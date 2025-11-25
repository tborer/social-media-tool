/**
 * Instagram Video Validation Utility
 *
 * Validates video files against Instagram's requirements for Feed and Reels
 * Docs: https://developers.facebook.com/docs/instagram-api/reference/ig-user/media
 */

export interface VideoValidationResult {
  valid: boolean;
  errors: string[];
  warnings: string[];
  metadata?: VideoMetadata;
}

export interface VideoMetadata {
  duration?: number; // in seconds
  width?: number;
  height?: number;
  aspectRatio?: string;
  size: number; // in bytes
  format: string;
  codec?: string;
}

export enum VideoType {
  FEED = 'FEED',
  REELS = 'REELS',
}

// Instagram Video Requirements
const VIDEO_REQUIREMENTS = {
  FEED: {
    maxSize: 100 * 1024 * 1024, // 100MB
    minDuration: 3, // 3 seconds
    maxDuration: 60 * 60, // 60 minutes
    allowedFormats: ['video/mp4', 'video/quicktime', 'video/x-m4v'],
    allowedExtensions: ['.mp4', '.mov', '.m4v'],
    allowedAspectRatios: {
      '1:1': { min: 0.95, max: 1.05 }, // Square (1:1)
      '4:5': { min: 0.75, max: 0.85 }, // Portrait (4:5)
      '16:9': { min: 1.75, max: 1.8 }, // Landscape (16:9)
    },
    minWidth: 500,
    minHeight: 500,
    maxWidth: 1920,
    maxHeight: 1920,
  },
  REELS: {
    maxSize: 100 * 1024 * 1024, // 100MB
    minDuration: 3, // 3 seconds
    maxDuration: 90, // 90 seconds
    allowedFormats: ['video/mp4', 'video/quicktime', 'video/x-m4v'],
    allowedExtensions: ['.mp4', '.mov', '.m4v'],
    allowedAspectRatios: {
      '9:16': { min: 0.55, max: 0.58 }, // Vertical (9:16)
    },
    minWidth: 500,
    minHeight: 888,
    maxWidth: 1080,
    maxHeight: 1920,
  },
};

/**
 * Validate video file for Instagram
 * @param file - File object or file metadata
 * @param videoType - Type of video (FEED or REELS)
 * @returns Validation result
 */
export function validateVideoFile(
  file: File | VideoMetadata,
  videoType: VideoType = VideoType.FEED
): VideoValidationResult {
  const result: VideoValidationResult = {
    valid: true,
    errors: [],
    warnings: [],
  };

  const requirements = VIDEO_REQUIREMENTS[videoType];

  // Extract metadata
  const metadata: VideoMetadata = file instanceof File
    ? {
        size: file.size,
        format: file.type,
      }
    : file;

  result.metadata = metadata;

  // Validate file size
  if (metadata.size > requirements.maxSize) {
    result.errors.push(
      `Video file size (${formatBytes(metadata.size)}) exceeds maximum allowed size of ${formatBytes(requirements.maxSize)}`
    );
    result.valid = false;
  }

  // Validate format
  if (file instanceof File) {
    const extension = '.' + file.name.split('.').pop()?.toLowerCase();
    if (!requirements.allowedExtensions.includes(extension)) {
      result.errors.push(
        `Video format not supported. Allowed formats: ${requirements.allowedExtensions.join(', ')}`
      );
      result.valid = false;
    }

    if (!requirements.allowedFormats.includes(file.type)) {
      result.warnings.push(
        `Video MIME type (${file.type}) may not be supported. Recommended: ${requirements.allowedFormats.join(', ')}`
      );
    }
  }

  // Validate duration
  if (metadata.duration !== undefined) {
    if (metadata.duration < requirements.minDuration) {
      result.errors.push(
        `Video duration (${metadata.duration}s) is less than minimum required duration of ${requirements.minDuration}s`
      );
      result.valid = false;
    }

    if (metadata.duration > requirements.maxDuration) {
      result.errors.push(
        `Video duration (${metadata.duration}s) exceeds maximum allowed duration of ${requirements.maxDuration}s for ${videoType}`
      );
      result.valid = false;
    }

    // Warning for very short videos
    if (metadata.duration < 5) {
      result.warnings.push(
        'Video is very short. Consider making it at least 5 seconds for better engagement.'
      );
    }
  }

  // Validate dimensions and aspect ratio
  if (metadata.width && metadata.height) {
    const aspectRatio = metadata.width / metadata.height;
    metadata.aspectRatio = formatAspectRatio(aspectRatio);

    // Check minimum dimensions
    if (metadata.width < requirements.minWidth || metadata.height < requirements.minHeight) {
      result.errors.push(
        `Video dimensions (${metadata.width}x${metadata.height}) are below minimum required (${requirements.minWidth}x${requirements.minHeight})`
      );
      result.valid = false;
    }

    // Check maximum dimensions
    if (metadata.width > requirements.maxWidth || metadata.height > requirements.maxHeight) {
      result.warnings.push(
        `Video dimensions (${metadata.width}x${metadata.height}) exceed recommended maximum (${requirements.maxWidth}x${requirements.maxHeight}). Video may be resized.`
      );
    }

    // Check aspect ratio
    const validAspectRatio = Object.entries(requirements.allowedAspectRatios).some(
      ([ratio, range]) => {
        return aspectRatio >= range.min && aspectRatio <= range.max;
      }
    );

    if (!validAspectRatio) {
      const allowedRatios = Object.keys(requirements.allowedAspectRatios).join(', ');
      result.errors.push(
        `Video aspect ratio (${metadata.aspectRatio}) is not supported for ${videoType}. Allowed: ${allowedRatios}`
      );
      result.valid = false;
    }
  }

  return result;
}

/**
 * Get video metadata from File object
 * This uses the browser's video element to extract metadata
 * @param file - Video file
 * @returns Promise with video metadata
 */
export async function getVideoMetadata(file: File): Promise<VideoMetadata> {
  return new Promise((resolve, reject) => {
    const video = document.createElement('video');
    video.preload = 'metadata';

    video.onloadedmetadata = () => {
      window.URL.revokeObjectURL(video.src);
      resolve({
        duration: video.duration,
        width: video.videoWidth,
        height: video.videoHeight,
        aspectRatio: formatAspectRatio(video.videoWidth / video.videoHeight),
        size: file.size,
        format: file.type,
      });
    };

    video.onerror = () => {
      window.URL.revokeObjectURL(video.src);
      reject(new Error('Failed to load video metadata'));
    };

    video.src = URL.createObjectURL(file);
  });
}

/**
 * Validate video with metadata extraction
 * @param file - Video file
 * @param videoType - Type of video (FEED or REELS)
 * @returns Promise with validation result
 */
export async function validateVideoWithMetadata(
  file: File,
  videoType: VideoType = VideoType.FEED
): Promise<VideoValidationResult> {
  try {
    const metadata = await getVideoMetadata(file);
    return validateVideoFile(metadata, videoType);
  } catch (error) {
    return {
      valid: false,
      errors: ['Failed to extract video metadata: ' + (error instanceof Error ? error.message : 'Unknown error')],
      warnings: [],
    };
  }
}

/**
 * Determine recommended video type based on aspect ratio
 * @param aspectRatio - Video aspect ratio (width/height)
 * @returns Recommended video type
 */
export function getRecommendedVideoType(aspectRatio: number): VideoType {
  // Vertical videos (9:16) are best for Reels
  if (aspectRatio >= 0.55 && aspectRatio <= 0.58) {
    return VideoType.REELS;
  }
  // Everything else is better for Feed
  return VideoType.FEED;
}

/**
 * Format bytes to human-readable string
 * @param bytes - Number of bytes
 * @returns Formatted string
 */
function formatBytes(bytes: number): string {
  if (bytes === 0) return '0 Bytes';
  const k = 1024;
  const sizes = ['Bytes', 'KB', 'MB', 'GB'];
  const i = Math.floor(Math.log(bytes) / Math.log(k));
  return Math.round(bytes / Math.pow(k, i) * 100) / 100 + ' ' + sizes[i];
}

/**
 * Format aspect ratio to readable string
 * @param ratio - Aspect ratio (width/height)
 * @returns Formatted string
 */
function formatAspectRatio(ratio: number): string {
  // Common aspect ratios
  if (ratio >= 0.95 && ratio <= 1.05) return '1:1';
  if (ratio >= 0.75 && ratio <= 0.85) return '4:5';
  if (ratio >= 0.55 && ratio <= 0.58) return '9:16';
  if (ratio >= 1.75 && ratio <= 1.8) return '16:9';

  // Custom ratio
  return `${ratio.toFixed(2)}:1`;
}

/**
 * Check if file is a video
 * @param file - File to check
 * @returns true if file is a video
 */
export function isVideoFile(file: File): boolean {
  return file.type.startsWith('video/');
}

/**
 * Get video type requirements
 * @param videoType - Type of video
 * @returns Requirements object
 */
export function getVideoRequirements(videoType: VideoType) {
  return VIDEO_REQUIREMENTS[videoType];
}
