import { NextApiRequest, NextApiResponse } from 'next';
import { createClient } from '@/util/supabase/api';
import { GeminiClient } from '@/lib/gemini-client';

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
  
  const { prompt, generateImage = true } = req.body;
  
  if (!prompt) {
    return res.status(400).json({ error: 'Prompt is required' });
  }
  
  try {
    // Call Gemini to generate content
    const client = new GeminiClient();
    const result = await client.generateContent(prompt, generateImage);
    
    const response: {
      caption: string;
      image?: string;
    } = {
      caption: result.caption
    };
    
    if (result.imageBase64) {
      response.image = `data:image/png;base64,${result.imageBase64}`;
    }
    
    return res.status(200).json(response);
  } catch (error) {
    console.error('Error generating content:', error);
    return res.status(500).json({ error: 'Failed to generate content' });
  }
}