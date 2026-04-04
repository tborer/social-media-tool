import { NextApiRequest, NextApiResponse } from 'next';
import { createClient } from '@/util/supabase/api';
import prisma from '@/lib/prisma';
import { logger } from '@/lib/server-logger';

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
    
    logger.info('Updated social media account', { accountId, userId });
    return res.status(200).json(updatedAccount);
  } catch (error) {
    const errorMessage = error instanceof Error ? error.message : 'Unknown error';
    logger.error('Error updating social media account', { accountId, userId, errorMessage });
    return res.status(500).json({ error: 'Failed to update social media account', details: errorMessage });
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

    // Explicitly clean up related records in a transaction to avoid relying
    // on database-level cascade rules which may be out of sync with the schema.
    await prisma.$transaction(async (tx: any) => {
      // Null out ContentPost references (matches schema onDelete: SetNull)
      await tx.contentPost.updateMany({
        where: { socialMediaAccountId: accountId },
        data: { socialMediaAccountId: null },
      });

      // Delete AccountInsight records (matches schema onDelete: Cascade)
      await tx.accountInsight.deleteMany({
        where: { accountId },
      });

      // Finally delete the account itself
      await tx.socialMediaAccount.delete({
        where: { id: accountId },
      });
    });

    logger.info('Deleted social media account', { accountId, userId });
    return res.status(204).send(null);
  } catch (error) {
    // Surface the actual error message so we can diagnose failures
    const errorMessage = error instanceof Error ? error.message : 'Unknown error';
    const errorCode = (error as any)?.code;
    logger.error('Error deleting social media account', {
      accountId,
      userId,
      errorMessage,
      errorCode,
    });

    return res.status(500).json({
      error: 'Failed to delete social media account',
      details: errorMessage,
      code: errorCode,
    });
  }
}