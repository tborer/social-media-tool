import { NextApiRequest, NextApiResponse } from 'next';
import { createClient } from '@/util/supabase/api';
import { generateCaption as generateGeminiCaption } from '@/lib/gemini';
import { generateCaption as generateOpenAICaption } from '@/lib/openai';
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

  // Only allow POST requests
  if (req.method !== 'POST') {
    return res.status(405).json({ error: 'Method not allowed' });
  }

  const { prompt, provider = 'gemini' } = req.body;

  if (!prompt) {
    return res.status(400).json({ error: 'Prompt is required' });
  }

  // Fetch the user's brand voice settings
  let brandVoice;
  try {
    const userSettings = await prisma.userSettings.findUnique({
      where: { userId: user.id },
      select: {
        brandVoiceTone: true,
        brandVoiceAudience: true,
        brandVoicePersonality: true,
        brandVoiceKeyPhrases: true,
        brandVoiceAvoidPhrases: true,
        brandVoiceExamples: true,
      },
    });

    if (
      userSettings &&
      (userSettings.brandVoiceTone ||
        userSettings.brandVoiceAudience ||
        userSettings.brandVoicePersonality ||
        userSettings.brandVoiceKeyPhrases.length > 0 ||
        userSettings.brandVoiceAvoidPhrases.length > 0 ||
        userSettings.brandVoiceExamples)
    ) {
      brandVoice = {
        tone: userSettings.brandVoiceTone,
        audience: userSettings.brandVoiceAudience,
        personality: userSettings.brandVoicePersonality,
        keyPhrases: userSettings.brandVoiceKeyPhrases,
        avoidPhrases: userSettings.brandVoiceAvoidPhrases,
        examples: userSettings.brandVoiceExamples,
      };
    }
  } catch (error) {
    // Non-fatal: if we can't load brand voice, just proceed without it
    console.error('Error loading brand voice settings:', error);
  }

  try {
    let result;

    // Use the selected provider
    if (provider === 'openai') {
      console.log('Using OpenAI for caption generation');
      result = await generateOpenAICaption(prompt, brandVoice);
    } else {
      console.log('Using Gemini for caption generation');
      result = await generateGeminiCaption(prompt, brandVoice);
    }

    return res.status(200).json({
      message: result.message || "Here's an analysis of your content request:",
      caption: result.caption,
    });
  } catch (error) {
    console.error('Error generating caption:', error);
    return res.status(500).json({ error: 'Failed to generate caption' });
  }
}
