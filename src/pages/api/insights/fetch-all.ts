import { NextApiRequest, NextApiResponse } from 'next';
import prisma from '@/lib/prisma';
import { logger } from '@/lib/server-logger';
import { getAccessToken } from '@/lib/instagram-token-manager';

const INSTAGRAM_GRAPH_API = 'https://graph.instagram.com/v22.0';
const MAX_POSTS_PER_ACCOUNT = 50;

export default async function handler(req: NextApiRequest, res: NextApiResponse) {
  // Verify this is a cron request via Bearer token
  const authHeader = req.headers.authorization;
  if (authHeader !== `Bearer ${process.env.CRON_SECRET}`) {
    logger.warn('Unauthorized fetch-all insights request');
    return res.status(401).json({ error: 'Unauthorized' });
  }

  if (req.method !== 'POST') {
    return res.status(405).json({ error: 'Method not allowed' });
  }

  const summary = {
    accountsProcessed: 0,
    accountInsightsFetched: 0,
    postsProcessed: 0,
    postInsightsFetched: 0,
    errors: [] as string[],
  };

  try {
    // Get all Instagram social media accounts
    const accounts = await prisma.socialMediaAccount.findMany({
      where: {
        accountType: 'INSTAGRAM',
      },
      include: {
        user: {
          select: { id: true },
        },
      },
    });

    logger.info(`Found ${accounts.length} Instagram accounts to fetch insights for`);

    for (const account of accounts) {
      const userId = account.userId;
      summary.accountsProcessed++;

      // Fetch account-level insights
      try {
        const accessToken = await getAccessToken(account.id, userId);

        // Fetch basic account fields
        const meResponse = await fetch(
          `${INSTAGRAM_GRAPH_API}/me?fields=followers_count,follows_count,media_count&access_token=${accessToken}`
        );

        if (meResponse.ok) {
          const meData = await meResponse.json();

          let profileViews = 0;
          let websiteClicks = 0;

          // Fetch profile insights (may not be available for all account types)
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
            }
          } catch (insightsError) {
            logger.warn(`Profile insights not available for account ${account.id}:`, insightsError, { userId });
          }

          await prisma.accountInsight.create({
            data: {
              accountId: account.id,
              followers: meData.followers_count ?? 0,
              following: meData.follows_count ?? 0,
              mediaCount: meData.media_count ?? 0,
              profileViews,
              websiteClicks,
            },
          });

          summary.accountInsightsFetched++;
          logger.info(`Fetched account insights for account ${account.id} (${account.username})`, { userId });
        } else {
          const errorData = await meResponse.json();
          const errorMsg = `Failed to fetch /me for account ${account.id}: ${JSON.stringify(errorData)}`;
          logger.error(errorMsg, { userId });
          summary.errors.push(errorMsg);
        }

        // Find all published ContentPosts with an igMediaId for this account
        const posts = await prisma.contentPost.findMany({
          where: {
            socialMediaAccountId: account.id,
            status: 'PUBLISHED',
            igMediaId: { not: null },
          },
          orderBy: { updatedAt: 'desc' },
          take: MAX_POSTS_PER_ACCOUNT,
        });

        logger.info(`Found ${posts.length} published posts for account ${account.id}`, { userId });

        for (const post of posts) {
          summary.postsProcessed++;

          try {
            // Fetch post insights from Instagram
            const postInsightsResponse = await fetch(
              `${INSTAGRAM_GRAPH_API}/${post.igMediaId}/insights?metric=impressions,reach,likes,comments,shares,saved&access_token=${accessToken}`
            );

            if (!postInsightsResponse.ok) {
              const errorData = await postInsightsResponse.json();
              const errorMsg = `Failed to fetch insights for post ${post.id} (media ${post.igMediaId}): ${JSON.stringify(errorData)}`;
              logger.error(errorMsg, { userId });
              summary.errors.push(errorMsg);
              continue;
            }

            const postInsightsData = await postInsightsResponse.json();

            const metrics: Record<string, number> = {};
            for (const item of postInsightsData.data || []) {
              metrics[item.name] = item.values?.[0]?.value ?? 0;
            }

            // Also fetch basic fields
            const fieldsResponse = await fetch(
              `${INSTAGRAM_GRAPH_API}/${post.igMediaId}?fields=like_count,comments_count,timestamp&access_token=${accessToken}`
            );

            let likes = metrics.likes ?? 0;
            let comments = metrics.comments ?? 0;

            if (fieldsResponse.ok) {
              const fieldsData = await fieldsResponse.json();
              if (likes === 0 && fieldsData.like_count) {
                likes = fieldsData.like_count;
              }
              if (comments === 0 && fieldsData.comments_count) {
                comments = fieldsData.comments_count;
              }
            }

            const impressions = metrics.impressions ?? 0;
            const reach = metrics.reach ?? 0;
            const shares = metrics.shares ?? 0;
            const saves = metrics.saved ?? 0;

            const engagement = reach > 0
              ? ((likes + comments + shares + saves) / reach) * 100
              : 0;

            await prisma.postInsight.create({
              data: {
                postId: post.id,
                impressions,
                reach,
                likes,
                comments,
                shares,
                saves,
                engagement,
              },
            });

            summary.postInsightsFetched++;
          } catch (postError) {
            const errorMsg = `Error fetching insights for post ${post.id}: ${postError instanceof Error ? postError.message : 'Unknown error'}`;
            logger.error(errorMsg, { userId });
            summary.errors.push(errorMsg);
          }
        }
      } catch (accountError) {
        const errorMsg = `Error processing account ${account.id} (${account.username}): ${accountError instanceof Error ? accountError.message : 'Unknown error'}`;
        logger.error(errorMsg, { userId });
        summary.errors.push(errorMsg);
      }
    }

    logger.info('Fetch-all insights completed', { summary });

    return res.status(200).json({
      success: true,
      message: 'Insights fetch completed',
      summary,
    });
  } catch (error) {
    logger.error('Error in fetch-all insights handler:', error);
    return res.status(500).json({
      error: 'Failed to fetch insights',
      details: error instanceof Error ? error.message : 'Unknown error',
    });
  }
}
