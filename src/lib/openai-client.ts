import OpenAI from 'openai';

export class OpenAIClient {
  private client: OpenAI;

  constructor() {
    const apiKey = process.env.OPENAI_API_KEY;
    if (!apiKey) {
      throw new Error('OPENAI_API_KEY is not defined');
    }
    this.client = new OpenAI({ apiKey });
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

  async generateImages(prompt: string, count: number = 1): Promise<{ images: string[] }> {
    try {
      // Ensure count is within limits (1-10 for DALL-E 3)
      const n = Math.min(Math.max(1, count), 10);
      
      const response = await this.client.images.generate({
        model: 'dall-e-3',
        prompt: `Create an Instagram-worthy image: ${prompt}`,
        n,
        size: '1024x1024',
      });

      return { images: response.data.map(item => item.url || '') };
    } catch (error) {
      console.error('OpenAI API error:', error);
      throw new Error('Failed to generate images with OpenAI');
    }
  }
}