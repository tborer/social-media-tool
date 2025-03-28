import { GeminiClient } from './gemini-client';

export async function generateCaption(prompt: string): Promise<{ message: string, caption: string }> {
  try {
    const client = new GeminiClient();
    const response = await client.generateCaptionWithMessage(prompt);
    return response;
  } catch (error) {
    console.error('Error generating caption:', error);
    throw new Error('Failed to generate caption');
  }
}

export async function generateImages(prompt: string, count: number = 1): Promise<string[]> {
  try {
    const client = new GeminiClient();
    const response = await client.generateImages(prompt, Math.min(count, 25));
    return response.images;
  } catch (error) {
    console.error('Error generating images:', error);
    throw new Error('Failed to generate images');
  }
}