import {
  Injectable,
  CanActivate,
  ExecutionContext,
  HttpException,
  HttpStatus,
  Logger,
  Inject,
} from '@nestjs/common';
import { Reflector } from '@nestjs/core';
import { Cache } from 'cache-manager';
import { CACHE_MANAGER } from '@nestjs/cache-manager';
import { Request } from 'express';

/**
 * Interface for rate limit options
 */
export interface RateLimitOptions {
  windowMs: number; // Time window in milliseconds
  maxAttempts: number; // Maximum number of attempts in the window
  blockDuration?: number; // Duration to block after exceeding limit (default: windowMs)
  keyGenerator?: (req: Request) => string; // Custom key generator
  skipSuccessfulRequests?: boolean; // Don't count successful requests
  skipFailedRequests?: boolean; // Don't count failed requests
}

/**
 * Rate limiting guard using Redis for distributed rate limiting
 * Provides protection against brute force attacks and API abuse
 */
@Injectable()
export class RateLimitGuard implements CanActivate {
  private readonly logger = new Logger(RateLimitGuard.name);

  constructor(
    private reflector: Reflector,
    @Inject(CACHE_MANAGER)
    private cacheManager: Cache,
  ) {}

  async canActivate(context: ExecutionContext): Promise<boolean> {
    const request = context.switchToHttp().getRequest<Request>();
    const response = context.switchToHttp().getResponse();

    // Get rate limit options from decorator metadata
    const rateLimitOptions = this.reflector.getAllAndOverride<RateLimitOptions>('rateLimit', [
      context.getHandler(),
      context.getClass(),
    ]);

    if (!rateLimitOptions) {
      // No rate limiting configured, allow through
      return true;
    }

    const key = this.generateKey(request, rateLimitOptions);
    const now = Date.now();
    const windowStart = now - rateLimitOptions.windowMs;

    try {
      // Get current attempts in the window
      const attempts = await this.getAttempts(key, windowStart, now);
      
      // Check if blocked
      const blockKey = `${key}:blocked`;
      const isBlocked = await this.cacheManager.get(blockKey);
      
      if (isBlocked) {
        this.logger.warn(`Rate limit exceeded for ${key} - request blocked`);
        this.setRateLimitHeaders(response, rateLimitOptions, attempts.length, 0);
        throw new HttpException(
          {
            statusCode: HttpStatus.TOO_MANY_REQUESTS,
            message: 'Too many requests. Please try again later.',
            error: 'Too Many Requests',
          },
          HttpStatus.TOO_MANY_REQUESTS,
        );
      }

      // Check if limit exceeded
      if (attempts.length >= rateLimitOptions.maxAttempts) {
        // Block the key
        const blockDuration = rateLimitOptions.blockDuration || rateLimitOptions.windowMs;
        await this.cacheManager.set(blockKey, true, blockDuration);
        
        this.logger.warn(
          `Rate limit exceeded for ${key}. Attempts: ${attempts.length}/${rateLimitOptions.maxAttempts}. Blocked for ${blockDuration}ms`
        );
        
        this.setRateLimitHeaders(response, rateLimitOptions, attempts.length, 0);
        throw new HttpException(
          {
            statusCode: HttpStatus.TOO_MANY_REQUESTS,
            message: 'Too many requests. Please try again later.',
            error: 'Too Many Requests',
            retryAfter: Math.ceil(blockDuration / 1000),
          },
          HttpStatus.TOO_MANY_REQUESTS,
        );
      }

      // Record this attempt
      await this.recordAttempt(key, now, rateLimitOptions.windowMs);

      // Set rate limit headers
      const remaining = Math.max(0, rateLimitOptions.maxAttempts - attempts.length - 1);
      this.setRateLimitHeaders(response, rateLimitOptions, attempts.length + 1, remaining);

      return true;
    } catch (error) {
      if (error instanceof HttpException) {
        throw error;
      }
      
      this.logger.error(`Rate limiting error for ${key}: ${error.message}`, error.stack);
      // On error, allow the request through (fail open)
      return true;
    }
  }

  /**
   * Generate cache key for rate limiting
   */
  private generateKey(request: Request, options: RateLimitOptions): string {
    if (options.keyGenerator) {
      return options.keyGenerator(request);
    }

    // Default key generation: IP + endpoint
    const ip = this.getClientIp(request);
    const endpoint = `${request.method}:${request.route?.path || request.path}`;
    return `rate_limit:${ip}:${endpoint}`;
  }

  /**
   * Get client IP address from request
   */
  private getClientIp(request: Request): string {
    return (
      (request.headers['x-forwarded-for'] as string)?.split(',')[0]?.trim() ||
      (request.headers['x-real-ip'] as string) ||
      request.connection?.remoteAddress ||
      request.socket?.remoteAddress ||
      'unknown'
    );
  }

  /**
   * Get attempts within the time window
   */
  private async getAttempts(key: string, windowStart: number, now: number): Promise<number[]> {
    const attemptsKey = `${key}:attempts`;
    const attempts = (await this.cacheManager.get(attemptsKey)) as number[] || [];
    
    // Filter attempts within the window
    return attempts.filter(timestamp => timestamp > windowStart);
  }

  /**
   * Record a new attempt
   */
  private async recordAttempt(key: string, timestamp: number, windowMs: number): Promise<void> {
    const attemptsKey = `${key}:attempts`;
    const attempts = (await this.cacheManager.get(attemptsKey)) as number[] || [];
    
    // Add new attempt
    attempts.push(timestamp);
    
    // Clean old attempts (keep only current window + a bit extra for safety)
    const cutoff = timestamp - windowMs * 2;
    const validAttempts = attempts.filter(t => t > cutoff);
    
    // Store attempts with TTL
    await this.cacheManager.set(attemptsKey, validAttempts, windowMs * 2);
  }

  /**
   * Set rate limiting headers in response
   */
  private setRateLimitHeaders(
    response: any,
    options: RateLimitOptions,
    used: number,
    remaining: number,
  ): void {
    response.setHeader('X-RateLimit-Limit', options.maxAttempts);
    response.setHeader('X-RateLimit-Remaining', remaining);
    response.setHeader('X-RateLimit-Used', used);
    response.setHeader('X-RateLimit-Window', Math.ceil(options.windowMs / 1000));
    
    if (remaining === 0) {
      const resetTime = Math.ceil((Date.now() + options.windowMs) / 1000);
      response.setHeader('X-RateLimit-Reset', resetTime);
      response.setHeader('Retry-After', Math.ceil(options.windowMs / 1000));
    }
  }
}