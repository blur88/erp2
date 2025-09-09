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
    
    // Get business context for ERP operations
    const businessContext = this.getBusinessContext(url);

    // Create request context
    const requestContext = {
      method,
      url,
      ip,
      userAgent,
      contentLength,
      businessContext,
      timestamp: new Date().toISOString(),
    };

    // Log request (exclude sensitive data)
    const sanitizedBody = this.sanitizeRequestBody(body);
    
    this.logger.log(
      `→ ${method} ${url} [${businessContext}] - IP: ${ip} - Size: ${contentLength}B`,
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
          `← ${statusCode} ${method} ${url} [${businessContext}] - Duration: ${duration}ms`,
        );

        // Log response body for debugging (in development only)
        if (process.env.NODE_ENV === 'development' && this.shouldLogResponseBody(url)) {
          this.logger.debug(
            `Response Body: ${JSON.stringify(this.sanitizeResponseBody(responseBody))}`,
          );
        }

        // Log slow requests as warnings
        if (duration > 3000) { // 3 seconds for ERP operations
          this.logger.warn(
            `Slow ERP operation: ${method} ${url} [${businessContext}] took ${duration}ms`,
          );
        }

        // Log large requests
        if (parseInt(contentLength) > 1000000) { // 1MB
          this.logger.warn(`Large request: ${url} - Size: ${contentLength}B`);
        }
      }),
      catchError((error) => {
        const duration = Date.now() - startTime;
        const statusCode = error.status || 500;
        
        // Log error response
        this.logger.error(
          `← ${statusCode} ${method} ${url} [${businessContext}] - Duration: ${duration}ms - Error: ${error.message}`,
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
  private sanitizeRequestBody(body: any): any {
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

    // Add ERP-specific sensitive fields
    const erpSensitiveFields = [
      'cost',
      'wholesalePrice',
      'taxRate',
      'margin',
      'discount',
    ];

    erpSensitiveFields.forEach(field => {
      if (sanitized[field]) {
        sanitized[field] = '[REDACTED]';
      }
    });

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
   * Get business context for ERP operations
   */
  private getBusinessContext(url: string): string {
    if (url.includes('/inventory/')) return 'INVENTORY';
    if (url.includes('/sales/')) return 'SALES';
    if (url.includes('/dashboard/')) return 'DASHBOARD';
    if (url.includes('/users/')) return 'USERS';
    return 'GENERAL';
  }

  /**
   * Determine if response body should be logged
   */
  private shouldLogResponseBody(url: string): boolean {
    // Don't log response bodies for these endpoints
    const excludePatterns = [
      '/users',
      '/upload',
      '/download',
      '/inventory/products',
      '/api/health',
    ];

    return !excludePatterns.some(pattern => url.includes(pattern));
  }
}