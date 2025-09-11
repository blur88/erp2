import { Injectable, Logger } from '@nestjs/common';
import { QueryFailedError } from 'typeorm';
import { ErrorClassifierService } from './error-classifier.service';
import { ErrorSanitizerService } from './error-sanitizer.service';

@Injectable()
export class ErrorLoggerService {
  private readonly logger = new Logger(ErrorLoggerService.name);

  constructor(
    private readonly errorClassifier: ErrorClassifierService,
    private readonly errorSanitizer: ErrorSanitizerService,
  ) {}

  /**
   * Securely log database errors without exposing sensitive information
   */
  logDatabaseError(error: QueryFailedError, requestId: string): void {
    try {
      // Validate inputs
      if (!error || !requestId) {
        this.logger.warn('Invalid parameters passed to logDatabaseError');
        return;
      }

      // Create sanitized log entry
      const sanitizedLog = {
        requestId,
        errorType: 'DatabaseError',
        constraintType: this.errorClassifier.getConstraintType(error.message?.toLowerCase() || ''),
        timestamp: new Date().toISOString(),
        // Only log error code and general type, not the full message
        errorCode: (error as any).code || 'UNKNOWN',
        severity: 'ERROR',
        messageLength: error.message?.length || 0,
        hasSensitiveInfo: this.errorSanitizer.containsSensitiveInfo(error.message || ''),
      };

      this.logger.error(
        `Database constraint violation: ${JSON.stringify(sanitizedLog)}`,
      );

      // In development, log more details but still sanitized and limited
      if (process.env.NODE_ENV !== 'production') {
        const sanitizedMessage = this.errorSanitizer.sanitizeErrorMessage(error.message || '');
        const debugInfo = {
          message: sanitizedMessage.substring(0, 500), // Limit debug message length
          query: error.query ? '[QUERY_PRESENT]' : '[NO_QUERY]',
          queryLength: error.query?.length || 0,
        };
        
        this.logger.debug(`Debug details for request ${requestId}:`, debugInfo);
      }
    } catch (loggingError) {
      // Prevent logging failures from crashing the error handler
      this.logger.warn(`Failed to log database error for request ${requestId}: ${loggingError.message}`);
    }
  }
}