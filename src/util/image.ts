/**
 * Utility functions for handling images
 *
 * Improvements:
 * - Robust handling for large data URLs by converting to Blob via fetch(data:...)
 * - Optional client-side compression before upload (canvas)
 * - Always includes credentials when calling /api/upload to ensure auth
 * - Clear error messages and safe fallbacks
 */

type ProcessOptions = {
  // Enable/disable compression. Default: true for large images.
  compress?: boolean;
  // Max output dimensions when compressing
  maxWidth?: number;
  maxHeight?: number;
  // Output quality (0..1) for lossy formats
  quality?: number;
  // If provided, force output MIME type (e.g., 'image/webp' or 'image/jpeg')
  outputType?: string;
};

/**
 * Returns a short, uploaded URL for very long data URLs. If imageUrl is already short or not a data URL,
 * returns it unchanged.
 *
 * Typical usage:
 * const safeUrl = await processImageUrl(possibleDataUrl);
 */
export async function processImageUrl(imageUrl: string, options: ProcessOptions = {}): Promise<string> {
  // If not running in a browser, or URL is not a data URL, or short enough, return as-is
  if (typeof window === 'undefined' || !isDataUrl(imageUrl) || imageUrl.length < 2000) {
    return imageUrl;
  }

  const {
    compress = true,
    maxWidth = 2048,
    maxHeight = 2048,
    quality = 0.85,
    outputType,
  } = options;

  try {
    // Convert data URL to blob using fetch for robustness on large payloads
    let blob = await dataUrlToBlob(imageUrl);

    // Optionally compress large images
    const shouldCompress =
      compress && blob.type.startsWith('image/') && blob.size > 1.5 * 1024 * 1024; // >1.5MB

    if (shouldCompress) {
      try {
        blob = await compressImage(blob, { maxWidth, maxHeight, quality, outputType });
      } catch (compressionError) {
        console.warn('Image compression failed, proceeding with original blob:', compressionError);
      }
    }

    // Create a File for upload (preserve or infer extension from MIME type)
    const fileName = `image-${Date.now()}.${getExtensionFromMimeType(blob.type || 'image/jpeg')}`;
    const file = new File([blob], fileName, { type: blob.type || 'image/jpeg' });

    // Upload using our API (credentials included for auth)
    const formData = new FormData();
    formData.append('file', file);

    const response = await fetch('/api/upload', {
      method: 'POST',
      body: formData,
      credentials: 'include',
    });

    if (!response.ok) {
      // Try to parse error JSON, otherwise fall back to status text
      let errorMessage = 'Failed to upload image';
      try {
        const errorData = await response.json();
        errorMessage = errorData.error || errorMessage;
      } catch {
        if (response.status === 405) {
          errorMessage = 'Upload method not allowed. Please try again or contact support.';
        } else if (response.status === 401) {
          errorMessage = 'Unauthorized during upload. Please sign in again.';
        } else {
          errorMessage = `Upload failed: ${response.status} ${response.statusText}`;
        }
      }
      throw new Error(errorMessage);
    }

    let data: any;
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
 * Check if string is a data URL
 */
export function isDataUrl(url: string): boolean {
  return typeof url === 'string' && url.startsWith('data:');
}

/**
 * Convert a data URL to a Blob. Uses fetch for performance and memory efficiency.
 * Falls back to manual base64 decode if needed.
 */
async function dataUrlToBlob(dataUrl: string): Promise<Blob> {
  try {
    const res = await fetch(dataUrl);
    if (!res.ok) throw new Error(`fetch(data:) failed: ${res.status} ${res.statusText}`);
    return await res.blob();
  } catch (e) {
    // Fallback to manual parsing if fetch fails (rare)
    const matches = dataUrl.match(/^data:([A-Za-z-+/]+);base64,(.+)$/);
    if (!matches || matches.length !== 3) {
      throw new Error('Invalid data URL');
    }
    const contentType = matches[1];
    const base64Data = matches[2];
    const byteCharacters = atob(base64Data);
    const byteArrays: Uint8Array[] = [];

    for (let offset = 0; offset < byteCharacters.length; offset += 1024) {
      const slice = byteCharacters.slice(offset, offset + 1024);
      const byteNumbers = new Array(slice.length);
      for (let i = 0; i < slice.length; i++) {
        byteNumbers[i] = slice.charCodeAt(i);
      }
      byteArrays.push(new Uint8Array(byteNumbers));
    }
    return new Blob(byteArrays, { type: contentType });
  }
}

/**
 * Compress image Blob using canvas downscaling and re-encoding.
 */
async function compressImage(
  blob: Blob,
  opts: { maxWidth: number; maxHeight: number; quality: number; outputType?: string }
): Promise<Blob> {
  const { maxWidth, maxHeight, quality, outputType } = opts;

  // Create Image from Blob
  const objectUrl = URL.createObjectURL(blob);
  try {
    const img = await loadImage(objectUrl);

    // Compute target dimensions
    let { width, height } = img;
    if (width <= maxWidth && height <= maxHeight) {
      // No resize needed, just re-encode if requested
      return await encodeImage(img, blob.type, { quality, outputType });
    }

    const aspect = width / height;
    if (width > height) {
      width = Math.min(width, maxWidth);
      height = Math.round(width / aspect);
    } else {
      height = Math.min(height, maxHeight);
      width = Math.round(height * aspect);
    }

    // Draw to canvas
    const canvas = document.createElement('canvas');
    canvas.width = width;
    canvas.height = height;
    const ctx = canvas.getContext('2d');
    if (!ctx) throw new Error('Canvas 2D context not available');
    ctx.drawImage(img, 0, 0, width, height);

    // Encode
    const targetType = outputType || bestOutputType(blob.type);
    const encoded = await canvasToBlob(canvas, targetType, quality);
    return encoded || blob; // Fallback to original if encoding failed
  } finally {
    URL.revokeObjectURL(objectUrl);
  }
}

/**
 * Load HTMLImageElement from object URL
 */
function loadImage(src: string): Promise<HTMLImageElement> {
  return new Promise((resolve, reject) => {
    const img = new Image();
    img.onload = () => resolve(img);
    img.onerror = () => reject(new Error('Failed to load image for compression'));
    img.src = src;
  });
}

/**
 * Re-encode without resizing if needed
 */
async function encodeImage(
  img: HTMLImageElement,
  originalType: string,
  opts: { quality: number; outputType?: string }
): Promise<Blob> {
  const canvas = document.createElement('canvas');
  canvas.width = img.naturalWidth;
  canvas.height = img.naturalHeight;
  const ctx = canvas.getContext('2d');
  if (!ctx) throw new Error('Canvas 2D context not available');
  ctx.drawImage(img, 0, 0);

  const targetType = opts.outputType || bestOutputType(originalType);
  const out = await canvasToBlob(canvas, targetType, opts.quality);
  return out || new Blob([], { type: originalType });
}

/**
 * Canvas to Blob with a Promise wrapper and dataURL fallback
 */
function canvasToBlob(canvas: HTMLCanvasElement, type: string, quality: number): Promise<Blob | null> {
  return new Promise((resolve) => {
    if (canvas.toBlob) {
      canvas.toBlob(
        (blob) => resolve(blob),
        type,
        normalizeQuality(quality)
      );
    } else {
      try {
        const dataUrl = canvas.toDataURL(type, normalizeQuality(quality));
        // Convert dataURL to Blob
        dataUrlToBlob(dataUrl).then((b) => resolve(b)).catch(() => resolve(null));
      } catch {
        resolve(null);
      }
    }
  });
}

function normalizeQuality(q: number) {
  if (typeof q !== 'number' || isNaN(q)) return 0.85;
  return Math.min(1, Math.max(0.1, q));
}

/**
 * Choose best output type based on original type
 */
function bestOutputType(originalType: string): string {
  // Prefer original if already efficient
  if (originalType === 'image/webp') return 'image/webp';
  if (originalType === 'image/jpeg' || originalType === 'image/jpg') return 'image/jpeg';
  // PNG preserves transparency but larger; for photos, JPEG is better
  // Default to JPEG for social media images
  return 'image/jpeg';
}

/**
 * Gets the file extension from a MIME type
 * @param mimeType The MIME type
 * @returns The file extension
 */
export function getExtensionFromMimeType(mimeType: string): string {
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