import {
  ExceptionFilter,
  Catch,
  ArgumentsHost,
  HttpException,
  HttpStatus,
  Logger,
} from '@nestjs/common';
import { Request, Response } from 'express';
import { QueryFailedError } from 'typeorm';

/**
 * Global HTTP Exception Filter
 * Handles all HTTP exceptions and provides consistent error responses
 */
@Catch()
export class HttpExceptionFilter implements ExceptionFilter {
  private readonly logger = new Logger(HttpExceptionFilter.name);

  catch(exception: unknown, host: ArgumentsHost): void {
    const ctx = host.switchToHttp();
    const response = ctx.getResponse<Response>();
    const request = ctx.getRequest<Request>();

    let status: number;
    let message: string | object;
    let error: string;

    if (exception instanceof HttpException) {
      // Handle NestJS HTTP exceptions
      status = exception.getStatus();
      const exceptionResponse = exception.getResponse();
      
      if (typeof exceptionResponse === 'object') {
        message = (exceptionResponse as any).message || exceptionResponse;
        error = (exceptionResponse as any).error || exception.name;
      } else {
        message = exceptionResponse;
        error = exception.name;
      }
    } else if (exception instanceof QueryFailedError) {
      // Handle database query errors
      status = HttpStatus.BAD_REQUEST;
      message = this.handleDatabaseError(exception);
      error = 'Database Error';
    } else {
      // Handle unexpected errors
      status = HttpStatus.INTERNAL_SERVER_ERROR;
      message = 'An unexpected error occurred';
      error = 'Internal Server Error';

      // Log unexpected errors
      this.logger.error(
        `Unexpected error: ${exception}`,
        exception instanceof Error ? exception.stack : undefined,
      );
    }

    // Security: Don't expose sensitive information in production
    if (process.env.NODE_ENV === 'production' && status === HttpStatus.INTERNAL_SERVER_ERROR) {
      message = 'An unexpected error occurred';
    }

    // Create standardized error response
    const errorResponse = {
      statusCode: status,
      timestamp: new Date().toISOString(),
      path: request.url,
      method: request.method,
      error,
      message,
      ...(status >= 500 && { requestId: this.generateRequestId() }),
    };

    // Log security-related errors
    if (this.isSecurityError(status, error)) {
      this.logger.warn(
        `Security error: ${status} ${error} - ${request.method} ${request.url} - IP: ${request.ip} - User-Agent: ${request.get('User-Agent')}`,
      );
    }

    // Log all errors except validation errors (400) to avoid spam
    if (status !== HttpStatus.BAD_REQUEST || this.shouldLogBadRequest(exception)) {
      this.logger.error(
        `HTTP ${status} Error: ${JSON.stringify(message)} - ${request.method} ${request.url}`,
        exception instanceof Error ? exception.stack : undefined,
      );
    }

    response.status(status).json(errorResponse);
  }

  /**
   * Handle database-specific errors
   */
  private handleDatabaseError(error: QueryFailedError): string {
    const message = error.message;

    // Handle common database constraint violations
    if (message.includes('duplicate key value')) {
      if (message.includes('users_username_key')) {
        return 'Username already exists';
      }
      if (message.includes('users_email_key')) {
        return 'Email already exists';
      }
      if (message.includes('products_barcode_key') || message.includes('barcode')) {
        return 'Product barcode already exists. Please use a unique barcode.';
      }
      return 'Duplicate entry detected';
    }

    if (message.includes('foreign key constraint')) {
      return 'Referenced record does not exist';
    }

    if (message.includes('not null constraint')) {
      return 'Required field is missing';
    }

    if (message.includes('check constraint')) {
      return 'Invalid data format';
    }

    // Don't expose raw database errors in production
    if (process.env.NODE_ENV === 'production') {
      return 'Database operation failed';
    }

    return message;
  }

  /**
   * Check if error is security-related
   */
  private isSecurityError(status: number, error: string): boolean {
    const securityStatuses = [
      HttpStatus.UNAUTHORIZED,
      HttpStatus.FORBIDDEN,
      HttpStatus.TOO_MANY_REQUESTS,
    ];

    const securityErrors = [
      'Unauthorized',
      'Forbidden',
      'JWT',
      'Token',
      'Authentication',
      'Authorization',
    ];

    return (
      securityStatuses.includes(status) ||
      securityErrors.some(keyword => error.includes(keyword))
    );
  }

  /**
   * Determine if bad request should be logged
   */
  private shouldLogBadRequest(exception: unknown): boolean {
    // Log database-related bad requests
    if (exception instanceof QueryFailedError) {
      return true;
    }

    // Log security-related bad requests
    if (exception instanceof HttpException) {
      const response = exception.getResponse();
      const message = typeof response === 'object' ? JSON.stringify(response) : response;
      return this.isSecurityError(400, message.toString());
    }

    return false;
  }

  /**
   * Generate a unique request ID for tracking server errors
   */
  private generateRequestId(): string {
    return Math.random().toString(36).substring(2, 15) + 
           Math.random().toString(36).substring(2, 15);
  }
}