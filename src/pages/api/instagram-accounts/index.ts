import { NextApiRequest, NextApiResponse } from 'next';
import { createClient } from '@/util/supabase/api';
import prisma from '@/lib/prisma';
import { logger } from '@/lib/logger';

export default async function handler(req: NextApiRequest, res: NextApiResponse) {
  // Create Supabase client for authentication
  const supabase = createClient(req, res);
  
  // Get the user from the session
  const { data: { user }, error: authError } = await supabase.auth.getUser();
  
  if (authError || !user) {
    console.error('Authentication error:', authError);
    return res.status(401).json({ error: 'Unauthorized' });
  }
  
  // Log the request
  try {
    await logger.serverLog({
      type: 'CONTENT_POST',
      endpoint: '/api/instagram-accounts',
      userId: user.id,
      requestData: {
        method: req.method,
      },
      status: 301,
    });
  } catch (logError) {
    console.error('Error logging redirect:', logError);
  }
  
  // Redirect to the social media accounts endpoint
  res.setHeader('Location', '/api/social-media-accounts');
  return res.status(301).json({ 
    message: 'This endpoint is deprecated. Please use /api/social-media-accounts instead.',
    redirectTo: '/api/social-media-accounts'
  });
}