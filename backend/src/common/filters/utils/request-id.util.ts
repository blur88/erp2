import { randomUUID } from 'crypto';

/**
 * Generate a cryptographically secure unique request ID for tracking server errors
 */
function generateRequestId(): string {
  return randomUUID();
}

/**
 * Generate a fallback request ID when crypto operations fail
 */
function generateFallbackRequestId(): string {
  return `req_${Date.now()}_${Math.random().toString(36).substr(2, 9)}`;
}

/**
 * Generate a secure request ID with fallback handling
 */
export function generateSecureRequestId(): string {
  try {
    return generateRequestId();
  } catch (cryptoError) {
    return generateFallbackRequestId();
  }
}
