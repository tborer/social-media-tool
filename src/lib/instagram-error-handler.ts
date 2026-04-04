/**
 * Instagram API Error Handler
 *
 * Maps Instagram Graph API error responses to appropriate HTTP status codes
 * with actionable error messages for the frontend.
 *
 * Reference: https://developers.facebook.com/docs/graph-api/guides/error-handling
 */

import type { NextApiResponse } from 'next';

export interface InstagramErrorResponse {
  status: number;
  body: {
    error: string;
    code: string;
    instagramError?: string;
    details?: any;
  };
}

/**
 * Map an Instagram Graph API error response to an appropriate HTTP response.
 * Call this when `response.ok === false` for an Instagram API call.
 *
 * @param status - HTTP status code returned by Instagram
 * @param errorData - Parsed JSON error body from Instagram (may be empty)
 */
export function mapInstagramError(status: number, errorData: any): InstagramErrorResponse {
  const igError = errorData?.error || {};
  const igErrorCode = igError.code;
  const igErrorSubcode = igError.error_subcode;
  const igErrorType = igError.type;
  const igErrorMessage = igError.message || 'Instagram API request failed';

  // OAuth/token errors: 190 (invalid token), 102 (session expired), 463/467 (expired/invalid)
  if (
    igErrorCode === 190 ||
    igErrorCode === 102 ||
    igErrorSubcode === 463 ||
    igErrorSubcode === 467 ||
    igErrorType === 'OAuthException' ||
    status === 401
  ) {
    return {
      status: 401,
      body: {
        error: 'Instagram access token is invalid or expired. Please reconnect your Instagram account.',
        code: 'TOKEN_INVALID',
        instagramError: igErrorMessage,
        details: errorData,
      },
    };
  }

  // Permission errors - usually means wrong account type (Business/Creator required)
  if (igErrorCode === 10 || igErrorCode === 200 || igErrorCode === 294 || status === 403) {
    return {
      status: 403,
      body: {
        error: 'Your Instagram account does not have permission for this action. A Business or Creator account may be required.',
        code: 'PERMISSION_DENIED',
        instagramError: igErrorMessage,
        details: errorData,
      },
    };
  }

  // Rate limiting
  if (igErrorCode === 4 || igErrorCode === 17 || igErrorCode === 32 || igErrorCode === 613 || status === 429) {
    return {
      status: 429,
      body: {
        error: 'Instagram API rate limit reached. Please try again later.',
        code: 'RATE_LIMITED',
        instagramError: igErrorMessage,
        details: errorData,
      },
    };
  }

  // Bad request - likely wrong fields for account type
  if (status === 400) {
    return {
      status: 400,
      body: {
        error: 'Instagram rejected the request. Your account may not support this operation (Business/Creator account required).',
        code: 'INVALID_REQUEST',
        instagramError: igErrorMessage,
        details: errorData,
      },
    };
  }

  // True upstream/gateway failure (5xx from Instagram)
  if (status >= 500) {
    return {
      status: 502,
      body: {
        error: 'Instagram API is currently unavailable. Please try again later.',
        code: 'INSTAGRAM_UNAVAILABLE',
        instagramError: igErrorMessage,
        details: errorData,
      },
    };
  }

  // Unknown error
  return {
    status: status || 500,
    body: {
      error: 'Instagram request failed',
      code: 'INSTAGRAM_ERROR',
      instagramError: igErrorMessage,
      details: errorData,
    },
  };
}

/**
 * Send an Instagram error response directly from an API handler.
 */
export function sendInstagramError(res: NextApiResponse, status: number, errorData: any) {
  const mapped = mapInstagramError(status, errorData);
  return res.status(mapped.status).json(mapped.body);
}
