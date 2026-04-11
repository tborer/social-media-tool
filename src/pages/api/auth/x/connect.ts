import { NextApiRequest, NextApiResponse } from 'next';
import { createClient } from '@/util/supabase/api';
import {
  getAuthorizationUrl,
  generateCodeVerifier,
  generateCodeChallenge,
  isXConfigured,
} from '@/lib/x-oauth';
import { logger } from '@/lib/server-logger';
import crypto from 'crypto';

/**
 * X (Twitter) OAuth 2.0 PKCE Connect Endpoint
 *
 * Initiates the X OAuth 2.0 authorization flow with PKCE.
 * The PKCE code verifier is embedded in the state parameter so it can
 * be retrieved in the callback without server-side session storage.
 *
 * Query Parameters:
 * - returnUrl (optional): URL to return to after OAuth completion
 */
export default async function handler(req: NextApiRequest, res: NextApiResponse) {
  if (req.method !== 'GET') {
    return res.status(405).json({ error: 'Method not allowed' });
  }

  console.log('[X connect] Received connect request');

  try {
    const supabase = createClient(req, res);
    const { data: { user }, error: authError } = await supabase.auth.getUser();

    if (authError || !user) {
      console.error('[X connect] Auth error — user not logged in', { authError });
      logger.error('Authentication error in X connect:', authError);
      return res.status(401).json({ error: 'Unauthorized' });
    }

    console.log('[X connect] Authenticated user', { userId: user.id });

    if (!isXConfigured()) {
      const missing = [
        !process.env.X_CLIENT_ID && 'X_CLIENT_ID',
        !process.env.X_CLIENT_SECRET && 'X_CLIENT_SECRET',
        !process.env.X_REDIRECT_URI && 'X_REDIRECT_URI',
      ].filter(Boolean).join(', ');
      console.error('[X connect] OAuth not configured — missing env vars:', missing);
      logger.error('X OAuth not configured — missing X_CLIENT_ID, X_CLIENT_SECRET, or X_REDIRECT_URI');
      return res.redirect(
        '/dashboard?error=' +
          encodeURIComponent(
            'X OAuth is not configured on the server. An administrator must set X_CLIENT_ID, X_CLIENT_SECRET, and X_REDIRECT_URI.'
          )
      );
    }

    const returnUrl = req.query.returnUrl as string | undefined;

    // Generate PKCE pair
    const codeVerifier = generateCodeVerifier();
    const codeChallenge = generateCodeChallenge(codeVerifier);

    // Embed the code verifier in the state so the callback can use it for
    // the token exchange without any server-side session storage.
    const state = Buffer.from(
      JSON.stringify({
        userId: user.id,
        returnUrl,
        nonce: crypto.randomBytes(16).toString('hex'),
        codeVerifier,
      })
    ).toString('base64url');

    const authUrl = getAuthorizationUrl(state, codeChallenge);

    console.log('[X connect] Redirecting user to X OAuth', {
      userId: user.id,
      redirectUri: process.env.X_REDIRECT_URI,
      scopes: new URL(authUrl).searchParams.get('scope'),
    });
    logger.info('Redirecting user to X OAuth', { userId: user.id });
    return res.redirect(authUrl);
  } catch (error) {
    console.error('[X connect] Unhandled error', { error });
    logger.error('Error in X connect endpoint:', error);
    return res.redirect(
      '/dashboard?error=' +
        encodeURIComponent(
          'Failed to initiate X OAuth: ' +
            (error instanceof Error ? error.message : 'Unknown error')
        )
    );
  }
}
