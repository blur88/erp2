import { Injectable, Logger } from '@nestjs/common';
import { QueryFailedError } from 'typeorm';
import { DatabaseErrorResponse } from './error-types';
import { ErrorClassifierService } from './error-classifier.service';
import { DatabaseErrorLoggerService } from './error-logger.service';
import { IdGeneratorService } from './id-generator.service';

/**
 * Service to handle database errors securely and consistently
 */
@Injectable()
export class DatabaseErrorHandler {
  private readonly logger = new Logger(DatabaseErrorHandler.name);

  constructor(
    private readonly errorClassifier: ErrorClassifierService,
    private readonly errorLogger: DatabaseErrorLoggerService,
    private readonly idGenerator: IdGeneratorService,
  ) {}

  /**
   * Handle database errors securely with input validation
   */
  handleDatabaseError(error: QueryFailedError, isProduction = false): DatabaseErrorResponse {
    // Input validation
    if (!error || typeof error.message !== 'string') {
      return this.errorClassifier.getGenericError(isProduction);
    }

    // Generate secure request ID
    const requestId = this.idGenerator.generateRequestId();

    // Sanitize and validate error message length
    const rawMessage = error.message;
    if (rawMessage.length > 10000) {
      this.logger.warn(`Extremely long error message detected: ${requestId}`);
      return this.errorClassifier.getGenericError(isProduction, requestId);
    }

    const errorMessage = rawMessage.toLowerCase();
    
    // Log detailed error internally for debugging (sanitized)
    this.errorLogger.logDatabaseError(error, requestId);

    // Determine constraint type using pattern matching
    const constraintType = this.errorClassifier.getConstraintType(errorMessage);
    const errorResponse = this.errorClassifier.getErrorResponse(constraintType, isProduction);

    return {
      ...errorResponse,
      requestId,
    };
  }

  /**
   * Delegate to error sanitizer for compatibility
   */
  containsSensitiveInfo(message: string): boolean {
    return this.errorLogger['errorSanitizer'].containsSensitiveInfo(message);
  }
}