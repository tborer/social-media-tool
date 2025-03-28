import { NextApiRequest, NextApiResponse } from 'next';
import { createClient } from '@/util/supabase/api';
import prisma from '@/lib/prisma';

export default async function handler(req: NextApiRequest, res: NextApiResponse) {
  // Create Supabase client for authentication
  const supabase = createClient(req, res);
  
  // Get the user from the session
  const { data: { user }, error: authError } = await supabase.auth.getUser();
  
  if (authError || !user) {
    console.error('Authentication error:', authError);
    return res.status(401).json({ error: 'Unauthorized' });
  }
  
  // Only allow GET requests
  if (req.method !== 'GET') {
    return res.status(405).json({ error: 'Method not allowed' });
  }
  
  const { id } = req.query;
  
  if (!id || typeof id !== 'string') {
    return res.status(400).json({ error: 'Instagram account ID is required' });
  }
  
  try {
    // Check if the Instagram account belongs to the user
    const account = await prisma.instagramAccount.findFirst({
      where: {
        id,
        userId: user.id
      }
    });
    
    if (!account) {
      return res.status(404).json({ error: 'Instagram account not found' });
    }
    
    // In a real implementation, this would fetch images from the Instagram API
    // For now, we'll return mock data
    const mockImages = [
      {
        id: '1',
        url: 'https://picsum.photos/id/1/500/500',
        caption: 'Beautiful sunset #nature'
      },
      {
        id: '2',
        url: 'https://picsum.photos/id/2/500/500',
        caption: 'Coffee time #lifestyle'
      },
      {
        id: '3',
        url: 'https://picsum.photos/id/3/500/500',
        caption: 'Beach vibes #travel'
      }
    ];
    
    return res.status(200).json(mockImages);
  } catch (error) {
    console.error('Error fetching Instagram images:', error);
    return res.status(500).json({ error: 'Failed to fetch Instagram images' });
  }
}