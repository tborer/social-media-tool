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
  
  // Handle GET request to fetch user settings
  if (req.method === 'GET') {
    try {
      // Get user settings from database
      const settings = await prisma.userSettings.findUnique({
        where: {
          userId: user.id,
        },
      });
      
      if (!settings) {
        return res.status(404).json({ error: 'Settings not found' });
      }
      
      // Return settings with masked API keys for security
      return res.status(200).json({
        ...settings,
        openaiApiKey: settings.openaiApiKey ? '••••••••' : null,
        geminiApiKey: settings.geminiApiKey ? '••••••••' : null,
      });
    } catch (error) {
      console.error('Error fetching user settings:', error);
      return res.status(500).json({ error: 'Failed to fetch user settings' });
    }
  }
  
  // Handle POST request to create or update user settings
  if (req.method === 'POST') {
    try {
      const { openaiApiKey, geminiApiKey, openaiMonthlyLimit, geminiMonthlyLimit } = req.body;
      
      // Validate input
      if (openaiMonthlyLimit < 0 || geminiMonthlyLimit < 0) {
        return res.status(400).json({ error: 'Limits cannot be negative' });
      }
      
      // Check if user already has settings
      const existingSettings = await prisma.userSettings.findUnique({
        where: {
          userId: user.id,
        },
      });
      
      let settings;
      
      if (existingSettings) {
        // Update existing settings
        settings = await prisma.userSettings.update({
          where: {
            userId: user.id,
          },
          data: {
            // Only update API keys if they are provided and not empty
            ...(openaiApiKey !== undefined && openaiApiKey !== '' && { openaiApiKey }),
            ...(geminiApiKey !== undefined && geminiApiKey !== '' && { geminiApiKey }),
            // Always update limits
            openaiMonthlyLimit: openaiMonthlyLimit || 100,
            geminiMonthlyLimit: geminiMonthlyLimit || 100,
            updatedAt: new Date(),
          },
        });
      } else {
        // Create new settings
        settings = await prisma.userSettings.create({
          data: {
            userId: user.id,
            openaiApiKey: openaiApiKey || null,
            geminiApiKey: geminiApiKey || null,
            openaiMonthlyLimit: openaiMonthlyLimit || 100,
            geminiMonthlyLimit: geminiMonthlyLimit || 100,
          },
        });
      }
      
      // Return settings with masked API keys for security
      return res.status(200).json({
        ...settings,
        openaiApiKey: settings.openaiApiKey ? '••••••••' : null,
        geminiApiKey: settings.geminiApiKey ? '••••••••' : null,
      });
    } catch (error) {
      console.error('Error saving user settings:', error);
      return res.status(500).json({ error: 'Failed to save user settings' });
    }
  }
  
  // Handle unsupported methods
  return res.status(405).json({ error: 'Method not allowed' });
}