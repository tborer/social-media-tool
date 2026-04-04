import { NextApiRequest, NextApiResponse } from 'next';
import { createClient } from '@/util/supabase/api';
import prisma from '@/lib/prisma';
import { logger } from '@/lib/server-logger';
import { getAccessToken, getTokenInfo } from '@/lib/instagram-token-manager';
import { mapInstagramError } from '@/lib/instagram-error-handler';

const INSTAGRAM_GRAPH_API = 'https://graph.instagram.com/v22.0';

/**
 * Instagram Connection Diagnostics
 *
 * Runs a series of checks against an Instagram account's token to help
 * diagnose authentication / API connectivity issues.
 *
 * Query params:
 *   - accountId: the SocialMediaAccount id to diagnose
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

  const { accountId } = req.query;
  if (!accountId || typeof accountId !== 'string') {
    return res.status(400).json({ error: 'accountId query parameter is required' });
  }

  const checks: Array<{ name: string; ok: boolean; details?: any }> = [];

  try {
    // Check 1: account exists
    const account = await prisma.socialMediaAccount.findFirst({
      where: { id: accountId, userId: user.id },
    });

    if (!account) {
      return res.status(404).json({ error: 'Account not found' });
    }

    checks.push({
      name: 'Account record exists',
      ok: true,
      details: {
        username: account.username,
        accountType: account.accountType,
        isEncrypted: account.isEncrypted,
        tokenExpiresAt: account.tokenExpiresAt,
        updatedAt: account.updatedAt,
      },
    });

    // Check 2: token expiration metadata
    let tokenInfo;
    try {
      tokenInfo = await getTokenInfo(accountId, user.id);
      checks.push({
        name: 'Token metadata',
        ok: !tokenInfo.isExpired,
        details: {
          expiresAt: tokenInfo.expiresAt,
          isExpired: tokenInfo.isExpired,
          needsRefresh: tokenInfo.needsRefresh,
          tokenState: tokenInfo.token,
        },
      });
    } catch (e) {
      checks.push({
        name: 'Token metadata',
        ok: false,
        details: { error: e instanceof Error ? e.message : 'Unknown error' },
      });
    }

    // Check 3: can we decrypt / retrieve the token?
    let accessToken: string | null = null;
    try {
      accessToken = await getAccessToken(accountId, user.id);
      checks.push({
        name: 'Token retrieval / decryption',
        ok: true,
        details: { tokenPreview: `${accessToken.slice(0, 6)}...${accessToken.slice(-4)}` },
      });
    } catch (e) {
      checks.push({
        name: 'Token retrieval / decryption',
        ok: false,
        details: { error: e instanceof Error ? e.message : 'Unknown error' },
      });
    }

    if (!accessToken) {
      return res.status(200).json({
        accountId,
        username: account.username,
        overallStatus: 'failed',
        checks,
        recommendation: 'Reconnect your Instagram account.',
      });
    }

    // Check 4: call Instagram /me (basic identity - works with both Basic Display & Graph API)
    let accountType = 'unknown';
    try {
      const meResponse = await fetch(
        `${INSTAGRAM_GRAPH_API}/me?fields=id,username,account_type&access_token=${accessToken}`
      );
      if (meResponse.ok) {
        const meData = await meResponse.json();
        accountType = meData.account_type || 'unknown';
        checks.push({
          name: 'Instagram /me (identity)',
          ok: true,
          details: { id: meData.id, username: meData.username, accountType: meData.account_type },
        });
      } else {
        const errorData = await meResponse.json().catch(() => ({}));
        const mapped = mapInstagramError(meResponse.status, errorData);
        checks.push({
          name: 'Instagram /me (identity)',
          ok: false,
          details: { status: meResponse.status, instagramError: errorData?.error, mapped: mapped.body },
        });

        return res.status(200).json({
          accountId,
          username: account.username,
          overallStatus: 'failed',
          checks,
          recommendation:
            mapped.body.code === 'TOKEN_INVALID'
              ? 'Your Instagram access token is invalid or expired. Disconnect and reconnect your Instagram account.'
              : 'Instagram API call failed. See check details.',
        });
      }
    } catch (e) {
      checks.push({
        name: 'Instagram /me (identity)',
        ok: false,
        details: { error: e instanceof Error ? e.message : 'Unknown error' },
      });
      return res.status(200).json({
        accountId,
        username: account.username,
        overallStatus: 'failed',
        checks,
        recommendation: 'Network error calling Instagram. Check server connectivity.',
      });
    }

    // Check 5: call Instagram /me with Business/Creator-only fields
    try {
      const bizResponse = await fetch(
        `${INSTAGRAM_GRAPH_API}/me?fields=followers_count,follows_count,media_count&access_token=${accessToken}`
      );
      if (bizResponse.ok) {
        const bizData = await bizResponse.json();
        checks.push({
          name: 'Instagram Business fields (followers_count, etc.)',
          ok: true,
          details: bizData,
        });
      } else {
        const errorData = await bizResponse.json().catch(() => ({}));
        const mapped = mapInstagramError(bizResponse.status, errorData);
        checks.push({
          name: 'Instagram Business fields (followers_count, etc.)',
          ok: false,
          details: { status: bizResponse.status, instagramError: errorData?.error, mapped: mapped.body },
        });
      }
    } catch (e) {
      checks.push({
        name: 'Instagram Business fields (followers_count, etc.)',
        ok: false,
        details: { error: e instanceof Error ? e.message : 'Unknown error' },
      });
    }

    const allOk = checks.every((c) => c.ok);
    const recommendation = allOk
      ? 'All checks passed. Insights should be available.'
      : accountType && accountType !== 'BUSINESS' && accountType !== 'CREATOR'
        ? `This account is of type "${accountType}". Account Insights require a Business or Creator account. Convert your account in the Instagram app and reconnect.`
        : 'Some checks failed. Review the check details and consider reconnecting the account.';

    return res.status(200).json({
      accountId,
      username: account.username,
      accountType,
      overallStatus: allOk ? 'healthy' : 'degraded',
      checks,
      recommendation,
    });
  } catch (error) {
    logger.error('Error running Instagram diagnostics', { error, accountId, userId: user.id });
    return res.status(500).json({
      error: 'Diagnostics failed',
      details: error instanceof Error ? error.message : 'Unknown error',
      checks,
    });
  }
}
