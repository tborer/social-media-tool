import { NextApiRequest, NextApiResponse } from 'next';
import { createClient } from '@/util/supabase/api';
import prisma from '@/lib/prisma';

export default async function handler(req: NextApiRequest, res: NextApiResponse) {
  if (req.method !== 'GET') {
    return res.status(405).json({ error: 'Method not allowed' });
  }

  const supabase = createClient(req, res);
  const { data: { user }, error: authError } = await supabase.auth.getUser();

  if (authError || !user) {
    return res.status(401).json({ error: 'Unauthorized' });
  }

  try {
    const [contactsByStatus, messagesByStatus, messagesSentThisWeek] = await Promise.all([
      prisma.contact.groupBy({
        by: ['status'],
        where: { userId: user.id },
        _count: true,
      }),
      prisma.outreachMessage.groupBy({
        by: ['status'],
        where: { userId: user.id },
        _count: true,
      }),
      prisma.outreachMessage.count({
        where: {
          userId: user.id,
          sentAt: { gte: new Date(Date.now() - 7 * 24 * 60 * 60 * 1000) },
        },
      }),
    ]);

    const contactByStatusMap: Record<string, number> = {
      PROSPECT: 0, CONTACTED: 0, RESPONDED: 0, CONVERTED: 0, INACTIVE: 0,
    };
    for (const row of contactsByStatus) {
      contactByStatusMap[row.status] = row._count;
    }

    const messageByStatusMap: Record<string, number> = {
      DRAFT: 0, SENT: 0, REPLIED: 0, NO_REPLY: 0,
    };
    for (const row of messagesByStatus) {
      messageByStatusMap[row.status] = row._count;
    }

    const denominator = messageByStatusMap.SENT + messageByStatusMap.REPLIED + messageByStatusMap.NO_REPLY;
    const responseRate = denominator > 0 ? messageByStatusMap.REPLIED / denominator : 0;

    return res.status(200).json({
      contactsByStatus: contactByStatusMap,
      messagesByStatus: messageByStatusMap,
      responseRate: Math.round(responseRate * 10000) / 10000,
      messagesSentThisWeek,
    });
  } catch (error) {
    console.error('Error fetching outreach stats:', error);
    return res.status(500).json({ error: 'Failed to fetch outreach stats' });
  }
}
