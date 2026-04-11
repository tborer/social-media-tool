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

  console.log('[X callback] Received callback', {
    hasCode: !!code,
    hasState: !!state,
    hasError: !!error,
    error,
  });

  try {
    // Handle denial / errors from X
    if (error) {
      console.error('[X callback] OAuth error from X provider', { error });
      logger.error('X OAuth error from provider:', { error });
      return res.redirect(
        '/dashboard?error=' + encodeURIComponent('X authorization was denied')
      );
    }

    if (!code || typeof code !== 'string') {
      console.error('[X callback] Missing authorization code');
      logger.error('Missing authorization code in X callback');
      return res.redirect('/dashboard?error=' + encodeURIComponent('Missing authorization code'));
    }

    if (!state || typeof state !== 'string') {
      console.error('[X callback] Missing state parameter');
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
      console.log('[X callback] Decoded state', {
        userId: stateData.userId,
        hasNonce: !!stateData.nonce,
        hasCodeVerifier: !!stateData.codeVerifier,
        returnUrl: stateData.returnUrl,
      });
    } catch {
      console.error('[X callback] Failed to decode state parameter');
      logger.error('Failed to decode X OAuth state parameter');
      return res.redirect('/dashboard?error=' + encodeURIComponent('Invalid state parameter'));
    }

    if (!stateData.codeVerifier) {
      console.error('[X callback] Missing code verifier in state');
      logger.error('Missing code verifier in X OAuth state');
      return res.redirect('/dashboard?error=' + encodeURIComponent('Invalid OAuth state'));
    }

    // Verify authenticated user matches the user embedded in state
    const supabase = createClient(req, res);
    const { data: { user }, error: authError } = await supabase.auth.getUser();

    if (authError || !user) {
      console.error('[X callback] Auth error — user not logged in', { authError });
      logger.error('Authentication error in X callback:', authError);
      return res.redirect('/dashboard?error=' + encodeURIComponent('Authentication required'));
    }

    console.log('[X callback] Authenticated user', {
      authUserId: user.id,
      stateUserId: stateData.userId,
    });

    if (stateData.userId !== user.id) {
      console.error('[X callback] State user ID mismatch', {
        stateUserId: stateData.userId,
        authUserId: user.id,
      });
      logger.error('X OAuth state user ID mismatch', {
        stateUserId: stateData.userId,
        authUserId: user.id,
      });
      return res.redirect('/dashboard?error=' + encodeURIComponent('Invalid authentication state'));
    }

    logger.info('Processing X OAuth callback', { userId: user.id });

    // Step 1: Exchange code for access + refresh tokens
    console.log('[X callback] Exchanging authorization code for tokens (PKCE)');
    const tokenResponse = await exchangeCodeForToken(code, stateData.codeVerifier);
    console.log('[X callback] Token exchange succeeded', {
      expiresIn: tokenResponse.expires_in,
      hasRefreshToken: !!tokenResponse.refresh_token,
    });
    logger.info('Received X tokens', {
      userId: user.id,
      hasRefreshToken: !!tokenResponse.refresh_token,
    });

    // Step 2: Fetch X user profile
    console.log('[X callback] Fetching X user profile');
    const xUser = await getUserInfo(tokenResponse.access_token);
    console.log('[X callback] Profile fetched', {
      username: xUser.username,
      xUserId: xUser.id,
    });
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
        console.log('[X callback] Tokens encrypted');
        logger.info('X tokens encrypted', { userId: user.id });
      } catch (encErr) {
        console.error('[X callback] Token encryption failed (storing plaintext)', { encErr });
        logger.error('Failed to encrypt X tokens (storing plaintext):', encErr);
      }
    } else {
      console.warn('[X callback] ENCRYPTION_KEY not set — storing tokens in plaintext');
      logger.warn('Encryption not configured — storing X tokens in plaintext', { userId: user.id });
    }

    // Step 4: Calculate access token expiry
    const tokenExpiresAt = calculateExpirationDate(tokenResponse.expires_in);
    console.log('[X callback] Token expires at', { tokenExpiresAt });

    // Step 5: Upsert X account in the database
    console.log('[X callback] Upserting X account in DB', { xUserId: xUser.id, username: xUser.username });
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
        console.log('[X callback] Updated existing X account', { accountId: existingAccount.id });
        logger.info('Updated existing X account', {
          userId: user.id,
          accountId: existingAccount.id,
        });
      } else {
        const created = await prisma.socialMediaAccount.create({
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
        console.log('[X callback] Created new X account', { accountId: created.id });
        logger.info('Created new X account', { userId: user.id });
      }
    } catch (dbError) {
      const msg = dbError instanceof Error ? dbError.message : String(dbError);
      console.error('[X callback] Database error saving X account', { error: msg, dbError });
      logger.error('Database error saving X account:', dbError);
      return res.redirect(
        '/dashboard?error=' +
          encodeURIComponent('Failed to save X account. Please try again.')
      );
    }

    // Step 6: Redirect to dashboard with success
    const returnUrl = stateData.returnUrl || '/dashboard';
    const successUrl = `${returnUrl}${returnUrl.includes('?') ? '&' : '?'}success=x_connected`;

    console.log('[X callback] OAuth flow complete — redirecting to', { successUrl });
    logger.info('X OAuth flow completed successfully', {
      userId: user.id,
      xUsername: xUser.username,
    });

    return res.redirect(successUrl);
  } catch (error) {
    console.error('[X callback] Unhandled error in callback', { error });
    logger.error('Error in X OAuth callback:', error);
    return res.redirect(
      '/dashboard?error=' +
        encodeURIComponent(
          error instanceof Error ? error.message : 'Failed to connect X account'
        )
    );
  }
}
