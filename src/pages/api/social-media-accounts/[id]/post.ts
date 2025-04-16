import { NextApiRequest, NextApiResponse } from 'next';
import { createClient } from '@/util/supabase/api';
import prisma from '@/lib/prisma';
import { logger } from '@/lib/logger';

// Helper function to post to Instagram
async function postToInstagram(accessToken: string, imageUrl: string, caption: string) {
  try {
    // Step 1: Create a media container
    const createContainerResponse = await fetch(
      `https://graph.instagram.com/v22.0/me/media`,
      {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          'Authorization': `Bearer ${accessToken}`
        },
        body: JSON.stringify({
          image_url: imageUrl,
          caption: caption
        })
      }
    );

    if (!createContainerResponse.ok) {
      const errorData = await createContainerResponse.json();
      throw new Error(`Failed to create Instagram media container: ${JSON.stringify(errorData)}`);
    }

    const containerData = await createContainerResponse.json();
    const containerId = containerData.id;

    if (!containerId) {
      throw new Error('No container ID returned from Instagram API');
    }

    // Step 2: Publish the container
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
      throw new Error(`Failed to publish Instagram media: ${JSON.stringify(errorData)}`);
    }

    const publishData = await publishResponse.json();
    return {
      success: true,
      mediaId: publishData.id
    };
  } catch (error) {
    console.error('Instagram posting error:', error);
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
    
    let postResult = null;
    
    // Post to the appropriate social media platform
    if (account.accountType === 'INSTAGRAM') {
      // Post to Instagram using the two-step process
      postResult = await postToInstagram(
        account.accessToken,
        post.imageUrl,
        post.caption
      );
    } else {
      // For other platforms, we'll implement later
      return res.status(400).json({ 
        error: `Posting to ${account.accountType} is not implemented yet` 
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