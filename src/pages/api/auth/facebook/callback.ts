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

  console.log('[Facebook callback] Received callback', {
    hasCode: !!code,
    hasState: !!state,
    hasError: !!req.query.error,
    error: req.query.error,
    error_description,
  });

  try {
    if (req.query.error) {
      console.error('[Facebook callback] OAuth error from Facebook provider', {
        error: req.query.error,
        error_description,
      });
      logger.error('Facebook OAuth error:', { error: req.query.error, error_description });
      return res.redirect(
        `/dashboard?error=${encodeURIComponent(
          (error_description as string) || 'Facebook authorization failed'
        )}`
      );
    }

    if (!code || typeof code !== 'string') {
      console.error('[Facebook callback] Missing authorization code');
      return res.redirect('/dashboard?error=' + encodeURIComponent('Missing authorization code'));
    }
    if (!state || typeof state !== 'string') {
      console.error('[Facebook callback] Missing state parameter');
      return res.redirect('/dashboard?error=' + encodeURIComponent('Invalid state parameter'));
    }

    let stateData: { userId: string; returnUrl?: string; nonce: string };
    try {
      stateData = JSON.parse(Buffer.from(state, 'base64url').toString('utf-8'));
      console.log('[Facebook callback] Decoded state', {
        userId: stateData.userId,
        hasNonce: !!stateData.nonce,
        returnUrl: stateData.returnUrl,
      });
    } catch {
      console.error('[Facebook callback] Failed to decode state parameter');
      return res.redirect('/dashboard?error=' + encodeURIComponent('Invalid state parameter'));
    }

    const supabase = createClient(req, res);
    const { data: { user }, error: authError } = await supabase.auth.getUser();
    if (authError || !user) {
      console.error('[Facebook callback] Auth error — user not logged in', { authError });
      logger.error('Authentication error in Facebook callback', authError);
      return res.redirect('/dashboard?error=' + encodeURIComponent('Authentication required'));
    }

    console.log('[Facebook callback] Authenticated user', {
      authUserId: user.id,
      stateUserId: stateData.userId,
    });

    if (stateData.userId !== user.id) {
      console.error('[Facebook callback] State user ID mismatch', {
        stateUserId: stateData.userId,
        authUserId: user.id,
      });
      logger.error('Facebook OAuth state user ID mismatch', {
        stateUserId: stateData.userId,
        authUserId: user.id,
      });
      return res.redirect('/dashboard?error=' + encodeURIComponent('Invalid authentication'));
    }

    logger.info('Processing Facebook OAuth callback', { userId: user.id });

    // Exchange code for short-lived token
    console.log('[Facebook callback] Exchanging authorization code for short-lived token');
    const shortLived = await exchangeCodeForToken(code);
    console.log('[Facebook callback] Short-lived token received');

    // Exchange for long-lived user token
    console.log('[Facebook callback] Exchanging for long-lived token');
    const longLived = await exchangeForLongLivedToken(shortLived.access_token);
    console.log('[Facebook callback] Long-lived token received', { expiresIn: longLived.expires_in });

    // Fetch the Pages managed by this user
    console.log('[Facebook callback] Fetching managed Pages via /me/accounts');
    const pages = await getManagedPages(longLived.access_token);
    console.log('[Facebook callback] Pages fetched', {
      count: pages?.length ?? 0,
      pageNames: pages?.map(p => p.name) ?? [],
    });

    if (!pages || pages.length === 0) {
      console.error('[Facebook callback] No managed Pages found for this user');
      return res.redirect(
        '/dashboard?error=' +
          encodeURIComponent('No Facebook Pages found. You must manage at least one Page.')
      );
    }

    // Use the first Page (the user can reconnect to pick a different one in the future)
    const page = pages[0];
    console.log('[Facebook callback] Using page', { pageId: page.id, pageName: page.name });

    // Encrypt the page access token
    let accessToken = page.access_token;
    let isEncrypted = false;
    if (isEncryptionConfigured()) {
      try {
        accessToken = encrypt(page.access_token);
        isEncrypted = true;
        console.log('[Facebook callback] Page access token encrypted');
      } catch (e) {
        console.error('[Facebook callback] Token encryption failed (storing plaintext)', { e });
        logger.error('Failed to encrypt Facebook token:', e);
      }
    } else {
      console.warn('[Facebook callback] ENCRYPTION_KEY not set — storing token in plaintext');
    }

    // Page tokens derived from long-lived user tokens do not expire
    const tokenExpiresAt = null;

    // Upsert account
    console.log('[Facebook callback] Upserting Facebook account in DB', {
      pageId: page.id,
      pageName: page.name,
    });
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
      console.log('[Facebook callback] Updated existing Facebook Page account', {
        accountId: existing.id,
      });
      logger.info('Updated existing Facebook Page account', { userId: user.id, pageId: page.id });
    } else {
      const created = await prisma.socialMediaAccount.create({
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
      console.log('[Facebook callback] Created new Facebook Page account', { accountId: created.id });
      logger.info('Created new Facebook Page account', { userId: user.id, pageId: page.id });
    }

    const returnUrl = stateData.returnUrl || '/dashboard';
    const successUrl = `${returnUrl}${returnUrl.includes('?') ? '&' : '?'}success=facebook_connected`;
    console.log('[Facebook callback] OAuth flow complete — redirecting to', { successUrl });
    logger.info('Facebook OAuth flow completed', { userId: user.id, pageName: page.name });
    return res.redirect(successUrl);
  } catch (error) {
    console.error('[Facebook callback] Unhandled error in callback', { error });
    logger.error('Error in Facebook OAuth callback:', error);
    return res.redirect(
      '/dashboard?error=' +
        encodeURIComponent(
          error instanceof Error ? error.message : 'Failed to connect Facebook account'
        )
    );
  }
}
