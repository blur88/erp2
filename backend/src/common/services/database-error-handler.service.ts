import { Injectable, Logger } from '@nestjs/common';
import { QueryFailedError } from 'typeorm';
import { randomUUID } from 'crypto';

/**
 * Database error types and their corresponding error codes
 */
export enum DatabaseErrorCode {
  DUPLICATE_ENTRY = 'DB_001',
  FOREIGN_KEY_VIOLATION = 'DB_002',
  NOT_NULL_VIOLATION = 'DB_003',
  CHECK_CONSTRAINT = 'DB_004',
  UNKNOWN_ERROR = 'DB_999',
}

/**
 * Standardized database error response
 */
export interface DatabaseErrorResponse {
  code: DatabaseErrorCode;
  message: string;
  requestId?: string;
}

/**
 * Service to handle database errors securely and consistently
 */
@Injectable()
export class DatabaseErrorHandler {
  private readonly logger = new Logger(DatabaseErrorHandler.name);

  /**
   * Secure constraint type mapping without exposing schema details
   */
  private readonly CONSTRAINT_MESSAGES = new Map<string, DatabaseErrorResponse>([
    ['duplicate', {
      code: DatabaseErrorCode.DUPLICATE_ENTRY,
      message: 'This value already exists. Please use a unique value.',
    }],
    ['foreign', {
      code: DatabaseErrorCode.FOREIGN_KEY_VIOLATION,
      message: 'Referenced record does not exist or has been removed.',
    }],
    ['null', {
      code: DatabaseErrorCode.NOT_NULL_VIOLATION,
      message: 'Required field is missing. Please provide all required information.',
    }],
    ['check', {
      code: DatabaseErrorCode.CHECK_CONSTRAINT,
      message: 'Invalid data format. Please check your input and try again.',
    }],
  ]);

  /**
   * Enhanced constraint patterns for better matching without exposing schema
   */
  private readonly CONSTRAINT_PATTERNS = new Set([
    'duplicate key',
    'foreign key',
    'not null',
    'check constraint',
    'violates',
    'constraint',
  ]);

  /**
   * Handle database errors securely with input validation
   */
  handleDatabaseError(error: QueryFailedError, isProduction = false): DatabaseErrorResponse {
    // Input validation
    if (!error || typeof error.message !== 'string') {
      return this.getGenericError(isProduction);
    }

    // Secure UUID generation with fallback
    let requestId: string;
    try {
      requestId = randomUUID();
    } catch (cryptoError) {
      this.logger.warn('Failed to generate UUID, using fallback');
      requestId = `req_${Date.now()}_${Math.random().toString(36).substr(2, 9)}`;
    }

    // Sanitize and validate error message length
    const rawMessage = error.message;
    if (rawMessage.length > 10000) {
      this.logger.warn(`Extremely long error message detected: ${requestId}`);
      return this.getGenericError(isProduction, requestId);
    }

    const errorMessage = rawMessage.toLowerCase();
    
    // Log detailed error internally for debugging (sanitized)
    this.logDatabaseError(error, requestId);

    // Determine constraint type using pattern matching
    const constraintType = this.getConstraintType(errorMessage);
    const errorResponse = this.CONSTRAINT_MESSAGES.get(constraintType) || {
      code: DatabaseErrorCode.UNKNOWN_ERROR,
      message: isProduction 
        ? 'Database operation failed. Please try again or contact support.'
        : 'An error occurred while processing your request.',
    };

    return {
      ...errorResponse,
      requestId,
    };
  }

  /**
   * Generate generic error response for invalid inputs or exceptions
   */
  private getGenericError(isProduction: boolean, requestId?: string): DatabaseErrorResponse {
    const fallbackId = requestId || `err_${Date.now()}`;
    return {
      code: DatabaseErrorCode.UNKNOWN_ERROR,
      message: isProduction 
        ? 'Database operation failed. Please try again or contact support.'
        : 'An error occurred while processing your request.',
      requestId: fallbackId,
    };
  }

  /**
   * Determine constraint type from error message without exposing schema details
   */
  private getConstraintType(errorMessage: string): string {
    if (errorMessage.includes('duplicate key') || errorMessage.includes('already exists')) {
      return 'duplicate';
    }
    
    if (errorMessage.includes('foreign key') || errorMessage.includes('violates foreign key')) {
      return 'foreign';
    }
    
    if (errorMessage.includes('not null') || errorMessage.includes('null value')) {
      return 'null';
    }
    
    if (errorMessage.includes('check constraint') || errorMessage.includes('violates check')) {
      return 'check';
    }

    return 'unknown';
  }

  /**
   * Securely log database errors without exposing sensitive information
   */
  private logDatabaseError(error: QueryFailedError, requestId: string): void {
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
        constraintType: this.getConstraintType(error.message?.toLowerCase() || ''),
        timestamp: new Date().toISOString(),
        // Only log error code and general type, not the full message
        errorCode: (error as any).code || 'UNKNOWN',
        severity: 'ERROR',
        messageLength: error.message?.length || 0,
        hasSensitiveInfo: this.containsSensitiveInfo(error.message || ''),
      };

      this.logger.error(
        `Database constraint violation: ${JSON.stringify(sanitizedLog)}`,
      );

      // In development, log more details but still sanitized and limited
      if (process.env.NODE_ENV !== 'production') {
        const sanitizedMessage = this.sanitizeErrorMessage(error.message || '');
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

  /**
   * Sanitize error messages to prevent information disclosure using ReDoS-safe patterns
   */
  private sanitizeErrorMessage(message: string): string {
    if (!message || typeof message !== 'string') {
      return '[INVALID_MESSAGE]';
    }

    // Limit processing to reasonable message length to prevent ReDoS
    if (message.length > 5000) {
      return '[MESSAGE_TOO_LONG]';
    }

    try {
      // Use simple, non-backtracking regex patterns to prevent ReDoS
      return message
        .replace(/table\s+"[a-zA-Z0-9_]{1,64}"/gi, 'table "[TABLE]"')
        .replace(/column\s+"[a-zA-Z0-9_]{1,64}"/gi, 'column "[COLUMN]"')
        .replace(/constraint\s+"[a-zA-Z0-9_]{1,64}"/gi, 'constraint "[CONSTRAINT]"')
        .replace(/Key\s+\([a-zA-Z0-9_,\s]{1,200}\)/gi, 'Key ([FIELDS])')
        .replace(/=\s*\([^)]{1,100}\)/gi, '=([VALUE])')
        // Additional sanitization for common database identifiers
        .replace(/index\s+"[a-zA-Z0-9_]{1,64}"/gi, 'index "[INDEX]"')
        .replace(/schema\s+"[a-zA-Z0-9_]{1,64}"/gi, 'schema "[SCHEMA]"')
        .replace(/database\s+"[a-zA-Z0-9_]{1,64}"/gi, 'database "[DATABASE]"');
    } catch (regexError) {
      this.logger.warn('Regex processing failed during message sanitization');
      return '[SANITIZATION_ERROR]';
    }
  }

  /**
   * Check if error contains sensitive database information using ReDoS-safe patterns
   */
  containsSensitiveInfo(message: string): boolean {
    if (!message || typeof message !== 'string') {
      return false;
    }

    // Limit processing to reasonable message length
    if (message.length > 5000) {
      return true; // Assume sensitive if unusually long
    }

    try {
      // Use simple, bounded regex patterns to prevent ReDoS
      const sensitivePatterns = [
        /table\s+"[a-zA-Z0-9_]{1,64}"/i,
        /column\s+"[a-zA-Z0-9_]{1,64}"/i,
        /constraint\s+"[a-zA-Z0-9_]{1,64}"/i,
        /Key\s+\([a-zA-Z0-9_,\s]{1,200}\)/i,
        /index\s+"[a-zA-Z0-9_]{1,64}"/i,
        /schema\s+"[a-zA-Z0-9_]{1,64}"/i,
      ];

      return sensitivePatterns.some(pattern => pattern.test(message));
    } catch (regexError) {
      this.logger.warn('Regex processing failed during sensitive info check');
      return true; // Assume sensitive on error to be safe
    }
  }
}