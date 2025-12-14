import { NextApiRequest, NextApiResponse } from 'next';
import { createClient } from '@/util/supabase/api';
import prisma from '@/lib/prisma';
import { logger } from '@/lib/logger';
import { LogType } from '@prisma/client';

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
    logger.info(`Fetching content posts for user: ${userId}`, { userId });
    
    const posts = await prisma.contentPost.findMany({
      where: { userId },
      orderBy: { createdAt: 'desc' },
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
    
    logger.info(`Successfully fetched ${posts.length} content posts`, { userId });
    return res.status(200).json(posts);
  } catch (error) {
    logger.error('Error fetching content posts:', error, { userId });
    return res.status(500).json({ error: 'Failed to fetch content posts' });
  }
}

// Create a new content post for the authenticated user
async function createContentPost(req: NextApiRequest, res: NextApiResponse, userId: string) {
  // Create a log entry for this content post creation
  const logEntry = await prisma.log.create({
    data: {
      type: LogType.CONTENT_POST,
      endpoint: '/api/content-posts',
      requestData: { method: req.method, headers: req.headers },
      userId: userId,
    },
  });
  
  logger.info(`Created log entry for content post creation: ${logEntry.id}`, { userId });
  
  try {
    // Check if the request body is too large
    const contentLength = parseInt(req.headers['content-length'] || '0', 10);
    const maxContentLength = 1024 * 1024; // 1MB limit
    
    logger.info(`Request content length: ${contentLength} bytes`, { userId });
    
    // Update log with request body size
    await prisma.log.update({
      where: { id: logEntry.id },
      data: {
        requestData: {
          ...logEntry.requestData as any,
          contentLength
        }
      }
    });
    
    if (contentLength > maxContentLength) {
      const errorMsg = `Request body too large (${contentLength} bytes)`;
      logger.error(`Error creating content post: ${errorMsg}`, { userId });
      
      // Update log with error
      await prisma.log.update({
        where: { id: logEntry.id },
        data: {
          error: errorMsg,
          status: 413
        }
      });
      
      return res.status(413).json({ 
        error: 'Request body too large. Image URLs may be too long or contain too much data. Try using a shorter image URL or reducing the content size.' 
      });
    }
    
    const { caption, imageUrl, socialMediaAccountId, contentType, videoType, status } = req.body;
    
    // Update log with request details
    await prisma.log.update({
      where: { id: logEntry.id },
      data: {
        requestData: {
          ...logEntry.requestData as any,
          captionLength: caption ? caption.length : 0,
          imageUrlLength: imageUrl ? imageUrl.length : 0,
          socialMediaAccountId,
          contentType,
          status
        }
      }
    });
    
    if (!caption) {
      const errorMsg = 'Caption is required';
      logger.error(`Error creating content post: ${errorMsg}`, { userId });
      
      // Update log with error
      await prisma.log.update({
        where: { id: logEntry.id },
        data: {
          error: errorMsg,
          status: 400
        }
      });
      
      return res.status(400).json({ error: errorMsg });
    }
    
    // Log the size of the caption and imageUrl for debugging
    logger.info(`Caption length: ${caption.length} characters`, { userId });
    
    if (imageUrl) {
      logger.info(`Image URL length: ${imageUrl.length} characters`, { userId });
      logger.info(`Image URL starts with: ${imageUrl.substring(0, 50)}...`, { userId });
      
      // Check if it's a temporary URL from our API
      const isTemporaryUrl = imageUrl.startsWith('/api/image/');
      if (isTemporaryUrl) {
        logger.info(`Using temporary URL: ${imageUrl}`, { userId });
        
        // Extract the short ID from the URL
        const shortId = imageUrl.split('/').pop();
        if (shortId) {
          // Check if the URL mapping exists
          const mapping = await prisma.urlMapping.findUnique({
            where: { short_id: shortId }
          });
          
          if (!mapping) {
            const errorMsg = `Temporary image URL not found: ${imageUrl}`;
            logger.error(errorMsg, { userId });
            
            // Update log with error
            await prisma.log.update({
              where: { id: logEntry.id },
              data: {
                error: errorMsg,
                status: 400
              }
            });
            
            return res.status(400).json({ error: 'Image URL is invalid or expired. Please upload the image again.' });
          }
          
          logger.info(`Found URL mapping for temporary URL: ${shortId}`, { userId });
        }
      }
    }
    
    // Check if the image URL is too long
    if (imageUrl && imageUrl.length > 2000) {
      const errorMsg = `Image URL is too long (${imageUrl.length} characters)`;
      logger.warn(errorMsg, { userId });
      
      // Update log with error
      await prisma.log.update({
        where: { id: logEntry.id },
        data: {
          error: errorMsg,
          status: 400
        }
      });
      
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
      // Respect explicitly provided status, otherwise default based on scheduledFor
      status: status !== undefined ? status : (scheduledFor ? 'SCHEDULED' : 'DRAFT'),
    };
    
    // Add contentType if provided
    if (contentType) {
      postData.contentType = contentType;
    }

    // Add videoType if provided (for VIDEO content)
    if (videoType) {
      postData.videoType = videoType;
    }

    // Add scheduledFor if provided
    if (scheduledFor) {
      postData.scheduledFor = new Date(scheduledFor);
    }
    
    // Only include socialMediaAccountId if it's provided and valid
    if (socialMediaAccountId && socialMediaAccountId.trim() !== '') {
      // Verify the social media account belongs to the user
      try {
        const account = await prisma.socialMediaAccount.findFirst({
          where: {
            id: socialMediaAccountId,
            userId,
          },
        });
        
        if (!account) {
          const errorMsg = `Invalid social media account ID: ${socialMediaAccountId}`;
          logger.error(`Error creating content post: ${errorMsg}`, { userId });
          
          // Update log with error
          await prisma.log.update({
            where: { id: logEntry.id },
            data: {
              error: errorMsg,
              status: 400
            }
          });
          
          return res.status(400).json({ error: 'Invalid social media account' });
        }
        
        // If account is valid, add it to the post data
        postData.socialMediaAccountId = socialMediaAccountId;
        logger.info(`Verified social media account: ${account.username}`, { userId });
      } catch (accountError) {
        const errorMsg = `Error verifying social media account: ${accountError instanceof Error ? accountError.message : 'Unknown error'}`;
        logger.error(errorMsg, accountError, { userId });

        // Update log with error
        await prisma.log.update({
          where: { id: logEntry.id },
          data: {
            error: errorMsg,
            status: 500
          }
        });

        return res.status(500).json({ error: 'Failed to verify social media account' });
      }
    }
    
    // Create new content post
    try {
      const newPost = await prisma.contentPost.create({
        data: postData,
      });
      
      logger.info(`Successfully created content post with ID: ${newPost.id}`, { userId });
      
      // Update log with success
      await prisma.log.update({
        where: { id: logEntry.id },
        data: {
          response: {
            id: newPost.id,
            status: newPost.status,
            createdAt: newPost.createdAt
          },
          status: 201
        }
      });
      
      return res.status(201).json(newPost);
    } catch (createError) {
      const errorMsg = `Error creating content post in database: ${createError instanceof Error ? createError.message : 'Unknown error'}`;
      logger.error(errorMsg, createError, { userId });

      // Update log with error
      await prisma.log.update({
        where: { id: logEntry.id },
        data: {
          error: errorMsg,
          status: 500
        }
      });

      return res.status(500).json({
        error: 'Failed to create content post. Please try again or contact support.'
      });
    }
  } catch (error) {
    const errorMsg = `Unexpected error creating content post: ${error instanceof Error ? error.message : 'Unknown error'}`;
    logger.error(errorMsg, error, { userId });
    
    // Update log with error
    await prisma.log.update({
      where: { id: logEntry.id },
      data: {
        error: errorMsg,
        status: 500
      }
    });
    
    return res.status(500).json({ error: 'Failed to create content post' });
  }
}