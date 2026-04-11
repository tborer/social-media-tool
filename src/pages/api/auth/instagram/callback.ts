import { NextApiRequest, NextApiResponse } from 'next';
import { createClient } from '@/util/supabase/api';
import {
  exchangeCodeForToken,
  exchangeForLongLivedToken,
  getUserInfo,
  calculateExpirationDate,
} from '@/lib/instagram-oauth';
import { encrypt, isEncryptionConfigured } from '@/lib/encryption';
import { logger } from '@/lib/server-logger';
import prisma from '@/lib/prisma';

/**
 * Instagram OAuth Callback Endpoint
 *
 * Handles the OAuth callback from Instagram after user authorizes the app
 *
 * Query Parameters:
 * - code: Authorization code from Instagram
 * - state: State parameter for CSRF protection
 * - error (optional): Error from Instagram
 * - error_reason (optional): Error reason
 * - error_description (optional): Error description
 */
export default async function handler(req: NextApiRequest, res: NextApiResponse) {
  // Only allow GET requests
  if (req.method !== 'GET') {
    return res.status(405).json({ error: 'Method not allowed' });
  }

  const { code, state, error, error_reason, error_description } = req.query;

  console.log('[Instagram callback] Received callback', {
    hasCode: !!code,
    hasState: !!state,
    hasError: !!error,
    error,
    error_description,
  });

  try {
    // Check for errors from Instagram
    if (error) {
      console.error('[Instagram callback] OAuth error from Instagram provider', {
        error,
        error_reason,
        error_description,
      });
      logger.error('Instagram OAuth error:', { error, error_reason, error_description });
      return res.redirect(
        `/dashboard?error=${encodeURIComponent(
          error_description as string || 'Instagram authorization failed'
        )}`
      );
    }

    // Validate required parameters
    if (!code || typeof code !== 'string') {
      console.error('[Instagram callback] Missing authorization code');
      logger.error('Missing authorization code in Instagram callback');
      return res.redirect('/dashboard?error=' + encodeURIComponent('Missing authorization code'));
    }

    if (!state || typeof state !== 'string') {
      console.error('[Instagram callback] Missing state parameter');
      logger.error('Missing state parameter in Instagram callback');
      return res.redirect('/dashboard?error=' + encodeURIComponent('Invalid state parameter'));
    }

    // Decode and validate state parameter
    let stateData: { userId: string; returnUrl?: string; nonce: string };
    try {
      stateData = JSON.parse(Buffer.from(state, 'base64url').toString('utf-8'));
      console.log('[Instagram callback] Decoded state', {
        userId: stateData.userId,
        hasNonce: !!stateData.nonce,
        returnUrl: stateData.returnUrl,
      });
    } catch (e) {
      console.error('[Instagram callback] Failed to decode state parameter', { e });
      logger.error('Invalid state parameter format:', e);
      return res.redirect('/dashboard?error=' + encodeURIComponent('Invalid state parameter'));
    }

    // Create Supabase client for authentication
    const supabase = createClient(req, res);

    // Get the user from the session
    const { data: { user }, error: authError } = await supabase.auth.getUser();

    if (authError || !user) {
      console.error('[Instagram callback] Auth error — user not logged in', { authError });
      logger.error('Authentication error in Instagram callback:', authError);
      return res.redirect('/dashboard?error=' + encodeURIComponent('Authentication required'));
    }

    console.log('[Instagram callback] Authenticated user', {
      authUserId: user.id,
      stateUserId: stateData.userId,
    });

    // Verify that the state's user ID matches the authenticated user
    if (stateData.userId !== user.id) {
      console.error('[Instagram callback] State user ID mismatch', {
        stateUserId: stateData.userId,
        authUserId: user.id,
      });
      logger.error('State user ID mismatch:', { stateUserId: stateData.userId, authUserId: user.id });
      return res.redirect('/dashboard?error=' + encodeURIComponent('Invalid authentication'));
    }

    logger.info('Processing Instagram OAuth callback', { userId: user.id });

    // Step 1: Exchange authorization code for short-lived token
    console.log('[Instagram callback] Exchanging authorization code for short-lived token');
    const shortLivedTokenResponse = await exchangeCodeForToken(code);
    console.log('[Instagram callback] Short-lived token received');
    logger.info('Received short-lived token from Instagram', { userId: user.id });

    // Step 2: Exchange short-lived token for long-lived token
    console.log('[Instagram callback] Exchanging for long-lived token');
    const longLivedTokenResponse = await exchangeForLongLivedToken(
      shortLivedTokenResponse.access_token
    );
    console.log('[Instagram callback] Long-lived token received', {
      expiresIn: longLivedTokenResponse.expires_in,
    });
    logger.info('Received long-lived token from Instagram', { userId: user.id });

    // Step 3: Get user information from Instagram
    console.log('[Instagram callback] Fetching Instagram user info');
    const instagramUser = await getUserInfo(longLivedTokenResponse.access_token);
    console.log('[Instagram callback] User info fetched', {
      username: instagramUser.username,
      accountType: instagramUser.account_type,
    });
    logger.info('Retrieved Instagram user info:', {
      userId: user.id,
      instagramUsername: instagramUser.username,
      instagramAccountType: instagramUser.account_type,
    });

    // Validate the IG account type. Only BUSINESS and MEDIA_CREATOR accounts
    // support the Graph API /insights edge — PERSONAL accounts will never
    // return view/reach/engagement data even if the scopes are granted.
    const igAccountType = instagramUser.account_type ?? null;
    const supportsInsights = igAccountType === 'BUSINESS' || igAccountType === 'MEDIA_CREATOR';
    if (igAccountType && !supportsInsights) {
      console.warn('[Instagram callback] Account does not support insights', {
        accountType: igAccountType,
      });
      logger.warn('Connected Instagram account does not support insights', {
        userId: user.id,
        instagramAccountType: igAccountType,
      });
    }

    // Step 4: Encrypt the access token (if encryption is configured)
    let accessToken = longLivedTokenResponse.access_token;
    let isEncrypted = false;

    if (isEncryptionConfigured()) {
      try {
        accessToken = encrypt(longLivedTokenResponse.access_token);
        isEncrypted = true;
        console.log('[Instagram callback] Access token encrypted');
        logger.info('Access token encrypted', { userId: user.id });
      } catch (encryptionError) {
        console.error('[Instagram callback] Token encryption failed (storing plaintext)', { encryptionError });
        logger.error('Failed to encrypt access token:', encryptionError);
        // Continue with unencrypted token - encryption is optional
      }
    } else {
      console.warn('[Instagram callback] ENCRYPTION_KEY not set — storing token in plaintext');
      logger.warn('Encryption not configured - storing token in plaintext', { userId: user.id });
    }

    // Step 5: Calculate token expiration date
    const tokenExpiresAt = calculateExpirationDate(longLivedTokenResponse.expires_in);
    console.log('[Instagram callback] Token expires at', { tokenExpiresAt });

    // Step 6: Save or update the Instagram account in the database
    console.log('[Instagram callback] Upserting Instagram account in DB', {
      username: instagramUser.username,
    });
    try {
      const existingAccount = await prisma.socialMediaAccount.findFirst({
        where: {
          userId: user.id,
          username: instagramUser.username,
          accountType: 'INSTAGRAM',
        },
      });

      if (existingAccount) {
        // Update existing account
        await prisma.socialMediaAccount.update({
          where: { id: existingAccount.id },
          data: {
            accessToken,
            isEncrypted,
            tokenExpiresAt,
            instagramAccountType: igAccountType,
            updatedAt: new Date(),
          },
        });
        console.log('[Instagram callback] Updated existing Instagram account', {
          accountId: existingAccount.id,
        });
        logger.info('Updated existing Instagram account', {
          userId: user.id,
          accountId: existingAccount.id,
        });
      } else {
        // Create new account
        const created = await prisma.socialMediaAccount.create({
          data: {
            username: instagramUser.username,
            accessToken,
            isEncrypted,
            tokenExpiresAt,
            accountType: 'INSTAGRAM',
            instagramAccountType: igAccountType,
            userId: user.id,
          },
        });
        console.log('[Instagram callback] Created new Instagram account', { accountId: created.id });
        logger.info('Created new Instagram account', { userId: user.id });
      }
    } catch (dbError) {
      const msg = dbError instanceof Error ? dbError.message : String(dbError);
      console.error('[Instagram callback] Database error saving Instagram account', {
        error: msg,
        dbError,
      });
      logger.error('Database error saving Instagram account:', dbError);
      return res.redirect(
        '/dashboard?error=' +
          encodeURIComponent('Failed to save Instagram account. Please try again.')
      );
    }

    // Step 7: Redirect to the return URL or dashboard
    const returnUrl = stateData.returnUrl || '/dashboard';
    const baseSuccess = `${returnUrl}${returnUrl.includes('?') ? '&' : '?'}success=instagram_connected`;
    // If the connected account is Personal (not Business/Creator), surface a
    // warning so the user knows insights will not be available.
    const successUrl = igAccountType && !supportsInsights
      ? `${baseSuccess}&warning=${encodeURIComponent(`Instagram account is ${igAccountType} — insights are only available for BUSINESS or CREATOR accounts. Switch to a Professional account in the Instagram app to enable insights.`)}`
      : baseSuccess;

    console.log('[Instagram callback] OAuth flow complete — redirecting to', { successUrl });
    logger.info('Instagram OAuth flow completed successfully', {
      userId: user.id,
      instagramUsername: instagramUser.username,
    });

    return res.redirect(successUrl);
  } catch (error) {
    console.error('[Instagram callback] Unhandled error in callback', { error });
    logger.error('Error in Instagram OAuth callback:', error);
    return res.redirect(
      '/dashboard?error=' +
        encodeURIComponent(
          error instanceof Error ? error.message : 'Failed to connect Instagram account'
        )
    );
  }
}
