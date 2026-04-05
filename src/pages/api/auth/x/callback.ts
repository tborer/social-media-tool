import { NextApiRequest, NextApiResponse } from 'next';
import { createClient } from '@/util/supabase/api';
import {
  exchangeCodeForToken,
  getUserInfo,
  calculateExpirationDate,
} from '@/lib/x-oauth';
import { encrypt, isEncryptionConfigured } from '@/lib/encryption';
import { logger } from '@/lib/server-logger';
import prisma from '@/lib/prisma';

/**
 * X (Twitter) OAuth 2.0 PKCE Callback Endpoint
 *
 * Handles the redirect from X after the user authorizes the app.
 * Exchanges the authorization code (+ PKCE verifier from state) for
 * access + refresh tokens, fetches the user profile, and upserts
 * the account in the database.
 *
 * Query Parameters (set by X):
 * - code: Authorization code
 * - state: CSRF state token (also carries the PKCE code verifier)
 * - error (optional): Error if authorization was denied
 */
export default async function handler(req: NextApiRequest, res: NextApiResponse) {
  if (req.method !== 'GET') {
    return res.status(405).json({ error: 'Method not allowed' });
  }

  const { code, state, error } = req.query;

  try {
    // Handle denial / errors from X
    if (error) {
      logger.error('X OAuth error from provider:', { error });
      return res.redirect(
        '/dashboard?error=' + encodeURIComponent('X authorization was denied')
      );
    }

    if (!code || typeof code !== 'string') {
      logger.error('Missing authorization code in X callback');
      return res.redirect('/dashboard?error=' + encodeURIComponent('Missing authorization code'));
    }

    if (!state || typeof state !== 'string') {
      logger.error('Missing state parameter in X callback');
      return res.redirect('/dashboard?error=' + encodeURIComponent('Invalid state parameter'));
    }

    // Decode state — carries userId, returnUrl, nonce, and codeVerifier
    let stateData: {
      userId: string;
      returnUrl?: string;
      nonce: string;
      codeVerifier: string;
    };
    try {
      stateData = JSON.parse(Buffer.from(state, 'base64url').toString('utf-8'));
    } catch {
      logger.error('Failed to decode X OAuth state parameter');
      return res.redirect('/dashboard?error=' + encodeURIComponent('Invalid state parameter'));
    }

    if (!stateData.codeVerifier) {
      logger.error('Missing code verifier in X OAuth state');
      return res.redirect('/dashboard?error=' + encodeURIComponent('Invalid OAuth state'));
    }

    // Verify authenticated user matches the user embedded in state
    const supabase = createClient(req, res);
    const { data: { user }, error: authError } = await supabase.auth.getUser();

    if (authError || !user) {
      logger.error('Authentication error in X callback:', authError);
      return res.redirect('/dashboard?error=' + encodeURIComponent('Authentication required'));
    }

    if (stateData.userId !== user.id) {
      logger.error('X OAuth state user ID mismatch', {
        stateUserId: stateData.userId,
        authUserId: user.id,
      });
      return res.redirect('/dashboard?error=' + encodeURIComponent('Invalid authentication state'));
    }

    logger.info('Processing X OAuth callback', { userId: user.id });

    // Step 1: Exchange code for access + refresh tokens
    const tokenResponse = await exchangeCodeForToken(code, stateData.codeVerifier);
    logger.info('Received X tokens', {
      userId: user.id,
      hasRefreshToken: !!tokenResponse.refresh_token,
    });

    // Step 2: Fetch X user profile
    const xUser = await getUserInfo(tokenResponse.access_token);
    logger.info('Retrieved X user info', {
      userId: user.id,
      xUsername: xUser.username,
      xUserId: xUser.id,
    });

    // Step 3: Encrypt tokens (if configured)
    let accessToken = tokenResponse.access_token;
    let refreshToken = tokenResponse.refresh_token ?? null;
    let isEncrypted = false;

    if (isEncryptionConfigured()) {
      try {
        accessToken = encrypt(tokenResponse.access_token);
        if (refreshToken) {
          refreshToken = encrypt(refreshToken);
        }
        isEncrypted = true;
        logger.info('X tokens encrypted', { userId: user.id });
      } catch (encErr) {
        logger.error('Failed to encrypt X tokens (storing plaintext):', encErr);
      }
    } else {
      logger.warn('Encryption not configured — storing X tokens in plaintext', { userId: user.id });
    }

    // Step 4: Calculate access token expiry
    const tokenExpiresAt = calculateExpirationDate(tokenResponse.expires_in);

    // Step 5: Upsert X account in the database
    try {
      const existingAccount = await prisma.socialMediaAccount.findFirst({
        where: {
          userId: user.id,
          xUserId: xUser.id,
          accountType: 'X',
        },
      });

      if (existingAccount) {
        await prisma.socialMediaAccount.update({
          where: { id: existingAccount.id },
          data: {
            username: xUser.username,
            accessToken,
            refreshToken,
            isEncrypted,
            tokenExpiresAt,
            xUserId: xUser.id,
            updatedAt: new Date(),
          },
        });
        logger.info('Updated existing X account', {
          userId: user.id,
          accountId: existingAccount.id,
        });
      } else {
        await prisma.socialMediaAccount.create({
          data: {
            username: xUser.username,
            accessToken,
            refreshToken,
            isEncrypted,
            tokenExpiresAt,
            accountType: 'X',
            xUserId: xUser.id,
            userId: user.id,
          },
        });
        logger.info('Created new X account', { userId: user.id });
      }
    } catch (dbError) {
      logger.error('Database error saving X account:', dbError);
      return res.redirect(
        '/dashboard?error=' +
          encodeURIComponent('Failed to save X account. Please try again.')
      );
    }

    // Step 6: Redirect to dashboard with success
    const returnUrl = stateData.returnUrl || '/dashboard';
    const successUrl = `${returnUrl}${returnUrl.includes('?') ? '&' : '?'}success=x_connected`;

    logger.info('X OAuth flow completed successfully', {
      userId: user.id,
      xUsername: xUser.username,
    });

    return res.redirect(successUrl);
  } catch (error) {
    logger.error('Error in X OAuth callback:', error);
    return res.redirect(
      '/dashboard?error=' +
        encodeURIComponent(
          error instanceof Error ? error.message : 'Failed to connect X account'
        )
    );
  }
}
