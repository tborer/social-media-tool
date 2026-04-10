import { NextApiRequest, NextApiResponse } from 'next';
import prisma from '@/lib/prisma';
import { logger } from '@/lib/server-logger';
import { getAccessToken } from '@/lib/instagram-token-manager';
import { decrypt, encrypt } from '@/lib/encryption';
import { refreshAccessToken } from '@/lib/x-oauth';

const INSTAGRAM_GRAPH_API = 'https://graph.instagram.com/v22.0';
const LINKEDIN_API_BASE = 'https://api.linkedin.com';
const X_API_BASE = 'https://api.twitter.com/2';
const MAX_POSTS_PER_ACCOUNT = 50;

// ---------------------------------------------------------------------------
// X helpers
// ---------------------------------------------------------------------------

async function getXAccessTokenForCron(account: {
  id: string;
  accessToken: string;
  refreshToken: string | null;
  isEncrypted: boolean;
  tokenExpiresAt: Date | null;
}): Promise<string> {
  const accessToken = account.isEncrypted ? decrypt(account.accessToken) : account.accessToken;
  const expiresAt = account.tokenExpiresAt;
  const fiveMinutes = new Date(Date.now() + 5 * 60 * 1000);

  if (expiresAt && expiresAt < fiveMinutes) {
    if (!account.refreshToken) throw new Error('No X refresh token available');
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
    return tokens.access_token;
  }
  return accessToken;
}

// ---------------------------------------------------------------------------
// LinkedIn helpers
// ---------------------------------------------------------------------------

function encodeUrn(urn: string): string {
  return encodeURIComponent(urn);
}

async function fetchLinkedInFollowers(accessToken: string, personUrn: string): Promise<number> {
  try {
    const url = `${LINKEDIN_API_BASE}/rest/followingStatistics?q=follower&networkEntity=${encodeUrn(personUrn)}`;
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

async function fetchLinkedInSocialActions(accessToken: string, postUrn: string) {
  const url = `${LINKEDIN_API_BASE}/rest/socialActions/${encodeUrn(postUrn)}?fields=likesSummary,commentsSummary,sharesSummary`;
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

// ---------------------------------------------------------------------------
// Main handler
// ---------------------------------------------------------------------------

export default async function handler(req: NextApiRequest, res: NextApiResponse) {
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
    // -----------------------------------------------------------------------
    // INSTAGRAM
    // -----------------------------------------------------------------------
    const igAccounts = await prisma.socialMediaAccount.findMany({
      where: { accountType: 'INSTAGRAM' },
      include: { user: { select: { id: true } } },
    });

    logger.info(`Found ${igAccounts.length} Instagram accounts to fetch insights for`);

    for (const account of igAccounts) {
      const userId = account.userId;
      summary.accountsProcessed++;

      try {
        const accessToken = await getAccessToken(account.id, userId);

        const meResponse = await fetch(
          `${INSTAGRAM_GRAPH_API}/me?fields=followers_count,follows_count,media_count&access_token=${accessToken}`
        );

        if (meResponse.ok) {
          const meData = await meResponse.json();
          let profileViews = 0;
          let websiteClicks = 0;

          try {
            const insRes = await fetch(
              `${INSTAGRAM_GRAPH_API}/me/insights?metric=profile_views,website_clicks&period=day&access_token=${accessToken}`
            );
            if (insRes.ok) {
              const insData = await insRes.json();
              for (const item of insData.data || []) {
                if (item.name === 'profile_views') profileViews = item.values?.[0]?.value ?? 0;
                if (item.name === 'website_clicks') websiteClicks = item.values?.[0]?.value ?? 0;
              }
            }
          } catch (insErr) {
            logger.warn(`Profile insights not available for account ${account.id}`, insErr, { userId });
          }

          const lastIgInsight = await prisma.accountInsight.findFirst({
            where: { accountId: account.id, platform: 'INSTAGRAM' },
            orderBy: { fetchedAt: 'desc' },
          });
          const igFollowers = meData.followers_count ?? 0;
          const followerGrowth = lastIgInsight ? igFollowers - lastIgInsight.followers : null;

          await prisma.accountInsight.create({
            data: {
              accountId: account.id,
              platform: 'INSTAGRAM',
              followers: igFollowers,
              following: meData.follows_count ?? 0,
              mediaCount: meData.media_count ?? 0,
              profileViews,
              websiteClicks,
              followerGrowth,
            },
          });

          summary.accountInsightsFetched++;
          logger.info(`Fetched IG account insights for ${account.id}`, { userId });
        } else {
          const errorData = await meResponse.json();
          const msg = `Failed to fetch /me for IG account ${account.id}: ${JSON.stringify(errorData)}`;
          logger.error(msg, { userId });
          summary.errors.push(msg);
        }

        const posts = await prisma.contentPost.findMany({
          where: { socialMediaAccountId: account.id, status: 'PUBLISHED', igMediaId: { not: null } },
          orderBy: { updatedAt: 'desc' },
          take: MAX_POSTS_PER_ACCOUNT,
        });

        for (const post of posts) {
          summary.postsProcessed++;
          try {
            // Determine IG media product type to pick the right metrics
            // (Reels/Stories don't support `impressions`)
            let mediaProductType = '';
            try {
              const typeRes = await fetch(
                `${INSTAGRAM_GRAPH_API}/${post.igMediaId}?fields=media_product_type&access_token=${accessToken}`
              );
              if (typeRes.ok) {
                const typeData = await typeRes.json();
                mediaProductType = typeData.media_product_type ?? '';
              }
            } catch {
              // Non-fatal
            }
            const isReelOrStory = mediaProductType === 'REELS' || mediaProductType === 'STORY';
            const primaryMetrics = isReelOrStory
              ? 'reach,likes,comments,shares,saved,plays'
              : 'impressions,reach,likes,comments,shares,saved';

            let piRes = await fetch(
              `${INSTAGRAM_GRAPH_API}/${post.igMediaId}/insights?metric=${primaryMetrics}&access_token=${accessToken}`
            );

            // Fallback: if 400 about unsupported impressions, retry without it
            if (!piRes.ok && piRes.status === 400 && !isReelOrStory) {
              const errData = await piRes.json().catch(() => ({}));
              const errMsg = errData?.error?.message ?? '';
              if (errMsg.includes('impressions')) {
                piRes = await fetch(
                  `${INSTAGRAM_GRAPH_API}/${post.igMediaId}/insights?metric=reach,likes,comments,shares,saved&access_token=${accessToken}`
                );
              }
            }

            const metrics: Record<string, number> = {};
            if (piRes.ok) {
              const piData = await piRes.json();
              for (const item of piData.data || []) {
                metrics[item.name] = item.values?.[0]?.value ?? 0;
              }
            }

            // Always fetch basic fields as fallback
            const fieldsRes = await fetch(
              `${INSTAGRAM_GRAPH_API}/${post.igMediaId}?fields=like_count,comments_count&access_token=${accessToken}`
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
                postId: post.id,
                platform: 'INSTAGRAM',
                platformPostId: post.igMediaId,
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

            summary.postInsightsFetched++;
          } catch (postErr) {
            const msg = `Error fetching IG insights for post ${post.id}: ${postErr instanceof Error ? postErr.message : 'Unknown'}`;
            logger.error(msg, { userId });
            summary.errors.push(msg);
          }
        }
      } catch (accountErr) {
        const msg = `Error processing IG account ${account.id}: ${accountErr instanceof Error ? accountErr.message : 'Unknown'}`;
        logger.error(msg, { userId });
        summary.errors.push(msg);
      }
    }

    // -----------------------------------------------------------------------
    // LINKEDIN
    // -----------------------------------------------------------------------
    const liAccounts = await prisma.socialMediaAccount.findMany({
      where: { accountType: 'LINKEDIN' },
      include: { user: { select: { id: true } } },
    });

    logger.info(`Found ${liAccounts.length} LinkedIn accounts to fetch insights for`);

    for (const account of liAccounts) {
      const userId = account.userId;
      summary.accountsProcessed++;

      try {
        if (account.tokenExpiresAt && new Date(account.tokenExpiresAt) < new Date()) {
          const msg = `LinkedIn token expired for account ${account.id} — skipping`;
          logger.warn(msg, { userId });
          summary.errors.push(msg);
          continue;
        }

        const accessToken = account.isEncrypted ? decrypt(account.accessToken) : account.accessToken;
        const followers = account.linkedinUserId
          ? await fetchLinkedInFollowers(accessToken, account.linkedinUserId)
          : 0;

        const lastInsight = await prisma.accountInsight.findFirst({
          where: { accountId: account.id, platform: 'LINKEDIN' },
          orderBy: { fetchedAt: 'desc' },
        });
        const followerGrowth = lastInsight ? followers - lastInsight.followers : null;

        await prisma.accountInsight.create({
          data: {
            accountId: account.id,
            platform: 'LINKEDIN',
            followers,
            following: 0,
            mediaCount: 0,
            profileViews: 0,
            websiteClicks: 0,
            followerGrowth,
          },
        });

        summary.accountInsightsFetched++;
        logger.info(`Fetched LinkedIn account insights for ${account.id}`, { userId });

        // Post insights
        const liPosts = await prisma.contentPost.findMany({
          where: {
            socialMediaAccountId: account.id,
            status: 'PUBLISHED',
            linkedinPostId: { not: null },
          },
          orderBy: { updatedAt: 'desc' },
          take: MAX_POSTS_PER_ACCOUNT,
        });

        for (const post of liPosts) {
          summary.postsProcessed++;
          try {
            const actions = await fetchLinkedInSocialActions(accessToken, post.linkedinPostId!);
            const likes = actions.likesSummary?.totalLikes ?? 0;
            const comments = actions.commentsSummary?.totalFirstLevelComments ?? 0;
            const shares = actions.sharesSummary?.totalShares ?? 0;
            const engagement = likes + comments + shares > 0
              ? ((likes + comments + shares) / Math.max(followers, 1)) * 100
              : 0;

            await prisma.postInsight.create({
              data: {
                postId: post.id,
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

            summary.postInsightsFetched++;
          } catch (postErr) {
            const msg = `Error fetching LinkedIn insights for post ${post.id}: ${postErr instanceof Error ? postErr.message : 'Unknown'}`;
            logger.error(msg, { userId });
            summary.errors.push(msg);
          }
        }
      } catch (accountErr) {
        const msg = `Error processing LinkedIn account ${account.id}: ${accountErr instanceof Error ? accountErr.message : 'Unknown'}`;
        logger.error(msg, { userId });
        summary.errors.push(msg);
      }
    }

    // -----------------------------------------------------------------------
    // X (Twitter)
    // -----------------------------------------------------------------------
    const xAccounts = await prisma.socialMediaAccount.findMany({
      where: { accountType: 'X' },
      include: { user: { select: { id: true } } },
    });

    logger.info(`Found ${xAccounts.length} X accounts to fetch insights for`);

    for (const account of xAccounts) {
      const userId = account.userId;
      summary.accountsProcessed++;

      try {
        const accessToken = await getXAccessTokenForCron(account);

        // Account-level metrics
        let followers = 0;
        let following = 0;
        let tweetCount = 0;

        if (account.xUserId) {
          const userRes = await fetch(
            `${X_API_BASE}/users/${account.xUserId}?user.fields=public_metrics`,
            { headers: { Authorization: `Bearer ${accessToken}` } }
          );
          if (userRes.ok) {
            const userData = await userRes.json();
            const pm = userData.data?.public_metrics ?? {};
            followers = pm.followers_count ?? 0;
            following = pm.following_count ?? 0;
            tweetCount = pm.tweet_count ?? 0;
          }
        }

        const lastXInsight = await prisma.accountInsight.findFirst({
          where: { accountId: account.id, platform: 'X' },
          orderBy: { fetchedAt: 'desc' },
        });
        const followerGrowth = lastXInsight ? followers - lastXInsight.followers : null;

        await prisma.accountInsight.create({
          data: {
            accountId: account.id,
            platform: 'X',
            followers,
            following,
            mediaCount: tweetCount,
            profileViews: 0,
            websiteClicks: 0,
            followerGrowth,
          },
        });

        summary.accountInsightsFetched++;
        logger.info(`Fetched X account insights for ${account.id}`, { userId });

        // Post insights
        const xPosts = await prisma.contentPost.findMany({
          where: {
            socialMediaAccountId: account.id,
            status: 'PUBLISHED',
            xPostId: { not: null },
          },
          orderBy: { updatedAt: 'desc' },
          take: MAX_POSTS_PER_ACCOUNT,
        });

        for (const post of xPosts) {
          summary.postsProcessed++;
          try {
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
            const shares = pm.retweet_count ?? 0;
            const comments = pm.reply_count ?? 0;
            const quoteCount = pm.quote_count ?? 0;
            const bookmarks = pm.bookmark_count ?? 0;
            const clicks = npm.url_link_clicks ?? 0;
            const profileVisits = npm.user_profile_clicks ?? 0;
            const engagement = impressions > 0
              ? ((likes + shares + comments + quoteCount) / impressions) * 100
              : 0;

            await prisma.postInsight.create({
              data: {
                postId: post.id,
                platform: 'X',
                platformPostId: post.xPostId,
                impressions,
                reach: impressions,
                likes,
                comments,
                shares,
                saves: bookmarks,
                clicks,
                profileVisits,
                bookmarks,
                engagement,
              },
            });

            summary.postInsightsFetched++;
          } catch (postErr) {
            const msg = `Error fetching X insights for post ${post.id}: ${postErr instanceof Error ? postErr.message : 'Unknown'}`;
            logger.error(msg, { userId });
            summary.errors.push(msg);
          }
        }
      } catch (accountErr) {
        const msg = `Error processing X account ${account.id}: ${accountErr instanceof Error ? accountErr.message : 'Unknown'}`;
        logger.error(msg, { userId });
        summary.errors.push(msg);
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
