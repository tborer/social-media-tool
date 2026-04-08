import { NextApiRequest, NextApiResponse } from 'next';
import { createClient } from '@/util/supabase/api';
import {
  exchangeCodeForToken,
  getUserInfo,
  calculateExpirationDate,
} from '@/lib/linkedin-oauth';
import { encrypt, isEncryptionConfigured } from '@/lib/encryption';
import { logger } from '@/lib/server-logger';
import prisma from '@/lib/prisma';

/**
 * LinkedIn OAuth Callback Endpoint
 *
 * Handles the redirect from LinkedIn after the user authorizes the app.
 * Exchanges the authorization code for an access token, fetches the user's
 * LinkedIn profile via /v2/me, and upserts the account in the database.
 *
 * Query Parameters (set by LinkedIn):
 * - code: Authorization code
 * - state: CSRF state token
 * - error (optional): Error code if authorization was denied
 * - error_description (optional): Human-readable error description
 */
export default async function handler(req: NextApiRequest, res: NextApiResponse) {
  if (req.method !== 'GET') {
    return res.status(405).json({ error: 'Method not allowed' });
  }

  const { code, state, error, error_description } = req.query;

  console.log('[LinkedIn callback] Received callback', {
    hasCode: !!code,
    hasState: !!state,
    hasError: !!error,
    error,
    error_description,
  });

  try {
    // Handle authorization errors from LinkedIn (e.g. user clicked Cancel, or scope issue)
    if (error) {
      const description = (error_description as string) || 'LinkedIn authorization was denied';
      console.error('[LinkedIn callback] OAuth error from LinkedIn provider', {
        error,
        error_description: description,
      });
      logger.error('LinkedIn OAuth error from provider', { error, error_description: description });
      return res.redirect('/dashboard?error=' + encodeURIComponent(description));
    }

    if (!code || typeof code !== 'string') {
      console.error('[LinkedIn callback] Missing authorization code');
      logger.error('Missing authorization code in LinkedIn callback');
      return res.redirect('/dashboard?error=' + encodeURIComponent('Missing authorization code from LinkedIn'));
    }

    if (!state || typeof state !== 'string') {
      console.error('[LinkedIn callback] Missing state parameter');
      logger.error('Missing state parameter in LinkedIn callback');
      return res.redirect('/dashboard?error=' + encodeURIComponent('Invalid OAuth state parameter'));
    }

    // Decode and validate CSRF state
    let stateData: { userId: string; returnUrl?: string; nonce: string };
    try {
      stateData = JSON.parse(Buffer.from(state, 'base64url').toString('utf-8'));
      console.log('[LinkedIn callback] Decoded state', {
        userId: stateData.userId,
        hasNonce: !!stateData.nonce,
        returnUrl: stateData.returnUrl,
      });
    } catch (decodeErr) {
      console.error('[LinkedIn callback] Failed to decode state parameter', { decodeErr });
      logger.error('Failed to decode LinkedIn OAuth state parameter');
      return res.redirect('/dashboard?error=' + encodeURIComponent('Invalid OAuth state parameter — could not decode'));
    }

    // Verify authenticated user matches the user in the state token
    const supabase = createClient(req, res);
    const { data: { user }, error: authError } = await supabase.auth.getUser();

    if (authError || !user) {
      console.error('[LinkedIn callback] Auth error — user not logged in', { authError });
      logger.error('Authentication error in LinkedIn callback', authError);
      return res.redirect('/dashboard?error=' + encodeURIComponent('You must be logged in to connect a LinkedIn account'));
    }

    console.log('[LinkedIn callback] Authenticated user', { authUserId: user.id, stateUserId: stateData.userId });

    if (stateData.userId !== user.id) {
      console.error('[LinkedIn callback] State user ID mismatch', {
        stateUserId: stateData.userId,
        authUserId: user.id,
      });
      logger.error('LinkedIn OAuth state user ID mismatch', {
        stateUserId: stateData.userId,
        authUserId: user.id,
      });
      return res.redirect('/dashboard?error=' + encodeURIComponent('OAuth state mismatch — please try connecting again'));
    }

    logger.info('Processing LinkedIn OAuth callback', { userId: user.id });

    // Step 1: Exchange authorization code for access token
    console.log('[LinkedIn callback] Exchanging authorization code for token');
    let tokenResponse;
    try {
      tokenResponse = await exchangeCodeForToken(code);
      console.log('[LinkedIn callback] Token exchange succeeded', {
        expiresIn: tokenResponse.expires_in,
        tokenType: tokenResponse.token_type,
      });
      logger.info('Received LinkedIn access token', { userId: user.id, expiresIn: tokenResponse.expires_in });
    } catch (tokenErr) {
      const msg = tokenErr instanceof Error ? tokenErr.message : String(tokenErr);
      console.error('[LinkedIn callback] Token exchange failed', { error: msg });
      logger.error('LinkedIn token exchange failed', { userId: user.id, error: msg });
      return res.redirect('/dashboard?error=' + encodeURIComponent(msg));
    }

    // Step 2: Fetch LinkedIn profile via /v2/me (no openid scope required)
    console.log('[LinkedIn callback] Fetching member profile from /v2/me');
    let linkedInUser;
    try {
      linkedInUser = await getUserInfo(tokenResponse.access_token);
      console.log('[LinkedIn callback] Profile fetch succeeded', {
        memberId: linkedInUser.sub,
        name: linkedInUser.name,
      });
      logger.info('Retrieved LinkedIn user info', {
        userId: user.id,
        linkedInName: linkedInUser.name,
        linkedInSub: linkedInUser.sub,
      });
    } catch (profileErr) {
      const msg = profileErr instanceof Error ? profileErr.message : String(profileErr);
      console.error('[LinkedIn callback] Profile fetch failed', { error: msg });
      logger.error('LinkedIn profile fetch failed', { userId: user.id, error: msg });
      return res.redirect('/dashboard?error=' + encodeURIComponent(msg));
    }

    // Step 3: Encrypt the access token (if encryption is configured)
    let accessToken = tokenResponse.access_token;
    let isEncrypted = false;

    if (isEncryptionConfigured()) {
      try {
        accessToken = encrypt(tokenResponse.access_token);
        isEncrypted = true;
        console.log('[LinkedIn callback] Access token encrypted');
        logger.info('LinkedIn access token encrypted', { userId: user.id });
      } catch (encErr) {
        console.error('[LinkedIn callback] Token encryption failed (storing plaintext)', { encErr });
        logger.error('Failed to encrypt LinkedIn access token (storing plaintext)', encErr);
      }
    } else {
      console.warn('[LinkedIn callback] ENCRYPTION_KEY not set — storing token in plaintext');
      logger.warn('Encryption not configured — storing LinkedIn token in plaintext', { userId: user.id });
    }

    // Step 4: Calculate token expiration date
    const tokenExpiresAt = calculateExpirationDate(tokenResponse.expires_in);
    console.log('[LinkedIn callback] Token expires at', { tokenExpiresAt });

    // LinkedIn member URN: "urn:li:person:{id}" — we store the raw id as linkedinUserId
    const linkedinUserId = linkedInUser.sub;
    const username = linkedInUser.name || linkedinUserId;

    // Step 5: Upsert the LinkedIn account in the database
    console.log('[LinkedIn callback] Upserting LinkedIn account in DB', { linkedinUserId, username });
    try {
      const existingAccount = await prisma.socialMediaAccount.findFirst({
        where: {
          userId: user.id,
          linkedinUserId,
          accountType: 'LINKEDIN',
        },
      });

      if (existingAccount) {
        await prisma.socialMediaAccount.update({
          where: { id: existingAccount.id },
          data: {
            username,
            accessToken,
            isEncrypted,
            tokenExpiresAt,
            linkedinUserId,
            updatedAt: new Date(),
          },
        });
        console.log('[LinkedIn callback] Updated existing LinkedIn account', { accountId: existingAccount.id });
        logger.info('Updated existing LinkedIn account', {
          userId: user.id,
          accountId: existingAccount.id,
        });
      } else {
        const created = await prisma.socialMediaAccount.create({
          data: {
            username,
            accessToken,
            isEncrypted,
            tokenExpiresAt,
            accountType: 'LINKEDIN',
            linkedinUserId,
            userId: user.id,
          },
        });
        console.log('[LinkedIn callback] Created new LinkedIn account', { accountId: created.id });
        logger.info('Created new LinkedIn account', { userId: user.id, accountId: created.id });
      }
    } catch (dbError) {
      const msg = dbError instanceof Error ? dbError.message : String(dbError);
      console.error('[LinkedIn callback] Database error saving LinkedIn account', { error: msg, dbError });
      logger.error('Database error saving LinkedIn account', dbError);
      return res.redirect(
        '/dashboard?error=' + encodeURIComponent('Failed to save LinkedIn account to database: ' + msg)
      );
    }

    // Step 6: Redirect to dashboard with success indicator
    const returnUrl = stateData.returnUrl || '/dashboard';
    const successUrl = `${returnUrl}${returnUrl.includes('?') ? '&' : '?'}success=linkedin_connected`;

    console.log('[LinkedIn callback] OAuth flow complete — redirecting to', { successUrl });
    logger.info('LinkedIn OAuth flow completed successfully', {
      userId: user.id,
      linkedInName: username,
    });

    return res.redirect(successUrl);
  } catch (error) {
    const msg = error instanceof Error ? error.message : 'Failed to connect LinkedIn account';
    console.error('[LinkedIn callback] Unhandled error in callback', { error });
    logger.error('Unhandled error in LinkedIn OAuth callback', error);
    return res.redirect('/dashboard?error=' + encodeURIComponent(msg));
  }
}
