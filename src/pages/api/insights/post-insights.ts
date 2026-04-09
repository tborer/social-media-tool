import { NextApiRequest, NextApiResponse } from 'next';
import { createClient } from '@/util/supabase/api';
import prisma from '@/lib/prisma';
import { logger } from '@/lib/server-logger';
import { getAccessToken } from '@/lib/instagram-token-manager';
import { sendInstagramError } from '@/lib/instagram-error-handler';

const INSTAGRAM_GRAPH_API = 'https://graph.instagram.com/v22.0';

export default async function handler(req: NextApiRequest, res: NextApiResponse) {
  // Create Supabase client for authentication
  const supabase = createClient(req, res);

  // Get the user from the session
  const { data: { user }, error: authError } = await supabase.auth.getUser();

  if (authError || !user) {
    logger.error('Authentication error:', authError);
    return res.status(401).json({ error: 'Unauthorized' });
  }

  switch (req.method) {
    case 'GET':
      return getPostInsights(req, res, user.id);
    case 'POST':
      return fetchPostInsights(req, res, user.id);
    default:
      return res.status(405).json({ error: 'Method not allowed' });
  }
}

// GET: Fetch stored post insights for the user's published posts
async function getPostInsights(req: NextApiRequest, res: NextApiResponse, userId: string) {
  try {
    const { postId } = req.query;

    const whereClause: any = {
      post: {
        userId,
      },
    };

    if (postId && typeof postId === 'string') {
      whereClause.postId = postId;
    }

    const insights = await prisma.postInsight.findMany({
      where: whereClause,
      orderBy: { fetchedAt: 'desc' },
      include: {
        post: {
          select: {
            id: true,
            caption: true,
            imageUrl: true,
            status: true,
            igMediaId: true,
            scheduledFor: true,
          },
        },
      },
    });

    logger.info(`Fetched ${insights.length} post insights`, { userId });
    return res.status(200).json(insights);
  } catch (error) {
    logger.error('Error fetching post insights:', error, { userId });
    return res.status(500).json({ error: 'Failed to fetch post insights' });
  }
}

// POST: Manually trigger fetching fresh insights from Instagram for a specific post
async function fetchPostInsights(req: NextApiRequest, res: NextApiResponse, userId: string) {
  try {
    const { postId } = req.body;

    if (!postId || typeof postId !== 'string') {
      return res.status(400).json({ error: 'postId is required' });
    }

    // Look up the ContentPost to get igMediaId
    const post = await prisma.contentPost.findFirst({
      where: {
        id: postId,
        userId,
      },
      include: {
        socialMediaAccount: true,
      },
    });

    if (!post) {
      return res.status(404).json({ error: 'Post not found' });
    }

    if (!post.igMediaId) {
      return res.status(400).json({ error: 'Post does not have an Instagram media ID' });
    }

    if (!post.socialMediaAccountId) {
      return res.status(400).json({ error: 'Post does not have a linked social media account' });
    }

    // Get access token
    let accessToken: string;
    try {
      accessToken = await getAccessToken(post.socialMediaAccountId, userId);
    } catch (tokenError) {
      logger.error('Failed to get access token for post insights', tokenError, { userId, postId });
      return res.status(401).json({
        error: 'Failed to get Instagram access token. Please reconnect your Instagram account.',
        code: 'TOKEN_UNAVAILABLE',
        details: tokenError instanceof Error ? tokenError.message : 'Unknown error',
      });
    }

    // Determine the IG media type so we can request the right metrics.
    // Reels don't support the `impressions` metric.
    let igMediaType = '';
    try {
      const typeRes = await fetch(
        `${INSTAGRAM_GRAPH_API}/${post.igMediaId}?fields=media_type&access_token=${accessToken}`
      );
      if (typeRes.ok) {
        const typeData = await typeRes.json();
        igMediaType = typeData.media_type ?? '';
      }
    } catch {
      // Non-fatal – fall back to the full metric set
    }

    const isReel = igMediaType === 'REELS';
    const insightMetrics = isReel
      ? 'reach,likes,comments,shares,saved,plays'
      : 'impressions,reach,likes,comments,shares,saved';

    // Fetch insights from Instagram Graph API
    const insightsResponse = await fetch(
      `${INSTAGRAM_GRAPH_API}/${post.igMediaId}/insights?metric=${insightMetrics}&access_token=${accessToken}`
    );

    if (!insightsResponse.ok) {
      const errorData = await insightsResponse.json().catch(() => ({}));
      logger.error('Instagram insights API error:', errorData, { userId, postId, status: insightsResponse.status });
      return sendInstagramError(res, insightsResponse.status, errorData);
    }

    const insightsData = await insightsResponse.json();

    // Parse metrics from the insights response
    const metrics: Record<string, number> = {};
    for (const item of insightsData.data || []) {
      metrics[item.name] = item.values?.[0]?.value ?? 0;
    }

    // Also fetch basic fields for like_count and comments_count
    const fieldsResponse = await fetch(
      `${INSTAGRAM_GRAPH_API}/${post.igMediaId}?fields=like_count,comments_count,timestamp&access_token=${accessToken}`
    );

    let likeCount = metrics.likes ?? 0;
    let commentsCount = metrics.comments ?? 0;

    if (fieldsResponse.ok) {
      const fieldsData = await fieldsResponse.json();
      // Use basic fields as fallback if insights metrics are zero
      if (likeCount === 0 && fieldsData.like_count) {
        likeCount = fieldsData.like_count;
      }
      if (commentsCount === 0 && fieldsData.comments_count) {
        commentsCount = fieldsData.comments_count;
      }
    }

    const impressions = metrics.impressions ?? 0;
    const reach = metrics.reach ?? 0;
    const likes = likeCount;
    const comments = commentsCount;
    const shares = metrics.shares ?? 0;
    const saves = metrics.saved ?? 0;

    // Calculate engagement rate: (likes + comments + shares + saves) / reach * 100
    const engagement = reach > 0
      ? ((likes + comments + shares + saves) / reach) * 100
      : 0;

    // Store as a new PostInsight record
    const insight = await prisma.postInsight.create({
      data: {
        postId,
        impressions,
        reach,
        likes,
        comments,
        shares,
        saves,
        engagement,
      },
    });

    logger.info(`Created post insight ${insight.id} for post ${postId}`, { userId });
    return res.status(201).json(insight);
  } catch (error) {
    logger.error('Error fetching post insights from Instagram:', error, { userId });
    return res.status(500).json({
      error: 'Failed to fetch post insights',
      details: error instanceof Error ? error.message : 'Unknown error',
    });
  }
}
