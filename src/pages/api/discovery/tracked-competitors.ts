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
    case 'GET': {
      const competitors = await prisma.trackedCompetitor.findMany({
        where: { userId: user.id },
        orderBy: { createdAt: 'desc' },
      });
      return res.status(200).json(competitors);
    }

    case 'POST': {
      const { username } = req.body;
      if (!username || typeof username !== 'string') {
        return res.status(400).json({ error: 'username is required' });
      }

      const normalized = username.replace(/^@/, '').toLowerCase().trim();
      if (!normalized) {
        return res.status(400).json({ error: 'Invalid username' });
      }

      const existing = await prisma.trackedCompetitor.findUnique({
        where: { userId_username: { userId: user.id, username: normalized } },
      });
      if (existing) {
        return res.status(409).json({ error: 'Competitor already tracked' });
      }

      const created = await prisma.trackedCompetitor.create({
        data: { userId: user.id, username: normalized },
      });
      return res.status(201).json(created);
    }

    case 'DELETE': {
      const { id } = req.body;
      if (!id || typeof id !== 'string') {
        return res.status(400).json({ error: 'id is required' });
      }

      await prisma.trackedCompetitor.deleteMany({
        where: { id, userId: user.id },
      });
      return res.status(200).json({ success: true });
    }

    default:
      return res.status(405).json({ error: 'Method not allowed' });
  }
}
