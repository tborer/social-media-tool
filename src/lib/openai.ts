import { OpenAIClient } from './openai-client';

export async function generateCaption(prompt: string): Promise<string> {
  try {
    const client = new OpenAIClient();
    const response = await client.generateContent(prompt);
    return response.caption;
  } catch (error) {
    console.error('Error generating caption:', error);
    throw new Error('Failed to generate caption');
  }
}

export async function generateImages(prompt: string, count: number = 1): Promise<string[]> {
  try {
    const client = new OpenAIClient();
    const response = await client.generateImages(prompt, Math.min(count, 25));
    return response.images;
  } catch (error) {
    console.error('Error generating images:', error);
    throw new Error('Failed to generate images');
  }
}