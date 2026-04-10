import { NextApiRequest, NextApiResponse } from 'next';
import { createClient } from '@/util/supabase/api';
import prisma from '@/lib/prisma';
import { logger } from '@/lib/server-logger';
import { getAccessToken } from '@/lib/instagram-token-manager';

const INSTAGRAM_GRAPH_API = 'https://graph.instagram.com/v22.0';

/**
 * POST /api/insights/sync-ig-posts
 *
 * Imports the authenticated user's Instagram posts into ContentPost and
 * optionally fetches insights for each imported post.
 *
 * Body: { accountId: string, fetchInsights?: boolean, limit?: number }
 */
export default async function handler(req: NextApiRequest, res: NextApiResponse) {
  const supabase = createClient(req, res);
  const { data: { user }, error: authError } = await supabase.auth.getUser();

  if (authError || !user) {
    logger.error('Sync IG posts – auth error', authError);
    return res.status(401).json({ error: 'Unauthorized' });
  }

  if (req.method !== 'POST') {
    return res.status(405).json({ error: 'Method not allowed' });
  }

  const { accountId, fetchInsights = true, limit = 25 } = req.body;

  if (!accountId || typeof accountId !== 'string') {
    return res.status(400).json({ error: 'accountId is required' });
  }

  const account = await prisma.socialMediaAccount.findFirst({
    where: { id: accountId, userId: user.id, accountType: 'INSTAGRAM' },
  });

  if (!account) {
    return res.status(404).json({ error: 'Instagram account not found' });
  }

  let accessToken: string;
  try {
    accessToken = await getAccessToken(account.id, user.id);
  } catch (tokenErr) {
    logger.error('Sync IG posts – token error', tokenErr, { userId: user.id, accountId });
    return res.status(401).json({
      error: 'Failed to get Instagram access token. Please reconnect your Instagram account.',
    });
  }

  const summary = {
    imported: 0,
    skipped: 0,
    insightsFetched: 0,
    errors: [] as string[],
    posts: [] as Array<{ postId: string; igMediaId: string; caption: string; isNew: boolean }>,
  };

  try {
    // Fetch the user's IG media list
    const clampedLimit = Math.min(Math.max(limit, 1), 100);
    const mediaUrl = `${INSTAGRAM_GRAPH_API}/me/media?fields=id,caption,media_type,media_product_type,media_url,thumbnail_url,timestamp,permalink&limit=${clampedLimit}&access_token=${accessToken}`;
    logger.info('Sync IG posts – fetching media list', { userId: user.id, accountId, url: mediaUrl.replace(accessToken, '***') });

    const mediaRes = await fetch(mediaUrl);
    if (!mediaRes.ok) {
      const errBody = await mediaRes.json().catch(() => ({}));
      logger.error('Sync IG posts – IG media list error', { status: mediaRes.status, body: errBody, userId: user.id });
      return res.status(502).json({
        error: 'Failed to fetch Instagram media list',
        igStatus: mediaRes.status,
        details: errBody,
      });
    }

    const mediaData = await mediaRes.json();
    const mediaItems: any[] = mediaData.data ?? [];
    logger.info(`Sync IG posts – received ${mediaItems.length} media items`, { userId: user.id });

    if (mediaItems.length === 0) {
      return res.status(200).json({ ...summary, message: 'No media found on this Instagram account' });
    }

    // Check which igMediaIds already exist
    const igMediaIds = mediaItems.map((m: any) => m.id);
    const existingPosts = await prisma.contentPost.findMany({
      where: { userId: user.id, igMediaId: { in: igMediaIds } },
      select: { id: true, igMediaId: true },
    });
    const existingMap = new Map(existingPosts.map((p) => [p.igMediaId, p.id]));

    for (const item of mediaItems) {
      const igMediaId = item.id as string;
      const caption = (item.caption as string) ?? '';
      const mediaType = (item.media_type as string) ?? 'IMAGE';
      const mediaProductType = (item.media_product_type as string) ?? '';
      const imageUrl = (item.media_url as string) ?? null;
      const timestamp = item.timestamp ? new Date(item.timestamp) : new Date();

      let contentType: 'IMAGE' | 'VIDEO' | 'BLOG_POST' = 'IMAGE';
      if (mediaType === 'VIDEO') {
        contentType = 'VIDEO';
      } else if (mediaType === 'CAROUSEL_ALBUM') {
        contentType = 'IMAGE';
      }

      // media_product_type is FEED, REELS, STORY, or AD
      // Meta deprecated `impressions` and `plays` on Apr 21, 2024, replacing both
      // with the new `views` metric. Stories only support a reduced metric set.
      const isStory = mediaProductType === 'STORY';
      const isReel = mediaProductType === 'REELS';

      let postId = existingMap.get(igMediaId);
      const isNew = !postId;

      if (!postId) {
        // Create new ContentPost
        try {
          const newPost = await prisma.contentPost.create({
            data: {
              caption,
              imageUrl,
              contentType,
              status: 'PUBLISHED',
              scheduledFor: timestamp,
              igMediaId,
              userId: user.id,
              socialMediaAccountId: account.id,
              targetPlatforms: ['INSTAGRAM'],
            },
          });
          postId = newPost.id;
          summary.imported++;
          logger.info(`Sync IG posts – imported ${igMediaId}`, { userId: user.id, postId });
        } catch (createErr) {
          const msg = `Failed to create post for igMediaId ${igMediaId}: ${createErr instanceof Error ? createErr.message : 'Unknown'}`;
          logger.error(msg, { userId: user.id });
          summary.errors.push(msg);
          continue;
        }
      } else {
        summary.skipped++;
      }

      summary.posts.push({ postId: postId!, igMediaId, caption: caption.slice(0, 80), isNew });

      // Fetch insights for the post
      if (fetchInsights && postId) {
        try {
          // Meta API v22 metric names (post-April 2024):
          //   - Feed/Reels: reach, likes, comments, shares, saved, views, total_interactions
          //   - Stories: reach, views, shares, replies, total_interactions (no likes/comments)
          // `impressions` and `plays` are deprecated — `views` replaces both.
          const primaryMetrics = isStory
            ? 'reach,views,shares,total_interactions,replies'
            : 'reach,likes,comments,shares,saved,views,total_interactions';

          let piRes = await fetch(
            `${INSTAGRAM_GRAPH_API}/${igMediaId}/insights?metric=${primaryMetrics}&access_token=${accessToken}`
          );

          // Fallback: if we get a 400 (e.g. very old media that predates `views`),
          // try a minimal safe set and, if that also fails, try the legacy set.
          let insightsErrorMsg = '';
          if (!piRes.ok && piRes.status === 400) {
            const errData = await piRes.json().catch(() => ({}));
            insightsErrorMsg = errData?.error?.message ?? `HTTP ${piRes.status}`;
            logger.warn(`Sync IG posts – metric error for ${igMediaId}: ${insightsErrorMsg} — retrying with minimal set`, { userId: user.id });
            const minimalMetrics = isStory
              ? 'reach,shares'
              : 'reach,likes,comments,shares,saved';
            piRes = await fetch(
              `${INSTAGRAM_GRAPH_API}/${igMediaId}/insights?metric=${minimalMetrics}&access_token=${accessToken}`
            );
          }

          const metrics: Record<string, number> = {};
          if (piRes.ok) {
            const piData = await piRes.json();
            for (const m of piData.data || []) {
              metrics[m.name] = m.values?.[0]?.value ?? 0;
            }
          } else {
            // Surface the error to the user via the summary so they can see why
            // insights are empty. Previously this silently wrote a zero row.
            const errData = await piRes.json().catch(() => ({}));
            const code = errData?.error?.code;
            const errMsg = errData?.error?.message ?? insightsErrorMsg ?? `HTTP ${piRes.status}`;
            const msg = `Insights unavailable for ${igMediaId} (code ${code ?? '?'}, HTTP ${piRes.status}): ${errMsg}`;
            logger.error(msg, { userId: user.id, postId });
            summary.errors.push(msg);
          }

          // Always fetch basic fields for like_count/comments_count fallback
          const fieldsRes = await fetch(
            `${INSTAGRAM_GRAPH_API}/${igMediaId}?fields=like_count,comments_count&access_token=${accessToken}`
          );
          let likes = metrics.likes ?? 0;
          let comments = metrics.comments ?? 0;
          if (fieldsRes.ok) {
            const fd = await fieldsRes.json();
            if (likes === 0 && fd.like_count) likes = fd.like_count;
            if (comments === 0 && fd.comments_count) comments = fd.comments_count;
          }

          // Map Meta's new `views` metric into the existing `impressions` column
          // (see post-insights.ts for the mapping rationale).
          const views = metrics.views ?? metrics.impressions ?? metrics.plays ?? 0;
          const reach = metrics.reach ?? 0;
          const shares = metrics.shares ?? 0;
          const saves = metrics.saved ?? 0;
          const totalInteractions = metrics.total_interactions ?? 0;
          const interactions = totalInteractions > 0
            ? totalInteractions
            : likes + comments + shares + saves;
          const denominator = reach > 0 ? reach : (views > 0 ? views : 0);
          const engagement = denominator > 0 ? (interactions / denominator) * 100 : 0;

          // Create an insight record even when advanced metrics are unavailable —
          // the basic like/comment counts from the fields fallback still have value
          // and allow the post to appear in the refinement UI.
          await prisma.postInsight.create({
            data: {
              postId: postId!,
              platform: 'INSTAGRAM',
              platformPostId: igMediaId,
              impressions: views, // Meta's `views` stored in legacy column
              reach,
              likes,
              comments,
              shares,
              saves,
              clicks: 0,
              profileVisits: 0,
              bookmarks: 0,
              engagement,
            },
          });

          summary.insightsFetched++;
        } catch (insErr) {
          const msg = `Error fetching insights for ${igMediaId}: ${insErr instanceof Error ? insErr.message : 'Unknown'}`;
          logger.error(msg, { userId: user.id, postId });
          summary.errors.push(msg);
        }
      }
    }

    logger.info('Sync IG posts – complete', {
      userId: user.id,
      imported: summary.imported,
      skipped: summary.skipped,
      insightsFetched: summary.insightsFetched,
      errors: summary.errors.length,
    });

    return res.status(200).json(summary);
  } catch (error) {
    logger.error('Sync IG posts – unexpected error', error, { userId: user.id });
    return res.status(500).json({
      error: 'Failed to sync Instagram posts',
      details: error instanceof Error ? error.message : 'Unknown error',
    });
  }
}
