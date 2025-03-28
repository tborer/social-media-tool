import { NextApiRequest, NextApiResponse } from 'next';
import { createClient } from '@/util/supabase/api';
import prisma from '@/lib/prisma';

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
      return getInstagramAccounts(req, res, user.id);
    case 'POST':
      return createInstagramAccount(req, res, user.id);
    default:
      return res.status(405).json({ error: 'Method not allowed' });
  }
}

// Get all Instagram accounts for the authenticated user
async function getInstagramAccounts(req: NextApiRequest, res: NextApiResponse, userId: string) {
  try {
    const accounts = await prisma.instagramAccount.findMany({
      where: { userId },
      orderBy: { createdAt: 'desc' },
    });
    
    return res.status(200).json(accounts);
  } catch (error) {
    console.error('Error fetching Instagram accounts:', error);
    return res.status(500).json({ error: 'Failed to fetch Instagram accounts' });
  }
}

// Create a new Instagram account for the authenticated user
async function createInstagramAccount(req: NextApiRequest, res: NextApiResponse, userId: string) {
  const { username, accessToken } = req.body;
  
  if (!username || !accessToken) {
    return res.status(400).json({ error: 'Username and access token are required' });
  }
  
  try {
    // Check if account already exists for this user
    const existingAccount = await prisma.instagramAccount.findFirst({
      where: {
        userId,
        username,
      },
    });
    
    if (existingAccount) {
      return res.status(409).json({ error: 'An account with this username already exists' });
    }
    
    // Create new Instagram account
    const newAccount = await prisma.instagramAccount.create({
      data: {
        username,
        accessToken,
        userId,
      },
    });
    
    return res.status(201).json(newAccount);
  } catch (error) {
    console.error('Error creating Instagram account:', error);
    return res.status(500).json({ error: 'Failed to create Instagram account' });
  }
}