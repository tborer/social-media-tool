import { NextApiRequest, NextApiResponse } from 'next';
import { createClient } from '@/util/supabase/api';
import prisma from '@/lib/prisma';
import { logger } from '@/lib/server-logger';

/**
 * A/B Test Tracker
 *
 * GET  /api/insights/ab-tests          — list all A/B tests for the user
 * POST /api/insights/ab-tests          — create a new A/B test pair
 * PUT  /api/insights/ab-tests?id=xxx   — update (mark winner / conclude)
 * DELETE /api/insights/ab-tests?id=xxx — delete an A/B test
 */
export default async function handler(req: NextApiRequest, res: NextApiResponse) {
  const supabase = createClient(req, res);
  const { data: { user }, error: authError } = await supabase.auth.getUser();
  if (authError || !user) {
    return res.status(401).json({ error: 'Unauthorized' });
  }

  switch (req.method) {
    case 'GET':  return listABTests(res, user.id);
    case 'POST': return createABTest(req, res, user.id);
    case 'PUT':  return updateABTest(req, res, user.id);
    case 'DELETE': return deleteABTest(req, res, user.id);
    default: return res.status(405).json({ error: 'Method not allowed' });
  }
}

async function listABTests(res: NextApiResponse, userId: string) {
  try {
    const tests = await (prisma as any).aBTest.findMany({
      where: { userId },
      orderBy: { createdAt: 'desc' },
    });

    // Enrich with post data and latest insights
    const enriched = await Promise.all(
      tests.map(async (test: any) => {
        const [postA, postB] = await Promise.all([
          prisma.contentPost.findFirst({
            where: { id: test.postAId, userId },
            include: { postInsights: { orderBy: { fetchedAt: 'desc' }, take: 1 } },
          }),
          prisma.contentPost.findFirst({
            where: { id: test.postBId, userId },
            include: { postInsights: { orderBy: { fetchedAt: 'desc' }, take: 1 } },
          }),
        ]);
        return {
          ...test,
          postA: postA ? {
            id: postA.id,
            caption: postA.caption.slice(0, 100) + (postA.caption.length > 100 ? '...' : ''),
            status: postA.status,
            insight: postA.postInsights[0] ?? null,
          } : null,
          postB: postB ? {
            id: postB.id,
            caption: postB.caption.slice(0, 100) + (postB.caption.length > 100 ? '...' : ''),
            status: postB.status,
            insight: postB.postInsights[0] ?? null,
          } : null,
        };
      })
    );

    return res.status(200).json(enriched);
  } catch (error) {
    logger.error('Error listing A/B tests:', error, { userId });
    return res.status(500).json({ error: 'Failed to list A/B tests' });
  }
}

async function createABTest(req: NextApiRequest, res: NextApiResponse, userId: string) {
  try {
    const { postAId, postBId, notes } = req.body;

    if (!postAId || !postBId) {
      return res.status(400).json({ error: 'postAId and postBId are required' });
    }
    if (postAId === postBId) {
      return res.status(400).json({ error: 'postAId and postBId must be different posts' });
    }

    // Verify both posts belong to user
    const [postA, postB] = await Promise.all([
      prisma.contentPost.findFirst({ where: { id: postAId, userId } }),
      prisma.contentPost.findFirst({ where: { id: postBId, userId } }),
    ]);
    if (!postA) return res.status(404).json({ error: 'Post A not found' });
    if (!postB) return res.status(404).json({ error: 'Post B not found' });

    const test = await (prisma as any).aBTest.create({
      data: { userId, postAId, postBId, notes: notes ?? null },
    });

    logger.info(`Created A/B test ${test.id}`, { userId, postAId, postBId });
    return res.status(201).json(test);
  } catch (error) {
    logger.error('Error creating A/B test:', error, { userId });
    return res.status(500).json({ error: 'Failed to create A/B test' });
  }
}

async function updateABTest(req: NextApiRequest, res: NextApiResponse, userId: string) {
  try {
    const { id } = req.query;
    if (!id || typeof id !== 'string') {
      return res.status(400).json({ error: 'id query param required' });
    }

    const existing = await (prisma as any).aBTest.findFirst({ where: { id, userId } });
    if (!existing) return res.status(404).json({ error: 'A/B test not found' });

    const { winnerId, notes, status } = req.body;
    const data: Record<string, unknown> = {};
    if (winnerId !== undefined) data.winnerId = winnerId;
    if (notes !== undefined) data.notes = notes;
    if (status !== undefined) data.status = status;
    if (winnerId) {
      data.status = 'concluded';
      data.comparedAt = new Date();
    }

    const updated = await (prisma as any).aBTest.update({ where: { id }, data });
    return res.status(200).json(updated);
  } catch (error) {
    logger.error('Error updating A/B test:', error, { userId });
    return res.status(500).json({ error: 'Failed to update A/B test' });
  }
}

async function deleteABTest(req: NextApiRequest, res: NextApiResponse, userId: string) {
  try {
    const { id } = req.query;
    if (!id || typeof id !== 'string') {
      return res.status(400).json({ error: 'id query param required' });
    }

    const existing = await (prisma as any).aBTest.findFirst({ where: { id, userId } });
    if (!existing) return res.status(404).json({ error: 'A/B test not found' });

    await (prisma as any).aBTest.delete({ where: { id } });
    return res.status(200).json({ success: true });
  } catch (error) {
    logger.error('Error deleting A/B test:', error, { userId });
    return res.status(500).json({ error: 'Failed to delete A/B test' });
  }
}
