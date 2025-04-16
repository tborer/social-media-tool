import { NextApiRequest, NextApiResponse } from 'next';
import { createClient } from '@/util/supabase/api';
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
  
  const { id } = req.query;
  
  if (!id || typeof id !== 'string') {
    return res.status(400).json({ error: 'Invalid account ID' });
  }
  
  // Log the request
  try {
    await logger.serverLog({
      type: 'CONTENT_POST',
      endpoint: `/api/instagram-accounts/${id}/images`,
      userId: user.id,
      requestData: {
        method: req.method,
        id,
      },
      status: 301,
    });
  } catch (logError) {
    console.error('Error logging redirect:', logError);
  }
  
  // Redirect to the social media accounts endpoint
  res.setHeader('Location', `/api/social-media-accounts/${id}/images`);
  return res.status(301).json({ 
    message: 'This endpoint is deprecated. Please use /api/social-media-accounts/:id/images instead.',
    redirectTo: `/api/social-media-accounts/${id}/images`
  });
}