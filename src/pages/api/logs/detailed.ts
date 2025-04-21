import { NextApiRequest, NextApiResponse } from 'next';
import { createClient } from '@/util/supabase/api';
import prisma from '@/lib/prisma';
import { logger } from '@/lib/logger';

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

  // Only allow GET requests
  if (req.method !== 'GET') {
    return res.status(405).json({ error: 'Method not allowed' });
  }

  try {
    // Get query parameters
    const { endpoint, limit = '20', offset = '0' } = req.query;
    
    // Parse limit and offset
    const parsedLimit = Math.min(parseInt(limit as string, 10) || 20, 100); // Max 100 logs
    const parsedOffset = parseInt(offset as string, 10) || 0;
    
    // Build the where clause
    const where: any = {
      userId: user.id,
    };
    
    // Add endpoint filter if provided
    if (endpoint && typeof endpoint === 'string') {
      where.endpoint = {
        contains: endpoint,
      };
    }
    
    // Get logs with pagination
    const logs = await prisma.log.findMany({
      where,
      orderBy: {
        createdAt: 'desc',
      },
      take: parsedLimit,
      skip: parsedOffset,
    });
    
    // Get total count for pagination
    const totalCount = await prisma.log.count({
      where,
    });
    
    // Log this request
    logger.info(`Fetched ${logs.length} detailed logs for user`, { userId: user.id });
    
    // Return logs with pagination info
    return res.status(200).json({
      logs,
      pagination: {
        total: totalCount,
        limit: parsedLimit,
        offset: parsedOffset,
        hasMore: parsedOffset + logs.length < totalCount,
      },
    });
  } catch (error) {
    logger.error('Error fetching detailed logs:', error, { userId: user.id });
    return res.status(500).json({ error: 'Failed to fetch logs' });
  }
}