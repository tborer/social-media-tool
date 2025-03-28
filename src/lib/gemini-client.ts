import { Buffer } from 'buffer';

export class GeminiClient {
  private apiKey: string;
  private baseUrl: string = 'https://generativelanguage.googleapis.com/v1beta';
  private model: string = 'gemini-2.0-flash-exp-image-generation';

  constructor() {
    const apiKey = process.env.GEMINI_API_KEY;
    if (!apiKey) {
      throw new Error('GEMINI_API_KEY is not defined');
    }
    this.apiKey = apiKey;
  }

  async generateContent(prompt: string, includeImage: boolean = true): Promise<{ caption: string, imageBase64?: string }> {
    try {
      const url = `${this.baseUrl}/models/${this.model}:generateContent?key=${this.apiKey}`;
      
      const responseModalities = includeImage ? ["Text", "Image"] : ["Text"];
      
      const payload = {
        contents: [{
          parts: [
            { text: prompt }
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

  async generateImages(prompt: string, count: number = 1): Promise<{ images: string[] }> {
    try {
      // Gemini currently doesn't support generating multiple images in one request
      // So we'll make multiple requests if count > 1
      const imagePromises = Array(Math.min(count, 25)).fill(null).map(async () => {
        const result = await this.generateContent(prompt, true);
        return result.imageBase64 ? `data:image/png;base64,${result.imageBase64}` : '';
      });
      
      const images = await Promise.all(imagePromises);
      return { images: images.filter(img => img !== '') };
    } catch (error) {
      console.error('Gemini API error:', error);
      throw new Error('Failed to generate images with Gemini');
    }
  }
}