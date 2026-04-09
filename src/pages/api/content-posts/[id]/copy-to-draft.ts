import { NextApiRequest, NextApiResponse } from 'next';
import { createClient } from '@/util/supabase/api';
import prisma from '@/lib/prisma';
import { logger } from '@/lib/server-logger';

/**
 * POST /api/content-posts/[id]/copy-to-draft
 *
 * Duplicates an existing post as a new DRAFT, optionally with a caption override.
 * Records `originalPostId` for lineage tracking.
 *
 * Body (optional):
 *  - captionOverride: string — replacement caption for the new draft
 */
export default async function handler(req: NextApiRequest, res: NextApiResponse) {
  if (req.method !== 'POST') {
    return res.status(405).json({ error: 'Method not allowed' });
  }

  const supabase = createClient(req, res);
  const { data: { user }, error: authError } = await supabase.auth.getUser();
  if (authError || !user) {
    return res.status(401).json({ error: 'Unauthorized' });
  }

  const { id } = req.query;
  if (!id || typeof id !== 'string') {
    return res.status(400).json({ error: 'Invalid post ID' });
  }

  try {
    // Fetch the source post
    const sourcePost = await prisma.contentPost.findFirst({
      where: { id, userId: user.id },
    });

    if (!sourcePost) {
      return res.status(404).json({ error: 'Post not found' });
    }

    const { captionOverride } = req.body || {};

    // Create the new draft, copying relevant fields
    const newDraft = await prisma.contentPost.create({
      data: {
        caption: typeof captionOverride === 'string' ? captionOverride : sourcePost.caption,
        imageUrl: sourcePost.imageUrl,
        contentType: sourcePost.contentType,
        videoType: sourcePost.videoType,
        status: 'DRAFT',
        targetPlatforms: sourcePost.targetPlatforms,
        originalPostId: sourcePost.id,
        platformOverrides: sourcePost.platformOverrides ?? undefined,
        userId: user.id,
        socialMediaAccountId: sourcePost.socialMediaAccountId,
      },
    });

    logger.info(`Copied post ${id} to new draft ${newDraft.id}`, { userId: user.id });

    return res.status(201).json(newDraft);
  } catch (error) {
    logger.error('Error copying post to draft:', error, { userId: user.id });
    return res.status(500).json({
      error: 'Failed to copy post to draft',
      details: error instanceof Error ? error.message : 'Unknown error',
    });
  }
}
