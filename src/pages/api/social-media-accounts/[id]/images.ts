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
  
  const { id } = req.query;
  
  if (!id || typeof id !== 'string') {
    return res.status(400).json({ error: 'Invalid account ID' });
  }
  
  // Only allow GET requests
  if (req.method !== 'GET') {
    return res.status(405).json({ error: 'Method not allowed' });
  }
  
  try {
    // Check if account exists and belongs to the user
    const account = await prisma.socialMediaAccount.findFirst({
      where: {
        id,
        userId: user.id,
      },
    });
    
    if (!account) {
      return res.status(404).json({ error: 'Social media account not found' });
    }
    
    // For now, return a mock response
    // In a real implementation, you would fetch images from the respective platform's API
    const mockImages = [
      {
        id: '1',
        url: 'https://picsum.photos/id/1/500/500',
        caption: 'Beautiful landscape',
      },
      {
        id: '2',
        url: 'https://picsum.photos/id/20/500/500',
        caption: 'City skyline',
      },
      {
        id: '3',
        url: 'https://picsum.photos/id/30/500/500',
        caption: 'Beach sunset',
      },
    ];
    
    return res.status(200).json(mockImages);
  } catch (error) {
    console.error('Error fetching social media images:', error);
    return res.status(500).json({ error: 'Failed to fetch images' });
  }
}