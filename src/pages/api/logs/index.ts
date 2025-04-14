import { NextApiRequest, NextApiResponse } from 'next';
import { createClient } from '@/util/supabase/api';
import prisma from '@/lib/prisma';

export default async function handler(
  req: NextApiRequest,
  res: NextApiResponse
) {
  // Get the user from Supabase auth
  const supabase = createClient(req, res);
  const {
    data: { user },
  } = await supabase.auth.getUser();

  if (!user) {
    return res.status(401).json({ error: 'Unauthorized' });
  }

  // Handle GET request to fetch logs
  if (req.method === 'GET') {
    try {
      const logs = await prisma.log.findMany({
        where: {
          userId: user.id,
        },
        orderBy: {
          createdAt: 'desc',
        },
      });

      return res.status(200).json(logs);
    } catch (error) {
      console.error('Error fetching logs:', error);
      return res.status(500).json({ error: 'Failed to fetch logs' });
    }
  }

  // Handle POST request to create a new log
  if (req.method === 'POST') {
    try {
      const { type, endpoint, requestData, response, status, error } = req.body;

      const log = await prisma.log.create({
        data: {
          type,
          endpoint,
          requestData,
          response,
          status,
          error,
          userId: user.id,
        },
      });

      return res.status(201).json(log);
    } catch (error) {
      console.error('Error creating log:', error);
      return res.status(500).json({ error: 'Failed to create log' });
    }
  }

  // Return 405 Method Not Allowed for other HTTP methods
  return res.status(405).json({ error: 'Method not allowed' });
}