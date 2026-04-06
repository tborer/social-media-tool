import { NextApiRequest, NextApiResponse } from 'next';
import { createClient } from '@/util/supabase/api';
import prisma from '@/lib/prisma';
import { logger } from '@/lib/server-logger';
import { decrypt, encrypt } from '@/lib/encryption';
import { refreshAccessToken } from '@/lib/x-oauth';

const X_API_BASE = 'https://api.twitter.com/2';

/**
 * Ensure the X access token is valid, refreshing if needed.
 * Returns the usable access token.
 */
async function getXToken(account: {
  id: string;
  accessToken: string;
  refreshToken: string | null;
  isEncrypted: boolean;
  tokenExpiresAt: Date | null;
}, userId: string): Promise<string> {
  const accessToken = account.isEncrypted ? decrypt(account.accessToken) : account.accessToken;
  const expiresAt = account.tokenExpiresAt;
  const fiveMinutesFromNow = new Date(Date.now() + 5 * 60 * 1000);

  if (expiresAt && expiresAt < fiveMinutesFromNow) {
    // Token is expired or expiring soon — refresh
    if (!account.refreshToken) {
      throw new Error('X access token expired and no refresh token available. Please reconnect.');
    }
    const rawRefresh = account.isEncrypted ? decrypt(account.refreshToken) : account.refreshToken;
    const tokens = await refreshAccessToken(rawRefresh);

    await prisma.socialMediaAccount.update({
      where: { id: account.id },
      data: {
        accessToken: encrypt(tokens.access_token),
        refreshToken: tokens.refresh_token ? encrypt(tokens.refresh_token) : null,
        tokenExpiresAt: tokens.expires_in
          ? new Date(Date.now() + tokens.expires_in * 1000)
          : null,
        isEncrypted: true,
      },
    });

    logger.info(`Refreshed X token for account ${account.id}`, { userId });
    return tokens.access_token;
  }

  return accessToken;
}

export default async function handler(req: NextApiRequest, res: NextApiResponse) {
  const supabase = createClient(req, res);
  const { data: { user }, error: authError } = await supabase.auth.getUser();
  if (authError || !user) {
    return res.status(401).json({ error: 'Unauthorized' });
  }

  if (req.method === 'GET') {
    return getXInsights(req, res, user.id);
  }
  if (req.method === 'POST') {
    return fetchXInsights(req, res, user.id);
  }
  return res.status(405).json({ error: 'Method not allowed' });
}

// GET: return stored X insights
async function getXInsights(req: NextApiRequest, res: NextApiResponse, userId: string) {
  try {
    const { accountId, postId } = req.query;

    if (accountId && typeof accountId === 'string') {
      const account = await prisma.socialMediaAccount.findFirst({
        where: { id: accountId, userId, accountType: 'X' },
      });
      if (!account) return res.status(404).json({ error: 'X account not found' });

      const insights = await prisma.accountInsight.findMany({
        where: { accountId, platform: 'X' },
        orderBy: { fetchedAt: 'desc' },
        take: 10,
      });
      return res.status(200).json(insights);
    }

    if (postId && typeof postId === 'string') {
      const insights = await prisma.postInsight.findMany({
        where: {
          postId,
          platform: 'X',
          post: { userId },
        },
        orderBy: { fetchedAt: 'desc' },
        take: 5,
      });
      return res.status(200).json(insights);
    }

    return res.status(400).json({ error: 'accountId or postId query param required' });
  } catch (error) {
    logger.error('Error fetching X insights:', error, { userId });
    return res.status(500).json({ error: 'Failed to fetch X insights' });
  }
}

// POST: fetch fresh X insights for an account or specific post
async function fetchXInsights(req: NextApiRequest, res: NextApiResponse, userId: string) {
  try {
    const { accountId, postId } = req.body;

    if (!accountId || typeof accountId !== 'string') {
      return res.status(400).json({ error: 'accountId is required' });
    }

    const account = await prisma.socialMediaAccount.findFirst({
      where: { id: accountId, userId, accountType: 'X' },
    });
    if (!account) return res.status(404).json({ error: 'X account not found' });

    let accessToken: string;
    try {
      accessToken = await getXToken(account, userId);
    } catch (err) {
      logger.error('Failed to get X token for insights', err, { userId, accountId });
      return res.status(401).json({
        error: err instanceof Error ? err.message : 'Failed to get X access token',
        code: 'TOKEN_UNAVAILABLE',
      });
    }

    // Fetch account-level metrics
    const xUserId = account.xUserId;
    let followers = 0;
    let following = 0;
    let tweetCount = 0;

    if (xUserId) {
      const userRes = await fetch(
        `${X_API_BASE}/users/${xUserId}?user.fields=public_metrics`,
        { headers: { Authorization: `Bearer ${accessToken}` } }
      );
      if (userRes.ok) {
        const userData = await userRes.json();
        const pm = userData.data?.public_metrics ?? {};
        followers = pm.followers_count ?? 0;
        following = pm.following_count ?? 0;
        tweetCount = pm.tweet_count ?? 0;
      } else {
        logger.warn(`X users/${xUserId} returned ${userRes.status}`, { userId });
      }
    }

    // Compute follower growth vs last snapshot
    const lastInsight = await prisma.accountInsight.findFirst({
      where: { accountId, platform: 'X' },
      orderBy: { fetchedAt: 'desc' },
    });
    const followerGrowth = lastInsight ? followers - lastInsight.followers : null;

    const accountInsight = await prisma.accountInsight.create({
      data: {
        accountId,
        platform: 'X',
        followers,
        following,
        mediaCount: tweetCount,
        profileViews: 0,
        websiteClicks: 0,
        followerGrowth,
      },
    });

    logger.info(`Created X account insight for ${accountId}`, { userId });

    // If a specific postId is provided, fetch that post's tweet metrics
    if (postId && typeof postId === 'string') {
      const post = await prisma.contentPost.findFirst({
        where: { id: postId, userId, xPostId: { not: null } },
      });
      if (!post || !post.xPostId) {
        return res.status(200).json({ accountInsight, postInsight: null });
      }

      try {
        // public_metrics (now public) + non_public_metrics (user context required)
        const tweetRes = await fetch(
          `${X_API_BASE}/tweets/${post.xPostId}?tweet.fields=public_metrics,non_public_metrics`,
          { headers: { Authorization: `Bearer ${accessToken}` } }
        );

        if (!tweetRes.ok) {
          const errData = await tweetRes.json().catch(() => ({}));
          throw new Error(`X tweet metrics ${tweetRes.status}: ${JSON.stringify(errData)}`);
        }

        const tweetData = await tweetRes.json();
        const pm = tweetData.data?.public_metrics ?? {};
        const npm = tweetData.data?.non_public_metrics ?? {};

        const impressions = pm.impression_count ?? 0;
        const likes = pm.like_count ?? 0;
        const shares = pm.retweet_count ?? 0; // retweets as "shares"
        const comments = pm.reply_count ?? 0;
        const bookmarks = pm.bookmark_count ?? 0;
        const clicks = npm.url_link_clicks ?? 0;
        const profileVisits = npm.user_profile_clicks ?? 0;

        // Engagement = (likes + retweets + replies + quotes) / impressions * 100
        const quoteCount = pm.quote_count ?? 0;
        const engagement = impressions > 0
          ? ((likes + shares + comments + quoteCount) / impressions) * 100
          : 0;

        const postInsight = await prisma.postInsight.create({
          data: {
            postId,
            platform: 'X',
            platformPostId: post.xPostId,
            impressions,
            reach: impressions, // X doesn't separate reach from impressions
            likes,
            comments,
            shares,
            saves: bookmarks,   // map bookmarks to saves
            clicks,
            profileVisits,
            bookmarks,
            engagement,
          },
        });

        logger.info(`Created X post insight for post ${postId}`, { userId });
        return res.status(201).json({ accountInsight, postInsight });
      } catch (postError) {
        logger.error('Failed to fetch X tweet metrics', postError, { userId, postId });
        return res.status(200).json({
          accountInsight,
          postInsight: null,
          postError: postError instanceof Error ? postError.message : 'Unknown',
        });
      }
    }

    return res.status(201).json({ accountInsight });
  } catch (error) {
    logger.error('Error fetching X insights:', error, { userId });
    return res.status(500).json({
      error: 'Failed to fetch X insights',
      details: error instanceof Error ? error.message : 'Unknown error',
    });
  }
}
