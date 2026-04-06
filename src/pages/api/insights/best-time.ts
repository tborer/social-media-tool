import { NextApiRequest, NextApiResponse } from 'next';
import { createClient } from '@/util/supabase/api';
import prisma from '@/lib/prisma';
import { logger } from '@/lib/server-logger';

const DAY_NAMES = ['Sunday', 'Monday', 'Tuesday', 'Wednesday', 'Thursday', 'Friday', 'Saturday'];

/**
 * GET /api/insights/best-time?platform=INSTAGRAM&accountId=xxx
 *
 * Returns the optimal posting time for the given platform based on the user's
 * historical post performance. Used by the "Schedule for best time" button in
 * the create-post dialog.
 *
 * Response: { hour, dayOfWeek, dayName, avgEngagement, sampleSize, isoString }
 * isoString is the next occurrence of that day/hour in the future (UTC).
 */
export default async function handler(req: NextApiRequest, res: NextApiResponse) {
  if (req.method !== 'GET') {
    return res.status(405).json({ error: 'Method not allowed' });
  }

  const supabase = createClient(req, res);
  const { data: { user }, error: authError } = await supabase.auth.getUser();
  if (authError || !user) {
    return res.status(401).json({ error: 'Unauthorized' });
  }

  const { platform, accountId } = req.query;

  try {
    // Fetch all published posts for this user with scheduling time and their best insight
    const whereClause: Record<string, unknown> = {
      userId: user.id,
      status: 'PUBLISHED',
      scheduledFor: { not: null },
    };
    if (accountId && typeof accountId === 'string') {
      whereClause.socialMediaAccountId = accountId;
    }

    const posts = await prisma.contentPost.findMany({
      where: whereClause,
      include: {
        postInsights: {
          where: platform && typeof platform === 'string' ? { platform } : {},
          orderBy: { fetchedAt: 'desc' },
          take: 1,
        },
        socialMediaAccount: { select: { accountType: true } },
      },
      orderBy: { createdAt: 'desc' },
      take: 200,
    });

    // Filter to posts that have insight data
    const postsWithInsights = posts.filter(
      (p) => p.postInsights.length > 0 && p.scheduledFor
    );

    if (postsWithInsights.length < 3) {
      // Not enough data — return a sensible default
      return res.status(200).json({
        hour: 9,
        dayOfWeek: 3, // Wednesday
        dayName: 'Wednesday',
        avgEngagement: null,
        sampleSize: 0,
        isoString: nextOccurrence(3, 9),
        note: 'Not enough data yet — defaulting to Wednesday 9:00 UTC.',
      });
    }

    // Group by day+hour, compute average engagement
    const slotMap = new Map<string, { hour: number; dayOfWeek: number; engagements: number[] }>();
    for (const post of postsWithInsights) {
      const d = new Date(post.scheduledFor!);
      const key = `${d.getUTCDay()}-${d.getUTCHours()}`;
      const eng = post.postInsights[0].engagement;
      if (!slotMap.has(key)) {
        slotMap.set(key, { hour: d.getUTCHours(), dayOfWeek: d.getUTCDay(), engagements: [] });
      }
      slotMap.get(key)!.engagements.push(eng);
    }

    const slots = Array.from(slotMap.values()).map((s) => ({
      hour: s.hour,
      dayOfWeek: s.dayOfWeek,
      avgEngagement: s.engagements.reduce((a, b) => a + b, 0) / s.engagements.length,
      sampleSize: s.engagements.length,
    }));

    // Pick the slot with the highest average engagement (minimum 1 sample)
    slots.sort((a, b) => b.avgEngagement - a.avgEngagement);
    const best = slots[0];

    logger.info('Best time computed', { userId: user.id, platform, best });

    return res.status(200).json({
      hour: best.hour,
      dayOfWeek: best.dayOfWeek,
      dayName: DAY_NAMES[best.dayOfWeek],
      avgEngagement: Math.round(best.avgEngagement * 100) / 100,
      sampleSize: best.sampleSize,
      isoString: nextOccurrence(best.dayOfWeek, best.hour),
    });
  } catch (error) {
    logger.error('Error computing best time:', error, { userId: user.id });
    return res.status(500).json({
      error: 'Failed to compute best posting time',
      details: error instanceof Error ? error.message : 'Unknown error',
    });
  }
}

/**
 * Returns the ISO string of the next occurrence of a given UTC weekday + hour,
 * starting from now + 1 minute.
 */
function nextOccurrence(targetDay: number, targetHour: number): string {
  const now = new Date();
  const result = new Date(Date.UTC(
    now.getUTCFullYear(),
    now.getUTCMonth(),
    now.getUTCDate(),
    targetHour,
    0,
    0,
    0
  ));

  // Advance day-by-day until we land on the right weekday and the time is in the future
  while (result.getUTCDay() !== targetDay || result <= now) {
    result.setUTCDate(result.getUTCDate() + 1);
    result.setUTCHours(targetHour, 0, 0, 0);
  }

  return result.toISOString();
}
