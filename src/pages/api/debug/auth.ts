import { NextApiRequest, NextApiResponse } from 'next';
import { createClient } from '@/util/supabase/api';
import { logger } from '@/lib/logger';

export default async function handler(req: NextApiRequest, res: NextApiResponse) {
  if (req.method !== 'GET') {
    return res.status(405).json({ error: 'Method not allowed' });
  }

  try {
    // Create Supabase client for authentication
    const supabase = createClient(req, res);
    
    // Log request details
    logger.info('Auth debug - Request details:', {
      method: req.method,
      url: req.url,
      headers: {
        cookie: req.headers.cookie ? 'present' : 'missing',
        authorization: req.headers.authorization ? 'present' : 'missing',
        'user-agent': req.headers['user-agent'],
      },
      cookies: Object.keys(req.cookies),
    });
    
    // Try to get the user from the session
    const { data, error: authError } = await supabase.auth.getUser();
    const user = data?.user;
    
    // Log authentication result
    logger.info('Auth debug - Authentication result:', {
      hasUser: !!user,
      userId: user?.id,
      userEmail: user?.email,
      authError: authError?.message,
      authErrorCode: authError?.status,
    });
    
    // Return debug information
    return res.status(200).json({
      authenticated: !!user,
      user: user ? {
        id: user.id,
        email: user.email,
        created_at: user.created_at,
      } : null,
      authError: authError ? {
        message: authError.message,
        status: authError.status,
      } : null,
      requestInfo: {
        hasCookies: Object.keys(req.cookies).length > 0,
        cookieNames: Object.keys(req.cookies),
        hasAuthHeader: !!req.headers.authorization,
      },
    });
  } catch (error) {
    logger.error('Auth debug - Unexpected error:', error);
    return res.status(500).json({ 
      error: 'Internal server error',
      details: error instanceof Error ? error.message : 'Unknown error'
    });
  }
}