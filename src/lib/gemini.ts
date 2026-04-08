import { GeminiClient } from './gemini-client';

type BrandVoice = {
  tone?: string | null;
  audience?: string | null;
  personality?: string | null;
  keyPhrases?: string[];
  avoidPhrases?: string[];
  examples?: string | null;
};

export async function generateCaption(prompt: string, brandVoice?: BrandVoice): Promise<{ message: string, caption: string }> {
  try {
    const client = new GeminiClient();
    const response = await client.generateCaptionWithMessage(prompt, brandVoice);
    return response;
  } catch (error) {
    console.error('Error generating caption:', error);
    throw new Error('Failed to generate caption');
  }
}

export async function generateImages(prompt: string, count: number = 1, style?: string, aspectRatio?: string): Promise<string[]> {
  try {
    const client = new GeminiClient();
    const response = await client.generateImages(prompt, Math.min(count, 25), style, aspectRatio);
    return response.images;
  } catch (error) {
    console.error('Error generating images:', error);
    throw new Error('Failed to generate images');
  }
}
