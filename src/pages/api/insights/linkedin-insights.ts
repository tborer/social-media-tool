import { NextApiRequest, NextApiResponse } from 'next';
import { createClient } from '@/util/supabase/api';
import prisma from '@/lib/prisma';
import { logger } from '@/lib/server-logger';
import { decrypt } from '@/lib/encryption';

const LINKEDIN_API_BASE = 'https://api.linkedin.com';

/**
 * Decode a LinkedIn URN for use in API paths (e.g. urn:li:ugcPost:xxx → urn%3Ali%3AugcPost%3Axxx)
 */
function encodeUrn(urn: string): string {
  return encodeURIComponent(urn);
}

/**
 * Fetch social actions (likes, comments, shares) for a LinkedIn post.
 * Uses the /rest/socialActions endpoint with w_member_social scope.
 */
async function fetchSocialActions(accessToken: string, postUrn: string) {
  const encoded = encodeUrn(postUrn);
  const url = `${LINKEDIN_API_BASE}/rest/socialActions/${encoded}?fields=likesSummary,commentsSummary,sharesSummary`;
  const res = await fetch(url, {
    headers: {
      Authorization: `Bearer ${accessToken}`,
      'LinkedIn-Version': '202411',
      'X-Restli-Protocol-Version': '2.0.0',
    },
  });
  if (!res.ok) {
    const body = await res.json().catch(() => ({}));
    throw new Error(`LinkedIn socialActions ${res.status}: ${JSON.stringify(body)}`);
  }
  return res.json();
}

/**
 * Fetch follower count for a LinkedIn member.
 * Uses /rest/followingStatistics?q=follower&networkEntity={personUrn}
 * Falls back to 0 if not accessible with current scopes.
 */
async function fetchLinkedInFollowers(accessToken: string, personUrn: string): Promise<number> {
  try {
    const encoded = encodeUrn(personUrn);
    const url = `${LINKEDIN_API_BASE}/rest/followingStatistics?q=follower&networkEntity=${encoded}`;
    const res = await fetch(url, {
      headers: {
        Authorization: `Bearer ${accessToken}`,
        'LinkedIn-Version': '202411',
        'X-Restli-Protocol-Version': '2.0.0',
      },
    });
    if (!res.ok) return 0;
    const data = await res.json();
    return data.followerCount ?? data.firstDegreeSize ?? 0;
  } catch {
    return 0;
  }
}

export default async function handler(req: NextApiRequest, res: NextApiResponse) {
  const supabase = createClient(req, res);
  const { data: { user }, error: authError } = await supabase.auth.getUser();
  if (authError || !user) {
    return res.status(401).json({ error: 'Unauthorized' });
  }

  if (req.method === 'GET') {
    return getLinkedInInsights(req, res, user.id);
  }
  if (req.method === 'POST') {
    return fetchLinkedInInsights(req, res, user.id);
  }
  return res.status(405).json({ error: 'Method not allowed' });
}

// GET: return stored LinkedIn insights
async function getLinkedInInsights(req: NextApiRequest, res: NextApiResponse, userId: string) {
  try {
    const { accountId, postId } = req.query;

    if (accountId && typeof accountId === 'string') {
      // Account-level insights
      const account = await prisma.socialMediaAccount.findFirst({
        where: { id: accountId, userId, accountType: 'LINKEDIN' },
      });
      if (!account) return res.status(404).json({ error: 'LinkedIn account not found' });

      const insights = await prisma.accountInsight.findMany({
        where: { accountId, platform: 'LINKEDIN' },
        orderBy: { fetchedAt: 'desc' },
        take: 10,
      });
      return res.status(200).json(insights);
    }

    if (postId && typeof postId === 'string') {
      // Post-level insights
      const insights = await prisma.postInsight.findMany({
        where: {
          postId,
          platform: 'LINKEDIN',
          post: { userId },
        },
        orderBy: { fetchedAt: 'desc' },
        take: 5,
      });
      return res.status(200).json(insights);
    }

    return res.status(400).json({ error: 'accountId or postId query param required' });
  } catch (error) {
    logger.error('Error fetching LinkedIn insights:', error, { userId });
    return res.status(500).json({ error: 'Failed to fetch LinkedIn insights' });
  }
}

// POST: fetch fresh LinkedIn insights for an account or specific post
async function fetchLinkedInInsights(req: NextApiRequest, res: NextApiResponse, userId: string) {
  try {
    const { accountId, postId } = req.body;

    if (!accountId || typeof accountId !== 'string') {
      return res.status(400).json({ error: 'accountId is required' });
    }

    const account = await prisma.socialMediaAccount.findFirst({
      where: { id: accountId, userId, accountType: 'LINKEDIN' },
    });
    if (!account) return res.status(404).json({ error: 'LinkedIn account not found' });

    // Decrypt access token
    let accessToken: string;
    try {
      accessToken = account.isEncrypted ? decrypt(account.accessToken) : account.accessToken;
    } catch (err) {
      logger.error('Failed to decrypt LinkedIn token', err, { userId, accountId });
      return res.status(401).json({ error: 'Failed to decrypt LinkedIn access token. Please reconnect.' });
    }

    // Check token expiry
    if (account.tokenExpiresAt && new Date(account.tokenExpiresAt) < new Date()) {
      return res.status(401).json({
        error: 'LinkedIn access token has expired. Please reconnect your LinkedIn account.',
        code: 'TOKEN_EXPIRED',
      });
    }

    // Fetch account-level insights (follower count)
    const personUrn = account.linkedinUserId;
    const followers = personUrn ? await fetchLinkedInFollowers(accessToken, personUrn) : 0;

    // Compute follower growth vs last snapshot
    const lastInsight = await prisma.accountInsight.findFirst({
      where: { accountId, platform: 'LINKEDIN' },
      orderBy: { fetchedAt: 'desc' },
    });
    const followerGrowth = lastInsight ? followers - lastInsight.followers : null;

    const accountInsight = await prisma.accountInsight.create({
      data: {
        accountId,
        platform: 'LINKEDIN',
        followers,
        following: 0,
        mediaCount: 0,
        profileViews: 0,
        websiteClicks: 0,
        followerGrowth,
      },
    });

    logger.info(`Created LinkedIn account insight for ${accountId}`, { userId });

    // If a specific postId is provided, fetch that post's metrics
    if (postId && typeof postId === 'string') {
      const post = await prisma.contentPost.findFirst({
        where: { id: postId, userId, linkedinPostId: { not: null } },
      });
      if (!post || !post.linkedinPostId) {
        return res.status(200).json({ accountInsight, postInsight: null });
      }

      try {
        const actions = await fetchSocialActions(accessToken, post.linkedinPostId);
        const likes = actions.likesSummary?.totalLikes ?? 0;
        const comments = actions.commentsSummary?.totalFirstLevelComments ?? 0;
        const shares = actions.sharesSummary?.totalShares ?? 0;
        // LinkedIn doesn't expose impressions/reach via standard scopes; use 0
        const engagement = likes + comments + shares > 0
          ? ((likes + comments + shares) / Math.max(followers, 1)) * 100
          : 0;

        const postInsight = await prisma.postInsight.create({
          data: {
            postId,
            platform: 'LINKEDIN',
            platformPostId: post.linkedinPostId,
            impressions: 0,
            reach: 0,
            likes,
            comments,
            shares,
            saves: 0,
            clicks: 0,
            profileVisits: 0,
            bookmarks: 0,
            engagement,
          },
        });

        logger.info(`Created LinkedIn post insight for post ${postId}`, { userId });
        return res.status(201).json({ accountInsight, postInsight });
      } catch (postError) {
        logger.error('Failed to fetch LinkedIn post social actions', postError, { userId, postId });
        return res.status(200).json({ accountInsight, postInsight: null, postError: postError instanceof Error ? postError.message : 'Unknown' });
      }
    }

    return res.status(201).json({ accountInsight });
  } catch (error) {
    logger.error('Error fetching LinkedIn insights:', error, { userId });
    return res.status(500).json({
      error: 'Failed to fetch LinkedIn insights',
      details: error instanceof Error ? error.message : 'Unknown error',
    });
  }
}
