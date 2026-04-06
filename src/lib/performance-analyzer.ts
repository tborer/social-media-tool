import prisma from '@/lib/prisma';

type Platform = 'INSTAGRAM' | 'LINKEDIN' | 'X' | 'ALL';

// CTA keywords for caption linting
const CTA_KEYWORDS = [
  'save', 'comment', 'share', 'click', 'visit', 'check out', 'dm', 'swipe',
  'tap', 'follow', 'subscribe', 'link in bio', 'shop now', 'learn more',
  'sign up', 'register', 'apply', 'join', 'watch', 'grab', 'get yours',
  'drop a', 'tell me', 'let me know', 'tag a', 'double tap',
];

// Platform hashtag norms
const HASHTAG_NORMS: Record<string, { ideal: [number, number]; tooMany: number }> = {
  INSTAGRAM: { ideal: [5, 15], tooMany: 30 },
  LINKEDIN: { ideal: [3, 5], tooMany: 10 },
  X: { ideal: [1, 3], tooMany: 5 },
};

// Platform caption length norms (chars)
const CAPTION_NORMS: Record<string, { ideal: [number, number]; tooLong: number }> = {
  INSTAGRAM: { ideal: [150, 500], tooLong: 1500 },
  LINKEDIN: { ideal: [200, 1300], tooLong: 2500 },
  X: { ideal: [50, 240], tooLong: 280 },
};

export interface CaptionLintResult {
  score: number;        // 0-100
  grade: 'red' | 'yellow' | 'green';
  hasCTA: boolean;
  hasQuestion: boolean;
  hashtagCount: number;
  hashtagStatus: 'ok' | 'too_few' | 'too_many';
  captionLength: number;
  captionLengthStatus: 'ok' | 'too_short' | 'too_long';
  hasLinkInBio: boolean; // Instagram only
  suggestions: string[];
}

export function lintCaption(caption: string, platform: string): CaptionLintResult {
  const lower = caption.toLowerCase();
  const hasCTA = CTA_KEYWORDS.some((kw) => lower.includes(kw));
  const hasQuestion = caption.includes('?');
  const hashtagCount = (caption.match(/#[\w\u00C0-\u024F]+/g) || []).length;
  const captionLength = caption.length;
  const hasLinkInBio = platform === 'INSTAGRAM' && lower.includes('link in bio');

  const norm = HASHTAG_NORMS[platform] ?? HASHTAG_NORMS['INSTAGRAM'];
  const capNorm = CAPTION_NORMS[platform] ?? CAPTION_NORMS['INSTAGRAM'];

  const hashtagStatus: CaptionLintResult['hashtagStatus'] =
    hashtagCount > norm.tooMany ? 'too_many' :
    hashtagCount < norm.ideal[0] ? 'too_few' : 'ok';

  const captionLengthStatus: CaptionLintResult['captionLengthStatus'] =
    captionLength > capNorm.tooLong ? 'too_long' :
    captionLength < capNorm.ideal[0] ? 'too_short' : 'ok';

  const suggestions: string[] = [];
  let score = 100;

  if (!hasCTA) {
    suggestions.push('Add a call-to-action (e.g. "Save this post", "Drop a comment", "Link in bio").');
    score -= 25;
  }
  if (!hasQuestion) {
    suggestions.push('Add a question to encourage comments and boost engagement.');
    score -= 10;
  }
  if (hashtagStatus === 'too_many') {
    suggestions.push(`Too many hashtags (${hashtagCount}). Aim for ${norm.ideal[0]}–${norm.ideal[1]} for ${platform}.`);
    score -= 15;
  } else if (hashtagStatus === 'too_few') {
    suggestions.push(`Add more hashtags — at least ${norm.ideal[0]} for ${platform}.`);
    score -= 10;
  }
  if (captionLengthStatus === 'too_long') {
    suggestions.push(`Caption is too long (${captionLength} chars). Keep it under ${capNorm.tooLong} for ${platform}.`);
    score -= 15;
  } else if (captionLengthStatus === 'too_short') {
    suggestions.push(`Caption is very short. Aim for at least ${capNorm.ideal[0]} characters to provide context.`);
    score -= 10;
  }
  if (platform === 'INSTAGRAM' && !hasLinkInBio && hasCTA) {
    suggestions.push('Consider adding "link in bio" if you want to drive traffic to a URL.');
    score -= 5;
  }

  score = Math.max(0, score);
  const grade: CaptionLintResult['grade'] =
    score >= 70 ? 'green' : score >= 40 ? 'yellow' : 'red';

  return {
    score,
    grade,
    hasCTA,
    hasQuestion,
    hashtagCount,
    hashtagStatus,
    captionLength,
    captionLengthStatus,
    hasLinkInBio,
    suggestions,
  };
}

export interface UnderperformerPost {
  id: string;
  captionSnippet: string;
  platform: string;
  engagement: number;
  avgEngagement: number;
  failureModes: string[];
  impressions: number;
  reach: number;
  likes: number;
  comments: number;
  saves: number;
  scheduledFor: Date | null;
}

export interface DeclineAlert {
  platform: string;
  metric: 'engagement' | 'followers';
  thisWeek: number;
  lastWeek: number;
  dropPercent: number;
  suggestion: string;
}

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
  // 8d additions
  underperformers: UnderperformerPost[];
  declineAlerts: DeclineAlert[];
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
      underperformers: [],
      declineAlerts: [],
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

  // ------------------------------------------------------------------
  // 8d: Underperformer detection (bottom 20% by engagement, last 90 days)
  // ------------------------------------------------------------------
  const ninetyDaysAgo = new Date(Date.now() - 90 * 24 * 60 * 60 * 1000);
  const recentPostData = postData.filter(
    (p) => p.createdAt >= ninetyDaysAgo
  );
  const underperformers: UnderperformerPost[] = [];

  if (recentPostData.length >= 5) {
    const sortedRecent = [...recentPostData].sort((a, b) => a.engagement - b.engagement);
    const cutoffIdx = Math.ceil(sortedRecent.length * 0.2);
    const bottom20 = sortedRecent.slice(0, cutoffIdx);
    const plAvgMap = new Map<string, number>();
    for (const ps of platformStats) plAvgMap.set(ps.platform, ps.avgEngagement);

    for (const p of bottom20) {
      const plAvg = plAvgMap.get(p.platform) ?? sumE;
      const failureModes: string[] = [];
      const normHt = HASHTAG_NORMS[p.platform] ?? HASHTAG_NORMS['INSTAGRAM'];
      const normCap = CAPTION_NORMS[p.platform] ?? CAPTION_NORMS['INSTAGRAM'];
      const ht = (p.caption.match(/#[\w\u00C0-\u024F]+/g) || []).length;
      const lower = p.caption.toLowerCase();
      const hasCTA = CTA_KEYWORDS.some((kw) => lower.includes(kw));

      if (ht > normHt.tooMany) failureModes.push('Too many hashtags');
      if (ht < normHt.ideal[0]) failureModes.push('Too few hashtags');
      if (p.caption.length > normCap.tooLong) failureModes.push('Caption too long');
      if (!hasCTA) failureModes.push('No call to action');
      if (!p.caption.includes('?')) failureModes.push('No engagement question');
      if (p.impressions > sumE * 1.5 && p.engagement < plAvg * 0.5) {
        failureModes.push('High reach but low engagement — check media quality');
      }
      if (p.saves < 1 && p.reach > sumR * 0.8) {
        failureModes.push('Good reach but no saves — add more value/utility');
      }
      if (failureModes.length === 0) failureModes.push('Below-average engagement');

      underperformers.push({
        id: p.id,
        captionSnippet: truncateCaption(p.caption),
        platform: p.platform,
        engagement: p.engagement,
        avgEngagement: plAvg,
        failureModes,
        impressions: p.impressions,
        reach: p.reach,
        likes: p.likes,
        comments: p.comments,
        saves: p.saves,
        scheduledFor: p.scheduledFor instanceof Date ? p.scheduledFor : null,
      });
    }
  }

  // ------------------------------------------------------------------
  // 8d: Decline alerts — week-over-week engagement drop > 20%
  // ------------------------------------------------------------------
  const declineAlerts: DeclineAlert[] = [];
  const oneWeekAgo = new Date(Date.now() - 7 * 24 * 60 * 60 * 1000);
  const twoWeeksAgo = new Date(Date.now() - 14 * 24 * 60 * 60 * 1000);

  const allPlatformsInData = Array.from(new Set(postData.map((p) => p.platform)));
  for (const pl of allPlatformsInData) {
    const plPosts = postData.filter((p) => p.platform === pl);
    const thisWeekPosts = plPosts.filter((p) => p.createdAt >= oneWeekAgo);
    const lastWeekPosts = plPosts.filter(
      (p) => p.createdAt >= twoWeeksAgo && p.createdAt < oneWeekAgo
    );

    if (thisWeekPosts.length > 0 && lastWeekPosts.length > 0) {
      const thisWkAvg = avg(thisWeekPosts.map((p) => p.engagement));
      const lastWkAvg = avg(lastWeekPosts.map((p) => p.engagement));
      if (lastWkAvg > 0) {
        const drop = ((lastWkAvg - thisWkAvg) / lastWkAvg) * 100;
        if (drop >= 20) {
          const mediaCheck = thisWeekPosts.some((p) => !p.caption.includes('#'))
            ? 'Your recent posts have no hashtags.'
            : thisWeekPosts.every((p) => !p.caption.includes('?'))
            ? 'Your recent posts have no engagement questions.'
            : 'Review your recent content format and posting times.';
          declineAlerts.push({
            platform: pl,
            metric: 'engagement',
            thisWeek: Math.round(thisWkAvg * 100) / 100,
            lastWeek: Math.round(lastWkAvg * 100) / 100,
            dropPercent: Math.round(drop),
            suggestion: `Your ${pl} engagement dropped ${Math.round(drop)}% this week. ${mediaCheck}`,
          });
        }
      }
    }
  }

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
    underperformers,
    declineAlerts,
  };
}
