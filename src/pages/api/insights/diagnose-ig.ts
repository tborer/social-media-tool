import { NextApiRequest, NextApiResponse } from 'next';
import { createClient } from '@/util/supabase/api';
import prisma from '@/lib/prisma';
import { logger } from '@/lib/server-logger';
import { getAccessToken } from '@/lib/instagram-token-manager';

const INSTAGRAM_GRAPH_API = 'https://graph.instagram.com/v22.0';

/**
 * POST /api/insights/diagnose-ig
 *
 * Diagnostic endpoint for Instagram insights retrieval. Given an accountId,
 * this endpoint runs a sequence of probes against the Meta Graph API and
 * returns the raw responses so the user can see exactly why insights may or
 * may not be working.
 *
 * Checks performed:
 *   1. Account type (BUSINESS / MEDIA_CREATOR / PERSONAL)
 *   2. Basic /me fields (followers_count, media_count)
 *   3. Most recent media list
 *   4. Per-media /insights call for the newest post (tests the critical
 *      post-insights path including the `views` metric)
 *   5. Account-level /me/insights call
 *
 * Body: { accountId: string }
 */
export default async function handler(req: NextApiRequest, res: NextApiResponse) {
  const supabase = createClient(req, res);
  const { data: { user }, error: authError } = await supabase.auth.getUser();

  if (authError || !user) {
    return res.status(401).json({ error: 'Unauthorized' });
  }

  if (req.method !== 'POST') {
    return res.status(405).json({ error: 'Method not allowed' });
  }

  const { accountId } = req.body;
  if (!accountId || typeof accountId !== 'string') {
    return res.status(400).json({ error: 'accountId is required' });
  }

  const account = await prisma.socialMediaAccount.findFirst({
    where: { id: accountId, userId: user.id, accountType: 'INSTAGRAM' },
  });

  if (!account) {
    return res.status(404).json({ error: 'Instagram account not found' });
  }

  const report: {
    accountId: string;
    username: string;
    storedAccountType: string | null;
    checks: Record<string, { ok: boolean; status?: number; data?: any; error?: string }>;
    summary: {
      insightsSupported: boolean;
      blockingIssue: string | null;
      recommendations: string[];
    };
  } = {
    accountId,
    username: account.username,
    storedAccountType: account.instagramAccountType ?? null,
    checks: {},
    summary: {
      insightsSupported: false,
      blockingIssue: null,
      recommendations: [],
    },
  };

  let accessToken: string;
  try {
    accessToken = await getAccessToken(accountId, user.id);
  } catch (err) {
    report.checks.tokenAccess = {
      ok: false,
      error: err instanceof Error ? err.message : 'Unknown',
    };
    report.summary.blockingIssue = 'Could not retrieve access token — reconnect your Instagram account.';
    return res.status(200).json(report);
  }

  // Helper to safely run a probe
  const probe = async (name: string, url: string) => {
    try {
      const r = await fetch(url);
      const data = await r.json().catch(() => ({}));
      report.checks[name] = { ok: r.ok, status: r.status, data };
      return { ok: r.ok, data, status: r.status };
    } catch (err) {
      report.checks[name] = { ok: false, error: err instanceof Error ? err.message : 'Unknown' };
      return { ok: false, data: {}, status: 0 };
    }
  };

  // 1. Account type + basic fields
  const accountProbe = await probe(
    'account',
    `${INSTAGRAM_GRAPH_API}/me?fields=id,username,account_type,followers_count,media_count&access_token=${accessToken}`
  );

  const liveAccountType = accountProbe.data?.account_type ?? null;
  const supportsInsights = liveAccountType === 'BUSINESS' || liveAccountType === 'MEDIA_CREATOR';

  if (!accountProbe.ok) {
    report.summary.blockingIssue = 'Cannot fetch /me from Instagram. Token may be expired or revoked.';
    report.summary.recommendations.push('Reconnect your Instagram account.');
    return res.status(200).json(report);
  }

  if (liveAccountType && !supportsInsights) {
    report.summary.blockingIssue = `Instagram account type is ${liveAccountType}. Insights require BUSINESS or MEDIA_CREATOR.`;
    report.summary.recommendations.push('Switch to a Professional account in the Instagram app (Settings → Account → Switch to Professional Account).');
  }

  // Persist the live account type so the dashboard reflects it
  if (liveAccountType && liveAccountType !== account.instagramAccountType) {
    try {
      await prisma.socialMediaAccount.update({
        where: { id: accountId },
        data: { instagramAccountType: liveAccountType },
      });
      report.storedAccountType = liveAccountType;
    } catch (updateErr) {
      logger.warn('Failed to persist IG account type from diagnostic', updateErr, { userId: user.id, accountId });
    }
  }

  // 2. Media list
  const mediaProbe = await probe(
    'mediaList',
    `${INSTAGRAM_GRAPH_API}/me/media?fields=id,media_type,media_product_type,timestamp&limit=5&access_token=${accessToken}`
  );

  const firstMediaId = mediaProbe.data?.data?.[0]?.id;
  const firstMediaProductType = mediaProbe.data?.data?.[0]?.media_product_type ?? '';

  // 3. Per-post insights for the newest media — this is the critical check
  if (firstMediaId) {
    const isStory = firstMediaProductType === 'STORY';
    const metrics = isStory
      ? 'reach,views,shares,total_interactions,replies'
      : 'reach,likes,comments,shares,saved,views,total_interactions';

    await probe(
      'postInsights_v22',
      `${INSTAGRAM_GRAPH_API}/${firstMediaId}/insights?metric=${metrics}&access_token=${accessToken}`
    );

    // Also try the legacy metric set so we can see exactly which metrics Meta rejects
    await probe(
      'postInsights_legacy',
      `${INSTAGRAM_GRAPH_API}/${firstMediaId}/insights?metric=impressions,reach,likes,comments,shares,saved&access_token=${accessToken}`
    );
  } else {
    report.checks.postInsights_v22 = { ok: false, error: 'No media found to probe' };
  }

  // 4. Account-level insights (modern signature)
  const now = Math.floor(Date.now() / 1000);
  const since = now - 30 * 24 * 60 * 60;
  await probe(
    'accountInsights',
    `${INSTAGRAM_GRAPH_API}/me/insights?metric=profile_views,website_clicks&metric_type=total_value&period=day&since=${since}&until=${now}&access_token=${accessToken}`
  );

  // Build a summary
  const postInsightsOk = report.checks.postInsights_v22?.ok === true;
  report.summary.insightsSupported = supportsInsights && postInsightsOk;

  if (!report.summary.blockingIssue) {
    if (!postInsightsOk && firstMediaId) {
      const metricErr = report.checks.postInsights_v22?.data?.error?.message ?? 'Unknown';
      report.summary.blockingIssue = `Post insights call failed: ${metricErr}`;
      report.summary.recommendations.push('Check that the `instagram_business_manage_insights` scope was granted during OAuth.');
      report.summary.recommendations.push('Verify the Instagram app in Meta Developer Console is in Live mode (not Development).');
    } else if (postInsightsOk) {
      report.summary.recommendations.push('All checks passed — run "Sync Instagram Posts" to refresh insights.');
    }
  }

  logger.info('IG diagnostic run', { userId: user.id, accountId, summary: report.summary });

  return res.status(200).json(report);
}
