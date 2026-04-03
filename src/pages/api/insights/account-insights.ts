import { NextApiRequest, NextApiResponse } from 'next';
import { createClient } from '@/util/supabase/api';
import prisma from '@/lib/prisma';
import { logger } from '@/lib/server-logger';
import { getAccessToken } from '@/lib/instagram-token-manager';

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
    const accessToken = await getAccessToken(accountId, userId);

    // Fetch basic account fields from Instagram Graph API
    const meResponse = await fetch(
      `${INSTAGRAM_GRAPH_API}/me?fields=followers_count,follows_count,media_count&access_token=${accessToken}`
    );

    if (!meResponse.ok) {
      const errorData = await meResponse.json();
      logger.error('Instagram /me API error:', errorData, { userId });
      return res.status(502).json({ error: 'Failed to fetch account data from Instagram', details: errorData });
    }

    const meData = await meResponse.json();

    const followers = meData.followers_count ?? 0;
    const following = meData.follows_count ?? 0;
    const mediaCount = meData.media_count ?? 0;

    // Fetch profile insights (may not be available for all account types)
    let profileViews = 0;
    let websiteClicks = 0;

    try {
      const insightsResponse = await fetch(
        `${INSTAGRAM_GRAPH_API}/me/insights?metric=profile_views,website_clicks&period=day&access_token=${accessToken}`
      );

      if (insightsResponse.ok) {
        const insightsData = await insightsResponse.json();
        for (const item of insightsData.data || []) {
          if (item.name === 'profile_views') {
            profileViews = item.values?.[0]?.value ?? 0;
          }
          if (item.name === 'website_clicks') {
            websiteClicks = item.values?.[0]?.value ?? 0;
          }
        }
      } else {
        const errorData = await insightsResponse.json();
        logger.warn('Instagram profile insights not available for this account type:', errorData, { userId });
      }
    } catch (insightsError) {
      logger.warn('Failed to fetch profile insights (may not be available for this account type):', insightsError, { userId });
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

    logger.info(`Created account insight ${insight.id} for account ${accountId}`, { userId });
    return res.status(201).json(insight);
  } catch (error) {
    logger.error('Error fetching account insights from Instagram:', error, { userId });
    return res.status(500).json({
      error: 'Failed to fetch account insights',
      details: error instanceof Error ? error.message : 'Unknown error',
    });
  }
}
