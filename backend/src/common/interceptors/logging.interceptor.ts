import {
  Injectable,
  NestInterceptor,
  ExecutionContext,
  CallHandler,
  Logger,
} from '@nestjs/common';
import { Observable } from 'rxjs';
import { tap, catchError } from 'rxjs/operators';
import { Request, Response } from 'express';

/**
 * Logging Interceptor
 * Logs HTTP requests and responses for audit and debugging purposes
 */
@Injectable()
export class LoggingInterceptor implements NestInterceptor {
  private readonly logger = new Logger(LoggingInterceptor.name);

  intercept(context: ExecutionContext, next: CallHandler): Observable<any> {
    const request = context.switchToHttp().getRequest<Request>();
    const response = context.switchToHttp().getResponse<Response>();
    const { method, url, headers, body, ip } = request;
    
    const userAgent = headers['user-agent'] || '';
    const contentLength = headers['content-length'] || '0';
    const startTime = Date.now();
    
    // Get user info if available
    const user = (request as any).user;
    const userId = user?.userId || 'anonymous';
    const username = user?.username || 'anonymous';

    // Create request context
    const requestContext = {
      method,
      url,
      ip,
      userAgent,
      contentLength,
      userId,
      username,
      timestamp: new Date().toISOString(),
    };

    // Log request (exclude sensitive data)
    const sanitizedBody = this.sanitizeRequestBody(body, url);
    
    this.logger.log(
      `→ ${method} ${url} - User: ${username} (${userId}) - IP: ${ip} - Size: ${contentLength}B`,
    );

    if (sanitizedBody && Object.keys(sanitizedBody).length > 0) {
      this.logger.debug(`Request Body: ${JSON.stringify(sanitizedBody)}`);
    }

    return next.handle().pipe(
      tap((responseBody) => {
        const duration = Date.now() - startTime;
        const statusCode = response.statusCode;
        
        // Log successful response
        this.logger.log(
          `← ${statusCode} ${method} ${url} - User: ${username} - Duration: ${duration}ms`,
        );

        // Log response body for debugging (in development only)
        if (process.env.NODE_ENV === 'development' && this.shouldLogResponseBody(url)) {
          this.logger.debug(
            `Response Body: ${JSON.stringify(this.sanitizeResponseBody(responseBody))}`,
          );
        }

        // Log slow requests as warnings
        if (duration > 5000) { // 5 seconds
          this.logger.warn(
            `Slow request detected: ${method} ${url} took ${duration}ms - User: ${username}`,
          );
        }
      }),
      catchError((error) => {
        const duration = Date.now() - startTime;
        const statusCode = error.status || 500;
        
        // Log error response
        this.logger.error(
          `← ${statusCode} ${method} ${url} - User: ${username} - Duration: ${duration}ms - Error: ${error.message}`,
          error.stack,
        );

        // Re-throw the error so it can be handled by the exception filter
        throw error;
      }),
    );
  }

  /**
   * Sanitize request body to remove sensitive information
   */
  private sanitizeRequestBody(body: any, url: string): any {
    if (!body || typeof body !== 'object') {
      return body;
    }

    const sensitiveFields = [
      'password',
      'currentPassword',
      'newPassword',
      'confirmPassword',
      'token',
      'refreshToken',
      'accessToken',
      'secret',
      'key',
      'apiKey',
      'authorization',
    ];

    const sanitized = { ...body };

    // Remove sensitive fields
    sensitiveFields.forEach(field => {
      if (sanitized[field]) {
        sanitized[field] = '[REDACTED]';
      }
    });

    // For auth endpoints, be extra cautious
    if (url.includes('/auth/')) {
      if (sanitized.password) sanitized.password = '[REDACTED]';
      if (sanitized.username) {
        // Only show first 3 characters of username for privacy
        sanitized.username = sanitized.username.substring(0, 3) + '***';
      }
    }

    return sanitized;
  }

  /**
   * Sanitize response body to remove sensitive information
   */
  private sanitizeResponseBody(body: any): any {
    if (!body || typeof body !== 'object') {
      return body;
    }

    const sanitized = { ...body };

    // Remove sensitive fields from response
    const sensitiveFields = [
      'password',
      'accessToken',
      'refreshToken',
      'token',
      'secret',
      'key',
    ];

    sensitiveFields.forEach(field => {
      if (sanitized[field]) {
        sanitized[field] = '[REDACTED]';
      }
    });

    // Handle nested objects
    if (sanitized.tokens) {
      sanitized.tokens = {
        ...sanitized.tokens,
        accessToken: '[REDACTED]',
        refreshToken: '[REDACTED]',
      };
    }

    return sanitized;
  }

  /**
   * Determine if response body should be logged
   */
  private shouldLogResponseBody(url: string): boolean {
    // Don't log response bodies for these endpoints
    const excludePatterns = [
      '/auth/login',
      '/auth/refresh',
      '/users',
      '/upload',
      '/download',
    ];

    return !excludePatterns.some(pattern => url.includes(pattern));
  }
}