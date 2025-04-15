import { NextApiRequest, NextApiResponse } from 'next';
import { createClient } from '@/util/supabase/api';
import prisma from '@/lib/prisma';
import { createLog } from '@/lib/logger';

export default async function handler(req: NextApiRequest, res: NextApiResponse) {
  // Create Supabase client for authentication
  const supabase = createClient(req, res);
  
  // Get the user from the session
  const { data: { user }, error: authError } = await supabase.auth.getUser();
  
  if (authError || !user) {
    console.error('Authentication error:', authError);
    return res.status(401).json({ error: 'Unauthorized' });
  }
  
  // Handle different HTTP methods
  switch (req.method) {
    case 'GET':
      return getSocialMediaAccounts(req, res, user.id);
    case 'POST':
      return createSocialMediaAccount(req, res, user.id);
    default:
      return res.status(405).json({ error: 'Method not allowed' });
  }
}

// Get all social media accounts for the authenticated user
async function getSocialMediaAccounts(req: NextApiRequest, res: NextApiResponse, userId: string) {
  try {
    const accounts = await prisma.socialMediaAccount.findMany({
      where: { userId },
      orderBy: { createdAt: 'desc' },
    });
    
    return res.status(200).json(accounts);
  } catch (error) {
    console.error('Error fetching social media accounts:', error);
    return res.status(500).json({ error: 'Failed to fetch social media accounts' });
  }
}

// Create a new social media account for the authenticated user
async function createSocialMediaAccount(req: NextApiRequest, res: NextApiResponse, userId: string) {
  const { username, accessToken, accountType } = req.body;
  
  if (!username || !accessToken || !accountType) {
    return res.status(400).json({ error: 'Username, access token, and account type are required' });
  }
  
  try {
    // Check if account already exists for this user
    const existingAccount = await prisma.socialMediaAccount.findFirst({
      where: {
        userId,
        username,
        accountType,
      },
    });
    
    if (existingAccount) {
      return res.status(409).json({ error: `An account with this username already exists for ${accountType}` });
    }
    
    // Create new social media account
    const newAccount = await prisma.socialMediaAccount.create({
      data: {
        username,
        accessToken,
        accountType,
        userId,
      },
    });
    
    // Log the account creation
    try {
      await createLog({
        type: 'CONTENT_POST',
        endpoint: '/api/social-media-accounts',
        userId,
        requestData: {
          method: 'POST',
          username,
          accountType,
        },
        response: {
          id: newAccount.id,
          username: newAccount.username,
          accountType: newAccount.accountType,
        },
        status: 201,
      });
    } catch (logError) {
      console.error('Error logging account creation:', logError);
      // Continue even if logging fails
    }
    
    return res.status(201).json(newAccount);
  } catch (error) {
    console.error('Error creating social media account:', error);
    
    // Log the error
    try {
      await createLog({
        type: 'CONTENT_POST',
        endpoint: '/api/social-media-accounts',
        userId,
        requestData: {
          method: 'POST',
          username,
          accountType,
        },
        error: error instanceof Error ? error.message : 'Unknown error',
        status: 500,
      });
    } catch (logError) {
      console.error('Error logging account creation failure:', logError);
      // Continue even if logging fails
    }
    
    return res.status(500).json({ error: 'Failed to create social media account' });
  }
}