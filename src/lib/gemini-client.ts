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

  async generateCaptionWithMessage(prompt: string): Promise<{ message: string, caption: string }> {
    try {
      const url = `${this.baseUrl}/models/gemini-1.5-pro:generateContent?key=${this.apiKey}`;
      
      const payload = {
        contents: [{
          parts: [
            { 
              text: `Generate both a message analyzing the content request and an Instagram caption based on this prompt: "${prompt}".
              
              Your response should be in this format:
              
              MESSAGE:
              [A brief analysis of the content request, explaining what kind of content would work well for this prompt]
              
              CAPTION:
              [An engaging Instagram caption with relevant hashtags that would work well for a post based on this prompt]`
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
          // If format is not as expected, use the whole text as caption
          caption = messageParts[1].trim();
        }
      } else {
        // If format is not as expected, use the whole text as caption
        caption = fullText.trim();
      }

      return { message, caption };
    } catch (error) {
      console.error('Gemini API error:', error);
      throw new Error('Failed to generate content with Gemini');
    }
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
        
        if (result.imageBase64) {
          // Return actual image data URL for better user experience
          // Note: In production, you should upload this to a storage service
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