import { NextApiRequest, NextApiResponse } from 'next';
import { createClient } from '@/util/supabase/api';
import prisma from '@/lib/prisma';
import { logger } from '@/lib/logger';
import { getAccessToken } from '@/lib/instagram-token-manager';

// Helper function to resolve image URL to a publicly accessible URL
async function resolveImageUrl(imageUrl: string, supabase: any, userId: string) {
  // If it's already a full URL, return as is
  if (imageUrl.startsWith('http://') || imageUrl.startsWith('https://')) {
    return imageUrl;
  }
  
  // If it's a temporary URL from our API, we need to get the actual file
  if (imageUrl.startsWith('/api/image/')) {
    const shortId = imageUrl.split('/').pop();
    if (!shortId) {
      throw new Error('Invalid temporary image URL');
    }
    
    // Look up the URL mapping
    const mapping = await prisma.urlMapping.findUnique({
      where: { short_id: shortId }
    });
    
    if (!mapping) {
      throw new Error('Temporary image URL not found or expired');
    }
    
    // Try to upload the file to Supabase storage if it's not already there
    try {
      // Check if file already exists in Supabase storage
      const { data: existingFile } = await supabase.storage
        .from('uploads')
        .list(`${userId}/`, {
          search: mapping.file_name
        });
      
      if (existingFile && existingFile.length > 0) {
        // File exists, get public URL
        const { data: urlData } = supabase.storage
          .from('uploads')
          .getPublicUrl(`${userId}/${mapping.file_name}`);
        
        if (urlData?.publicUrl) {
          return urlData.publicUrl;
        }
      }
      
      // File doesn't exist in storage, upload it
      const fs = require('fs').promises;
      const fileBuffer = await fs.readFile(mapping.original_path);
      
      const uploadResult = await supabase.storage
        .from('uploads')
        .upload(`${userId}/${mapping.file_name}`, fileBuffer, {
          contentType: mapping.mime_type,
          cacheControl: '3600',
          upsert: true
        });
      
      if (uploadResult.error) {
        throw new Error(`Failed to upload file to storage: ${uploadResult.error.message}`);
      }
      
      // Get public URL
      const { data: urlData } = supabase.storage
        .from('uploads')
        .getPublicUrl(`${userId}/${mapping.file_name}`);
      
      if (!urlData?.publicUrl) {
        throw new Error('Failed to get public URL for uploaded file');
      }
      
      return urlData.publicUrl;
    } catch (error) {
      throw new Error(`Failed to resolve temporary image URL: ${error.message}`);
    }
  }
  
  // If it's a relative URL, make it absolute
  if (imageUrl.startsWith('/')) {
    const baseUrl = process.env.NEXT_PUBLIC_SUPABASE_URL || 'https://localhost:3000';
    return `${baseUrl}${imageUrl}`;
  }
  
  return imageUrl;
}

// Helper function to post to Bluesky
async function postToBluesky(accessToken: string, imageUrl: string, caption: string, supabase: any, userId: string) {
  try {
    // Resolve the image URL to a publicly accessible URL
    const resolvedImageUrl = await resolveImageUrl(imageUrl, supabase, userId);
    
    logger.info(`Posting to Bluesky with resolved image URL: ${resolvedImageUrl}`, { userId });
    
    // For now, Bluesky posting is not fully implemented
    // This is a placeholder for future implementation
    throw new Error('Bluesky posting is not yet implemented. Coming soon!');
    
  } catch (error) {
    logger.error('Bluesky posting error:', error, { userId });
    throw error;
  }
}

// Helper function to post to X (Twitter)
async function postToX(accessToken: string, imageUrl: string, caption: string, supabase: any, userId: string) {
  try {
    // Resolve the image URL to a publicly accessible URL
    const resolvedImageUrl = await resolveImageUrl(imageUrl, supabase, userId);
    
    logger.info(`Posting to X with resolved image URL: ${resolvedImageUrl}`, { userId });
    
    // For now, X posting is not fully implemented
    // This is a placeholder for future implementation
    throw new Error('X (Twitter) posting is not yet implemented. Coming soon!');
    
  } catch (error) {
    logger.error('X posting error:', error, { userId });
    throw error;
  }
}

// Helper function to post to Instagram (images and videos)
async function postToInstagram(
  accessToken: string,
  mediaUrl: string,
  caption: string,
  supabase: any,
  userId: string,
  contentType: string = 'IMAGE',
  videoType?: string
) {
  try {
    // Resolve the media URL to a publicly accessible URL
    const resolvedMediaUrl = await resolveImageUrl(mediaUrl, supabase, userId);

    logger.info(`Posting ${contentType} to Instagram with resolved URL: ${resolvedMediaUrl}`, { userId });

    // Prepare container creation payload based on content type
    let containerPayload: any = {
      caption: caption
    };

    if (contentType === 'VIDEO') {
      // For videos, use video_url and media_type
      containerPayload.video_url = resolvedMediaUrl;

      // Determine media type: REELS for vertical videos, VIDEO for feed videos
      if (videoType === 'REELS') {
        containerPayload.media_type = 'REELS';
        logger.info('Creating Instagram Reels container', { userId });
      } else {
        containerPayload.media_type = 'VIDEO';
        logger.info('Creating Instagram Feed video container', { userId });
      }
    } else {
      // For images, use image_url (default behavior)
      containerPayload.image_url = resolvedMediaUrl;
    }

    // Step 1: Create a media container
    const createContainerResponse = await fetch(
      `https://graph.instagram.com/v22.0/me/media`,
      {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          'Authorization': `Bearer ${accessToken}`
        },
        body: JSON.stringify(containerPayload)
      }
    );

    if (!createContainerResponse.ok) {
      const errorData = await createContainerResponse.json();
      logger.error('Instagram media container creation failed:', errorData, { userId });
      throw new Error(`Failed to create Instagram media container: ${JSON.stringify(errorData)}`);
    }

    const containerData = await createContainerResponse.json();
    const containerId = containerData.id;

    if (!containerId) {
      throw new Error('No container ID returned from Instagram API');
    }

    logger.info(`Instagram media container created: ${containerId}`, { userId });

    // Step 2: For videos, wait for processing to complete before publishing
    if (contentType === 'VIDEO') {
      logger.info('Video container created, waiting for Instagram to process video...', { userId });

      // Poll the container status until it's ready (max 30 attempts, 2 seconds each = 1 minute)
      let attempts = 0;
      const maxAttempts = 30;
      let isReady = false;

      while (attempts < maxAttempts && !isReady) {
        await new Promise(resolve => setTimeout(resolve, 2000)); // Wait 2 seconds

        const statusResponse = await fetch(
          `https://graph.instagram.com/v22.0/${containerId}?fields=status_code`,
          {
            method: 'GET',
            headers: {
              'Authorization': `Bearer ${accessToken}`
            }
          }
        );

        if (statusResponse.ok) {
          const statusData = await statusResponse.json();
          const statusCode = statusData.status_code;

          logger.info(`Video processing status: ${statusCode}`, { userId, attempt: attempts + 1 });

          if (statusCode === 'FINISHED') {
            isReady = true;
          } else if (statusCode === 'ERROR') {
            throw new Error('Instagram video processing failed');
          }
          // status_code can be: IN_PROGRESS, FINISHED, ERROR
        }

        attempts++;
      }

      if (!isReady) {
        throw new Error('Video processing timeout - Instagram is taking too long to process the video');
      }

      logger.info('Video processing complete, ready to publish', { userId });
    }

    // Step 3: Publish the container
    const publishResponse = await fetch(
      `https://graph.instagram.com/v22.0/me/media_publish`,
      {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          'Authorization': `Bearer ${accessToken}`
        },
        body: JSON.stringify({
          creation_id: containerId
        })
      }
    );

    if (!publishResponse.ok) {
      const errorData = await publishResponse.json();
      logger.error('Instagram media publish failed:', errorData, { userId });
      throw new Error(`Failed to publish Instagram media: ${JSON.stringify(errorData)}`);
    }

    const publishData = await publishResponse.json();
    logger.info(`Instagram ${contentType} published successfully: ${publishData.id}`, { userId });

    return {
      success: true,
      mediaId: publishData.id,
      resolvedMediaUrl
    };
  } catch (error) {
    logger.error('Instagram posting error:', error, { userId });
    throw error;
  }
}

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

    if (!post.imageUrl) {
      return res.status(400).json({ error: 'Post must have an image URL' });
    }

    // Get and decrypt access token (with automatic refresh if needed)
    const accessToken = await getAccessToken(account.id, user.id);

    let postResult = null;

    // Post to the appropriate social media platform
    if (account.accountType === 'INSTAGRAM') {
      // Post to Instagram using the two-step process
      postResult = await postToInstagram(
        accessToken,
        post.imageUrl,
        post.caption,
        supabase,
        user.id,
        post.contentType,
        post.videoType || undefined
      );
    } else if (account.accountType === 'BLUESKY') {
      // Post to Bluesky
      postResult = await postToBluesky(
        accessToken,
        post.imageUrl,
        post.caption,
        supabase,
        user.id
      );
    } else if (account.accountType === 'X') {
      // Post to X (Twitter)
      postResult = await postToX(
        accessToken,
        post.imageUrl,
        post.caption,
        supabase,
        user.id
      );
    } else {
      return res.status(400).json({
        error: `Unknown account type: ${account.accountType}`
      });
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
      response: postResult,
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
    
    return res.status(200).json({
      success: true,
      message: `Content posted successfully to ${account.accountType === "INSTAGRAM" ? "Instagram" : 
               account.accountType === "BLUESKY" ? "Bluesky" : "X"}`,
      post: updatedPost,
      postResult
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
    
    return res.status(500).json({ 
      error: 'Failed to post to social media',
      details: error instanceof Error ? error.message : 'Unknown error'
    });
  }
}