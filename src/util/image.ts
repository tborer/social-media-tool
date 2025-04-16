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
    // For data URLs, we need to upload the image to a storage service
    // In this case, we'll use our own upload API
    
    // Extract the base64 data
    const matches = imageUrl.match(/^data:([A-Za-z-+/]+);base64,(.+)$/);
    
    if (!matches || matches.length !== 3) {
      throw new Error('Invalid data URL');
    }
    
    // Convert base64 to blob
    const contentType = matches[1];
    const base64Data = matches[2];
    const byteCharacters = atob(base64Data);
    const byteArrays = [];
    
    for (let offset = 0; offset < byteCharacters.length; offset += 512) {
      const slice = byteCharacters.slice(offset, offset + 512);
      
      const byteNumbers = new Array(slice.length);
      for (let i = 0; i < slice.length; i++) {
        byteNumbers[i] = slice.charCodeAt(i);
      }
      
      const byteArray = new Uint8Array(byteNumbers);
      byteArrays.push(byteArray);
    }
    
    const blob = new Blob(byteArrays, { type: contentType });
    
    // Create a file from the blob
    const file = new File([blob], `image-${Date.now()}.${getExtensionFromMimeType(contentType)}`, { type: contentType });
    
    // Create a FormData object to upload the file
    const formData = new FormData();
    formData.append('file', file);
    
    // Upload the file using our upload API
    const response = await fetch('/api/upload', {
      method: 'POST',
      body: formData,
    });
    
    if (!response.ok) {
      let errorMessage = 'Failed to upload image';
      try {
        const errorData = await response.json();
        errorMessage = errorData.error || errorMessage;
      } catch (jsonError) {
        console.error('Error parsing upload API response:', jsonError);
        errorMessage = `Upload failed with status: ${response.status} ${response.statusText}`;
      }
      throw new Error(errorMessage);
    }
    
    let data;
    try {
      data = await response.json();
    } catch (jsonError) {
      console.error('Error parsing upload response JSON:', jsonError);
      throw new Error('Invalid response from upload server');
    }
    
    if (!data || !data.url) {
      throw new Error('Upload server returned an invalid response');
    }
    
    return data.url;
  } catch (error) {
    console.error('Error processing image URL:', error);
    throw new Error(error instanceof Error ? error.message : 'Failed to process image URL');
  }
}

/**
 * Gets the file extension from a MIME type
 * @param mimeType The MIME type
 * @returns The file extension
 */
function getExtensionFromMimeType(mimeType: string): string {
  const extensions: Record<string, string> = {
    'image/jpeg': 'jpg',
    'image/jpg': 'jpg',
    'image/png': 'png',
    'image/gif': 'gif',
    'image/webp': 'webp',
    'image/svg+xml': 'svg',
    'image/bmp': 'bmp',
    'image/tiff': 'tiff',
  };
  
  return extensions[mimeType] || 'jpg';
}