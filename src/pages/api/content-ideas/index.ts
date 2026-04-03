import { NextApiRequest, NextApiResponse } from 'next';
import { createClient } from '@/util/supabase/api';
import prisma from '@/lib/prisma';

export default async function handler(req: NextApiRequest, res: NextApiResponse) {
  const supabase = createClient(req, res);
  const { data: { user }, error: authError } = await supabase.auth.getUser();

  if (authError || !user) {
    return res.status(401).json({ error: 'Unauthorized' });
  }

  switch (req.method) {
    case 'GET':
      return getContentIdeas(req, res, user.id);
    case 'POST':
      return createContentIdea(req, res, user.id);
    default:
      return res.status(405).json({ error: 'Method not allowed' });
  }
}

async function getContentIdeas(req: NextApiRequest, res: NextApiResponse, userId: string) {
  try {
    const { status } = req.query;

    const ideas = await prisma.contentIdea.findMany({
      where: {
        userId,
        ...(status && typeof status === 'string' && { status: status as any }),
      },
      orderBy: { createdAt: 'desc' },
    });

    return res.status(200).json(ideas);
  } catch (error) {
    console.error('Error fetching content ideas:', error);
    return res.status(500).json({ error: 'Failed to fetch content ideas' });
  }
}

async function createContentIdea(req: NextApiRequest, res: NextApiResponse, userId: string) {
  try {
    const {
      sourceUrl,
      sourceAccountName,
      sourceCaption,
      sourceImageUrl,
      sourceLikes,
      sourceComments,
      notes,
      tags,
      status,
    } = req.body;

    if (!sourceCaption && !notes) {
      return res.status(400).json({ error: 'At least sourceCaption or notes is required' });
    }

    const newIdea = await prisma.contentIdea.create({
      data: {
        userId,
        ...(sourceUrl !== undefined && { sourceUrl }),
        ...(sourceAccountName !== undefined && { sourceAccountName }),
        ...(sourceCaption !== undefined && { sourceCaption }),
        ...(sourceImageUrl !== undefined && { sourceImageUrl }),
        ...(sourceLikes !== undefined && { sourceLikes }),
        ...(sourceComments !== undefined && { sourceComments }),
        ...(notes !== undefined && { notes }),
        ...(tags !== undefined && { tags }),
        ...(status !== undefined && { status }),
      },
    });

    return res.status(201).json(newIdea);
  } catch (error) {
    console.error('Error creating content idea:', error);
    return res.status(500).json({ error: 'Failed to create content idea' });
  }
}
