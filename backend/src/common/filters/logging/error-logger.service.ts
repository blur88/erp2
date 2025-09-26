import { Injectable, Logger } from '@nestjs/common';
import { Request } from 'express';
import { LogFormatterService } from './log-formatter.service';
import { DataSanitizerService } from '../security/data-sanitizer.service';

/**
 * Centralized error logging service
 */
@Injectable()
export class ErrorLoggerService {
  private readonly logger = new Logger(ErrorLoggerService.name);

  constructor(
    private readonly logFormatter: LogFormatterService,
    private readonly dataSanitizer: DataSanitizerService,
  ) {}

  /**
   * Log unexpected errors securely without exposing sensitive information
   */
  logUnexpectedError(exception: unknown, requestId: string, request: Request): void {
    const logData = this.logFormatter.formatUnexpectedError(request, requestId);
    
    this.logger.error(`Unexpected error occurred: ${this.logFormatter.formatAsJson(logData)}`);

    // Only log stack trace in development, and sanitize it
    if (process.env.NODE_ENV !== 'production') {
      const stack = exception instanceof Error 
        ? this.dataSanitizer.sanitizeStackTrace(exception.stack) 
        : 'No stack available';
      this.logger.debug(`Stack trace for request ${requestId}: ${stack}`);
    }
  }

  /**
   * Log security-related errors with sanitized information
   */
  logSecurityError(status: number, error: string, request: Request, requestId?: string): void {
    const logData = this.logFormatter.formatSecurityError(status, error, request, requestId);
    
    this.logger.warn(`Security error detected: ${this.logFormatter.formatAsJson(logData)}`);
  }

  /**
   * Log application errors with appropriate detail level
   */
  logApplicationError(
    status: number,
    message: string | object,
    request: Request,
    requestId?: string,
    isProduction = false,
  ): void {
    const logData = this.logFormatter.formatApplicationError(
      status,
      message,
      request,
      requestId,
      isProduction,
    );

    this.logger.error(`HTTP ${status} Error: ${this.logFormatter.formatAsJson(logData)}`);
  }

  /**
   * Log database errors with context
   */
  logDatabaseError(
    error: string,
    request: Request,
    requestId?: string,
  ): void {
    const baseContext = this.logFormatter.createLogContext(request, requestId);
    
    const logData = {
      ...baseContext,
      type: 'DatabaseError' as const,
      error: this.dataSanitizer.sanitizeErrorMessage(error),
    };

    this.logger.error(`Database Error: ${this.logFormatter.formatAsJson(logData)}`);
  }
}