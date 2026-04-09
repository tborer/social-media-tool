import { NextApiRequest, NextApiResponse } from 'next';
import { createClient } from '@/util/supabase/api';
import { getAuthorizationUrl, isFacebookConfigured } from '@/lib/facebook-oauth';
import { logger } from '@/lib/server-logger';
import crypto from 'crypto';

/**
 * GET /api/auth/facebook/connect
 *
 * Initiates the Facebook Login OAuth flow by redirecting to Facebook's authorization page.
 */
export default async function handler(req: NextApiRequest, res: NextApiResponse) {
  if (req.method !== 'GET') {
    return res.status(405).json({ error: 'Method not allowed' });
  }

  try {
    const supabase = createClient(req, res);
    const { data: { user }, error: authError } = await supabase.auth.getUser();

    if (authError || !user) {
      logger.error('Authentication error in Facebook connect:', authError);
      return res.status(401).json({ error: 'Unauthorized' });
    }

    if (!isFacebookConfigured()) {
      const missing = [
        !process.env.FACEBOOK_APP_ID && 'FACEBOOK_APP_ID',
        !process.env.FACEBOOK_APP_SECRET && 'FACEBOOK_APP_SECRET',
        !process.env.FACEBOOK_REDIRECT_URI && 'FACEBOOK_REDIRECT_URI',
      ].filter(Boolean).join(', ');

      logger.error('Facebook OAuth not configured — missing: ' + missing);
      return res.redirect(
        '/dashboard?error=' +
          encodeURIComponent(`Facebook OAuth is not configured. Missing: ${missing}`)
      );
    }

    const returnUrl = req.query.returnUrl as string | undefined;
    const state = Buffer.from(
      JSON.stringify({
        userId: user.id,
        returnUrl,
        nonce: crypto.randomBytes(16).toString('hex'),
      })
    ).toString('base64url');

    const authUrl = getAuthorizationUrl(state);

    logger.info('Redirecting user to Facebook OAuth', { userId: user.id });
    return res.redirect(authUrl);
  } catch (error) {
    logger.error('Error in Facebook connect endpoint:', error);
    return res.redirect(
      '/dashboard?error=' +
        encodeURIComponent(
          'Failed to initiate Facebook OAuth: ' +
            (error instanceof Error ? error.message : 'Unknown error')
        )
    );
  }
}
