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
  
  // Only allow POST requests
  if (req.method !== 'POST') {
    return res.status(405).json({ error: 'Method not allowed' });
  }
  
  const { postId } = req.body;
  
  if (!postId) {
    return res.status(400).json({ error: 'Post ID is required' });
  }
  
  try {
    // Check if account exists and belongs to the user
    const account = await prisma.socialMediaAccount.findFirst({
      where: {
        id,
        userId: user.id,
      },
    });
    
    if (!account) {
      return res.status(404).json({ error: 'Social media account not found' });
    }
    
    // Check if post exists and belongs to the user
    const post = await prisma.contentPost.findFirst({
      where: {
        id: postId,
        userId: user.id,
      },
    });
    
    if (!post) {
      return res.status(404).json({ error: 'Content post not found' });
    }
    
    // Log the request
    await logger.log({
      type: 'CONTENT_POST',
      endpoint: `/api/social-media-accounts/${id}/post`,
      userId: user.id,
      requestData: {
        method: 'POST',
        accountId: id,
        postId,
        accountType: account.accountType,
      },
      status: 200,
    });
    
    // Update the post with the social media account ID and status
    const updatedPost = await prisma.contentPost.update({
      where: { id: postId },
      data: {
        socialMediaAccountId: id,
        status: 'PUBLISHED',
      },
    });
    
    // In a real implementation, you would post to the respective platform's API
    // For now, just return success
    return res.status(200).json({
      success: true,
      message: `Content posted successfully to ${account.accountType === "INSTAGRAM" ? "Instagram" : 
               account.accountType === "BLUESKY" ? "Bluesky" : "X"}`,
      post: updatedPost,
    });
  } catch (error) {
    console.error('Error posting to social media:', error);
    
    // Log the error
    await logger.log({
      type: 'CONTENT_POST',
      endpoint: `/api/social-media-accounts/${id}/post`,
      userId: user.id,
      requestData: {
        method: 'POST',
        accountId: id,
        postId,
      },
      error: error instanceof Error ? error.message : 'Unknown error',
      status: 500,
    });
    
    // Update the post status to FAILED
    try {
      await prisma.contentPost.update({
        where: { id: postId },
        data: {
          status: 'FAILED',
        },
      });
    } catch (updateError) {
      console.error('Error updating post status:', updateError);
    }
    
    return res.status(500).json({ error: 'Failed to post to social media' });
  }
}