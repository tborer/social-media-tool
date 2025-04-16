import { NextApiRequest, NextApiResponse } from 'next';
import { createClient } from '@/util/supabase/api';
import prisma from '@/lib/prisma';
import logger from '@/lib/logger';

export default async function handler(req: NextApiRequest, res: NextApiResponse) {
  // Create Supabase client for authentication
  const supabase = createClient(req, res);
  
  // Get the user from the session
  const { data: { user }, error: authError } = await supabase.auth.getUser();
  
  if (authError || !user) {
    logger.error('Authentication error:', authError);
    return res.status(401).json({ error: 'Unauthorized' });
  }
  
  // Handle different HTTP methods
  switch (req.method) {
    case 'GET':
      return getContentPosts(req, res, user.id);
    case 'POST':
      return createContentPost(req, res, user.id);
    default:
      return res.status(405).json({ error: 'Method not allowed' });
  }
}

// Get all content posts for the authenticated user
async function getContentPosts(req: NextApiRequest, res: NextApiResponse, userId: string) {
  try {
    const posts = await prisma.contentPost.findMany({
      where: { userId },
      orderBy: { createdAt: 'desc' },
      include: {
        socialMediaAccount: {
          select: {
            id: true,
            username: true,
          },
        },
      },
    });
    
    return res.status(200).json(posts);
  } catch (error) {
    logger.error('Error fetching content posts:', error);
    return res.status(500).json({ error: 'Failed to fetch content posts' });
  }
}

// Create a new content post for the authenticated user
async function createContentPost(req: NextApiRequest, res: NextApiResponse, userId: string) {
  try {
    // Check if the request body is too large
    const contentLength = parseInt(req.headers['content-length'] || '0', 10);
    const maxContentLength = 1024 * 1024; // 1MB limit
    
    if (contentLength > maxContentLength) {
      logger.error(`Error creating content post: Request body too large (${contentLength} bytes)`);
      return res.status(413).json({ 
        error: 'Request body too large. Image URLs may be too long or contain too much data. Try using a shorter image URL or reducing the content size.' 
      });
    }
    
    const { caption, imageUrl, socialMediaAccountId, contentType, status } = req.body;
    
    if (!caption) {
      logger.error('Error creating content post: Caption is required');
      return res.status(400).json({ error: 'Caption is required' });
    }
    
    // Log the size of the caption and imageUrl for debugging
    logger.info(`Caption length: ${caption.length} characters`);
    logger.info(`Image URL length: ${imageUrl ? imageUrl.length : 0} characters`);
    
    // Check if the image URL is too long
    if (imageUrl && imageUrl.length > 2000) {
      logger.warn(`Image URL is too long (${imageUrl.length} characters). This may cause issues.`);
      return res.status(400).json({ 
        error: 'Image URL is too long. Please use a shorter URL or a different image.' 
      });
    }
    
    // Get scheduledFor from request body
    const { scheduledFor } = req.body;
    
    // Prepare the data for creating a new post
    const postData: any = {
      caption,
      imageUrl,
      userId,
      // Use provided status or default to DRAFT
      status: status || (scheduledFor ? 'SCHEDULED' : 'DRAFT'),
    };
    
    // Add contentType if provided
    if (contentType) {
      postData.contentType = contentType;
    }
    
    // Add scheduledFor if provided
    if (scheduledFor) {
      postData.scheduledFor = new Date(scheduledFor);
    }
    
    // Only include socialMediaAccountId if it's provided and valid
    if (socialMediaAccountId && socialMediaAccountId.trim() !== '') {
      // Verify the social media account belongs to the user
      const account = await prisma.socialMediaAccount.findFirst({
        where: {
          id: socialMediaAccountId,
          userId,
        },
      });
      
      if (!account) {
        logger.error(`Error creating content post: Invalid social media account ID: ${socialMediaAccountId}`);
        return res.status(400).json({ error: 'Invalid social media account' });
      }
      
      // If account is valid, add it to the post data
      postData.socialMediaAccountId = socialMediaAccountId;
    }
    
    // Create new content post
    const newPost = await prisma.contentPost.create({
      data: postData,
    });
    
    logger.info(`Successfully created content post with ID: ${newPost.id}`);
    return res.status(201).json(newPost);
  } catch (error) {
    logger.error('Error creating content post:', error);
    return res.status(500).json({ error: 'Failed to create content post' });
  }
}