import { NextApiRequest, NextApiResponse } from 'next';
import { createClient } from '@/util/supabase/api';
import prisma from '@/lib/prisma';
import { LogType } from '@prisma/client';

export default async function handler(req: NextApiRequest, res: NextApiResponse) {
  // Only allow POST requests
  if (req.method !== 'POST') {
    return res.status(405).json({ error: 'Method not allowed' });
  }

  // Create Supabase client for authentication
  const supabase = createClient(req, res);
  
  // Get the user from the session
  const { data: { user }, error: authError } = await supabase.auth.getUser();
  
  if (authError || !user) {
    console.error('Authentication error:', authError);
    return res.status(401).json({ error: 'Unauthorized' });
  }
  
  const { id } = req.query;
  const { postId } = req.body;
  
  if (!id || typeof id !== 'string') {
    return res.status(400).json({ error: 'Invalid account ID' });
  }

  if (!postId || typeof postId !== 'string') {
    return res.status(400).json({ error: 'Post ID is required' });
  }

  try {
    // Verify the Instagram account belongs to the user
    const instagramAccount = await prisma.instagramAccount.findFirst({
      where: {
        id: id as string,
        userId: user.id,
      },
    });
    
    if (!instagramAccount) {
      return res.status(404).json({ error: 'Instagram account not found' });
    }

    // Get the content post
    const contentPost = await prisma.contentPost.findFirst({
      where: {
        id: postId,
        userId: user.id,
      },
    });
    
    if (!contentPost) {
      return res.status(404).json({ error: 'Content post not found' });
    }

    // Check if the post has required content
    if (!contentPost.caption) {
      return res.status(400).json({ error: 'Post must have a caption' });
    }

    // Call Instagram Graph API to publish the post
    try {
      // For image posts
      if (contentPost.imageUrl) {
        // First, upload the image to Instagram
        const imageUploadUrl = `https://graph.facebook.com/v18.0/me/media?image_url=${encodeURIComponent(contentPost.imageUrl)}&caption=${encodeURIComponent(contentPost.caption)}&access_token=${instagramAccount.accessToken}`;
        
        const imageUploadResponse = await fetch(imageUploadUrl, {
          method: 'POST',
        });

        const imageUploadData = await imageUploadResponse.json();
        
        // Log the image upload request and response
        await prisma.log.create({
          data: {
            type: LogType.CONTENT_POST,
            endpoint: 'Instagram Media Upload',
            requestData: {
              url: 'https://graph.facebook.com/v18.0/me/media',
              method: 'POST',
              params: {
                image_url: contentPost.imageUrl,
                caption: contentPost.caption,
                // Don't log the actual access token for security
                access_token: '[REDACTED]'
              }
            },
            response: imageUploadData,
            status: imageUploadResponse.status,
            userId: user.id,
          }
        });

        if (!imageUploadResponse.ok) {
          console.error('Instagram API error (image upload):', imageUploadData);
          return res.status(500).json({ 
            error: 'Failed to upload image to Instagram',
            details: imageUploadData.error?.message || 'Unknown Instagram API error'
          });
        }

        // Then publish the container
        const publishUrl = `https://graph.facebook.com/v18.0/me/media_publish?creation_id=${imageUploadData.id}&access_token=${instagramAccount.accessToken}`;
        
        const publishResponse = await fetch(publishUrl, {
          method: 'POST',
        });

        const publishData = await publishResponse.json();
        
        // Log the publish request and response
        await prisma.log.create({
          data: {
            type: LogType.CONTENT_POST,
            endpoint: 'Instagram Media Publish',
            requestData: {
              url: 'https://graph.facebook.com/v18.0/me/media_publish',
              method: 'POST',
              params: {
                creation_id: imageUploadData.id,
                // Don't log the actual access token for security
                access_token: '[REDACTED]'
              }
            },
            response: publishData,
            status: publishResponse.status,
            userId: user.id,
          }
        });

        if (!publishResponse.ok) {
          console.error('Instagram API error (publishing):', publishData);
          return res.status(500).json({ 
            error: 'Failed to publish post to Instagram',
            details: publishData.error?.message || 'Unknown Instagram API error'
          });
        }

        // Update the post status in the database
        await prisma.contentPost.update({
          where: { id: postId },
          data: {
            status: 'PUBLISHED',
            instagramAccountId: id as string,
          },
        });

        return res.status(200).json({ 
          success: true, 
          message: 'Post published successfully to Instagram',
          instagramPostId: publishData.id
        });
      } else {
        // For caption-only posts (no image)
        const captionOnlyUrl = `https://graph.facebook.com/v18.0/me/media?caption=${encodeURIComponent(contentPost.caption)}&access_token=${instagramAccount.accessToken}`;
        
        const captionOnlyResponse = await fetch(captionOnlyUrl, {
          method: 'POST',
        });

        const captionOnlyData = await captionOnlyResponse.json();
        
        // Log the caption-only post request and response
        await prisma.log.create({
          data: {
            type: LogType.CONTENT_POST,
            endpoint: 'Instagram Caption-Only Post',
            requestData: {
              url: 'https://graph.facebook.com/v18.0/me/media',
              method: 'POST',
              params: {
                caption: contentPost.caption,
                // Don't log the actual access token for security
                access_token: '[REDACTED]'
              }
            },
            response: captionOnlyData,
            status: captionOnlyResponse.status,
            userId: user.id,
          }
        });

        if (!captionOnlyResponse.ok) {
          console.error('Instagram API error (caption-only post):', captionOnlyData);
          return res.status(500).json({ 
            error: 'Failed to publish caption-only post to Instagram',
            details: captionOnlyData.error?.message || 'Unknown Instagram API error'
          });
        }

        // Update the post status in the database
        await prisma.contentPost.update({
          where: { id: postId },
          data: {
            status: 'PUBLISHED',
            instagramAccountId: id as string,
          },
        });

        return res.status(200).json({ 
          success: true, 
          message: 'Caption-only post published successfully to Instagram',
          instagramPostId: captionOnlyData.id
        });
      }
    } catch (instagramError) {
      console.error('Error posting to Instagram:', instagramError);
      
      // Update the post status to FAILED
      await prisma.contentPost.update({
        where: { id: postId },
        data: {
          status: 'FAILED',
        },
      });
      
      return res.status(500).json({ 
        error: 'Failed to post to Instagram',
        details: instagramError instanceof Error ? instagramError.message : 'Unknown error'
      });
    }
  } catch (error) {
    console.error('Server error:', error);
    return res.status(500).json({ 
      error: 'Internal server error',
      details: error instanceof Error ? error.message : 'Unknown error'
    });
  }
}