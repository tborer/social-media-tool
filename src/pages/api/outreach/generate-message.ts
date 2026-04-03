import { NextApiRequest, NextApiResponse } from 'next';
import { createClient } from '@/util/supabase/api';
import prisma from '@/lib/prisma';
import OpenAI from 'openai';

const TEMPLATE_PROMPTS: Record<string, string> = {
  introduction: 'Write a friendly introduction message to connect and start a relationship.',
  collaboration: 'Write a message proposing a collaboration or partnership opportunity.',
  product_pitch: 'Write a concise product pitch message that feels personal, not salesy.',
  follow_up: 'Write a warm follow-up message referencing a previous interaction.',
};

export default async function handler(req: NextApiRequest, res: NextApiResponse) {
  if (req.method !== 'POST') {
    return res.status(405).json({ error: 'Method not allowed' });
  }

  const supabase = createClient(req, res);
  const { data: { user }, error: authError } = await supabase.auth.getUser();

  if (authError || !user) {
    return res.status(401).json({ error: 'Unauthorized' });
  }

  try {
    const { contactId, templateType = 'introduction', customInstructions } = req.body;

    if (!contactId) {
      return res.status(400).json({ error: 'contactId is required' });
    }

    const contact = await prisma.contact.findFirst({
      where: { id: contactId, userId: user.id },
    });

    if (!contact) {
      return res.status(404).json({ error: 'Contact not found' });
    }

    const userSettings = await prisma.userSettings.findUnique({ where: { userId: user.id } });
    const apiKey = userSettings?.openaiApiKey || process.env.OPENAI_API_KEY;

    if (!apiKey) {
      return res.status(400).json({ error: 'No OpenAI API key configured. Set one in your user settings or contact an admin.' });
    }

    const openai = new OpenAI({ apiKey });

    const templatePrompt = TEMPLATE_PROMPTS[templateType] || TEMPLATE_PROMPTS.introduction;

    const profileInfo = [
      contact.igUsername && `Username: @${contact.igUsername}`,
      contact.displayName && `Name: ${contact.displayName}`,
      contact.niche && `Niche: ${contact.niche}`,
      contact.bio && `Bio: ${contact.bio}`,
      contact.followerCount && `Followers: ${contact.followerCount.toLocaleString()}`,
      contact.location && `Location: ${contact.location}`,
      contact.engagementRate && `Engagement Rate: ${contact.engagementRate}%`,
    ].filter(Boolean).join('\n');

    const prompt = `You are an expert at writing personalized Instagram DMs for outreach. ${templatePrompt}

Here is the contact's profile information:
${profileInfo}

Requirements:
- Keep it short (2-4 sentences max)
- Sound natural and human, not like a template
- Reference specific details from their profile to show you've done your research
- Include a clear but soft call to action
${customInstructions ? `\nAdditional instructions: ${customInstructions}` : ''}

Write only the message text, no subject line or greeting prefix.`;

    const completion = await openai.chat.completions.create({
      model: 'gpt-4',
      messages: [{ role: 'user', content: prompt }],
      max_tokens: 300,
      temperature: 0.8,
    });

    const messageBody = completion.choices[0]?.message?.content?.trim() || '';

    if (!messageBody) {
      return res.status(500).json({ error: 'Failed to generate message' });
    }

    return res.status(200).json({ messageBody, templateType });
  } catch (error) {
    console.error('Error generating message:', error);
    return res.status(500).json({ error: 'Failed to generate message' });
  }
}
