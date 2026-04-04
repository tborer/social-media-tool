import { NextApiRequest, NextApiResponse } from 'next';
import { createClient } from '@/util/supabase/api';
import { getAuthorizationUrl, isInstagramConfigured } from '@/lib/instagram-oauth';
import { logger } from '@/lib/server-logger';
import crypto from 'crypto';

/**
 * Instagram OAuth Connect Endpoint
 *
 * Initiates the Instagram OAuth flow by redirecting the user to Instagram's authorization page
 *
 * Query Parameters:
 * - returnUrl (optional): URL to return to after OAuth completion
 */
export default async function handler(req: NextApiRequest, res: NextApiResponse) {
  // Only allow GET requests
  if (req.method !== 'GET') {
    return res.status(405).json({ error: 'Method not allowed' });
  }

  try {
    // Create Supabase client for authentication
    const supabase = createClient(req, res);

    // Get the user from the session
    const { data: { user }, error: authError } = await supabase.auth.getUser();

    if (authError || !user) {
      logger.error('Authentication error in Instagram connect:', authError);
      return res.status(401).json({ error: 'Unauthorized' });
    }

    // Check if Instagram OAuth is configured
    if (!isInstagramConfigured()) {
      logger.error('Instagram OAuth not configured - missing env vars (INSTAGRAM_APP_ID, INSTAGRAM_APP_SECRET, INSTAGRAM_REDIRECT_URI)');
      // Redirect back to dashboard with an error so the user sees a toast
      // instead of raw JSON. This is a deployment/config issue.
      return res.redirect(
        '/dashboard?error=' +
          encodeURIComponent(
            'Instagram OAuth is not configured on the server. An administrator must set INSTAGRAM_APP_ID, INSTAGRAM_APP_SECRET, and INSTAGRAM_REDIRECT_URI environment variables.'
          )
      );
    }

    // Generate a state parameter for CSRF protection
    // State includes user ID and optional return URL
    const returnUrl = req.query.returnUrl as string | undefined;
    const state = Buffer.from(
      JSON.stringify({
        userId: user.id,
        returnUrl,
        nonce: crypto.randomBytes(16).toString('hex'),
      })
    ).toString('base64url');

    // Get Instagram authorization URL
    const authUrl = getAuthorizationUrl(state);

    logger.info('Redirecting user to Instagram OAuth', { userId: user.id });

    // Redirect to Instagram authorization page
    return res.redirect(authUrl);
  } catch (error) {
    logger.error('Error in Instagram connect endpoint:', error);
    return res.redirect(
      '/dashboard?error=' +
        encodeURIComponent(
          'Failed to initiate Instagram OAuth: ' +
            (error instanceof Error ? error.message : 'Unknown error')
        )
    );
  }
}
