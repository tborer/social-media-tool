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
      return getCriteria(res, user.id);
    case 'POST':
      return createCriteria(req, res, user.id);
    case 'PUT':
      return updateCriteria(req, res, user.id);
    case 'DELETE':
      return deleteCriteria(req, res, user.id);
    default:
      return res.status(405).json({ error: 'Method not allowed' });
  }
}

async function getCriteria(res: NextApiResponse, userId: string) {
  try {
    const criteria = await prisma.outreachCriteria.findMany({
      where: { userId },
      orderBy: { updatedAt: 'desc' },
    });

    return res.status(200).json(criteria);
  } catch (error) {
    console.error('Error fetching outreach criteria:', error);
    return res.status(500).json({ error: 'Failed to fetch outreach criteria' });
  }
}

async function createCriteria(req: NextApiRequest, res: NextApiResponse, userId: string) {
  try {
    const { name, searchTerms, locations, niches, followerMin, followerMax, notes } = req.body;

    if (!name) {
      return res.status(400).json({ error: 'name is required' });
    }

    const criteria = await prisma.outreachCriteria.create({
      data: {
        userId,
        name,
        ...(searchTerms !== undefined && { searchTerms }),
        ...(locations !== undefined && { locations }),
        ...(niches !== undefined && { niches }),
        ...(followerMin !== undefined && { followerMin }),
        ...(followerMax !== undefined && { followerMax }),
        ...(notes !== undefined && { notes }),
      },
    });

    return res.status(201).json(criteria);
  } catch (error) {
    console.error('Error creating outreach criteria:', error);
    return res.status(500).json({ error: 'Failed to create outreach criteria' });
  }
}

async function updateCriteria(req: NextApiRequest, res: NextApiResponse, userId: string) {
  try {
    const { id, name, searchTerms, locations, niches, followerMin, followerMax, notes } = req.body;

    if (!id) {
      return res.status(400).json({ error: 'id is required' });
    }

    const existing = await prisma.outreachCriteria.findFirst({ where: { id, userId } });
    if (!existing) {
      return res.status(404).json({ error: 'Outreach criteria not found' });
    }

    const criteria = await prisma.outreachCriteria.update({
      where: { id },
      data: {
        ...(name !== undefined && { name }),
        ...(searchTerms !== undefined && { searchTerms }),
        ...(locations !== undefined && { locations }),
        ...(niches !== undefined && { niches }),
        ...(followerMin !== undefined && { followerMin }),
        ...(followerMax !== undefined && { followerMax }),
        ...(notes !== undefined && { notes }),
      },
    });

    return res.status(200).json(criteria);
  } catch (error) {
    console.error('Error updating outreach criteria:', error);
    return res.status(500).json({ error: 'Failed to update outreach criteria' });
  }
}

async function deleteCriteria(req: NextApiRequest, res: NextApiResponse, userId: string) {
  try {
    const { id } = req.body;

    if (!id) {
      return res.status(400).json({ error: 'id is required' });
    }

    const existing = await prisma.outreachCriteria.findFirst({ where: { id, userId } });
    if (!existing) {
      return res.status(404).json({ error: 'Outreach criteria not found' });
    }

    await prisma.outreachCriteria.delete({ where: { id } });
    return res.status(204).send(null);
  } catch (error) {
    console.error('Error deleting outreach criteria:', error);
    return res.status(500).json({ error: 'Failed to delete outreach criteria' });
  }
}
