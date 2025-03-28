import { NextApiRequest, NextApiResponse } from 'next';
import { createClient } from '@/util/supabase/api';
import { generateImages } from '@/lib/openai';

export default async function handler(req: NextApiRequest, res: NextApiResponse) {
  // Create Supabase client for authentication
  const supabase = createClient(req, res);
  
  // Get the user from the session
  const { data: { user }, error: authError } = await supabase.auth.getUser();
  
  if (authError || !user) {
    console.error('Authentication error:', authError);
    return res.status(401).json({ error: 'Unauthorized' });
  }
  
  // Only allow POST requests
  if (req.method !== 'POST') {
    return res.status(405).json({ error: 'Method not allowed' });
  }
  
  const { prompt, count = 1 } = req.body;
  
  if (!prompt) {
    return res.status(400).json({ error: 'Prompt is required' });
  }
  
  // Validate count
  const imageCount = Math.min(Math.max(1, Number(count)), 25);
  
  try {
    // Call OpenAI to generate images
    const images = await generateImages(prompt, imageCount);
    
    return res.status(200).json({ images });
  } catch (error) {
    console.error('Error generating images:', error);
    return res.status(500).json({ error: 'Failed to generate images' });
  }
}