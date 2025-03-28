import { NextApiRequest, NextApiResponse } from 'next';
import { createClient } from '@/util/supabase/api';
import { generateCaption } from '@/lib/gemini';

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
  
  const { prompt } = req.body;
  
  if (!prompt) {
    return res.status(400).json({ error: 'Prompt is required' });
  }
  
  try {
    // Call Gemini to generate a caption
    const generatedCaption = await generateCaption(prompt);
    
    return res.status(200).json({ caption: generatedCaption });
  } catch (error) {
    console.error('Error generating caption:', error);
    return res.status(500).json({ error: 'Failed to generate caption' });
  }
}