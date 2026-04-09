import { NextApiRequest, NextApiResponse } from 'next';
import { createClient } from '@/util/supabase/api';
import {
  exchangeCodeForToken,
  exchangeForLongLivedToken,
  getManagedPages,
} from '@/lib/facebook-oauth';
import { encrypt, isEncryptionConfigured } from '@/lib/encryption';
import { logger } from '@/lib/server-logger';
import prisma from '@/lib/prisma';

/**
 * GET /api/auth/facebook/callback
 *
 * Handles the OAuth callback from Facebook after user authorizes the app.
 * Exchanges the code for a long-lived user token, then fetches managed Pages.
 * Stores the first Page's access_token and metadata.
 */
export default async function handler(req: NextApiRequest, res: NextApiResponse) {
  if (req.method !== 'GET') {
    return res.status(405).json({ error: 'Method not allowed' });
  }

  const { code, state, error_description } = req.query;

  try {
    if (req.query.error) {
      logger.error('Facebook OAuth error:', { error: req.query.error, error_description });
      return res.redirect(
        `/dashboard?error=${encodeURIComponent(
          (error_description as string) || 'Facebook authorization failed'
        )}`
      );
    }

    if (!code || typeof code !== 'string') {
      return res.redirect('/dashboard?error=' + encodeURIComponent('Missing authorization code'));
    }
    if (!state || typeof state !== 'string') {
      return res.redirect('/dashboard?error=' + encodeURIComponent('Invalid state parameter'));
    }

    let stateData: { userId: string; returnUrl?: string; nonce: string };
    try {
      stateData = JSON.parse(Buffer.from(state, 'base64url').toString('utf-8'));
    } catch {
      return res.redirect('/dashboard?error=' + encodeURIComponent('Invalid state parameter'));
    }

    const supabase = createClient(req, res);
    const { data: { user }, error: authError } = await supabase.auth.getUser();
    if (authError || !user) {
      return res.redirect('/dashboard?error=' + encodeURIComponent('Authentication required'));
    }
    if (stateData.userId !== user.id) {
      return res.redirect('/dashboard?error=' + encodeURIComponent('Invalid authentication'));
    }

    logger.info('Processing Facebook OAuth callback', { userId: user.id });

    // Exchange code for short-lived token
    const shortLived = await exchangeCodeForToken(code);

    // Exchange for long-lived user token
    const longLived = await exchangeForLongLivedToken(shortLived.access_token);

    // Fetch the Pages managed by this user
    const pages = await getManagedPages(longLived.access_token);
    if (!pages || pages.length === 0) {
      return res.redirect(
        '/dashboard?error=' +
          encodeURIComponent('No Facebook Pages found. You must manage at least one Page.')
      );
    }

    // Use the first Page (the user can reconnect to pick a different one in the future)
    const page = pages[0];

    // Encrypt the page access token
    let accessToken = page.access_token;
    let isEncrypted = false;
    if (isEncryptionConfigured()) {
      try {
        accessToken = encrypt(page.access_token);
        isEncrypted = true;
      } catch (e) {
        logger.error('Failed to encrypt Facebook token:', e);
      }
    }

    // Page tokens derived from long-lived user tokens do not expire
    const tokenExpiresAt = null;

    // Upsert account
    const existing = await prisma.socialMediaAccount.findFirst({
      where: { userId: user.id, accountType: 'FACEBOOK', facebookPageId: page.id },
    });

    if (existing) {
      await prisma.socialMediaAccount.update({
        where: { id: existing.id },
        data: {
          accessToken,
          isEncrypted,
          tokenExpiresAt,
          facebookPageName: page.name,
          updatedAt: new Date(),
        },
      });
      logger.info('Updated existing Facebook Page account', { userId: user.id, pageId: page.id });
    } else {
      await prisma.socialMediaAccount.create({
        data: {
          username: page.name,
          accessToken,
          isEncrypted,
          tokenExpiresAt,
          accountType: 'FACEBOOK',
          facebookPageId: page.id,
          facebookPageName: page.name,
          userId: user.id,
        },
      });
      logger.info('Created new Facebook Page account', { userId: user.id, pageId: page.id });
    }

    const returnUrl = stateData.returnUrl || '/dashboard';
    const successUrl = `${returnUrl}${returnUrl.includes('?') ? '&' : '?'}success=facebook_connected`;
    logger.info('Facebook OAuth flow completed', { userId: user.id, pageName: page.name });
    return res.redirect(successUrl);
  } catch (error) {
    logger.error('Error in Facebook OAuth callback:', error);
    return res.redirect(
      '/dashboard?error=' +
        encodeURIComponent(
          error instanceof Error ? error.message : 'Failed to connect Facebook account'
        )
    );
  }
}
