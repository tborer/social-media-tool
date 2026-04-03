import { NextApiRequest, NextApiResponse } from 'next';
import { createClient } from '@/util/supabase/api';
import prisma from '@/lib/prisma';

export default async function handler(req: NextApiRequest, res: NextApiResponse) {
  const supabase = createClient(req, res);
  const { data: { user }, error: authError } = await supabase.auth.getUser();

  if (authError || !user) {
    return res.status(401).json({ error: 'Unauthorized' });
  }

  const { id } = req.query;

  if (!id || typeof id !== 'string') {
    return res.status(400).json({ error: 'Invalid idea ID' });
  }

  switch (req.method) {
    case 'GET':
      return getContentIdea(req, res, id, user.id);
    case 'PUT':
      return updateContentIdea(req, res, id, user.id);
    case 'DELETE':
      return deleteContentIdea(req, res, id, user.id);
    default:
      return res.status(405).json({ error: 'Method not allowed' });
  }
}

async function getContentIdea(req: NextApiRequest, res: NextApiResponse, ideaId: string, userId: string) {
  try {
    const idea = await prisma.contentIdea.findFirst({
      where: {
        id: ideaId,
        userId,
      },
    });

    if (!idea) {
      return res.status(404).json({ error: 'Content idea not found' });
    }

    return res.status(200).json(idea);
  } catch (error) {
    console.error('Error fetching content idea:', error);
    return res.status(500).json({ error: 'Failed to fetch content idea' });
  }
}

async function updateContentIdea(req: NextApiRequest, res: NextApiResponse, ideaId: string, userId: string) {
  try {
    const existingIdea = await prisma.contentIdea.findFirst({
      where: {
        id: ideaId,
        userId,
      },
    });

    if (!existingIdea) {
      return res.status(404).json({ error: 'Content idea not found' });
    }

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

    const updatedIdea = await prisma.contentIdea.update({
      where: { id: ideaId },
      data: {
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

    return res.status(200).json(updatedIdea);
  } catch (error) {
    console.error('Error updating content idea:', error);
    return res.status(500).json({ error: 'Failed to update content idea' });
  }
}

async function deleteContentIdea(req: NextApiRequest, res: NextApiResponse, ideaId: string, userId: string) {
  try {
    const existingIdea = await prisma.contentIdea.findFirst({
      where: {
        id: ideaId,
        userId,
      },
    });

    if (!existingIdea) {
      return res.status(404).json({ error: 'Content idea not found' });
    }

    await prisma.contentIdea.delete({
      where: { id: ideaId },
    });

    return res.status(204).send(null);
  } catch (error) {
    console.error('Error deleting content idea:', error);
    return res.status(500).json({ error: 'Failed to delete content idea' });
  }
}
