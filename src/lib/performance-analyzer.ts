import prisma from '@/lib/prisma';

type Platform = 'INSTAGRAM' | 'LINKEDIN' | 'X' | 'ALL';

interface TopPost {
  id: string;
  captionSnippet: string;
  platform: string;
  engagement: number;
  likes: number;
  reach: number;
  impressions: number;
}

interface BestPostingTime {
  hour: number;
  dayOfWeek: number;
  postCount: number;
}

interface HashtagAnalysis {
  topPostHashtags: string[];
  worstPostHashtags: string[];
  recommendedHashtags: string[];
  avoidHashtags: string[];
}

interface ContentTypeBreakdown {
  type: string;
  count: number;
  avgEngagement: number;
}

interface PlatformStats {
  platform: string;
  totalPosts: number;
  avgEngagement: number;
  avgLikes: number;
  avgComments: number;
  avgShares: number;
  avgReach: number;
  avgImpressions: number;
  followers: number | null;
  followerGrowth: number | null;
}

export interface PerformanceSummary {
  totalPosts: number;
  avgEngagement: number;
  avgLikes: number;
  avgComments: number;
  avgShares: number;
  avgSaves: number;
  avgReach: number;
  topPosts: TopPost[];
  worstPosts: TopPost[];
  bestPostingTimes: BestPostingTime[];
  hashtagAnalysis: HashtagAnalysis;
  followerCount: number | null;
  // Cross-platform additions
  platformStats: PlatformStats[];
  contentTypeBreakdown: ContentTypeBreakdown[];
}

function extractHashtags(caption: string): string[] {
  const matches = caption.match(/#[\w\u00C0-\u024F]+/g);
  return matches ? matches.map((h) => h.toLowerCase()) : [];
}

function truncateCaption(caption: string, maxLen = 80): string {
  return caption.length > maxLen ? caption.slice(0, maxLen) + '...' : caption;
}

function avg(values: number[]): number {
  if (values.length === 0) return 0;
  return Math.round((values.reduce((s, v) => s + v, 0) / values.length) * 100) / 100;
}

export async function getPerformanceSummary(
  userId: string,
  platform: Platform = 'ALL'
): Promise<PerformanceSummary> {
  // Fetch all published posts with their latest insights
  const posts = await prisma.contentPost.findMany({
    where: { userId, status: 'PUBLISHED' },
    include: {
      postInsights: {
        orderBy: { fetchedAt: 'desc' },
        take: 1,
      },
    },
    orderBy: { createdAt: 'desc' },
  });

  // Fetch latest account insight per account (all platforms)
  const accounts = await prisma.socialMediaAccount.findMany({
    where: { userId },
    include: {
      accountInsights: {
        orderBy: { fetchedAt: 'desc' },
        take: 1,
      },
    },
  });

  const latestAccountInsight = accounts
    .flatMap((a) => a.accountInsights)
    .sort((a, b) => b.fetchedAt.getTime() - a.fetchedAt.getTime())[0];

  // Build per-post data — filter by platform when requested
  const postData = posts
    .filter((p) => p.postInsights.length > 0)
    .filter((p) => {
      if (platform === 'ALL') return true;
      return p.postInsights[0].platform === platform;
    })
    .map((p) => {
      const insight = p.postInsights[0];
      return {
        id: p.id,
        caption: p.caption,
        contentType: p.contentType,
        createdAt: p.createdAt,
        platform: insight.platform,
        engagement: insight.engagement,
        likes: insight.likes,
        comments: insight.comments,
        shares: insight.shares,
        saves: insight.saves,
        reach: insight.reach,
        impressions: insight.impressions,
      };
    });

  const totalPosts = postData.length;

  // ------------------------------------------------------------------
  // Per-platform stats
  // ------------------------------------------------------------------
  const platformGroups = new Map<string, typeof postData>();
  for (const p of posts.filter((p) => p.postInsights.length > 0)) {
    const ins = p.postInsights[0];
    const pl = ins.platform;
    if (!platformGroups.has(pl)) platformGroups.set(pl, []);
    platformGroups.get(pl)!.push({
      id: p.id,
      caption: p.caption,
      contentType: p.contentType,
      createdAt: p.createdAt,
      platform: pl,
      engagement: ins.engagement,
      likes: ins.likes,
      comments: ins.comments,
      shares: ins.shares,
      saves: ins.saves,
      reach: ins.reach,
      impressions: ins.impressions,
    });
  }

  const platformStats: PlatformStats[] = [];
  for (const [pl, pData] of platformGroups) {
    const acct = accounts.find((a) => a.accountType === pl);
    const latestAcctIns = acct?.accountInsights[0] ?? null;
    platformStats.push({
      platform: pl,
      totalPosts: pData.length,
      avgEngagement: avg(pData.map((p) => p.engagement)),
      avgLikes: avg(pData.map((p) => p.likes)),
      avgComments: avg(pData.map((p) => p.comments)),
      avgShares: avg(pData.map((p) => p.shares)),
      avgReach: avg(pData.map((p) => p.reach)),
      avgImpressions: avg(pData.map((p) => p.impressions)),
      followers: latestAcctIns?.followers ?? null,
      followerGrowth: latestAcctIns?.followerGrowth ?? null,
    });
  }

  // ------------------------------------------------------------------
  // Content type breakdown
  // ------------------------------------------------------------------
  const typeGroups = new Map<string, number[]>();
  for (const p of postData) {
    const t = p.contentType;
    if (!typeGroups.has(t)) typeGroups.set(t, []);
    typeGroups.get(t)!.push(p.engagement);
  }
  const contentTypeBreakdown: ContentTypeBreakdown[] = [];
  for (const [type, engagements] of typeGroups) {
    contentTypeBreakdown.push({
      type,
      count: engagements.length,
      avgEngagement: avg(engagements),
    });
  }
  contentTypeBreakdown.sort((a, b) => b.avgEngagement - a.avgEngagement);

  if (totalPosts === 0) {
    return {
      totalPosts: 0,
      avgEngagement: 0,
      avgLikes: 0,
      avgComments: 0,
      avgShares: 0,
      avgSaves: 0,
      avgReach: 0,
      topPosts: [],
      worstPosts: [],
      bestPostingTimes: [],
      hashtagAnalysis: {
        topPostHashtags: [],
        worstPostHashtags: [],
        recommendedHashtags: [],
        avoidHashtags: [],
      },
      followerCount: latestAccountInsight?.followers ?? null,
      platformStats,
      contentTypeBreakdown,
    };
  }

  // Aggregate averages
  const sumE = avg(postData.map((p) => p.engagement));
  const sumL = avg(postData.map((p) => p.likes));
  const sumC = avg(postData.map((p) => p.comments));
  const sumSh = avg(postData.map((p) => p.shares));
  const sumSv = avg(postData.map((p) => p.saves));
  const sumR = avg(postData.map((p) => p.reach));

  // Sort by engagement for top/worst
  const sorted = [...postData].sort((a, b) => b.engagement - a.engagement);

  const toTopPost = (p: (typeof postData)[0]): TopPost => ({
    id: p.id,
    captionSnippet: truncateCaption(p.caption),
    platform: p.platform,
    engagement: p.engagement,
    likes: p.likes,
    reach: p.reach,
    impressions: p.impressions,
  });

  const topPosts = sorted.slice(0, 5).map(toTopPost);
  const worstPosts = sorted.slice(-3).reverse().map(toTopPost);

  // Best posting times from top-performing posts
  const topForTimes = sorted.slice(0, Math.min(10, sorted.length));
  const timeMap = new Map<string, { hour: number; dayOfWeek: number; count: number }>();
  for (const p of topForTimes) {
    const d = new Date(p.createdAt);
    const key = `${d.getUTCDay()}-${d.getUTCHours()}`;
    const existing = timeMap.get(key);
    if (existing) {
      existing.count++;
    } else {
      timeMap.set(key, { hour: d.getUTCHours(), dayOfWeek: d.getUTCDay(), count: 1 });
    }
  }
  const bestPostingTimes = Array.from(timeMap.values())
    .sort((a, b) => b.count - a.count)
    .slice(0, 5)
    .map((t) => ({ hour: t.hour, dayOfWeek: t.dayOfWeek, postCount: t.count }));

  // Hashtag analysis (caption-level, works across platforms)
  const topHashtags = sorted.slice(0, 5).flatMap((p) => extractHashtags(p.caption));
  const worstHashtags = sorted.slice(-3).flatMap((p) => extractHashtags(p.caption));

  const topSet = new Set(topHashtags);
  const worstSet = new Set(worstHashtags);

  const topFreq = new Map<string, number>();
  for (const h of topHashtags) {
    topFreq.set(h, (topFreq.get(h) || 0) + 1);
  }

  const recommendedHashtags = Array.from(topFreq.entries())
    .sort((a, b) => b[1] - a[1])
    .map(([tag]) => tag)
    .filter((tag) => !worstSet.has(tag) || topSet.has(tag))
    .slice(0, 10);

  const avoidHashtags = Array.from(worstSet).filter((h) => !topSet.has(h));

  return {
    totalPosts,
    avgEngagement: sumE,
    avgLikes: sumL,
    avgComments: sumC,
    avgShares: sumSh,
    avgSaves: sumSv,
    avgReach: sumR,
    topPosts,
    worstPosts,
    bestPostingTimes,
    hashtagAnalysis: {
      topPostHashtags: Array.from(topSet),
      worstPostHashtags: Array.from(worstSet),
      recommendedHashtags,
      avoidHashtags,
    },
    followerCount: latestAccountInsight?.followers ?? null,
    platformStats,
    contentTypeBreakdown,
  };
}
