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
 * LinkedIn profile, and upserts the account in the database.
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

  try {
    // Handle authorization errors from LinkedIn
    if (error) {
      logger.error('LinkedIn OAuth error from provider:', { error, error_description });
      return res.redirect(
        '/dashboard?error=' +
          encodeURIComponent(
            (error_description as string) || 'LinkedIn authorization was denied'
          )
      );
    }

    if (!code || typeof code !== 'string') {
      logger.error('Missing authorization code in LinkedIn callback');
      return res.redirect('/dashboard?error=' + encodeURIComponent('Missing authorization code'));
    }

    if (!state || typeof state !== 'string') {
      logger.error('Missing state parameter in LinkedIn callback');
      return res.redirect('/dashboard?error=' + encodeURIComponent('Invalid state parameter'));
    }

    // Decode and validate CSRF state
    let stateData: { userId: string; returnUrl?: string; nonce: string };
    try {
      stateData = JSON.parse(Buffer.from(state, 'base64url').toString('utf-8'));
    } catch {
      logger.error('Failed to decode LinkedIn OAuth state parameter');
      return res.redirect('/dashboard?error=' + encodeURIComponent('Invalid state parameter'));
    }

    // Verify authenticated user matches the user in the state token
    const supabase = createClient(req, res);
    const { data: { user }, error: authError } = await supabase.auth.getUser();

    if (authError || !user) {
      logger.error('Authentication error in LinkedIn callback:', authError);
      return res.redirect('/dashboard?error=' + encodeURIComponent('Authentication required'));
    }

    if (stateData.userId !== user.id) {
      logger.error('LinkedIn OAuth state user ID mismatch', {
        stateUserId: stateData.userId,
        authUserId: user.id,
      });
      return res.redirect('/dashboard?error=' + encodeURIComponent('Invalid authentication state'));
    }

    logger.info('Processing LinkedIn OAuth callback', { userId: user.id });

    // Step 1: Exchange authorization code for access token
    const tokenResponse = await exchangeCodeForToken(code);
    logger.info('Received LinkedIn access token', { userId: user.id });

    // Step 2: Fetch LinkedIn profile via OIDC userinfo
    const linkedInUser = await getUserInfo(tokenResponse.access_token);
    logger.info('Retrieved LinkedIn user info', {
      userId: user.id,
      linkedInName: linkedInUser.name,
      linkedInSub: linkedInUser.sub,
    });

    // Step 3: Encrypt the access token (if encryption is configured)
    let accessToken = tokenResponse.access_token;
    let isEncrypted = false;

    if (isEncryptionConfigured()) {
      try {
        accessToken = encrypt(tokenResponse.access_token);
        isEncrypted = true;
        logger.info('LinkedIn access token encrypted', { userId: user.id });
      } catch (encErr) {
        logger.error('Failed to encrypt LinkedIn access token (storing plaintext):', encErr);
      }
    } else {
      logger.warn('Encryption not configured — storing LinkedIn token in plaintext', {
        userId: user.id,
      });
    }

    // Step 4: Calculate token expiration date
    const tokenExpiresAt = calculateExpirationDate(tokenResponse.expires_in);

    // LinkedIn member URN format: "urn:li:person:{id}" — we store the raw sub
    const linkedinUserId = linkedInUser.sub;
    // Use the LinkedIn name as the display username (or email prefix as fallback)
    const username = linkedInUser.name || (linkedInUser.email?.split('@')[0] ?? linkedinUserId);

    // Step 5: Upsert the LinkedIn account
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
        logger.info('Updated existing LinkedIn account', {
          userId: user.id,
          accountId: existingAccount.id,
        });
      } else {
        await prisma.socialMediaAccount.create({
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
        logger.info('Created new LinkedIn account', { userId: user.id });
      }
    } catch (dbError) {
      logger.error('Database error saving LinkedIn account:', dbError);
      return res.redirect(
        '/dashboard?error=' +
          encodeURIComponent('Failed to save LinkedIn account. Please try again.')
      );
    }

    // Step 6: Redirect to dashboard with success indicator
    const returnUrl = stateData.returnUrl || '/dashboard';
    const successUrl = `${returnUrl}${returnUrl.includes('?') ? '&' : '?'}success=linkedin_connected`;

    logger.info('LinkedIn OAuth flow completed successfully', {
      userId: user.id,
      linkedInName: username,
    });

    return res.redirect(successUrl);
  } catch (error) {
    logger.error('Error in LinkedIn OAuth callback:', error);
    return res.redirect(
      '/dashboard?error=' +
        encodeURIComponent(
          error instanceof Error ? error.message : 'Failed to connect LinkedIn account'
        )
    );
  }
}
