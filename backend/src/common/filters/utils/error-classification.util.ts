import { HttpStatus, HttpException } from '@nestjs/common';
import { QueryFailedError } from 'typeorm';

/**
 * Security-related HTTP status codes
 */
export const SECURITY_STATUSES = new Set([
  HttpStatus.UNAUTHORIZED,
  HttpStatus.FORBIDDEN,
  HttpStatus.TOO_MANY_REQUESTS,
]);

/**
 * Security-related keywords for error detection
 */
export const SECURITY_KEYWORDS = new Set([
  'unauthorized',
  'forbidden',
  'jwt',
  'token',
  'authentication',
  'authorization',
]);

/**
 * Check if error is security-related using optimized lookups
 */
export function isSecurityError(status: number, error: string): boolean {
  if (SECURITY_STATUSES.has(status)) {
    return true;
  }

  const lowerError = error.toLowerCase();
  return Array.from(SECURITY_KEYWORDS).some(keyword => lowerError.includes(keyword));
}

/**
 * Determine if bad request should be logged
 */
export function shouldLogBadRequest(exception: unknown): boolean {
  // Always log database-related bad requests
  if (exception instanceof QueryFailedError) {
    return true;
  }

  // Log security-related bad requests
  if (exception instanceof HttpException) {
    const response = exception.getResponse();
    const message = typeof response === 'object' ? JSON.stringify(response) : response;
    return isSecurityError(HttpStatus.BAD_REQUEST, message.toString());
  }

  return false;
}