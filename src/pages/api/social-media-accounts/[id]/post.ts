import { NextApiRequest, NextApiResponse } from 'next';
import { createClient } from '@/util/supabase/api';
import prisma from '@/lib/prisma';
import { logger } from '@/lib/server-logger';
import { getAccessToken } from '@/lib/instagram-token-manager';
import { decrypt, encrypt, isEncryptionConfigured } from '@/lib/encryption';
import { refreshAccessToken as refreshXToken, calculateExpirationDate as calcXExpiry } from '@/lib/x-oauth';

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

// ---------------------------------------------------------------------------
// X (Twitter) helpers
// ---------------------------------------------------------------------------

/**
 * Split a long caption into tweet-sized chunks (≤ 280 chars each).
 * Adds a " (N/M)" thread counter suffix when splitting into multiple tweets.
 * Splits on word boundaries where possible.
 */
function splitIntoTweets(text: string, maxLength = 280): string[] {
  if (text.length <= maxLength) return [text];

  // Reserve space for the suffix " (N/M)" — worst case 8 chars for ≥10-part threads
  const SUFFIX_RESERVE = 8;
  const chunkMax = maxLength - SUFFIX_RESERVE;

  const chunks: string[] = [];
  let remaining = text.trim();

  while (remaining.length > 0) {
    if (remaining.length <= chunkMax) {
      chunks.push(remaining);
      break;
    }
    // Find last space within chunkMax characters
    let splitAt = remaining.lastIndexOf(' ', chunkMax);
    if (splitAt <= 0) splitAt = chunkMax; // No space found, hard-cut
    chunks.push(remaining.slice(0, splitAt).trim());
    remaining = remaining.slice(splitAt).trim();
  }

  if (chunks.length === 1) return chunks;
  return chunks.map((c, i) => `${c} (${i + 1}/${chunks.length})`);
}

/**
 * Upload a single image to X using the v1.1 media upload endpoint.
 * Returns the media_id_string for use in tweet creation.
 */
async function uploadXMedia(accessToken: string, imageUrl: string, userId: string): Promise<string> {
  logger.info(`Uploading media to X from: ${imageUrl}`, { userId });

  const imageResponse = await fetch(imageUrl);
  if (!imageResponse.ok) {
    throw new Error(`Failed to fetch image for X upload (status ${imageResponse.status}): ${imageUrl}`);
  }

  const imageBuffer = Buffer.from(await imageResponse.arrayBuffer());
  const contentType = imageResponse.headers.get('content-type') || 'image/jpeg';
  const totalBytes = imageBuffer.length;

  // Use chunked INIT → APPEND → FINALIZE for reliability with all image sizes
  // INIT
  const initParams = new URLSearchParams({
    command: 'INIT',
    total_bytes: String(totalBytes),
    media_type: contentType,
    media_category: 'tweet_image',
  });

  const initRes = await fetch('https://upload.twitter.com/1.1/media/upload.json', {
    method: 'POST',
    headers: {
      Authorization: `Bearer ${accessToken}`,
      'Content-Type': 'application/x-www-form-urlencoded',
    },
    body: initParams,
  });

  if (!initRes.ok) {
    const err = await initRes.json().catch(() => ({}));
    throw new Error(`X media upload INIT failed: ${JSON.stringify(err)}`);
  }

  const initData = await initRes.json();
  const mediaId = initData.media_id_string as string;

  // APPEND (send full buffer as segment 0)
  const formData = new FormData();
  formData.append('command', 'APPEND');
  formData.append('media_id', mediaId);
  formData.append('segment_index', '0');
  formData.append(
    'media',
    new Blob([imageBuffer], { type: contentType }),
    'upload'
  );

  const appendRes = await fetch('https://upload.twitter.com/1.1/media/upload.json', {
    method: 'POST',
    headers: { Authorization: `Bearer ${accessToken}` },
    body: formData,
  });

  if (!appendRes.ok && appendRes.status !== 204) {
    const err = await appendRes.text().catch(() => '');
    throw new Error(`X media upload APPEND failed (${appendRes.status}): ${err}`);
  }

  // FINALIZE
  const finalizeParams = new URLSearchParams({ command: 'FINALIZE', media_id: mediaId });
  const finalizeRes = await fetch('https://upload.twitter.com/1.1/media/upload.json', {
    method: 'POST',
    headers: {
      Authorization: `Bearer ${accessToken}`,
      'Content-Type': 'application/x-www-form-urlencoded',
    },
    body: finalizeParams,
  });

  if (!finalizeRes.ok) {
    const err = await finalizeRes.json().catch(() => ({}));
    throw new Error(`X media upload FINALIZE failed: ${JSON.stringify(err)}`);
  }

  logger.info(`X media uploaded successfully: ${mediaId}`, { userId });
  return mediaId;
}

/**
 * Get a valid (decrypted, auto-refreshed) X access token for an account.
 * Handles the short 2-hour expiry by rotating via the stored refresh token.
 */
async function getXAccessToken(account: any, userId: string): Promise<string> {
  let accessToken = account.accessToken;

  if (account.isEncrypted && isEncryptionConfigured()) {
    accessToken = decrypt(accessToken);
  }

  // If token is expired (or within 5 minutes of expiry), refresh it
  const fiveMinutesFromNow = new Date(Date.now() + 5 * 60 * 1000);
  const isExpired = account.tokenExpiresAt && new Date(account.tokenExpiresAt) <= fiveMinutesFromNow;

  if (isExpired) {
    if (!account.refreshToken) {
      throw new Error('X access token is expired and no refresh token is stored. Please reconnect your X account.');
    }

    let rawRefreshToken = account.refreshToken;
    if (account.isEncrypted && isEncryptionConfigured()) {
      rawRefreshToken = decrypt(rawRefreshToken);
    }

    logger.info('Refreshing X access token before posting', { accountId: account.id, userId });
    const tokenResponse = await refreshXToken(rawRefreshToken);

    let newAccessToken = tokenResponse.access_token;
    let newRefreshToken = tokenResponse.refresh_token ?? null;
    const isEncrypted = isEncryptionConfigured();

    if (isEncrypted) {
      newAccessToken = encrypt(tokenResponse.access_token);
      if (newRefreshToken) newRefreshToken = encrypt(newRefreshToken);
    }

    await prisma.socialMediaAccount.update({
      where: { id: account.id },
      data: {
        accessToken: newAccessToken,
        refreshToken: newRefreshToken,
        isEncrypted,
        tokenExpiresAt: calcXExpiry(tokenResponse.expires_in),
        updatedAt: new Date(),
      },
    });

    logger.info('X access token refreshed successfully', { accountId: account.id, userId });
    return tokenResponse.access_token;
  }

  return accessToken;
}

/**
 * Post to X (Twitter). Handles:
 * - Text-only tweets
 * - Tweets with a single image (uploaded via X Media API)
 * - Automatic thread splitting when caption exceeds 280 chars
 */
async function postToX(
  account: any,
  imageUrl: string | null,
  caption: string,
  supabase: any,
  userId: string
): Promise<{ success: boolean; tweetId: string; tweetIds: string[] }> {
  const accessToken = await getXAccessToken(account, userId);

  // Resolve image URL if provided
  let resolvedImageUrl: string | null = null;
  if (imageUrl) {
    try {
      resolvedImageUrl = await resolveImageUrl(imageUrl, supabase, userId);
    } catch (err: any) {
      logger.warn(`Could not resolve image URL for X post, continuing without media: ${err.message}`, { userId });
    }
  }

  // Upload media if we have an image (attach to the first tweet only)
  let mediaId: string | null = null;
  if (resolvedImageUrl) {
    try {
      mediaId = await uploadXMedia(accessToken, resolvedImageUrl, userId);
    } catch (err: any) {
      logger.warn(`X media upload failed, posting without image: ${err.message}`, { userId });
    }
  }

  // Split caption into tweets if needed
  const tweets = splitIntoTweets(caption);
  logger.info(`Posting ${tweets.length} tweet(s) to X`, { userId, count: tweets.length });

  let previousTweetId: string | null = null;
  const tweetIds: string[] = [];

  for (let i = 0; i < tweets.length; i++) {
    const tweetBody: any = { text: tweets[i] };

    // Attach media to the first tweet only
    if (i === 0 && mediaId) {
      tweetBody.media = { media_ids: [mediaId] };
    }

    // Chain subsequent tweets as replies
    if (previousTweetId) {
      tweetBody.reply = { in_reply_to_tweet_id: previousTweetId };
    }

    const response = await fetch('https://api.twitter.com/2/tweets', {
      method: 'POST',
      headers: {
        Authorization: `Bearer ${accessToken}`,
        'Content-Type': 'application/json',
      },
      body: JSON.stringify(tweetBody),
    });

    if (!response.ok) {
      const err = await response.json().catch(() => ({}));
      throw new Error(`X tweet ${i + 1}/${tweets.length} failed: ${JSON.stringify(err)}`);
    }

    const data = await response.json();
    const tweetId = data.data?.id as string;
    previousTweetId = tweetId;
    tweetIds.push(tweetId);

    logger.info(`X tweet ${i + 1}/${tweets.length} posted: ${tweetId}`, { userId });
  }

  return { success: true, tweetId: tweetIds[0], tweetIds };
}

// ---------------------------------------------------------------------------
// LinkedIn helpers
// ---------------------------------------------------------------------------

const LINKEDIN_API_VERSION = '202411';

/**
 * Get a valid (decrypted) LinkedIn access token.
 * LinkedIn tokens last 60 days with no refresh token — surface a clear error
 * if the token is expired so the user knows to reconnect.
 */
function getLinkedInAccessToken(account: any): string {
  if (account.tokenExpiresAt && new Date(account.tokenExpiresAt) <= new Date()) {
    throw new Error(
      'Your LinkedIn access token has expired. Please reconnect your LinkedIn account in the Accounts tab.'
    );
  }

  let accessToken = account.accessToken;
  if (account.isEncrypted && isEncryptionConfigured()) {
    accessToken = decrypt(accessToken);
  }
  return accessToken;
}

/**
 * Upload an image to LinkedIn via the Images API.
 * Returns the image URN (e.g. "urn:li:image:C4D22AQH…") for use in post creation.
 */
async function uploadLinkedInImage(
  accessToken: string,
  authorUrn: string,
  imageUrl: string,
  userId: string
): Promise<string> {
  logger.info(`Uploading image to LinkedIn from: ${imageUrl}`, { userId });

  // Step 1: Initialize upload
  const initRes = await fetch(
    'https://api.linkedin.com/rest/images?action=initializeUpload',
    {
      method: 'POST',
      headers: {
        Authorization: `Bearer ${accessToken}`,
        'Content-Type': 'application/json',
        'LinkedIn-Version': LINKEDIN_API_VERSION,
        'X-Restli-Protocol-Version': '2.0.0',
      },
      body: JSON.stringify({ initializeUploadRequest: { owner: authorUrn } }),
    }
  );

  if (!initRes.ok) {
    const err = await initRes.json().catch(() => ({}));
    throw new Error(`LinkedIn image upload initialization failed: ${JSON.stringify(err)}`);
  }

  const initData = await initRes.json();
  const uploadUrl: string = initData.value.uploadUrl;
  const imageUrn: string = initData.value.image;

  // Step 2: Fetch image and PUT to LinkedIn's presigned URL
  const imgFetch = await fetch(imageUrl);
  if (!imgFetch.ok) {
    throw new Error(`Failed to fetch image for LinkedIn upload (status ${imgFetch.status}): ${imageUrl}`);
  }

  const imgBuffer = await imgFetch.arrayBuffer();
  const contentType = imgFetch.headers.get('content-type') || 'image/jpeg';

  const uploadRes = await fetch(uploadUrl, {
    method: 'PUT',
    headers: {
      Authorization: `Bearer ${accessToken}`,
      'Content-Type': contentType,
    },
    body: imgBuffer,
  });

  if (!uploadRes.ok) {
    throw new Error(`LinkedIn image upload PUT failed (status ${uploadRes.status})`);
  }

  logger.info(`LinkedIn image uploaded: ${imageUrn}`, { userId });
  return imageUrn;
}

/**
 * Post to LinkedIn. Handles text-only and single-image posts.
 * Uses the LinkedIn Posts REST API (2024).
 */
async function postToLinkedIn(
  account: any,
  imageUrl: string | null,
  caption: string,
  supabase: any,
  userId: string
): Promise<{ success: boolean; postId: string | null }> {
  const accessToken = getLinkedInAccessToken(account);

  if (!account.linkedinUserId) {
    throw new Error(
      'LinkedIn member ID is missing for this account. Please reconnect your LinkedIn account.'
    );
  }

  const authorUrn = `urn:li:person:${account.linkedinUserId}`;

  // Resolve and upload image if provided
  let imageUrn: string | null = null;
  if (imageUrl) {
    try {
      const resolvedUrl = await resolveImageUrl(imageUrl, supabase, userId);
      imageUrn = await uploadLinkedInImage(accessToken, authorUrn, resolvedUrl, userId);
    } catch (err: any) {
      logger.warn(`LinkedIn image upload failed, posting without image: ${err.message}`, { userId });
    }
  }

  // Build the post payload
  const postPayload: any = {
    author: authorUrn,
    commentary: caption,
    visibility: 'PUBLIC',
    distribution: {
      feedDistribution: 'MAIN_FEED',
      targetEntities: [],
      thirdPartyDistributionChannels: [],
    },
    lifecycleState: 'PUBLISHED',
    isReshareDisabledByAuthor: false,
  };

  if (imageUrn) {
    postPayload.content = {
      media: {
        altText: 'Post image',
        id: imageUrn,
      },
    };
  }

  const postRes = await fetch('https://api.linkedin.com/rest/posts', {
    method: 'POST',
    headers: {
      Authorization: `Bearer ${accessToken}`,
      'Content-Type': 'application/json',
      'LinkedIn-Version': LINKEDIN_API_VERSION,
      'X-Restli-Protocol-Version': '2.0.0',
    },
    body: JSON.stringify(postPayload),
  });

  if (!postRes.ok) {
    const err = await postRes.json().catch(() => ({}));
    throw new Error(`LinkedIn post creation failed (${postRes.status}): ${JSON.stringify(err)}`);
  }

  // LinkedIn returns the post URN in the x-restli-id header (or X-RestLi-Id)
  const linkedinPostId =
    postRes.headers.get('x-restli-id') ||
    postRes.headers.get('X-RestLi-Id') ||
    null;

  logger.info(`LinkedIn post created: ${linkedinPostId}`, { userId });
  return { success: true, postId: linkedinPostId };
}

// ---------------------------------------------------------------------------
// Bluesky (placeholder)
// ---------------------------------------------------------------------------

async function postToBluesky(accessToken: string, imageUrl: string, caption: string, supabase: any, userId: string) {
  throw new Error('Bluesky posting is not yet implemented. Coming soon!');
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
    // Check if mediaUrl contains multiple URLs (comma-separated) for carousel posts
    const mediaUrls = mediaUrl.split(',').map(url => url.trim()).filter(url => url.length > 0);
    const isCarousel = mediaUrls.length > 1;

    if (isCarousel) {
      // --- Carousel (multi-image) flow ---
      logger.info(`Posting carousel with ${mediaUrls.length} images to Instagram`, { userId });

      // Step 1: Create individual item containers for each image
      const childContainerIds: string[] = [];

      for (const url of mediaUrls) {
        const resolvedUrl = await resolveImageUrl(url, supabase, userId);
        logger.info(`Creating carousel item container for: ${resolvedUrl}`, { userId });

        const itemResponse = await fetch(
          `https://graph.instagram.com/v22.0/me/media`,
          {
            method: 'POST',
            headers: {
              'Content-Type': 'application/json',
              'Authorization': `Bearer ${accessToken}`
            },
            body: JSON.stringify({
              image_url: resolvedUrl,
              is_carousel_item: true
            })
          }
        );

        if (!itemResponse.ok) {
          const errorData = await itemResponse.json();
          logger.error('Instagram carousel item container creation failed:', errorData, { userId });
          throw new Error(`Failed to create Instagram carousel item container: ${JSON.stringify(errorData)}`);
        }

        const itemData = await itemResponse.json();
        if (!itemData.id) {
          throw new Error('No container ID returned from Instagram API for carousel item');
        }

        childContainerIds.push(itemData.id);
        logger.info(`Carousel item container created: ${itemData.id}`, { userId });
      }

      // Step 2: Create the carousel container
      const carouselResponse = await fetch(
        `https://graph.instagram.com/v22.0/me/media`,
        {
          method: 'POST',
          headers: {
            'Content-Type': 'application/json',
            'Authorization': `Bearer ${accessToken}`
          },
          body: JSON.stringify({
            media_type: 'CAROUSEL',
            children: childContainerIds,
            caption: caption
          })
        }
      );

      if (!carouselResponse.ok) {
        const errorData = await carouselResponse.json();
        logger.error('Instagram carousel container creation failed:', errorData, { userId });
        throw new Error(`Failed to create Instagram carousel container: ${JSON.stringify(errorData)}`);
      }

      const carouselData = await carouselResponse.json();
      const carouselContainerId = carouselData.id;

      if (!carouselContainerId) {
        throw new Error('No container ID returned from Instagram API for carousel');
      }

      logger.info(`Instagram carousel container created: ${carouselContainerId}`, { userId });

      // Step 3: Publish the carousel container
      const publishResponse = await fetch(
        `https://graph.instagram.com/v22.0/me/media_publish`,
        {
          method: 'POST',
          headers: {
            'Content-Type': 'application/json',
            'Authorization': `Bearer ${accessToken}`
          },
          body: JSON.stringify({
            creation_id: carouselContainerId
          })
        }
      );

      if (!publishResponse.ok) {
        const errorData = await publishResponse.json();
        logger.error('Instagram carousel publish failed:', errorData, { userId });
        throw new Error(`Failed to publish Instagram carousel: ${JSON.stringify(errorData)}`);
      }

      const publishData = await publishResponse.json();
      logger.info(`Instagram carousel published successfully: ${publishData.id}`, { userId });

      return {
        success: true,
        mediaId: publishData.id,
        resolvedMediaUrl: mediaUrls[0]
      };
    }

    // --- Single image/video flow ---
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

    // Instagram requires media; LinkedIn and X support text-only posts
    if (account.accountType === 'INSTAGRAM' && !post.imageUrl) {
      return res.status(400).json({ error: 'Instagram posts must have an image or video URL.' });
    }

    let postResult: any = null;

    // Route to the correct platform publisher
    if (account.accountType === 'INSTAGRAM') {
      const accessToken = await getAccessToken(account.id, user.id);
      postResult = await postToInstagram(
        accessToken,
        post.imageUrl!,
        post.caption,
        supabase,
        user.id,
        post.contentType,
        post.videoType || undefined
      );
    } else if (account.accountType === 'LINKEDIN') {
      postResult = await postToLinkedIn(
        account,
        post.imageUrl ?? null,
        post.caption,
        supabase,
        user.id
      );
    } else if (account.accountType === 'X') {
      postResult = await postToX(
        account,
        post.imageUrl ?? null,
        post.caption,
        supabase,
        user.id
      );
    } else if (account.accountType === 'BLUESKY') {
      const accessToken = await getAccessToken(account.id, user.id);
      postResult = await postToBluesky(accessToken, post.imageUrl ?? '', post.caption, supabase, user.id);
    } else {
      return res.status(400).json({ error: `Unsupported account type: ${account.accountType}` });
    }

    const platformLabel =
      account.accountType === 'INSTAGRAM' ? 'Instagram' :
      account.accountType === 'LINKEDIN' ? 'LinkedIn' :
      account.accountType === 'X' ? 'X' : account.accountType;

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

    // Persist platform-specific post IDs and update status
    const updatedPost = await prisma.contentPost.update({
      where: { id: postId },
      data: {
        socialMediaAccountId: id,
        status: 'PUBLISHED',
        igMediaId:       account.accountType === 'INSTAGRAM' ? (postResult?.mediaId ?? null) : undefined,
        linkedinPostId:  account.accountType === 'LINKEDIN'  ? (postResult?.postId  ?? null) : undefined,
        xPostId:         account.accountType === 'X'         ? (postResult?.tweetId ?? null) : undefined,
      },
    });

    return res.status(200).json({
      success: true,
      message: `Content posted successfully to ${platformLabel}`,
      post: updatedPost,
      postResult,
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
      details: error instanceof Error ? error.message : 'Unknown error',
    });
  }
}