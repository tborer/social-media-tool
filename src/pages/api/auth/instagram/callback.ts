import { NextApiRequest, NextApiResponse } from 'next';
import { createClient } from '@/util/supabase/api';
import {
  exchangeCodeForToken,
  exchangeForLongLivedToken,
  getUserInfo,
  calculateExpirationDate,
} from '@/lib/instagram-oauth';
import { encrypt, isEncryptionConfigured } from '@/lib/encryption';
import { logger } from '@/lib/logger';
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

  try {
    // Check for errors from Instagram
    if (error) {
      logger.error('Instagram OAuth error:', { error, error_reason, error_description });
      return res.redirect(
        `/dashboard?error=${encodeURIComponent(
          error_description as string || 'Instagram authorization failed'
        )}`
      );
    }

    // Validate required parameters
    if (!code || typeof code !== 'string') {
      logger.error('Missing authorization code in Instagram callback');
      return res.redirect('/dashboard?error=' + encodeURIComponent('Missing authorization code'));
    }

    if (!state || typeof state !== 'string') {
      logger.error('Missing state parameter in Instagram callback');
      return res.redirect('/dashboard?error=' + encodeURIComponent('Invalid state parameter'));
    }

    // Decode and validate state parameter
    let stateData: { userId: string; returnUrl?: string; nonce: string };
    try {
      stateData = JSON.parse(Buffer.from(state, 'base64url').toString('utf-8'));
    } catch (e) {
      logger.error('Invalid state parameter format:', e);
      return res.redirect('/dashboard?error=' + encodeURIComponent('Invalid state parameter'));
    }

    // Create Supabase client for authentication
    const supabase = createClient(req, res);

    // Get the user from the session
    const { data: { user }, error: authError } = await supabase.auth.getUser();

    if (authError || !user) {
      logger.error('Authentication error in Instagram callback:', authError);
      return res.redirect('/dashboard?error=' + encodeURIComponent('Authentication required'));
    }

    // Verify that the state's user ID matches the authenticated user
    if (stateData.userId !== user.id) {
      logger.error('State user ID mismatch:', { stateUserId: stateData.userId, authUserId: user.id });
      return res.redirect('/dashboard?error=' + encodeURIComponent('Invalid authentication'));
    }

    logger.info('Processing Instagram OAuth callback', { userId: user.id });

    // Step 1: Exchange authorization code for short-lived token
    const shortLivedTokenResponse = await exchangeCodeForToken(code);
    logger.info('Received short-lived token from Instagram', { userId: user.id });

    // Step 2: Exchange short-lived token for long-lived token
    const longLivedTokenResponse = await exchangeForLongLivedToken(
      shortLivedTokenResponse.access_token
    );
    logger.info('Received long-lived token from Instagram', { userId: user.id });

    // Step 3: Get user information from Instagram
    const instagramUser = await getUserInfo(longLivedTokenResponse.access_token);
    logger.info('Retrieved Instagram user info:', {
      userId: user.id,
      instagramUsername: instagramUser.username,
    });

    // Step 4: Encrypt the access token (if encryption is configured)
    let accessToken = longLivedTokenResponse.access_token;
    let isEncrypted = false;

    if (isEncryptionConfigured()) {
      try {
        accessToken = encrypt(longLivedTokenResponse.access_token);
        isEncrypted = true;
        logger.info('Access token encrypted', { userId: user.id });
      } catch (encryptionError) {
        logger.error('Failed to encrypt access token:', encryptionError);
        // Continue with unencrypted token - encryption is optional
      }
    } else {
      logger.warn('Encryption not configured - storing token in plaintext', { userId: user.id });
    }

    // Step 5: Calculate token expiration date
    const tokenExpiresAt = calculateExpirationDate(longLivedTokenResponse.expires_in);

    // Step 6: Save or update the Instagram account in the database
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
            updatedAt: new Date(),
          },
        });
        logger.info('Updated existing Instagram account', {
          userId: user.id,
          accountId: existingAccount.id,
        });
      } else {
        // Create new account
        await prisma.socialMediaAccount.create({
          data: {
            username: instagramUser.username,
            accessToken,
            isEncrypted,
            tokenExpiresAt,
            accountType: 'INSTAGRAM',
            userId: user.id,
          },
        });
        logger.info('Created new Instagram account', { userId: user.id });
      }
    } catch (dbError) {
      logger.error('Database error saving Instagram account:', dbError);
      return res.redirect(
        '/dashboard?error=' +
          encodeURIComponent('Failed to save Instagram account. Please try again.')
      );
    }

    // Step 7: Redirect to the return URL or dashboard
    const returnUrl = stateData.returnUrl || '/dashboard';
    const successUrl = `${returnUrl}${
      returnUrl.includes('?') ? '&' : '?'
    }success=instagram_connected`;

    logger.info('Instagram OAuth flow completed successfully', {
      userId: user.id,
      instagramUsername: instagramUser.username,
    });

    return res.redirect(successUrl);
  } catch (error) {
    logger.error('Error in Instagram OAuth callback:', error);
    return res.redirect(
      '/dashboard?error=' +
        encodeURIComponent(
          error instanceof Error ? error.message : 'Failed to connect Instagram account'
        )
    );
  }
}
