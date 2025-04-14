import { NextApiRequest, NextApiResponse } from 'next';
import { createClient } from '@/util/supabase/api';
import { GeminiClient } from '@/lib/gemini-client';
import prisma from '@/lib/prisma';
import { LogType } from '@prisma/client';

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
    // Check user's usage limits
    const userSettings = await prisma.userSettings.findUnique({
      where: { userId: user.id },
    });
    
    // If user has settings and has reached their limit, return an error
    if (userSettings && userSettings.geminiUsageCount >= userSettings.geminiMonthlyLimit) {
      return res.status(403).json({ 
        error: 'Monthly usage limit reached for Gemini API',
        details: 'You have reached your monthly usage limit for Gemini. Please update your limits in the settings page or wait until the next billing cycle.'
      });
    }
    
    // Check if we need to reset the usage counter (if it's a new month)
    if (userSettings && userSettings.usageResetDate) {
      const resetDate = new Date(userSettings.usageResetDate);
      const currentDate = new Date();
      
      // If it's a new month, reset the counter
      if (resetDate.getMonth() !== currentDate.getMonth() || 
          resetDate.getFullYear() !== currentDate.getFullYear()) {
        await prisma.userSettings.update({
          where: { id: userSettings.id },
          data: {
            geminiUsageCount: 0,
            openaiUsageCount: 0,
            usageResetDate: currentDate,
          },
        });
      }
    }
    
    // Call Gemini to generate content
    const client = new GeminiClient();
    await client.initialize(user.id);
    
    let result;
    try {
      result = await client.generateContent(prompt, generateImage);
      
      // Log the successful AI generation request
      await prisma.log.create({
        data: {
          type: LogType.AI_GENERATION,
          endpoint: 'Gemini Content Generation',
          requestData: {
            prompt,
            generateImage,
          },
          response: {
            success: true,
            captionLength: result.caption.length,
            hasImage: !!result.imageBase64,
          },
          status: 200,
          userId: user.id,
        }
      });
    } catch (error) {
      // Log the failed AI generation request
      await prisma.log.create({
        data: {
          type: LogType.AI_GENERATION,
          endpoint: 'Gemini Content Generation',
          requestData: {
            prompt,
            generateImage,
          },
          error: error instanceof Error ? error.message : 'Unknown error',
          status: 500,
          userId: user.id,
        }
      });
      throw error; // Re-throw to be caught by the outer catch block
    }
    
    // Increment usage counter
    if (userSettings) {
      await prisma.userSettings.update({
        where: { id: userSettings.id },
        data: {
          geminiUsageCount: {
            increment: 1,
          },
        },
      });
    } else {
      // Create settings if they don't exist
      await prisma.userSettings.create({
        data: {
          userId: user.id,
          geminiUsageCount: 1,
        },
      });
    }
    
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