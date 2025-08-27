import { SetMetadata, applyDecorators } from '@nestjs/common';
import { UseGuards } from '@nestjs/common';
import { RateLimitGuard, RateLimitOptions } from '../guards/rate-limit.guard';

/**
 * Rate limiting decorator
 * Apply to controllers or methods to enable rate limiting
 */
export const RateLimit = (options: RateLimitOptions) => {
  return applyDecorators(
    SetMetadata('rateLimit', options),
    UseGuards(RateLimitGuard),
  );
};

/**
 * Predefined rate limiting configurations for common use cases
 */
export const RateLimitPresets = {
  /**
   * Strict rate limiting for authentication endpoints
   * 5 attempts per 15 minutes, blocks for 30 minutes
   */
  AUTH_STRICT: {
    windowMs: 15 * 60 * 1000, // 15 minutes
    maxAttempts: 5,
    blockDuration: 30 * 60 * 1000, // 30 minutes
  } as RateLimitOptions,

  /**
   * Moderate rate limiting for password reset
   * 3 attempts per hour
   */
  PASSWORD_RESET: {
    windowMs: 60 * 60 * 1000, // 1 hour
    maxAttempts: 3,
    blockDuration: 60 * 60 * 1000, // 1 hour
    keyGenerator: (req) => `password_reset:${req.ip}:${req.body?.email || 'unknown'}`,
  } as RateLimitOptions,

  /**
   * General API rate limiting
   * 100 requests per minute
   */
  API_GENERAL: {
    windowMs: 60 * 1000, // 1 minute
    maxAttempts: 100,
    blockDuration: 5 * 60 * 1000, // 5 minutes
  } as RateLimitOptions,

  /**
   * User creation rate limiting
   * 5 registrations per hour per IP
   */
  USER_CREATION: {
    windowMs: 60 * 60 * 1000, // 1 hour
    maxAttempts: 5,
    blockDuration: 2 * 60 * 60 * 1000, // 2 hours
  } as RateLimitOptions,
};