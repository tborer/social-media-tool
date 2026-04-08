import { NextApiRequest, NextApiResponse } from 'next';
import { createClient } from '@/util/supabase/api';
import { getAuthorizationUrl, isLinkedInConfigured } from '@/lib/linkedin-oauth';
import { logger } from '@/lib/server-logger';
import crypto from 'crypto';

/**
 * LinkedIn OAuth Connect Endpoint
 *
 * Initiates the LinkedIn OAuth 2.0 authorization flow by redirecting
 * the user to LinkedIn's authorization page.
 *
 * Query Parameters:
 * - returnUrl (optional): URL to return to after OAuth completion
 */
export default async function handler(req: NextApiRequest, res: NextApiResponse) {
  if (req.method !== 'GET') {
    return res.status(405).json({ error: 'Method not allowed' });
  }

  try {
    const supabase = createClient(req, res);
    const { data: { user }, error: authError } = await supabase.auth.getUser();

    if (authError || !user) {
      logger.error('Authentication error in LinkedIn connect:', authError);
      return res.status(401).json({ error: 'Unauthorized' });
    }

    if (!isLinkedInConfigured()) {
      const missing = [
        !process.env.LINKEDIN_CLIENT_ID && 'LINKEDIN_CLIENT_ID',
        !process.env.LINKEDIN_CLIENT_SECRET && 'LINKEDIN_CLIENT_SECRET',
        !process.env.LINKEDIN_REDIRECT_URI && 'LINKEDIN_REDIRECT_URI',
      ].filter(Boolean).join(', ');
      console.error('[LinkedIn connect] OAuth not configured — missing env vars:', missing);
      logger.error('LinkedIn OAuth not configured — missing env vars: ' + missing);
      return res.redirect(
        '/dashboard?error=' +
          encodeURIComponent(
            `LinkedIn OAuth is not configured on the server. Missing: ${missing}`
          )
      );
    }

    const returnUrl = req.query.returnUrl as string | undefined;

    // State parameter carries userId + returnUrl + nonce for CSRF protection.
    const state = Buffer.from(
      JSON.stringify({
        userId: user.id,
        returnUrl,
        nonce: crypto.randomBytes(16).toString('hex'),
      })
    ).toString('base64url');

    const authUrl = getAuthorizationUrl(state);

    console.log('[LinkedIn connect] Redirecting user to LinkedIn OAuth', {
      userId: user.id,
      redirectUri: process.env.LINKEDIN_REDIRECT_URI,
      // Log the scopes from the URL for easy debugging
      scopes: new URL(authUrl).searchParams.get('scope'),
    });
    logger.info('Redirecting user to LinkedIn OAuth', { userId: user.id });
    return res.redirect(authUrl);
  } catch (error) {
    logger.error('Error in LinkedIn connect endpoint:', error);
    return res.redirect(
      '/dashboard?error=' +
        encodeURIComponent(
          'Failed to initiate LinkedIn OAuth: ' +
            (error instanceof Error ? error.message : 'Unknown error')
        )
    );
  }
}
