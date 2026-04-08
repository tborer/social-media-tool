import { NextApiRequest, NextApiResponse } from 'next';
import { createClient } from '@/util/supabase/api';
import { generateImages as generateGeminiImages } from '@/lib/gemini';
import { generateImages as generateOpenAIImages } from '@/lib/openai';

const VALID_STYLES = ['photorealistic', 'artistic', 'cartoon', 'minimalist', 'vintage', 'professional', 'cinematic'];
const VALID_ASPECT_RATIOS = ['square', 'portrait', 'landscape', 'story'];

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

  const { prompt, count = 1, provider = 'gemini', style, aspectRatio } = req.body;

  if (!prompt) {
    return res.status(400).json({ error: 'Prompt is required' });
  }

  // Validate count
  const imageCount = Math.min(Math.max(1, Number(count)), 25);

  // Validate optional style and aspectRatio
  const validatedStyle = style && VALID_STYLES.includes(style) ? style : undefined;
  const validatedAspectRatio = aspectRatio && VALID_ASPECT_RATIOS.includes(aspectRatio) ? aspectRatio : undefined;

  try {
    let images;

    // Use the selected provider
    if (provider === 'openai') {
      console.log('Using OpenAI for image generation');
      images = await generateOpenAIImages(prompt, imageCount, validatedStyle, validatedAspectRatio);
    } else {
      console.log('Using Gemini for image generation');
      images = await generateGeminiImages(prompt, imageCount, validatedStyle, validatedAspectRatio);
    }

    return res.status(200).json({ images });
  } catch (error) {
    console.error('Error generating images:', error);
    return res.status(500).json({ error: 'Failed to generate images' });
  }
}
