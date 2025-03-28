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
        instagramAccount: {
          select: {
            id: true,
            username: true,
          },
        },
      },
    });
    
    return res.status(200).json(posts);
  } catch (error) {
    console.error('Error fetching content posts:', error);
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
      console.error(`Error creating content post: Request body too large (${contentLength} bytes)`);
      return res.status(413).json({ 
        error: 'Request body too large. Image URLs may be too long or contain too much data. Try using a shorter image URL or reducing the content size.' 
      });
    }
    
    const { caption, imageUrl, instagramAccountId } = req.body;
    
    if (!caption) {
      console.error('Error creating content post: Caption is required');
      return res.status(400).json({ error: 'Caption is required' });
    }
    
    // Log the size of the caption and imageUrl for debugging
    console.info(`Caption length: ${caption.length} characters`);
    console.info(`Image URL length: ${imageUrl ? imageUrl.length : 0} characters`);
    
    // If instagramAccountId is provided, verify it belongs to the user
    if (instagramAccountId) {
      const account = await prisma.instagramAccount.findFirst({
        where: {
          id: instagramAccountId,
          userId,
        },
      });
      
      if (!account) {
        console.error(`Error creating content post: Invalid Instagram account ID: ${instagramAccountId}`);
        return res.status(400).json({ error: 'Invalid Instagram account' });
      }
    }
    
    // Create new content post
    const newPost = await prisma.contentPost.create({
      data: {
        caption,
        imageUrl,
        userId,
        instagramAccountId,
        status: 'DRAFT',
      },
    });
    
    console.info(`Successfully created content post with ID: ${newPost.id}`);
    return res.status(201).json(newPost);
  } catch (error) {
    console.error('Error creating content post:', error);
    return res.status(500).json({ error: 'Failed to create content post' });
  }
}