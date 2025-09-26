import { Injectable, HttpStatus } from '@nestjs/common';
import { QueryFailedError } from 'typeorm';
import { DatabaseErrorHandler } from '../../services/database-error-handler.service';

export interface DatabaseExceptionResult {
  status: number;
  message: string;
  error: string;
  errorCode?: string;
  requestId?: string;
}

/**
 * Handler for database-related exceptions
 */
@Injectable()
export class DatabaseExceptionHandler {
  constructor(private readonly databaseErrorHandler: DatabaseErrorHandler) {}

  /**
   * Process database exceptions using the existing database error handler
   */
  handle(exception: QueryFailedError, isProduction = false): DatabaseExceptionResult {
    const dbError = this.databaseErrorHandler.handleDatabaseError(exception, isProduction);
    
    return {
      status: HttpStatus.BAD_REQUEST,
      message: dbError.message,
      error: 'Database Error',
      errorCode: dbError.code,
      requestId: dbError.requestId,
    };
  }

  /**
   * Check if exception is a database exception
   */
  canHandle(exception: unknown): exception is QueryFailedError {
    return exception instanceof QueryFailedError;
  }
}