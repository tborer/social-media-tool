import { Buffer } from 'buffer';
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

export class GeminiClient {
  private apiKey: string;
  private baseUrl: string = 'https://generativelanguage.googleapis.com/v1beta';
  private model: string = 'gemini-2.0-flash-exp-image-generation';

  constructor() {
    const defaultApiKey = process.env.GEMINI_API_KEY;
    if (!defaultApiKey) {
      throw new Error('GEMINI_API_KEY is not defined');
    }
    this.apiKey = defaultApiKey;
  }

  async initialize(userId?: string) {
    // If userId is provided, try to use the user's API key
    if (userId) {
      try {
        const userSettings = await prisma.userSettings.findUnique({
          where: { userId },
        });

        if (userSettings?.geminiApiKey) {
          this.apiKey = userSettings.geminiApiKey;
        }
      } catch (error) {
        console.error('Error initializing Gemini client with user API key:', error);
        // Fall back to default API key (already initialized)
      }
    }
  }

  async generateCaptionWithMessage(prompt: string, brandVoice?: BrandVoice): Promise<{ message: string, caption: string }> {
    try {
      const url = `${this.baseUrl}/models/gemini-1.5-pro:generateContent?key=${this.apiKey}`;
      const brandVoiceInstructions = brandVoice ? buildBrandVoiceInstructions(brandVoice) : '';

      const payload = {
        contents: [{
          parts: [
            {
              text: `Generate both a message analyzing the content request and a caption based on this prompt: "${prompt}".

              Your response should be in this format:

              MESSAGE:
              [A brief analysis of the content request, explaining what kind of content would work well for this prompt]

              CAPTION:
              [An engaging caption with relevant hashtags that would work well for a post based on this prompt]${brandVoiceInstructions}`
            }
          ]
        }],
        generationConfig: {
          temperature: 0.7,
          topP: 0.95,
          topK: 40,
          maxOutputTokens: 1024,
        }
      };

      const response = await fetch(url, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
        },
        body: JSON.stringify(payload),
      });

      if (!response.ok) {
        const errorData = await response.json();
        console.error('Gemini API error:', errorData);
        throw new Error(`Gemini API error: ${response.status} ${response.statusText}`);
      }

      const data = await response.json();

      // Extract text content
      let fullText = '';

      if (data.candidates && data.candidates.length > 0 && data.candidates[0].content) {
        const parts = data.candidates[0].content.parts || [];

        for (const part of parts) {
          if (part.text) {
            fullText += part.text;
          }
        }
      }

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
      console.error('Gemini API error:', error);
      throw new Error('Failed to generate content with Gemini');
    }
  }

  async generateContent(prompt: string, includeImage: boolean = true, style?: string, aspectRatio?: string): Promise<{ caption: string, imageBase64?: string }> {
    try {
      const url = `${this.baseUrl}/models/${this.model}:generateContent?key=${this.apiKey}`;

      const responseModalities = includeImage ? ["Text", "Image"] : ["Text"];

      // Build style and aspect ratio hints for the prompt
      const styleDescriptions: Record<string, string> = {
        photorealistic: 'photorealistic, high-quality photograph',
        artistic: 'artistic, painterly, creative illustration',
        cartoon: 'cartoon style, colorful, vector art',
        minimalist: 'minimalist, clean, simple, modern design',
        vintage: 'vintage, retro aesthetic, film grain',
        professional: 'professional, polished, corporate',
        cinematic: 'cinematic, dramatic lighting, movie-quality',
      };
      const aspectRatioHints: Record<string, string> = {
        square: 'square aspect ratio (1:1)',
        portrait: 'portrait aspect ratio (4:5)',
        landscape: 'landscape aspect ratio (16:9)',
        story: 'vertical story format (9:16)',
      };

      const styleHint = style && styleDescriptions[style] ? `, ${styleDescriptions[style]}` : '';
      const aspectHint = aspectRatio && aspectRatioHints[aspectRatio] ? `, ${aspectRatioHints[aspectRatio]}` : '';
      const enhancedPrompt = prompt + styleHint + aspectHint;

      const payload = {
        contents: [{
          parts: [
            { text: enhancedPrompt }
          ]
        }],
        generationConfig: { responseModalities }
      };

      const response = await fetch(url, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
        },
        body: JSON.stringify(payload),
      });

      if (!response.ok) {
        const errorData = await response.json();
        console.error('Gemini API error:', errorData);
        throw new Error(`Gemini API error: ${response.status} ${response.statusText}`);
      }

      const data = await response.json();

      // Extract text content
      let caption = '';
      let imageBase64 = '';

      if (data.candidates && data.candidates.length > 0 && data.candidates[0].content) {
        const parts = data.candidates[0].content.parts || [];

        for (const part of parts) {
          if (part.text) {
            caption += part.text;
          }
          if (part.inlineData && part.inlineData.data) {
            imageBase64 = part.inlineData.data;
          }
        }
      }

      return { caption, imageBase64 };
    } catch (error) {
      console.error('Gemini API error:', error);
      throw new Error('Failed to generate content with Gemini');
    }
  }

  async generateImages(prompt: string, count: number = 1, style?: string, aspectRatio?: string): Promise<{ images: string[] }> {
    try {
      // Gemini currently doesn't support generating multiple images in one request
      // So we'll make multiple requests if count > 1
      const imagePromises = Array(Math.min(count, 25)).fill(null).map(async () => {
        const result = await this.generateContent(prompt, true, style, aspectRatio);

        if (result.imageBase64) {
          return `data:image/png;base64,${result.imageBase64}`;
        }

        return '';
      });

      const images = await Promise.all(imagePromises);
      return { images: images.filter(img => img !== '') };
    } catch (error) {
      console.error('Gemini API error:', error);
      throw new Error('Failed to generate images with Gemini');
    }
  }
}
