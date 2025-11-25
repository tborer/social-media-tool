import { NextApiRequest, NextApiResponse } from 'next';
import prisma from '@/lib/prisma';
import { logger } from '@/lib/logger';
import { JobLock } from '@/lib/job-lock';
import { createClient } from '@supabase/supabase-js';
import { getAccessToken } from '@/lib/instagram-token-manager';

const SCHEDULER_LOCK_NAME = 'content_post_scheduler';
const MAX_RETRY_ATTEMPTS = 3;
const INSTAGRAM_DAILY_POST_LIMIT = 25;
const RATE_LIMIT_WINDOW_HOURS = 24;

// Helper function to calculate exponential backoff delay
function getRetryDelay(retryCount: number): number {
  // Exponential backoff: 5 min, 15 min, 45 min
  return Math.pow(3, retryCount) * 5 * 60 * 1000;
}

// Helper function to check if a post should be retried
function shouldRetryPost(post: any): boolean {
  if (post.retryCount >= MAX_RETRY_ATTEMPTS) {
    return false;
  }

  // If there's no lastRetryAt, it hasn't been retried yet
  if (!post.lastRetryAt) {
    return true;
  }

  // Calculate when the next retry should happen based on exponential backoff
  const retryDelay = getRetryDelay(post.retryCount);
  const nextRetryTime = new Date(post.lastRetryAt.getTime() + retryDelay);
  const now = new Date();

  return now >= nextRetryTime;
}

// Helper function to resolve image URL to a publicly accessible URL
async function resolveImageUrl(imageUrl: string, userId: string) {
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

    // Create Supabase client
    const supabase = createClient(
      process.env.NEXT_PUBLIC_SUPABASE_URL!,
      process.env.SUPABASE_SERVICE_ROLE_KEY!
    );

    // Try to get public URL from Supabase storage
    try {
      const { data: urlData } = supabase.storage
        .from('uploads')
        .getPublicUrl(`${userId}/${mapping.file_name}`);

      if (urlData?.publicUrl) {
        return urlData.publicUrl;
      }

      // If no public URL, try to upload the file
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

      const { data: newUrlData } = supabase.storage
        .from('uploads')
        .getPublicUrl(`${userId}/${mapping.file_name}`);

      if (!newUrlData?.publicUrl) {
        throw new Error('Failed to get public URL for uploaded file');
      }

      return newUrlData.publicUrl;
    } catch (error) {
      throw new Error(`Failed to resolve temporary image URL: ${error instanceof Error ? error.message : 'Unknown error'}`);
    }
  }

  // If it's a relative URL, make it absolute
  if (imageUrl.startsWith('/')) {
    const baseUrl = process.env.NEXT_PUBLIC_SUPABASE_URL || 'https://localhost:3000';
    return `${baseUrl}${imageUrl}`;
  }

  return imageUrl;
}

// Helper function to post to Instagram
async function postToInstagram(accessToken: string, imageUrl: string, caption: string, userId: string) {
  try {
    // Resolve the image URL to a publicly accessible URL
    const resolvedImageUrl = await resolveImageUrl(imageUrl, userId);

    logger.info(`Posting to Instagram with resolved image URL: ${resolvedImageUrl}`, { userId });

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
          image_url: resolvedImageUrl,
          caption: caption
        })
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
      logger.error('Instagram media publish failed:', errorData, { userId });
      throw new Error(`Failed to publish Instagram media: ${JSON.stringify(errorData)}`);
    }

    const publishData = await publishResponse.json();
    logger.info(`Instagram media published successfully: ${publishData.id}`, { userId });

    return {
      success: true,
      mediaId: publishData.id,
      resolvedImageUrl
    };
  } catch (error) {
    logger.error('Instagram posting error:', error, { userId });
    throw error;
  }
}

// Helper function to check rate limits for an account
async function checkAccountRateLimit(accountId: string): Promise<{ allowed: boolean; count: number }> {
  const cutoffTime = new Date();
  cutoffTime.setHours(cutoffTime.getHours() - RATE_LIMIT_WINDOW_HOURS);

  // Count posts published in the last 24 hours for this account
  const recentPostsCount = await prisma.contentPost.count({
    where: {
      socialMediaAccountId: accountId,
      status: 'PUBLISHED',
      updatedAt: {
        gte: cutoffTime
      }
    }
  });

  return {
    allowed: recentPostsCount < INSTAGRAM_DAILY_POST_LIMIT,
    count: recentPostsCount
  };
}

// Main scheduler function
async function processScheduledPosts(): Promise<{
  processed: number;
  published: number;
  failed: number;
  skipped: number;
  errors: string[];
}> {
  const results = {
    processed: 0,
    published: 0,
    failed: 0,
    skipped: 0,
    errors: [] as string[]
  };

  try {
    // Get all scheduled posts that are due
    const now = new Date();
    const scheduledPosts = await prisma.contentPost.findMany({
      where: {
        status: 'SCHEDULED',
        scheduledFor: {
          lte: now
        }
      },
      include: {
        socialMediaAccount: true,
        user: true
      },
      orderBy: {
        scheduledFor: 'asc'
      }
    });

    logger.info(`Found ${scheduledPosts.length} scheduled posts to process`);

    // Process each scheduled post
    for (const post of scheduledPosts) {
      results.processed++;

      try {
        // Check if we should retry this post (for previously failed posts)
        if (post.retryCount > 0 && !shouldRetryPost(post)) {
          logger.info(`Skipping post ${post.id} - waiting for retry delay`, { userId: post.userId });
          results.skipped++;
          continue;
        }

        // Check if post has exceeded max retry attempts
        if (post.retryCount >= MAX_RETRY_ATTEMPTS) {
          logger.info(`Post ${post.id} has exceeded max retry attempts, marking as FAILED`, { userId: post.userId });
          await prisma.contentPost.update({
            where: { id: post.id },
            data: {
              status: 'FAILED',
              errorMessage: `Exceeded maximum retry attempts (${MAX_RETRY_ATTEMPTS})`
            }
          });
          results.failed++;
          continue;
        }

        // Validate post has required fields
        if (!post.socialMediaAccountId) {
          logger.error(`Post ${post.id} has no social media account assigned`, { userId: post.userId });
          await prisma.contentPost.update({
            where: { id: post.id },
            data: {
              status: 'FAILED',
              errorMessage: 'No social media account assigned'
            }
          });
          results.failed++;
          continue;
        }

        if (!post.imageUrl) {
          logger.error(`Post ${post.id} has no image URL`, { userId: post.userId });
          await prisma.contentPost.update({
            where: { id: post.id },
            data: {
              status: 'FAILED',
              errorMessage: 'No image URL provided'
            }
          });
          results.failed++;
          continue;
        }

        const account = post.socialMediaAccount;
        if (!account) {
          logger.error(`Post ${post.id} social media account not found`, { userId: post.userId });
          await prisma.contentPost.update({
            where: { id: post.id },
            data: {
              status: 'FAILED',
              errorMessage: 'Social media account not found'
            }
          });
          results.failed++;
          continue;
        }

        // Check rate limits for the account
        const rateLimitCheck = await checkAccountRateLimit(account.id);
        if (!rateLimitCheck.allowed) {
          logger.info(
            `Rate limit reached for account ${account.username} (${rateLimitCheck.count}/${INSTAGRAM_DAILY_POST_LIMIT} posts in 24h)`,
            { userId: post.userId }
          );
          results.skipped++;
          continue;
        }

        // Attempt to publish the post
        logger.info(`Publishing post ${post.id} to ${account.accountType} account ${account.username}`, { userId: post.userId });

        // Get and decrypt access token (with automatic refresh if needed)
        const accessToken = await getAccessToken(account.id, post.userId);

        let publishResult = null;

        if (account.accountType === 'INSTAGRAM') {
          publishResult = await postToInstagram(
            accessToken,
            post.imageUrl,
            post.caption,
            post.userId
          );
        } else if (account.accountType === 'BLUESKY') {
          throw new Error('Bluesky posting is not yet implemented');
        } else if (account.accountType === 'X') {
          throw new Error('X (Twitter) posting is not yet implemented');
        } else {
          throw new Error(`Unknown account type: ${account.accountType}`);
        }

        // Update post status to PUBLISHED
        await prisma.contentPost.update({
          where: { id: post.id },
          data: {
            status: 'PUBLISHED',
            retryCount: 0,
            lastRetryAt: null,
            errorMessage: null
          }
        });

        logger.info(`Successfully published post ${post.id}`, { userId: post.userId });
        results.published++;

      } catch (error) {
        const errorMessage = error instanceof Error ? error.message : 'Unknown error';
        logger.error(`Failed to publish post ${post.id}:`, error, { userId: post.userId });

        // Update post with retry information
        await prisma.contentPost.update({
          where: { id: post.id },
          data: {
            retryCount: post.retryCount + 1,
            lastRetryAt: new Date(),
            errorMessage: errorMessage,
            // Only mark as FAILED if max retries exceeded
            status: post.retryCount + 1 >= MAX_RETRY_ATTEMPTS ? 'FAILED' : 'SCHEDULED'
          }
        });

        results.errors.push(`Post ${post.id}: ${errorMessage}`);
        if (post.retryCount + 1 >= MAX_RETRY_ATTEMPTS) {
          results.failed++;
        }
      }
    }

  } catch (error) {
    logger.error('Error in processScheduledPosts:', error);
    results.errors.push(`System error: ${error instanceof Error ? error.message : 'Unknown error'}`);
  }

  return results;
}

// API handler
export default async function handler(req: NextApiRequest, res: NextApiResponse) {
  // Verify this is a cron request (Vercel adds this header)
  const authHeader = req.headers.authorization;
  if (authHeader !== `Bearer ${process.env.CRON_SECRET}`) {
    logger.warn('Unauthorized scheduler request');
    return res.status(401).json({ error: 'Unauthorized' });
  }

  // Only allow POST requests
  if (req.method !== 'POST') {
    return res.status(405).json({ error: 'Method not allowed' });
  }

  // Try to acquire lock
  const lockAcquired = JobLock.acquire(SCHEDULER_LOCK_NAME, 5 * 60 * 1000); // 5 minute lock
  if (!lockAcquired) {
    logger.info('Scheduler already running, skipping this execution');
    return res.status(200).json({
      message: 'Scheduler already running',
      skipped: true
    });
  }

  try {
    logger.info('Starting scheduled posts processor');
    const results = await processScheduledPosts();

    logger.info('Scheduled posts processing completed', { results });

    return res.status(200).json({
      success: true,
      message: 'Scheduled posts processed',
      results
    });
  } catch (error) {
    logger.error('Error in scheduler handler:', error);
    return res.status(500).json({
      error: 'Failed to process scheduled posts',
      details: error instanceof Error ? error.message : 'Unknown error'
    });
  } finally {
    // Always release the lock
    JobLock.release(SCHEDULER_LOCK_NAME);
    logger.info('Scheduler lock released');
  }
}
