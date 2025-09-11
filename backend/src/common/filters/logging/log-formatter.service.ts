import { Injectable } from '@nestjs/common';
import { Request } from 'express';
import { DataSanitizerService } from '../security/data-sanitizer.service';

export interface LogContext {
  requestId?: string;
  method: string;
  path: string;
  timestamp: string;
  userAgent?: string;
  ip?: string;
}

export interface ErrorLogData extends LogContext {
  status?: number;
  error?: string;
  message?: string;
  type: 'SecurityError' | 'UnexpectedError' | 'ApplicationError' | 'DatabaseError';
}

/**
 * Service for formatting log messages consistently
 */
@Injectable()
export class LogFormatterService {
  constructor(private readonly dataSanitizer: DataSanitizerService) {}

  /**
   * Create base log context from request
   */
  createLogContext(request: Request, requestId?: string): LogContext {
    return {
      requestId,
      method: request.method,
      path: this.dataSanitizer.sanitizePath(request.url),
      timestamp: new Date().toISOString(),
      userAgent: this.dataSanitizer.sanitizeUserAgent(request.get('User-Agent')),
      ip: this.dataSanitizer.sanitizeIP(request.ip),
    };
  }

  /**
   * Format security error log
   */
  formatSecurityError(
    status: number,
    error: string,
    request: Request,
    requestId?: string,
  ): ErrorLogData {
    const baseContext = this.createLogContext(request, requestId);
    
    return {
      ...baseContext,
      type: 'SecurityError',
      status,
      error: this.dataSanitizer.sanitizeErrorMessage(error),
    };
  }

  /**
   * Format unexpected error log
   */
  formatUnexpectedError(
    request: Request,
    requestId: string,
  ): ErrorLogData {
    const baseContext = this.createLogContext(request, requestId);
    
    return {
      ...baseContext,
      type: 'UnexpectedError',
      error: 'UnexpectedError',
    };
  }

  /**
   * Format application error log
   */
  formatApplicationError(
    status: number,
    message: string | object,
    request: Request,
    requestId?: string,
    isProduction = false,
  ): ErrorLogData {
    const baseContext = this.createLogContext(request, requestId);
    
    const sanitizedMessage = typeof message === 'string' 
      ? this.dataSanitizer.sanitizeErrorMessage(message)
      : '[OBJECT_MESSAGE]';

    return {
      ...baseContext,
      type: 'ApplicationError',
      status,
      message: isProduction ? '[SANITIZED]' : sanitizedMessage,
    };
  }

  /**
   * Format log data as JSON string
   */
  formatAsJson(logData: ErrorLogData): string {
    return JSON.stringify(logData);
  }
}