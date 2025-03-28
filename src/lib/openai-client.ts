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

  async generateCaptionWithMessage(prompt: string): Promise<{ message: string, caption: string }> {
    try {
      const response = await this.client.chat.completions.create({
        model: 'gpt-4',
        messages: [
          {
            role: 'system',
            content: `You are a professional Instagram content creator. Generate both a message analyzing the content request and an Instagram caption based on the user's prompt.
            
            Your response should be in this format:
            
            MESSAGE:
            [A brief analysis of the content request, explaining what kind of content would work well for this prompt]
            
            CAPTION:
            [An engaging Instagram caption with relevant hashtags that would work well for a post based on this prompt]`
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
          // If format is not as expected, use the whole text as caption
          caption = messageParts[1].trim();
        }
      } else {
        // If format is not as expected, use the whole text as caption
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