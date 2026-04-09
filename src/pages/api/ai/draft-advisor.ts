import { NextApiRequest, NextApiResponse } from 'next';
import { createClient } from '@/util/supabase/api';
import OpenAI from 'openai';
import prisma from '@/lib/prisma';
import { getPerformanceSummary } from '@/lib/performance-analyzer';
import { logger } from '@/lib/server-logger';

/**
 * POST /api/ai/draft-advisor
 *
 * Analyzes a draft post (by postId or inline caption) and returns structured
 * JSON recommendations with per-platform notes, an overall score, and
 * actionable improvement suggestions.
 *
 * Body:
 *  - postId?: string          — fetch caption/media from an existing draft
 *  - caption?: string         — or provide a caption directly
 *  - targetPlatforms?: string[] — platforms to evaluate (default: all connected)
 */
export default async function handler(req: NextApiRequest, res: NextApiResponse) {
  if (req.method !== 'POST') {
    return res.status(405).json({ error: 'Method not allowed' });
  }

  const supabase = createClient(req, res);
  const { data: { user }, error: authError } = await supabase.auth.getUser();
  if (authError || !user) {
    return res.status(401).json({ error: 'Unauthorized' });
  }

  const { postId, caption: inlineCaption, targetPlatforms } = req.body;

  let caption: string;
  let imageUrl: string | null = null;
  let platforms: string[] = targetPlatforms || [];

  if (postId) {
    const post = await prisma.contentPost.findFirst({
      where: { id: postId, userId: user.id },
    });
    if (!post) {
      return res.status(404).json({ error: 'Post not found' });
    }
    caption = post.caption;
    imageUrl = post.imageUrl;
    if (platforms.length === 0) {
      platforms = post.targetPlatforms.length > 0 ? post.targetPlatforms : ['INSTAGRAM'];
    }
  } else if (inlineCaption) {
    caption = inlineCaption;
  } else {
    return res.status(400).json({ error: 'postId or caption is required' });
  }

  if (platforms.length === 0) platforms = ['INSTAGRAM'];

  try {
    const summary = await getPerformanceSummary(user.id);
    const userSettings = await prisma.userSettings.findUnique({ where: { userId: user.id } });
    const apiKey = userSettings?.openaiApiKey || process.env.OPENAI_API_KEY;
    if (!apiKey) {
      return res.status(400).json({ error: 'No OpenAI API key configured. Add one in Settings.' });
    }

    const openai = new OpenAI({ apiKey });

    // Build platform context
    const platformNotes = platforms.map((p) => {
      const stats = summary.platformStats.find((s) => s.platform === p);
      const avgEng = stats?.avgEngagement ?? summary.avgEngagement;
      return `${p}: avg engagement ${avgEng.toFixed(2)}%, avg likes ${stats?.avgLikes?.toFixed(0) ?? summary.avgLikes}`;
    }).join('\n');

    const systemPrompt = `You are an expert social media advisor. Analyze the user's draft caption and return structured JSON feedback.

User's performance context:
- Total posts: ${summary.totalPosts}
- Overall avg engagement: ${summary.avgEngagement.toFixed(2)}%
- Per-platform:
${platformNotes}
${summary.hashtagAnalysis.recommendedHashtags.length > 0 ? `- Top hashtags: ${summary.hashtagAnalysis.recommendedHashtags.slice(0, 8).join(', ')}` : ''}

Target platforms: ${platforms.join(', ')}

Respond ONLY with valid JSON in this exact format:
{
  "overallScore": <1-10 integer>,
  "summary": "One-sentence assessment of the draft",
  "recommendations": [
    {
      "category": "hook" | "cta" | "hashtags" | "tone" | "length" | "emoji" | "structure",
      "issue": "What's wrong or could be better",
      "suggestion": "Specific fix",
      "applyAction": "The exact replacement text to apply (or null if not applicable)",
      "impact": "high" | "medium" | "low"
    }
  ],
  "platformNotes": {
    "<PLATFORM>": "Platform-specific advice (character limits, formatting, hashtag strategy)"
  },
  "suggestedCaption": "A fully rewritten version incorporating all recommendations"
}`;

    const userMessage = `Draft caption:\n"${caption}"${imageUrl ? `\n\nPost has media attached: ${imageUrl}` : '\n\nNo media attached (text-only post)'}`;

    const completion = await openai.chat.completions.create({
      model: 'gpt-4o',
      messages: [
        { role: 'system', content: systemPrompt },
        { role: 'user', content: userMessage },
      ],
      temperature: 0.7,
      max_tokens: 1200,
      response_format: { type: 'json_object' },
    });

    const rawContent = completion.choices[0]?.message?.content ?? '{}';

    let parsed: Record<string, unknown>;
    try {
      parsed = JSON.parse(rawContent);
    } catch {
      logger.error('Failed to parse AI draft-advisor response', { rawContent, userId: user.id });
      return res.status(500).json({ error: 'AI returned invalid JSON. Please try again.' });
    }

    logger.info(`Draft advisor for user ${user.id}`, { platforms, postId });

    return res.status(200).json({
      postId: postId || null,
      targetPlatforms: platforms,
      originalCaption: caption,
      ...parsed,
    });
  } catch (error) {
    logger.error('Error in draft-advisor:', error, { userId: user.id });
    return res.status(500).json({
      error: 'Failed to generate draft advice',
      details: error instanceof Error ? error.message : 'Unknown error',
    });
  }
}
