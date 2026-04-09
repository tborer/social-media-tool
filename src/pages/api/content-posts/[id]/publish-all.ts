import { NextApiRequest, NextApiResponse } from 'next';
import { createClient } from '@/util/supabase/api';
import prisma from '@/lib/prisma';
import { logger } from '@/lib/server-logger';
import { getAccessToken } from '@/lib/instagram-token-manager';
import { publishPost as publishLinkedInPost } from '@/lib/linkedin-client';
import { publishTweet } from '@/lib/x-client';
import { publishFacebookPost } from '@/lib/facebook-client';
import { createPost as createBlueskyPost, refreshSession } from '@/lib/bluesky-client';
import { decrypt, isEncryptionConfigured } from '@/lib/encryption';

// Resolve image URL to a publicly accessible URL
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

async function postToInstagram(
  accessToken: string,
  imageUrl: string,
  caption: string,
  supabase: any,
  userId: string,
  contentType: string,
  videoType?: string
): Promise<{ mediaId: string }> {
  const mediaUrls = imageUrl.split(',').map(u => u.trim()).filter(Boolean);
  const isCarousel = mediaUrls.length > 1;

  if (isCarousel) {
    const childIds: string[] = [];
    for (const url of mediaUrls) {
      const resolved = await resolveImageUrl(url, supabase, userId);
      const itemRes = await fetch('https://graph.instagram.com/v22.0/me/media', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json', Authorization: `Bearer ${accessToken}` },
        body: JSON.stringify({ image_url: resolved, is_carousel_item: true }),
      });
      if (!itemRes.ok) throw new Error(`Carousel item failed: ${JSON.stringify(await itemRes.json())}`);
      const { id } = await itemRes.json();
      childIds.push(id);
    }
    const carouselRes = await fetch('https://graph.instagram.com/v22.0/me/media', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json', Authorization: `Bearer ${accessToken}` },
      body: JSON.stringify({ media_type: 'CAROUSEL', children: childIds, caption }),
    });
    if (!carouselRes.ok) throw new Error(`Carousel container failed: ${JSON.stringify(await carouselRes.json())}`);
    const { id: containerId } = await carouselRes.json();
    const pubRes = await fetch('https://graph.instagram.com/v22.0/me/media_publish', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json', Authorization: `Bearer ${accessToken}` },
      body: JSON.stringify({ creation_id: containerId }),
    });
    if (!pubRes.ok) throw new Error(`Carousel publish failed: ${JSON.stringify(await pubRes.json())}`);
    return { mediaId: (await pubRes.json()).id };
  }

  const resolved = await resolveImageUrl(imageUrl, supabase, userId);
  const payload: any = { caption };
  if (contentType === 'VIDEO') {
    payload.video_url = resolved;
    payload.media_type = videoType === 'REELS' ? 'REELS' : 'VIDEO';
  } else {
    payload.image_url = resolved;
  }

  const containerRes = await fetch('https://graph.instagram.com/v22.0/me/media', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json', Authorization: `Bearer ${accessToken}` },
    body: JSON.stringify(payload),
  });
  if (!containerRes.ok) throw new Error(`Container creation failed: ${JSON.stringify(await containerRes.json())}`);
  const { id: containerId } = await containerRes.json();

  if (contentType === 'VIDEO') {
    let ready = false;
    for (let i = 0; i < 30 && !ready; i++) {
      await new Promise(r => setTimeout(r, 2000));
      const statusRes = await fetch(`https://graph.instagram.com/v22.0/${containerId}?fields=status_code`, {
        headers: { Authorization: `Bearer ${accessToken}` },
      });
      if (statusRes.ok) {
        const { status_code } = await statusRes.json();
        if (status_code === 'FINISHED') ready = true;
        else if (status_code === 'ERROR') throw new Error('Instagram video processing failed');
      }
    }
    if (!ready) throw new Error('Video processing timeout');
  }

  const pubRes = await fetch('https://graph.instagram.com/v22.0/me/media_publish', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json', Authorization: `Bearer ${accessToken}` },
    body: JSON.stringify({ creation_id: containerId }),
  });
  if (!pubRes.ok) throw new Error(`Publish failed: ${JSON.stringify(await pubRes.json())}`);
  return { mediaId: (await pubRes.json()).id };
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

  const { accountIds } = req.body;
  if (!Array.isArray(accountIds) || accountIds.length === 0) {
    return res.status(400).json({ error: 'accountIds array is required' });
  }

  const post = await prisma.contentPost.findFirst({ where: { id, userId: user.id } });
  if (!post) return res.status(404).json({ error: 'Post not found' });

  const accounts = await prisma.socialMediaAccount.findMany({
    where: { id: { in: accountIds }, userId: user.id },
  });

  if (accounts.length === 0) {
    return res.status(404).json({ error: 'No valid accounts found' });
  }

  const results: Array<{ accountId: string; platform: string; username: string; success: boolean; error?: string; postId?: string }> = [];
  const updates: any = { status: 'PUBLISHED' };

  for (const account of accounts) {
    try {
      if (account.accountType === 'INSTAGRAM') {
        if (!post.imageUrl) throw new Error('Instagram posts require an image URL');
        const accessToken = await getAccessToken(account.id, user.id);
        const result = await postToInstagram(
          accessToken,
          post.imageUrl,
          post.caption,
          supabase,
          user.id,
          post.contentType,
          post.videoType ?? undefined
        );
        updates.igMediaId = result.mediaId;
        updates.socialMediaAccountId = account.id;
        results.push({ accountId: account.id, platform: 'INSTAGRAM', username: account.username, success: true, postId: result.mediaId });
      } else if (account.accountType === 'LINKEDIN') {
        let resolvedImageUrl: string | null = null;
        if (post.imageUrl) {
          try { resolvedImageUrl = await resolveImageUrl(post.imageUrl, supabase, user.id); } catch {}
        }
        const result = await publishLinkedInPost(account, post.caption, resolvedImageUrl, user.id);
        updates.linkedinPostId = result.postId;
        if (!updates.socialMediaAccountId) updates.socialMediaAccountId = account.id;
        results.push({ accountId: account.id, platform: 'LINKEDIN', username: account.username, success: true, postId: result.postId ?? undefined });
      } else if (account.accountType === 'X') {
        let resolvedImageUrl: string | null = null;
        if (post.imageUrl) {
          try { resolvedImageUrl = await resolveImageUrl(post.imageUrl, supabase, user.id); } catch {}
        }
        const result = await publishTweet(account, post.caption, resolvedImageUrl, user.id);
        updates.xPostId = result.tweetId;
        if (!updates.socialMediaAccountId) updates.socialMediaAccountId = account.id;
        results.push({ accountId: account.id, platform: 'X', username: account.username, success: true, postId: result.tweetId });
      } else if (account.accountType === 'FACEBOOK') {
        if (!account.facebookPageId) throw new Error('No Facebook Page connected');
        let pageToken = account.accessToken;
        if (account.isEncrypted && isEncryptionConfigured()) {
          pageToken = decrypt(account.accessToken);
        }
        let resolvedImageUrl: string | null = null;
        if (post.imageUrl) {
          try { resolvedImageUrl = await resolveImageUrl(post.imageUrl, supabase, user.id); } catch {}
        }
        const result = await publishFacebookPost(account.facebookPageId, pageToken, post.caption, resolvedImageUrl);
        updates.facebookPostId = result.postId;
        if (!updates.socialMediaAccountId) updates.socialMediaAccountId = account.id;
        results.push({ accountId: account.id, platform: 'FACEBOOK', username: account.username, success: true, postId: result.postId });
      } else if (account.accountType === 'BLUESKY') {
        if (!account.blueskyDid) throw new Error('No Bluesky DID found — reconnect your account');
        let accessJwt = account.accessToken;
        let refreshJwt = account.refreshToken || '';
        if (account.isEncrypted && isEncryptionConfigured()) {
          accessJwt = decrypt(account.accessToken);
          if (account.refreshToken) refreshJwt = decrypt(account.refreshToken);
        }
        // Refresh session to ensure token is valid
        try {
          const session = await refreshSession(refreshJwt);
          accessJwt = session.accessJwt;
        } catch {
          // If refresh fails, try with existing token
        }
        const result = await createBlueskyPost(accessJwt, account.blueskyDid, post.caption);
        updates.blueskyPostUri = result.uri;
        if (!updates.socialMediaAccountId) updates.socialMediaAccountId = account.id;
        results.push({ accountId: account.id, platform: 'BLUESKY', username: account.username, success: true, postId: result.uri });
      } else {
        results.push({ accountId: account.id, platform: account.accountType, username: account.username, success: false, error: `Platform ${account.accountType} not yet supported` });
      }
    } catch (err: any) {
      logger.error(`publish-all: failed for account ${account.id} (${account.accountType})`, err, { userId: user.id });
      results.push({ accountId: account.id, platform: account.accountType, username: account.username, success: false, error: err.message });
    }
  }

  const anySuccess = results.some(r => r.success);
  if (anySuccess) {
    await prisma.contentPost.update({ where: { id }, data: updates });
  } else {
    await prisma.contentPost.update({ where: { id }, data: { status: 'FAILED' } });
  }

  const allSuccess = results.every(r => r.success);
  return res.status(allSuccess ? 200 : 207).json({
    success: allSuccess,
    results,
    message: allSuccess
      ? `Published to ${results.length} platform(s)`
      : `Published to ${results.filter(r => r.success).length}/${results.length} platform(s)`,
  });
}
