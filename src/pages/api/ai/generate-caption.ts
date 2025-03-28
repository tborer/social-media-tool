import { NextApiRequest, NextApiResponse } from 'next';
import { createClient } from '@/util/supabase/api';
import { generateCaption as generateGeminiCaption } from '@/lib/gemini';
import { generateCaption as generateOpenAICaption } from '@/lib/openai';

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
  
  const { prompt, provider = 'gemini' } = req.body;
  
  if (!prompt) {
    return res.status(400).json({ error: 'Prompt is required' });
  }
  
  try {
    let result;
    
    // Use the selected provider
    if (provider === 'openai') {
      console.log('Using OpenAI for caption generation');
      result = await generateOpenAICaption(prompt);
    } else {
      console.log('Using Gemini for caption generation');
      result = await generateGeminiCaption(prompt);
    }
    
    return res.status(200).json({
      message: result.message || "Here's an analysis of your content request:",
      caption: result.caption
    });
  } catch (error) {
    console.error('Error generating caption:', error);
    return res.status(500).json({ error: 'Failed to generate caption' });
  }
}