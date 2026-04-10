import { NextApiRequest, NextApiResponse } from 'next';
import { createClient } from '@/util/supabase/api';
import prisma from '@/lib/prisma';
import { logger } from '@/lib/server-logger';
import { getAccessToken } from '@/lib/instagram-token-manager';
import { getLinkedInAccessToken, uploadLinkedInImage } from '@/lib/linkedin-client';

const INSTAGRAM_MIN_SCHEDULE_MINUTES = 20;
const LINKEDIN_MIN_SCHEDULE_MINUTES = 10;

// Resolve image URL to a publicly accessible URL (mirrors publish-all.ts)
async function resolveImageUrl(imageUrl: string, supabase: any, userId: string): Promise<string> {
  if (imageUrl.startsWith('http://') || imageUrl.startsWith('https://')) {
    return imageUrl;
  }

  if (imageUrl.startsWith('/api/image/')) {
    const shortId = imageUrl.split('/').pop();
    if (!shortId) throw new Error('Invalid temporary image URL');

    const mapping = await prisma.urlMapping.findUnique({ where: { short_id: shortId } });
    if (!mapping) throw new Error('Temporary image URL not found or expired');

    try {
      const { data: existingFile } = await supabase.storage
        .from('uploads')
        .list(`${userId}/`, { search: mapping.file_name });

      if (existingFile && existingFile.length > 0) {
        const { data: urlData } = supabase.storage
          .from('uploads')
          .getPublicUrl(`${userId}/${mapping.file_name}`);
        if (urlData?.publicUrl) return urlData.publicUrl;
      }

      const fs = require('fs').promises;
      const fileBuffer = await fs.readFile(mapping.original_path);
      const uploadResult = await supabase.storage
        .from('uploads')
        .upload(`${userId}/${mapping.file_name}`, fileBuffer, {
          contentType: mapping.mime_type,
          cacheControl: '3600',
          upsert: true,
        });
      if (uploadResult.error) throw new Error(`Storage upload failed: ${uploadResult.error.message}`);

      const { data: urlData } = supabase.storage
        .from('uploads')
        .getPublicUrl(`${userId}/${mapping.file_name}`);
      if (!urlData?.publicUrl) throw new Error('Failed to get public URL');
      return urlData.publicUrl;
    } catch (err: any) {
      throw new Error(`Failed to resolve temporary image URL: ${err.message}`);
    }
  }

  if (imageUrl.startsWith('/')) {
    return `${process.env.NEXT_PUBLIC_SUPABASE_URL || 'https://localhost:3000'}${imageUrl}`;
  }

  return imageUrl;
}

export default async function handler(req: NextApiRequest, res: NextApiResponse) {
  if (req.method !== 'POST') {
    return res.status(405).json({ error: 'Method not allowed' });
  }

  const supabase = createClient(req, res);
  const { data: { user }, error: authError } = await supabase.auth.getUser();
  if (authError || !user) return res.status(401).json({ error: 'Unauthorized' });

  const { id } = req.query;
  if (!id || typeof id !== 'string') return res.status(400).json({ error: 'Invalid post ID' });

  const post = await prisma.contentPost.findFirst({
    where: { id, userId: user.id },
    include: { socialMediaAccount: true },
  });

  if (!post) return res.status(404).json({ error: 'Post not found' });

  if (post.status !== 'SCHEDULED' || !post.scheduledFor) {
    return res.status(400).json({ error: 'Post must be SCHEDULED with a scheduledFor time' });
  }

  if (!post.socialMediaAccount) {
    return res.status(200).json({
      nativeScheduled: false,
      message: 'No social media account assigned — post will be published by the scheduler',
    });
  }

  const account = post.socialMediaAccount;
  const scheduledTime = new Date(post.scheduledFor);
  const now = new Date();
  const minutesUntil = (scheduledTime.getTime() - now.getTime()) / (1000 * 60);

  try {
    // -----------------------------------------------------------------------
    // Instagram native scheduling
    // -----------------------------------------------------------------------
    if (account.accountType === 'INSTAGRAM') {
      // Personal accounts do not support the Content Publishing API scheduling
      if (account.instagramAccountType === 'PERSONAL') {
        return res.status(200).json({
          nativeScheduled: false,
          message: 'Personal Instagram accounts do not support native scheduling — post will be published by the scheduler',
        });
      }

      if (!post.imageUrl) {
        return res.status(200).json({
          nativeScheduled: false,
          message: 'Instagram posts require an image — post will be published by the scheduler',
        });
      }

      if (minutesUntil < INSTAGRAM_MIN_SCHEDULE_MINUTES) {
        return res.status(200).json({
          nativeScheduled: false,
          message: `Schedule time must be at least ${INSTAGRAM_MIN_SCHEDULE_MINUTES} minutes away for Instagram native scheduling — post will be published by the scheduler`,
        });
      }

      const accessToken = await getAccessToken(account.id, user.id);
      const scheduledPublishTime = Math.floor(scheduledTime.getTime() / 1000);

      // Handle single image vs carousel
      const mediaUrls = post.imageUrl.split(',').map((u: string) => u.trim()).filter(Boolean);
      const isCarousel = mediaUrls.length > 1;

      let containerId: string;

      if (isCarousel) {
        // Create individual carousel item containers (no scheduled_publish_time on items)
        const childIds: string[] = [];
        for (const url of mediaUrls) {
          const resolved = await resolveImageUrl(url, supabase, user.id);
          const itemRes = await fetch('https://graph.instagram.com/v22.0/me/media', {
            method: 'POST',
            headers: { 'Content-Type': 'application/json', Authorization: `Bearer ${accessToken}` },
            body: JSON.stringify({ image_url: resolved, is_carousel_item: true }),
          });
          if (!itemRes.ok) {
            const err = await itemRes.json();
            throw new Error(`Carousel item creation failed: ${JSON.stringify(err)}`);
          }
          childIds.push((await itemRes.json()).id);
        }

        // Create the carousel container with scheduling
        const carouselRes = await fetch('https://graph.instagram.com/v22.0/me/media', {
          method: 'POST',
          headers: { 'Content-Type': 'application/json', Authorization: `Bearer ${accessToken}` },
          body: JSON.stringify({
            media_type: 'CAROUSEL',
            children: childIds,
            caption: post.caption,
            published: false,
            scheduled_publish_time: scheduledPublishTime,
          }),
        });
        if (!carouselRes.ok) {
          const err = await carouselRes.json();
          throw new Error(`Carousel container creation failed: ${JSON.stringify(err)}`);
        }
        containerId = (await carouselRes.json()).id;
      } else {
        // Single image or video
        const resolved = await resolveImageUrl(post.imageUrl, supabase, user.id);
        const payload: any = {
          caption: post.caption,
          published: false,
          scheduled_publish_time: scheduledPublishTime,
        };
        if (post.contentType === 'VIDEO') {
          payload.video_url = resolved;
          payload.media_type = post.videoType === 'REELS' ? 'REELS' : 'VIDEO';
        } else {
          payload.image_url = resolved;
        }

        const containerRes = await fetch('https://graph.instagram.com/v22.0/me/media', {
          method: 'POST',
          headers: { 'Content-Type': 'application/json', Authorization: `Bearer ${accessToken}` },
          body: JSON.stringify(payload),
        });
        if (!containerRes.ok) {
          const err = await containerRes.json();
          throw new Error(`Instagram media container creation failed: ${JSON.stringify(err)}`);
        }
        containerId = (await containerRes.json()).id;
      }

      // Persist the container ID so the scheduler knows to skip re-publishing
      await prisma.contentPost.update({
        where: { id: post.id },
        data: { igMediaId: containerId },
      });

      logger.info(
        `Instagram post natively scheduled: containerId=${containerId}, publishAt=${scheduledTime.toISOString()}`,
        { userId: user.id }
      );

      return res.status(200).json({
        nativeScheduled: true,
        platform: 'INSTAGRAM',
        containerId,
        message: `Post natively scheduled on Instagram for ${scheduledTime.toLocaleString()}`,
      });

    // -----------------------------------------------------------------------
    // LinkedIn native scheduling
    // -----------------------------------------------------------------------
    } else if (account.accountType === 'LINKEDIN') {
      if (minutesUntil < LINKEDIN_MIN_SCHEDULE_MINUTES) {
        return res.status(200).json({
          nativeScheduled: false,
          message: `Schedule time must be at least ${LINKEDIN_MIN_SCHEDULE_MINUTES} minutes away for LinkedIn native scheduling — post will be published by the scheduler`,
        });
      }

      const accessToken = getLinkedInAccessToken(account as any);

      if (!account.linkedinUserId) {
        return res.status(400).json({ error: 'LinkedIn member ID missing — please reconnect your LinkedIn account' });
      }

      const authorUrn = `urn:li:person:${account.linkedinUserId}`;
      const LINKEDIN_API_VERSION = '202411';

      // Upload image if provided
      let imageUrn: string | null = null;
      if (post.imageUrl) {
        try {
          const resolved = await resolveImageUrl(post.imageUrl, supabase, user.id);
          imageUrn = await uploadLinkedInImage(accessToken, authorUrn, resolved, user.id);
        } catch (imgErr: any) {
          logger.warn(
            `LinkedIn image upload failed for native scheduling (posting without image): ${imgErr.message}`,
            { userId: user.id }
          );
        }
      }

      const postPayload: any = {
        author: authorUrn,
        commentary: post.caption,
        visibility: 'PUBLIC',
        distribution: {
          feedDistribution: 'MAIN_FEED',
          targetEntities: [],
          thirdPartyDistributionChannels: [],
        },
        lifecycleState: 'SCHEDULED',
        scheduledAt: scheduledTime.getTime(), // milliseconds
        isReshareDisabledByAuthor: false,
      };

      if (imageUrn) {
        postPayload.content = { media: { altText: 'Post image', id: imageUrn } };
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
        throw new Error(`LinkedIn scheduled post creation failed (${postRes.status}): ${JSON.stringify(err)}`);
      }

      const linkedinPostId =
        postRes.headers.get('x-restli-id') || postRes.headers.get('X-RestLi-Id') || null;

      // Persist the LinkedIn post URN so the scheduler knows to skip re-publishing
      await prisma.contentPost.update({
        where: { id: post.id },
        data: { linkedinPostId },
      });

      logger.info(
        `LinkedIn post natively scheduled: postId=${linkedinPostId}, publishAt=${scheduledTime.toISOString()}`,
        { userId: user.id }
      );

      return res.status(200).json({
        nativeScheduled: true,
        platform: 'LINKEDIN',
        postId: linkedinPostId,
        message: `Post natively scheduled on LinkedIn for ${scheduledTime.toLocaleString()}`,
      });

    // -----------------------------------------------------------------------
    // Platforms without native scheduling API (X, Facebook, Bluesky)
    // -----------------------------------------------------------------------
    } else {
      return res.status(200).json({
        nativeScheduled: false,
        message: `Native scheduling is not available for ${account.accountType} — post will be published by the scheduler`,
      });
    }
  } catch (error: any) {
    logger.error('Native scheduling failed:', error, { userId: user.id });
    return res.status(200).json({
      nativeScheduled: false,
      error: error.message,
      message: `Native scheduling failed (${error.message}) — post will be published by the scheduler`,
    });
  }
}
