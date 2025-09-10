import {
  ExceptionFilter,
  Catch,
  ArgumentsHost,
  HttpException,
  HttpStatus,
  Logger,
  Injectable,
} from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { Request, Response } from 'express';
import { QueryFailedError } from 'typeorm';
import { randomUUID } from 'crypto';
import { DatabaseErrorHandler } from '@common/services/database-error-handler.service';

/**
 * Interface for HTTP exception response objects
 */
interface HttpExceptionResponse {
  message?: string | string[];
  error?: string;
  statusCode?: number;
}

/**
 * Interface for standardized error response
 */
interface StandardizedErrorResponse {
  statusCode: number;
  timestamp: string;
  path: string;
  method: string;
  error: string;
  message: string | object;
  code?: string;
  requestId?: string;
}

/**
 * Global HTTP Exception Filter
 * Handles all HTTP exceptions and provides consistent error responses
 */
@Catch()
@Injectable()
export class HttpExceptionFilter implements ExceptionFilter {
  private readonly logger = new Logger(HttpExceptionFilter.name);

  constructor(
    private readonly databaseErrorHandler: DatabaseErrorHandler,
    private readonly configService: ConfigService,
  ) {}

  catch(exception: unknown, host: ArgumentsHost): void {
    const ctx = host.switchToHttp();
    const response = ctx.getResponse<Response>();
    const request = ctx.getRequest<Request>();
    const isProduction = this.configService.get('NODE_ENV') === 'production';

    let status: number;
    let message: string | object;
    let error: string;
    let errorCode: string | undefined;
    let requestId: string | undefined;

    if (exception instanceof HttpException) {
      // Handle NestJS HTTP exceptions
      status = exception.getStatus();
      const exceptionResponse = exception.getResponse();
      
      if (typeof exceptionResponse === 'object') {
        const responseObj = exceptionResponse as HttpExceptionResponse;
        message = responseObj.message || exceptionResponse;
        error = responseObj.error || exception.name;
      } else {
        message = exceptionResponse;
        error = exception.name;
      }
    } else if (exception instanceof QueryFailedError) {
      // Handle database query errors using secure handler
      status = HttpStatus.BAD_REQUEST;
      const dbError = this.databaseErrorHandler.handleDatabaseError(exception, isProduction);
      message = dbError.message;
      error = 'Database Error';
      errorCode = dbError.code;
      requestId = dbError.requestId;
    } else {
      // Handle unexpected errors
      status = HttpStatus.INTERNAL_SERVER_ERROR;
      requestId = this.generateRequestId();
      message = isProduction 
        ? 'An unexpected error occurred. Please try again or contact support.' 
        : 'An unexpected error occurred';
      error = 'Internal Server Error';

      // Log unexpected errors securely
      this.logUnexpectedError(exception, requestId, request);
    }

    // Create standardized error response
    const errorResponse: StandardizedErrorResponse = {
      statusCode: status,
      timestamp: new Date().toISOString(),
      path: this.sanitizePath(request.url),
      method: request.method,
      error,
      message,
      ...(errorCode && { code: errorCode }),
      ...(requestId && { requestId }),
    };

    // Log security-related errors with sanitized data
    if (this.isSecurityError(status, error)) {
      this.logSecurityError(status, error, request, requestId);
    }

    // Log application errors (excluding validation spam)
    if (status !== HttpStatus.BAD_REQUEST || this.shouldLogBadRequest(exception)) {
      this.logApplicationError(status, message, request, requestId, isProduction);
    }

    response.status(status).json(errorResponse);
  }

  /**
   * Log unexpected errors securely without exposing sensitive information
   */
  private logUnexpectedError(exception: unknown, requestId: string, request: Request): void {
    const sanitizedLog = {
      requestId,
      errorType: 'UnexpectedError',
      method: request.method,
      path: this.sanitizePath(request.url),
      userAgent: this.sanitizeUserAgent(request.get('User-Agent')),
      timestamp: new Date().toISOString(),
    };

    this.logger.error(`Unexpected error occurred: ${JSON.stringify(sanitizedLog)}`);

    // Only log stack trace in development, and sanitize it
    if (!this.configService.get('NODE_ENV') || this.configService.get('NODE_ENV') !== 'production') {
      const stack = exception instanceof Error ? this.sanitizeStackTrace(exception.stack) : 'No stack available';
      this.logger.debug(`Stack trace for request ${requestId}: ${stack}`);
    }
  }

  /**
   * Log security-related errors with sanitized information
   */
  private logSecurityError(status: number, error: string, request: Request, requestId?: string): void {
    const securityLog = {
      requestId,
      type: 'SecurityError',
      status,
      error: this.sanitizeErrorMessage(error),
      method: request.method,
      path: this.sanitizePath(request.url),
      ip: this.sanitizeIP(request.ip),
      userAgent: this.sanitizeUserAgent(request.get('User-Agent')),
      timestamp: new Date().toISOString(),
    };

    this.logger.warn(`Security error detected: ${JSON.stringify(securityLog)}`);
  }

  /**
   * Log application errors with appropriate detail level
   */
  private logApplicationError(
    status: number,
    message: string | object,
    request: Request,
    requestId?: string,
    isProduction = false,
  ): void {
    const sanitizedMessage = typeof message === 'string' 
      ? this.sanitizeErrorMessage(message)
      : '[OBJECT_MESSAGE]';

    const errorLog = {
      requestId,
      status,
      method: request.method,
      path: this.sanitizePath(request.url),
      message: isProduction ? '[SANITIZED]' : sanitizedMessage,
      timestamp: new Date().toISOString(),
    };

    this.logger.error(`HTTP ${status} Error: ${JSON.stringify(errorLog)}`);
  }

  /**
   * Check if error is security-related using optimized lookups
   */
  private readonly SECURITY_STATUSES = new Set([
    HttpStatus.UNAUTHORIZED,
    HttpStatus.FORBIDDEN,
    HttpStatus.TOO_MANY_REQUESTS,
  ]);

  private readonly SECURITY_KEYWORDS = new Set([
    'unauthorized',
    'forbidden',
    'jwt',
    'token',
    'authentication',
    'authorization',
  ]);

  private isSecurityError(status: number, error: string): boolean {
    if (this.SECURITY_STATUSES.has(status)) {
      return true;
    }

    const lowerError = error.toLowerCase();
    return Array.from(this.SECURITY_KEYWORDS).some(keyword => lowerError.includes(keyword));
  }

  /**
   * Determine if bad request should be logged
   */
  private shouldLogBadRequest(exception: unknown): boolean {
    // Always log database-related bad requests
    if (exception instanceof QueryFailedError) {
      return true;
    }

    // Log security-related bad requests
    if (exception instanceof HttpException) {
      const response = exception.getResponse();
      const message = typeof response === 'object' ? JSON.stringify(response) : response;
      return this.isSecurityError(HttpStatus.BAD_REQUEST, message.toString());
    }

    return false;
  }

  /**
   * Sanitization utilities for secure logging
   */
  private sanitizePath(path: string): string {
    // Remove potential sensitive parameters but keep structure
    return path.replace(/([?&])(password|token|key|secret)=[^&]*/gi, '$1$2=[REDACTED]');
  }

  private sanitizeIP(ip: string): string {
    if (!ip) return '[UNKNOWN]';
    // Mask last octet for IPv4, last groups for IPv6
    if (ip.includes('.')) {
      return ip.replace(/\d+$/, 'xxx');
    }
    return ip.replace(/:([^:]+):([^:]+)$/, ':xxx:xxx');
  }

  private sanitizeUserAgent(userAgent: string): string {
    if (!userAgent) return '[UNKNOWN]';
    // Keep browser info but remove detailed version numbers
    return userAgent.replace(/\d+\.\d+\.\d+/g, 'x.x.x');
  }

  private sanitizeErrorMessage(message: string): string {
    return message
      .replace(/password\s*=\s*[^\s]+/gi, 'password=[REDACTED]')
      .replace(/token\s*=\s*[^\s]+/gi, 'token=[REDACTED]')
      .replace(/key\s*=\s*[^\s]+/gi, 'key=[REDACTED]')
      .replace(/secret\s*=\s*[^\s]+/gi, 'secret=[REDACTED]');
  }

  private sanitizeStackTrace(stack: string): string {
    if (!stack) return '[NO_STACK]';
    // Remove potential file paths and keep only relevant error info
    return stack
      .split('\n')
      .slice(0, 5) // Limit stack trace length
      .map(line => line.replace(/\/[^\s]+\//g, '/[PATH]/'))
      .join('\n');
  }

  /**
   * Generate a cryptographically secure unique request ID for tracking server errors
   */
  private generateRequestId(): string {
    return randomUUID();
  }
}