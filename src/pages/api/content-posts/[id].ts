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
    return res.status(400).json({ error: 'Invalid post ID' });
  }
  
  // Handle different HTTP methods
  switch (req.method) {
    case 'GET':
      return getContentPost(req, res, id, user.id);
    case 'PUT':
      return updateContentPost(req, res, id, user.id);
    case 'DELETE':
      return deleteContentPost(req, res, id, user.id);
    default:
      return res.status(405).json({ error: 'Method not allowed' });
  }
}

// Get a specific content post
async function getContentPost(req: NextApiRequest, res: NextApiResponse, postId: string, userId: string) {
  try {
    const post = await prisma.contentPost.findFirst({
      where: {
        id: postId,
        userId,
      },
      include: {
        socialMediaAccount: {
          select: {
            id: true,
            username: true,
            accountType: true,
          },
        },
      },
    });
    
    if (!post) {
      return res.status(404).json({ error: 'Content post not found' });
    }
    
    return res.status(200).json(post);
  } catch (error) {
    console.error('Error fetching content post:', error);
    return res.status(500).json({ error: 'Failed to fetch content post' });
  }
}

// Update a content post
async function updateContentPost(req: NextApiRequest, res: NextApiResponse, postId: string, userId: string) {
  const { caption, imageUrl, status, scheduledFor, socialMediaAccountId } = req.body;
  
  try {
    // Check if post exists and belongs to the user
    const existingPost = await prisma.contentPost.findFirst({
      where: {
        id: postId,
        userId,
      },
    });
    
    if (!existingPost) {
      return res.status(404).json({ error: 'Content post not found' });
    }
    
    // If socialMediaAccountId is provided, verify it belongs to the user
    if (socialMediaAccountId) {
      const account = await prisma.socialMediaAccount.findFirst({
        where: {
          id: socialMediaAccountId,
          userId,
        },
      });
      
      if (!account) {
        return res.status(400).json({ error: 'Invalid social media account' });
      }
    }
    
    // Update the post
    const updatedPost = await prisma.contentPost.update({
      where: { id: postId },
      data: {
        ...(caption !== undefined && { caption }),
        ...(imageUrl !== undefined && { imageUrl }),
        ...(status !== undefined && { status }),
        ...(scheduledFor !== undefined && { scheduledFor }),
        ...(socialMediaAccountId !== undefined && { socialMediaAccountId }),
      },
    });
    
    return res.status(200).json(updatedPost);
  } catch (error) {
    console.error('Error updating content post:', error);
    return res.status(500).json({ error: 'Failed to update content post' });
  }
}

// Delete a content post
async function deleteContentPost(req: NextApiRequest, res: NextApiResponse, postId: string, userId: string) {
  try {
    // Check if post exists and belongs to the user
    const existingPost = await prisma.contentPost.findFirst({
      where: {
        id: postId,
        userId,
      },
    });
    
    if (!existingPost) {
      return res.status(404).json({ error: 'Content post not found' });
    }
    
    // Delete the post
    await prisma.contentPost.delete({
      where: { id: postId },
    });
    
    return res.status(204).send(null);
  } catch (error) {
    console.error('Error deleting content post:', error);
    return res.status(500).json({ error: 'Failed to delete content post' });
  }
}