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
  
  const { id } = req.query;
  
  if (!id || typeof id !== 'string') {
    return res.status(400).json({ error: 'Invalid account ID' });
  }
  
  // Handle different HTTP methods
  switch (req.method) {
    case 'GET':
      return getSocialMediaAccount(req, res, id, user.id);
    case 'PUT':
      return updateSocialMediaAccount(req, res, id, user.id);
    case 'DELETE':
      return deleteSocialMediaAccount(req, res, id, user.id);
    default:
      return res.status(405).json({ error: 'Method not allowed' });
  }
}

// Get a specific social media account
async function getSocialMediaAccount(req: NextApiRequest, res: NextApiResponse, accountId: string, userId: string) {
  try {
    const account = await prisma.socialMediaAccount.findFirst({
      where: {
        id: accountId,
        userId,
      },
    });
    
    if (!account) {
      return res.status(404).json({ error: 'Social media account not found' });
    }
    
    return res.status(200).json(account);
  } catch (error) {
    console.error('Error fetching social media account:', error);
    return res.status(500).json({ error: 'Failed to fetch social media account' });
  }
}

// Update a social media account
async function updateSocialMediaAccount(req: NextApiRequest, res: NextApiResponse, accountId: string, userId: string) {
  const { username, accessToken, accountType } = req.body;
  
  if (!username && !accessToken && !accountType) {
    return res.status(400).json({ error: 'At least one field to update is required' });
  }
  
  try {
    // Check if account exists and belongs to the user
    const existingAccount = await prisma.socialMediaAccount.findFirst({
      where: {
        id: accountId,
        userId,
      },
    });
    
    if (!existingAccount) {
      return res.status(404).json({ error: 'Social media account not found' });
    }
    
    // Update the account
    const updatedAccount = await prisma.socialMediaAccount.update({
      where: { id: accountId },
      data: {
        ...(username && { username }),
        ...(accessToken && { accessToken }),
        ...(accountType && { accountType }),
      },
    });
    
    // Log the update
    await logger.log({
      type: 'CONTENT_POST',
      endpoint: `/api/social-media-accounts/${accountId}`,
      userId,
      requestData: {
        method: 'PUT',
        id: accountId,
        ...(username && { username }),
        ...(accountType && { accountType }),
      },
      response: {
        id: updatedAccount.id,
        username: updatedAccount.username,
        accountType: updatedAccount.accountType,
      },
      status: 200,
    });
    
    return res.status(200).json(updatedAccount);
  } catch (error) {
    console.error('Error updating social media account:', error);
    
    // Log the error
    await logger.log({
      type: 'CONTENT_POST',
      endpoint: `/api/social-media-accounts/${accountId}`,
      userId,
      requestData: {
        method: 'PUT',
        id: accountId,
      },
      error: error instanceof Error ? error.message : 'Unknown error',
      status: 500,
    });
    
    return res.status(500).json({ error: 'Failed to update social media account' });
  }
}

// Delete a social media account
async function deleteSocialMediaAccount(req: NextApiRequest, res: NextApiResponse, accountId: string, userId: string) {
  try {
    // Check if account exists and belongs to the user
    const existingAccount = await prisma.socialMediaAccount.findFirst({
      where: {
        id: accountId,
        userId,
      },
    });
    
    if (!existingAccount) {
      return res.status(404).json({ error: 'Social media account not found' });
    }
    
    // Delete the account
    await prisma.socialMediaAccount.delete({
      where: { id: accountId },
    });
    
    // Log the deletion
    await logger.log({
      type: 'CONTENT_POST',
      endpoint: `/api/social-media-accounts/${accountId}`,
      userId,
      requestData: {
        method: 'DELETE',
        id: accountId,
      },
      status: 204,
    });
    
    return res.status(204).send(null);
  } catch (error) {
    console.error('Error deleting social media account:', error);
    
    // Log the error
    await logger.log({
      type: 'CONTENT_POST',
      endpoint: `/api/social-media-accounts/${accountId}`,
      userId,
      requestData: {
        method: 'DELETE',
        id: accountId,
      },
      error: error instanceof Error ? error.message : 'Unknown error',
      status: 500,
    });
    
    return res.status(500).json({ error: 'Failed to delete social media account' });
  }
}