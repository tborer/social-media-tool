/**
 * Utility functions for handling images
 */

/**
 * Processes an image URL to ensure it's not too long
 * If it's a data URL (base64), it extracts the data and returns a shorter URL
 * @param imageUrl The original image URL
 * @returns A processed image URL that is shorter
 */
export async function processImageUrl(imageUrl: string): Promise<string> {
  // If the URL is not a data URL or is already short enough, return it as is
  if (!imageUrl.startsWith('data:') || imageUrl.length < 2000) {
    return imageUrl;
  }

  try {
    // For data URLs, we'll extract the data and upload it to an image hosting service
    // For this example, we'll simulate this by returning a shortened URL
    // In a real implementation, you would upload the image to a storage service like Supabase Storage
    
    // Extract the base64 data
    const matches = imageUrl.match(/^data:([A-Za-z-+/]+);base64,(.+)$/);
    
    if (!matches || matches.length !== 3) {
      throw new Error('Invalid data URL');
    }
    
    // In a real implementation, you would upload the image to a storage service
    // and return the URL to the uploaded image
    // For now, we'll return a placeholder URL
    return `https://example.com/image-${Date.now()}.jpg`;
    
    // TODO: Replace with actual image upload code
    // Example with Supabase Storage:
    // const { data, error } = await supabase.storage
    //   .from('images')
    //   .upload(`image-${Date.now()}.jpg`, decode(matches[2]), {
    //     contentType: matches[1],
    //   });
    // 
    // if (error) throw error;
    // 
    // return supabase.storage.from('images').getPublicUrl(data.path).publicUrl;
  } catch (error) {
    console.error('Error processing image URL:', error);
    throw new Error('Failed to process image URL');
  }
}