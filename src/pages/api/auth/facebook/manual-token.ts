import { NextApiRequest, NextApiResponse } from 'next';
import { createClient } from '@/util/supabase/api';
import prisma from '@/lib/prisma';
import { logger } from '@/lib/server-logger';
import { encrypt, isEncryptionConfigured } from '@/lib/encryption';
import { getManagedPages, exchangeForLongLivedToken, isFacebookConfigured, getTokenSelf } from '@/lib/facebook-oauth';

/**
 * POST /api/auth/facebook/manual-token
 *
 * Accepts a user access token that the user generated directly in Meta's
 * Graph API Explorer (with at least the pages_show_list + pages_manage_posts
 * + pages_read_engagement scopes) and saves the resulting Facebook Page
 * account to the database.
 *
 * Body:
 *   - userAccessToken: string (required)
 *   - pageId?: string (optional — pick a specific Page; otherwise the first one is used)
 *
 * Behavior:
 *   - If FACEBOOK_APP_ID/SECRET are configured, the short-lived user token is
 *     exchanged for a long-lived one before fetching Pages. Page tokens
 *     derived from a long-lived user token do not expire.
 *   - If app credentials are not configured, the provided token is used
 *     as-is (the resulting Page tokens may expire sooner).
 */
export default async function handler(req: NextApiRequest, res: NextApiResponse) {
  if (req.method !== 'POST') {
    return res.status(405).json({ error: 'Method not allowed' });
  }

  const supabase = createClient(req, res);
  const { data: { user }, error: authError } = await supabase.auth.getUser();
  if (authError || !user) {
    return res.status(401).json({ error: 'Unauthorized' });
  }

  const { userAccessToken, pageId } = req.body as { userAccessToken?: string; pageId?: string };

  if (!userAccessToken || typeof userAccessToken !== 'string' || userAccessToken.trim().length < 20) {
    return res.status(400).json({ error: 'A valid Facebook user access token is required' });
  }

  try {
    // If app credentials are configured, upgrade to a long-lived token so the
    // derived Page tokens never expire. Otherwise fall back to the raw token.
    let tokenForPageFetch = userAccessToken.trim();
    if (isFacebookConfigured()) {
      try {
        const longLived = await exchangeForLongLivedToken(tokenForPageFetch);
        tokenForPageFetch = longLived.access_token;
        logger.info('Exchanged user token for long-lived token', { userId: user.id });
      } catch (e: any) {
        logger.warn(
          `Could not exchange Facebook token for long-lived version (continuing with provided token): ${e.message}`,
          { userId: user.id }
        );
      }
    }

    // Fetch the Pages managed by this user (works for user access tokens)
    let pages = await getManagedPages(tokenForPageFetch);

    // Fallback: the token might be a page-scoped token (generated when the user
    // selects a specific Page in Graph API Explorer rather than "User Token").
    // For page tokens, GET /me returns the Page's own id+name, and the token
    // itself is the page access token — no separate page token fetch is needed.
    if (!pages || pages.length === 0) {
      logger.info('No pages from /me/accounts — checking if token is a page-scoped token', {
        userId: user.id,
      });
      const self = await getTokenSelf(tokenForPageFetch);
      if (self?.id && self?.name) {
        logger.info('Detected page-scoped token; using token directly as page access token', {
          userId: user.id,
          pageId: self.id,
        });
        pages = [{ id: self.id, name: self.name, access_token: tokenForPageFetch }];
      }
    }

    if (!pages || pages.length === 0) {
      return res.status(400).json({
        error:
          'No Facebook Pages found for this token. ' +
          'If you generated this token from Meta\'s Graph API Explorer, make sure you selected ' +
          '"User Token" (not a specific Page) in the token dropdown, then added the ' +
          'pages_show_list, pages_manage_posts, and pages_read_engagement scopes.',
      });
    }

    // Pick the requested page, or the first one
    const page = pageId ? pages.find(p => p.id === pageId) : pages[0];
    if (!page) {
      return res.status(400).json({
        error: `Page ID ${pageId} not found in your managed Pages. Available: ${pages.map(p => `${p.name} (${p.id})`).join(', ')}`,
      });
    }

    // Encrypt the page access token
    let accessToken = page.access_token;
    let isEncrypted = false;
    if (isEncryptionConfigured()) {
      try {
        accessToken = encrypt(page.access_token);
        isEncrypted = true;
      } catch (e) {
        logger.error('Failed to encrypt Facebook page token:', e);
      }
    }

    // Upsert the account
    const existing = await prisma.socialMediaAccount.findFirst({
      where: { userId: user.id, accountType: 'FACEBOOK', facebookPageId: page.id },
    });

    let account;
    if (existing) {
      account = await prisma.socialMediaAccount.update({
        where: { id: existing.id },
        data: {
          username: page.name,
          accessToken,
          isEncrypted,
          tokenExpiresAt: null,
          facebookPageName: page.name,
          updatedAt: new Date(),
        },
      });
      logger.info('Updated existing Facebook Page account via manual token', { userId: user.id, pageId: page.id });
    } else {
      account = await prisma.socialMediaAccount.create({
        data: {
          username: page.name,
          accessToken,
          isEncrypted,
          tokenExpiresAt: null,
          accountType: 'FACEBOOK',
          facebookPageId: page.id,
          facebookPageName: page.name,
          userId: user.id,
        },
      });
      logger.info('Created new Facebook Page account via manual token', { userId: user.id, pageId: page.id });
    }

    return res.status(200).json({
      success: true,
      account,
      pagesAvailable: pages.map(p => ({ id: p.id, name: p.name })),
      message: `Connected Facebook Page: ${page.name}`,
    });
  } catch (error: any) {
    logger.error('Facebook manual token connection failed:', error, { userId: user.id });
    return res.status(400).json({
      error: error.message || 'Failed to connect Facebook Page using the provided token',
    });
  }
}
