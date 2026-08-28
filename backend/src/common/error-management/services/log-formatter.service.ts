import { Injectable } from '@nestjs/common';
import type { Request } from 'express';
import { ErrorSanitizerService } from './error-sanitizer.service';

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

@Injectable()
export class LogFormatterService {
  constructor(private readonly errorSanitizer: ErrorSanitizerService) {}

  createLogContext(request: Request, requestId?: string): LogContext {
    return {
      requestId,
      method: request.method,
      path: this.errorSanitizer.sanitizePath(request.url),
      timestamp: new Date().toISOString(),
      userAgent: this.errorSanitizer.sanitizeUserAgent(request.get('User-Agent')),
      ip: this.errorSanitizer.sanitizeIP(request.ip),
    };
  }

  formatSecurityError(status: number, error: string, request: Request, requestId?: string): ErrorLogData {
    return {
      ...this.createLogContext(request, requestId),
      type: 'SecurityError',
      status,
      error: this.errorSanitizer.sanitizeErrorMessage(error),
    };
  }

  formatUnexpectedError(request: Request, requestId: string): ErrorLogData {
    return {
      ...this.createLogContext(request, requestId),
      type: 'UnexpectedError',
      error: 'UnexpectedError',
    };
  }

  formatApplicationError(
    status: number,
    message: string | object,
    request: Request,
    requestId?: string,
    isProduction = false,
  ): ErrorLogData {
    const sanitizedMessage =
      typeof message === 'string' ? this.errorSanitizer.sanitizeErrorMessage(message) : '[OBJECT_MESSAGE]';
    return {
      ...this.createLogContext(request, requestId),
      type: 'ApplicationError',
      status,
      message: isProduction ? '[SANITIZED]' : sanitizedMessage,
    };
  }

  formatAsJson(logData: ErrorLogData): string {
    return JSON.stringify(logData);
  }
}
