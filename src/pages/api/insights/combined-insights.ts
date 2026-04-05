import { NextApiRequest, NextApiResponse } from 'next';
import { createClient } from '@/util/supabase/api';
import prisma from '@/lib/prisma';
import { logger } from '@/lib/server-logger';
import { getPerformanceSummary } from '@/lib/performance-analyzer';

export default async function handler(req: NextApiRequest, res: NextApiResponse) {
  const supabase = createClient(req, res);
  const { data: { user }, error: authError } = await supabase.auth.getUser();
  if (authError || !user) {
    return res.status(401).json({ error: 'Unauthorized' });
  }

  if (req.method !== 'GET') {
    return res.status(405).json({ error: 'Method not allowed' });
  }

  try {
    const { platform } = req.query;
    const platformFilter = (platform as string) || 'ALL';

    // Performance summary (top posts, timing, hashtags, platform stats)
    const summary = await getPerformanceSummary(
      user.id,
      platformFilter as 'INSTAGRAM' | 'LINKEDIN' | 'X' | 'ALL'
    );

    // Latest account insights per account (for the account overview strip)
    const accounts = await prisma.socialMediaAccount.findMany({
      where: { userId: user.id },
      include: {
        accountInsights: {
          orderBy: { fetchedAt: 'desc' },
          take: 2, // latest + prev for growth delta
        },
      },
    });

    const accountOverview = accounts.map((acct) => {
      const latest = acct.accountInsights[0] ?? null;
      const prev = acct.accountInsights[1] ?? null;
      const growth = latest && prev ? latest.followers - prev.followers : (latest?.followerGrowth ?? null);
      return {
        accountId: acct.id,
        username: acct.username,
        accountType: acct.accountType,
        platform: latest?.platform ?? acct.accountType,
        followers: latest?.followers ?? 0,
        following: latest?.following ?? 0,
        mediaCount: latest?.mediaCount ?? 0,
        profileViews: latest?.profileViews ?? 0,
        websiteClicks: latest?.websiteClicks ?? 0,
        followerGrowth: growth,
        lastFetchedAt: latest?.fetchedAt ?? null,
      };
    });

    // Cross-platform post table: all published posts with their latest insight per platform
    const publishedPosts = await prisma.contentPost.findMany({
      where: { userId: user.id, status: 'PUBLISHED' },
      include: {
        postInsights: {
          orderBy: { fetchedAt: 'desc' },
          take: 3, // up to 3 platforms
        },
        socialMediaAccount: {
          select: { username: true, accountType: true },
        },
      },
      orderBy: { updatedAt: 'desc' },
      take: 100,
    });

    const postTable = publishedPosts.map((post) => {
      // Deduplicate by platform — keep the most recent insight per platform
      const insightsByPlatform = new Map<string, (typeof post.postInsights)[0]>();
      for (const ins of post.postInsights) {
        if (!insightsByPlatform.has(ins.platform)) {
          insightsByPlatform.set(ins.platform, ins);
        }
      }

      return {
        postId: post.id,
        caption: post.caption.slice(0, 120) + (post.caption.length > 120 ? '...' : ''),
        imageUrl: post.imageUrl,
        contentType: post.contentType,
        scheduledFor: post.scheduledFor,
        updatedAt: post.updatedAt,
        account: post.socialMediaAccount
          ? { username: post.socialMediaAccount.username, accountType: post.socialMediaAccount.accountType }
          : null,
        targetPlatforms: post.targetPlatforms,
        platformInsights: Array.from(insightsByPlatform.entries()).map(([platform, ins]) => ({
          platform,
          impressions: ins.impressions,
          reach: ins.reach,
          likes: ins.likes,
          comments: ins.comments,
          shares: ins.shares,
          saves: ins.saves,
          clicks: ins.clicks,
          profileVisits: ins.profileVisits,
          bookmarks: ins.bookmarks,
          engagement: ins.engagement,
          fetchedAt: ins.fetchedAt,
        })),
      };
    });

    // What's Working: top 5 posts per platform (8c)
    const topByPlatform: Record<string, any[]> = {};

    // Build per-platform top-5 from the full published posts query
    const allPostData: Array<{
      postId: string;
      captionSnippet: string;
      platform: string;
      engagement: number;
      likes: number;
      reach: number;
      impressions: number;
      contentType: string;
      scheduledFor: Date | null;
    }> = publishedPosts
      .filter((p) => p.postInsights.length > 0)
      .flatMap((p) =>
        p.postInsights.slice(0, 1).map((ins) => ({
          postId: p.id,
          captionSnippet: p.caption.slice(0, 80) + (p.caption.length > 80 ? '...' : ''),
          platform: ins.platform,
          engagement: ins.engagement,
          likes: ins.likes,
          reach: ins.reach,
          impressions: ins.impressions,
          contentType: p.contentType,
          scheduledFor: p.scheduledFor,
        }))
      );

    const allPlatforms: string[] = Array.from(new Set(allPostData.map((p) => p.platform)));
    for (const pl of allPlatforms) {
      topByPlatform[pl] = allPostData
        .filter((p) => p.platform === pl)
        .sort((a, b) => b.engagement - a.engagement)
        .slice(0, 5);
    }

    // Timing analysis per platform (8c)
    const timingByPlatform: Record<string, { hour: number; dayOfWeek: number; avgEngagement: number }[]> = {};
    for (const pl of allPlatforms) {
      const plPosts = allPostData.filter((p) => p.platform === pl && p.scheduledFor);
      const hourMap = new Map<string, { hour: number; dayOfWeek: number; engagements: number[] }>();
      for (const p of plPosts) {
        if (!p.scheduledFor) continue;
        const d = new Date(p.scheduledFor);
        const key = `${d.getUTCDay()}-${d.getUTCHours()}`;
        if (!hourMap.has(key)) {
          hourMap.set(key, { hour: d.getUTCHours(), dayOfWeek: d.getUTCDay(), engagements: [] });
        }
        hourMap.get(key)!.engagements.push(p.engagement);
      }
      timingByPlatform[pl] = Array.from(hourMap.values())
        .map((t) => ({
          hour: t.hour,
          dayOfWeek: t.dayOfWeek,
          avgEngagement: t.engagements.reduce((s, v) => s + v, 0) / t.engagements.length,
        }))
        .sort((a, b) => b.avgEngagement - a.avgEngagement)
        .slice(0, 5);
    }

    logger.info('Combined insights fetched', { userId: user.id, platformFilter });

    return res.status(200).json({
      summary,
      accountOverview,
      postTable,
      topByPlatform,
      timingByPlatform,
    });
  } catch (error) {
    logger.error('Error fetching combined insights:', error, { userId: user.id });
    return res.status(500).json({
      error: 'Failed to fetch combined insights',
      details: error instanceof Error ? error.message : 'Unknown error',
    });
  }
}
