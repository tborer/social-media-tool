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
  
  const { id } = req.query;
  
  if (!id || typeof id !== 'string') {
    return res.status(400).json({ error: 'Invalid account ID' });
  }
  
  // Handle different HTTP methods
  switch (req.method) {
    case 'GET':
      return getInstagramAccount(req, res, id, user.id);
    case 'PUT':
      return updateInstagramAccount(req, res, id, user.id);
    case 'DELETE':
      return deleteInstagramAccount(req, res, id, user.id);
    default:
      return res.status(405).json({ error: 'Method not allowed' });
  }
}

// Get a specific Instagram account
async function getInstagramAccount(req: NextApiRequest, res: NextApiResponse, accountId: string, userId: string) {
  try {
    const account = await prisma.instagramAccount.findFirst({
      where: {
        id: accountId,
        userId,
      },
    });
    
    if (!account) {
      return res.status(404).json({ error: 'Instagram account not found' });
    }
    
    return res.status(200).json(account);
  } catch (error) {
    console.error('Error fetching Instagram account:', error);
    return res.status(500).json({ error: 'Failed to fetch Instagram account' });
  }
}

// Update an Instagram account
async function updateInstagramAccount(req: NextApiRequest, res: NextApiResponse, accountId: string, userId: string) {
  const { username, accessToken } = req.body;
  
  if (!username && !accessToken) {
    return res.status(400).json({ error: 'At least one field to update is required' });
  }
  
  try {
    // Check if account exists and belongs to the user
    const existingAccount = await prisma.instagramAccount.findFirst({
      where: {
        id: accountId,
        userId,
      },
    });
    
    if (!existingAccount) {
      return res.status(404).json({ error: 'Instagram account not found' });
    }
    
    // Update the account
    const updatedAccount = await prisma.instagramAccount.update({
      where: { id: accountId },
      data: {
        ...(username && { username }),
        ...(accessToken && { accessToken }),
      },
    });
    
    return res.status(200).json(updatedAccount);
  } catch (error) {
    console.error('Error updating Instagram account:', error);
    return res.status(500).json({ error: 'Failed to update Instagram account' });
  }
}

// Delete an Instagram account
async function deleteInstagramAccount(req: NextApiRequest, res: NextApiResponse, accountId: string, userId: string) {
  try {
    // Check if account exists and belongs to the user
    const existingAccount = await prisma.instagramAccount.findFirst({
      where: {
        id: accountId,
        userId,
      },
    });
    
    if (!existingAccount) {
      return res.status(404).json({ error: 'Instagram account not found' });
    }
    
    // Delete the account
    await prisma.instagramAccount.delete({
      where: { id: accountId },
    });
    
    return res.status(204).send(null);
  } catch (error) {
    console.error('Error deleting Instagram account:', error);
    return res.status(500).json({ error: 'Failed to delete Instagram account' });
  }
}