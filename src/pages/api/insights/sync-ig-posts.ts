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

  const { accountId, fetchInsights = true, limit = 50 } = req.body;

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
    const mediaUrl = `${INSTAGRAM_GRAPH_API}/me/media?fields=id,caption,media_type,media_url,thumbnail_url,timestamp,permalink&limit=${clampedLimit}&access_token=${accessToken}`;
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
      const imageUrl = (item.media_url as string) ?? null;
      const timestamp = item.timestamp ? new Date(item.timestamp) : new Date();

      let contentType: 'IMAGE' | 'VIDEO' | 'BLOG_POST' = 'IMAGE';
      if (mediaType === 'VIDEO' || mediaType === 'REELS') {
        contentType = 'VIDEO';
      } else if (mediaType === 'CAROUSEL_ALBUM') {
        contentType = 'IMAGE';
      }

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
          const piRes = await fetch(
            `${INSTAGRAM_GRAPH_API}/${igMediaId}/insights?metric=impressions,reach,likes,comments,shares,saved&access_token=${accessToken}`
          );

          if (!piRes.ok) {
            const errData = await piRes.json().catch(() => ({}));
            const msg = `Insights fetch failed for ${igMediaId} (HTTP ${piRes.status}): ${JSON.stringify(errData).slice(0, 200)}`;
            logger.warn(msg, { userId: user.id, postId });
            summary.errors.push(msg);
            continue;
          }

          const piData = await piRes.json();
          const metrics: Record<string, number> = {};
          for (const m of piData.data || []) {
            metrics[m.name] = m.values?.[0]?.value ?? 0;
          }

          // Also fetch basic fields for like_count/comments_count fallback
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

          const impressions = metrics.impressions ?? 0;
          const reach = metrics.reach ?? 0;
          const shares = metrics.shares ?? 0;
          const saves = metrics.saved ?? 0;
          const engagement = reach > 0 ? ((likes + comments + shares + saves) / reach) * 100 : 0;

          await prisma.postInsight.create({
            data: {
              postId: postId!,
              platform: 'INSTAGRAM',
              platformPostId: igMediaId,
              impressions,
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
