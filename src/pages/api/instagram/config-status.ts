import { NextApiRequest, NextApiResponse } from 'next';
import { createClient } from '@/util/supabase/api';

/**
 * Instagram OAuth Config Status
 *
 * Reports which Instagram OAuth env vars are present at runtime on the server.
 * Does NOT expose secret values - only whether they are set and their length.
 */
export default async function handler(req: NextApiRequest, res: NextApiResponse) {
  if (req.method !== 'GET') {
    return res.status(405).json({ error: 'Method not allowed' });
  }

  // Require authentication so this isn't publicly readable
  const supabase = createClient(req, res);
  const { data: { user }, error: authError } = await supabase.auth.getUser();
  if (authError || !user) {
    return res.status(401).json({ error: 'Unauthorized' });
  }

  const appId = process.env.INSTAGRAM_APP_ID;
  const appSecret = process.env.INSTAGRAM_APP_SECRET;
  const redirectUri = process.env.INSTAGRAM_REDIRECT_URI;

  const describe = (value: string | undefined) => {
    if (value === undefined) return { set: false, reason: 'undefined (not set)' };
    if (value === '') return { set: false, reason: 'empty string' };
    if (value.trim() !== value) return { set: true, reason: 'set but has leading/trailing whitespace', length: value.length };
    return { set: true, length: value.length };
  };

  const appIdStatus = describe(appId);
  const appSecretStatus = describe(appSecret);
  const redirectUriStatus = describe(redirectUri);

  const allConfigured = appIdStatus.set && appSecretStatus.set && redirectUriStatus.set;

  return res.status(200).json({
    allConfigured,
    env: {
      INSTAGRAM_APP_ID: appIdStatus,
      INSTAGRAM_APP_SECRET: { ...appSecretStatus, length: appSecretStatus.set ? '***' : undefined },
      INSTAGRAM_REDIRECT_URI: {
        ...redirectUriStatus,
        // Safe to show - it's your own callback URL
        value: redirectUri || null,
      },
    },
    nodeEnv: process.env.NODE_ENV,
    vercelEnv: process.env.VERCEL_ENV || null,
    recommendations: allConfigured
      ? ['All required env vars are set. If you still see errors, check that the values are correct in your Meta app dashboard.']
      : [
          'Set all three env vars in your Vercel project settings (Settings → Environment Variables).',
          'Make sure they are enabled for the Production environment (and Preview if testing there).',
          'After adding env vars, trigger a new deployment - Vercel does NOT apply env var changes to existing deployments.',
          'Check for typos: the exact names are INSTAGRAM_APP_ID, INSTAGRAM_APP_SECRET, INSTAGRAM_REDIRECT_URI.',
        ],
  });
}
