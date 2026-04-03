import prisma from '@/lib/prisma';

interface TopPost {
  captionSnippet: string;
  engagement: number;
  likes: number;
  reach: number;
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
}

function extractHashtags(caption: string): string[] {
  const matches = caption.match(/#[\w\u00C0-\u024F]+/g);
  return matches ? matches.map((h) => h.toLowerCase()) : [];
}

function truncateCaption(caption: string, maxLen = 80): string {
  return caption.length > maxLen ? caption.slice(0, maxLen) + '...' : caption;
}

export async function getPerformanceSummary(userId: string): Promise<PerformanceSummary> {
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

  // Fetch latest account insight for follower count
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

  // Build per-post data with insight metrics
  const postData = posts
    .filter((p) => p.postInsights.length > 0)
    .map((p) => {
      const insight = p.postInsights[0];
      return {
        caption: p.caption,
        createdAt: p.createdAt,
        engagement: insight.engagement,
        likes: insight.likes,
        comments: insight.comments,
        shares: insight.shares,
        saves: insight.saves,
        reach: insight.reach,
      };
    });

  const totalPosts = postData.length;

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
    };
  }

  // Averages
  const sum = postData.reduce(
    (acc, p) => ({
      engagement: acc.engagement + p.engagement,
      likes: acc.likes + p.likes,
      comments: acc.comments + p.comments,
      shares: acc.shares + p.shares,
      saves: acc.saves + p.saves,
      reach: acc.reach + p.reach,
    }),
    { engagement: 0, likes: 0, comments: 0, shares: 0, saves: 0, reach: 0 }
  );

  const avg = (v: number) => Math.round((v / totalPosts) * 100) / 100;

  // Sort by engagement for top/worst
  const sorted = [...postData].sort((a, b) => b.engagement - a.engagement);

  const toTopPost = (p: (typeof postData)[0]): TopPost => ({
    captionSnippet: truncateCaption(p.caption),
    engagement: p.engagement,
    likes: p.likes,
    reach: p.reach,
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

  // Hashtag analysis
  const topHashtags = sorted
    .slice(0, 5)
    .flatMap((p) => extractHashtags(p.caption));
  const worstHashtags = sorted
    .slice(-3)
    .flatMap((p) => extractHashtags(p.caption));

  const topSet = new Set(topHashtags);
  const worstSet = new Set(worstHashtags);

  // Count frequency in top posts
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
    avgEngagement: avg(sum.engagement),
    avgLikes: avg(sum.likes),
    avgComments: avg(sum.comments),
    avgShares: avg(sum.shares),
    avgSaves: avg(sum.saves),
    avgReach: avg(sum.reach),
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
  };
}
