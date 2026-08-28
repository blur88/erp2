import { Injectable, Logger } from '@nestjs/common';
import type { Request } from 'express';
import { ErrorSanitizerService } from './error-sanitizer.service';
import { LogFormatterService } from './log-formatter.service';

@Injectable()
export class ErrorLoggerService {
  private readonly logger = new Logger(ErrorLoggerService.name);

  constructor(
    private readonly logFormatter: LogFormatterService,
    private readonly errorSanitizer: ErrorSanitizerService,
  ) {}

  logUnexpectedError(exception: unknown, requestId: string, request: Request): void {
    const logData = this.logFormatter.formatUnexpectedError(request, requestId);
    this.logger.error(`Unexpected error occurred: ${this.logFormatter.formatAsJson(logData)}`);

    if (process.env.NODE_ENV !== 'production') {
      const stack =
        exception instanceof Error ? this.errorSanitizer.sanitizeStackTrace(exception.stack) : 'No stack available';
      this.logger.debug(`Stack trace for request ${requestId}: ${stack}`);
    }
  }

  logSecurityError(status: number, error: string, request: Request, requestId?: string): void {
    const logData = this.logFormatter.formatSecurityError(status, error, request, requestId);
    this.logger.warn(`Security error detected: ${this.logFormatter.formatAsJson(logData)}`);
  }

  logApplicationError(
    status: number,
    message: string | object,
    request: Request,
    requestId?: string,
    isProduction = false,
  ): void {
    const logData = this.logFormatter.formatApplicationError(status, message, request, requestId, isProduction);
    this.logger.error(`HTTP ${status} Error: ${this.logFormatter.formatAsJson(logData)}`);
  }

  logDatabaseError(error: string, request: Request, requestId?: string): void {
    const baseContext = this.logFormatter.createLogContext(request, requestId);
    const logData = {
      ...baseContext,
      type: 'DatabaseError' as const,
      error: this.errorSanitizer.sanitizeErrorMessage(error),
    };
    this.logger.error(`Database Error: ${this.logFormatter.formatAsJson(logData)}`);
  }
}
