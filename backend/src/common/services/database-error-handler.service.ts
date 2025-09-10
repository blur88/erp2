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
   * Handle database errors securely
   */
  handleDatabaseError(error: QueryFailedError, isProduction = false): DatabaseErrorResponse {
    const requestId = randomUUID();
    const errorMessage = error.message.toLowerCase();
    
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
    // Create sanitized log entry
    const sanitizedLog = {
      requestId,
      errorType: 'DatabaseError',
      constraintType: this.getConstraintType(error.message.toLowerCase()),
      timestamp: new Date().toISOString(),
      // Only log error code and general type, not the full message
      errorCode: (error as any).code || 'UNKNOWN',
      severity: 'ERROR',
    };

    this.logger.error(
      `Database constraint violation: ${JSON.stringify(sanitizedLog)}`,
    );

    // In development, log more details but still sanitized
    if (process.env.NODE_ENV !== 'production') {
      this.logger.debug(`Full error details for request ${requestId}:`, {
        message: this.sanitizeErrorMessage(error.message),
        query: error.query ? '[QUERY_PRESENT]' : '[NO_QUERY]',
      });
    }
  }

  /**
   * Sanitize error messages to prevent information disclosure
   */
  private sanitizeErrorMessage(message: string): string {
    return message
      .replace(/table\s+"[\w_]+"/gi, 'table "[TABLE]"')
      .replace(/column\s+"[\w_]+"/gi, 'column "[COLUMN]"')
      .replace(/constraint\s+"[\w_]+"/gi, 'constraint "[CONSTRAINT]"')
      .replace(/Key\s+\([\w_,\s]+\)/gi, 'Key ([FIELDS])')
      .replace(/=\s*\([^)]+\)/gi, '=([VALUE])');
  }

  /**
   * Check if error contains sensitive database information
   */
  containsSensitiveInfo(message: string): boolean {
    const sensitivePatterns = [
      /table\s+"[\w_]+"/i,
      /column\s+"[\w_]+"/i,
      /constraint\s+"[\w_]+"/i,
      /Key\s+\([\w_,\s]+\)/i,
    ];

    return sensitivePatterns.some(pattern => pattern.test(message));
  }
}