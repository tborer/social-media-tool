import OpenAI from 'openai';
import prisma from '@/lib/prisma';

type BrandVoice = {
  tone?: string | null;
  audience?: string | null;
  personality?: string | null;
  keyPhrases?: string[];
  avoidPhrases?: string[];
  examples?: string | null;
};

function buildBrandVoiceInstructions(brandVoice: BrandVoice): string {
  const parts: string[] = [];
  if (brandVoice.tone) parts.push(`Tone: ${brandVoice.tone}`);
  if (brandVoice.audience) parts.push(`Target audience: ${brandVoice.audience}`);
  if (brandVoice.personality) parts.push(`Brand personality: ${brandVoice.personality}`);
  if (brandVoice.keyPhrases?.length) parts.push(`Always incorporate these phrases or themes: ${brandVoice.keyPhrases.join(', ')}`);
  if (brandVoice.avoidPhrases?.length) parts.push(`Never use these words or phrases: ${brandVoice.avoidPhrases.join(', ')}`);
  if (brandVoice.examples) parts.push(`Example captions that match the desired voice:\n${brandVoice.examples}`);
  return parts.length > 0 ? `\n\nBrand voice guidelines:\n${parts.join('\n')}` : '';
}

export class OpenAIClient {
  private client: OpenAI;

  constructor(userId?: string) {
    this.client = new OpenAI({ apiKey: process.env.OPENAI_API_KEY });
  }

  async initialize(userId?: string) {
    // If userId is provided, try to use the user's API key
    if (userId) {
      try {
        const userSettings = await prisma.userSettings.findUnique({
          where: { userId },
        });

        if (userSettings?.openaiApiKey) {
          this.client = new OpenAI({ apiKey: userSettings.openaiApiKey });
        }
      } catch (error) {
        console.error('Error initializing OpenAI client with user API key:', error);
        // Fall back to default API key (already initialized)
      }
    }
  }

  async generateCaptionWithMessage(prompt: string, brandVoice?: BrandVoice): Promise<{ message: string, caption: string }> {
    try {
      const brandVoiceInstructions = brandVoice ? buildBrandVoiceInstructions(brandVoice) : '';
      const response = await this.client.chat.completions.create({
        model: 'gpt-4',
        messages: [
          {
            role: 'system',
            content: `You are a professional social media content creator. Generate both a message analyzing the content request and a caption based on the user's prompt.

            Your response should be in this format:

            MESSAGE:
            [A brief analysis of the content request, explaining what kind of content would work well for this prompt]

            CAPTION:
            [An engaging caption with relevant hashtags that would work well for a post based on this prompt]${brandVoiceInstructions}`
          },
          {
            role: 'user',
            content: prompt
          }
        ],
        max_tokens: 1000
      });

      const fullText = response.choices[0].message.content || '';

      // Parse the response to extract message and caption
      const messageParts = fullText.split('MESSAGE:');
      let message = '';
      let caption = '';

      if (messageParts.length > 1) {
        const captionParts = messageParts[1].split('CAPTION:');
        if (captionParts.length > 1) {
          message = captionParts[0].trim();
          caption = captionParts[1].trim();
        } else {
          caption = messageParts[1].trim();
        }
      } else {
        caption = fullText.trim();
      }

      return { message, caption };
    } catch (error) {
      console.error('OpenAI API error:', error);
      throw new Error('Failed to generate caption with OpenAI');
    }
  }

  async generateContent(prompt: string): Promise<{ caption: string }> {
    try {
      const response = await this.client.chat.completions.create({
        model: 'gpt-4',
        messages: [
          {
            role: 'system',
            content: 'You are a professional Instagram content creator. Create engaging, trendy captions for Instagram posts. Include relevant hashtags.'
          },
          {
            role: 'user',
            content: prompt
          }
        ],
        max_tokens: 500
      });

      return { caption: response.choices[0].message.content || '' };
    } catch (error) {
      console.error('OpenAI API error:', error);
      throw new Error('Failed to generate caption with OpenAI');
    }
  }

  async generateImages(prompt: string, count: number = 1, style?: string, aspectRatio?: string): Promise<{ images: string[] }> {
    try {
      // Ensure count is within limits (1-10 for DALL-E 3)
      const n = Math.min(Math.max(1, count), 10);

      // Map aspect ratio to DALL-E 3 supported sizes
      const sizeMap: Record<string, '1024x1024' | '1024x1792' | '1792x1024'> = {
        square: '1024x1024',
        portrait: '1024x1792',
        landscape: '1792x1024',
        story: '1024x1792',
      };
      const size = sizeMap[aspectRatio || 'square'] ?? '1024x1024';

      // Build style prefix for the prompt
      const styleDescriptions: Record<string, string> = {
        photorealistic: 'photorealistic, high-quality photograph,',
        artistic: 'artistic, painterly, creative illustration,',
        cartoon: 'cartoon style, colorful, vector art,',
        minimalist: 'minimalist, clean, simple, modern design,',
        vintage: 'vintage, retro aesthetic, film grain,',
        professional: 'professional, polished, corporate,',
        cinematic: 'cinematic, dramatic lighting, movie-quality,',
      };
      const stylePrefix = style && styleDescriptions[style] ? `${styleDescriptions[style]} ` : '';

      const response = await this.client.images.generate({
        model: 'dall-e-3',
        prompt: `${stylePrefix}Create an Instagram-worthy image: ${prompt}`,
        n,
        size,
      });

      return { images: response.data.map(item => item.url || '') };
    } catch (error) {
      console.error('OpenAI API error:', error);
      throw new Error('Failed to generate images with OpenAI');
    }
  }
}
