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
      return getAccountInsights(req, res, user.id);
    case 'POST':
      return fetchAccountInsights(req, res, user.id);
    default:
      return res.status(405).json({ error: 'Method not allowed' });
  }
}

// GET: Fetch stored account insights for a specific account
async function getAccountInsights(req: NextApiRequest, res: NextApiResponse, userId: string) {
  try {
    const { accountId } = req.query;

    if (!accountId || typeof accountId !== 'string') {
      return res.status(400).json({ error: 'accountId query parameter is required' });
    }

    // Verify the account belongs to the user
    const account = await prisma.socialMediaAccount.findFirst({
      where: {
        id: accountId,
        userId,
      },
    });

    if (!account) {
      return res.status(404).json({ error: 'Account not found' });
    }

    const insights = await prisma.accountInsight.findMany({
      where: { accountId },
      orderBy: { fetchedAt: 'desc' },
      include: {
        account: {
          select: {
            id: true,
            username: true,
            accountType: true,
          },
        },
      },
    });

    logger.info(`Fetched ${insights.length} account insights for account ${accountId}`, { userId });
    return res.status(200).json(insights);
  } catch (error) {
    logger.error('Error fetching account insights:', error, { userId });
    return res.status(500).json({ error: 'Failed to fetch account insights' });
  }
}

// POST: Manually trigger fetching fresh insights from Instagram
async function fetchAccountInsights(req: NextApiRequest, res: NextApiResponse, userId: string) {
  try {
    const { accountId } = req.body;

    if (!accountId || typeof accountId !== 'string') {
      return res.status(400).json({ error: 'accountId is required' });
    }

    // Get account from SocialMediaAccount table and verify it belongs to user
    const account = await prisma.socialMediaAccount.findFirst({
      where: {
        id: accountId,
        userId,
      },
    });

    if (!account) {
      return res.status(404).json({ error: 'Account not found' });
    }

    // Get access token
    let accessToken: string;
    try {
      accessToken = await getAccessToken(accountId, userId);
    } catch (tokenError) {
      logger.error('Failed to get access token for account insights', tokenError, { userId, accountId });
      return res.status(401).json({
        error: 'Failed to get Instagram access token. Please reconnect your Instagram account.',
        code: 'TOKEN_UNAVAILABLE',
        details: tokenError instanceof Error ? tokenError.message : 'Unknown error',
      });
    }

    // Fetch basic account fields from Instagram Graph API
    const meResponse = await fetch(
      `${INSTAGRAM_GRAPH_API}/me?fields=followers_count,follows_count,media_count&access_token=${accessToken}`
    );

    if (!meResponse.ok) {
      const errorData = await meResponse.json().catch(() => ({}));
      logger.error('Instagram /me API error:', errorData, { userId, accountId, status: meResponse.status });
      return sendInstagramError(res, meResponse.status, errorData);
    }

    const meData = await meResponse.json();

    const followers = meData.followers_count ?? 0;
    const following = meData.follows_count ?? 0;
    const mediaCount = meData.media_count ?? 0;

    // Fetch profile insights (may not be available for all account types).
    // As of 2024, Meta requires `metric_type=total_value` for aggregated account
    // metrics like profile_views and website_clicks over a period.
    let profileViews = 0;
    let websiteClicks = 0;
    let accountInsightsError: string | null = null;

    const now = Math.floor(Date.now() / 1000);
    const since = now - 30 * 24 * 60 * 60; // last 30 days

    try {
      const insightsResponse = await fetch(
        `${INSTAGRAM_GRAPH_API}/me/insights?metric=profile_views,website_clicks&metric_type=total_value&period=day&since=${since}&until=${now}&access_token=${accessToken}`
      );

      if (insightsResponse.ok) {
        const insightsData = await insightsResponse.json();
        for (const item of insightsData.data || []) {
          // total_value API returns { total_value: { value: N } }
          const total = item.total_value?.value;
          const legacy = item.values?.[0]?.value;
          const value = total ?? legacy ?? 0;
          if (item.name === 'profile_views') profileViews = value;
          if (item.name === 'website_clicks') websiteClicks = value;
        }
      } else {
        const errorData = await insightsResponse.json().catch(() => ({}));
        const errMsg = errorData?.error?.message ?? `HTTP ${insightsResponse.status}`;
        const errCode = errorData?.error?.code;
        accountInsightsError = `Account insights unavailable (code ${errCode ?? '?'}): ${errMsg}`;
        logger.warn('Instagram profile insights not available:', errorData, { userId, status: insightsResponse.status });
      }
    } catch (insightsError) {
      accountInsightsError = insightsError instanceof Error ? insightsError.message : 'Unknown error';
      logger.warn('Failed to fetch profile insights:', insightsError, { userId });
    }

    // Store as a new AccountInsight record
    const insight = await prisma.accountInsight.create({
      data: {
        accountId,
        followers,
        following,
        mediaCount,
        profileViews,
        websiteClicks,
      },
    });

    logger.info(`Created account insight ${insight.id} for account ${accountId}`, {
      userId,
      followers,
      profileViews,
      websiteClicks,
      accountInsightsError,
    });
    // Surface any non-fatal account insights error to the client so the user
    // knows why profile_views / website_clicks may be zero.
    return res.status(201).json({
      ...insight,
      warning: accountInsightsError,
    });
  } catch (error) {
    logger.error('Error fetching account insights from Instagram:', error, { userId });
    return res.status(500).json({
      error: 'Failed to fetch account insights',
      details: error instanceof Error ? error.message : 'Unknown error',
    });
  }
}
