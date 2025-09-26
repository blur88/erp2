import {
  ExceptionFilter,
  Catch,
  ArgumentsHost,
  HttpStatus,
  Injectable,
} from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { Request, Response } from 'express';
import { StandardizedErrorResponse } from './types';
import { shouldLogBadRequest } from './utils';
import { SecurityDetectorService } from './security';
import { ErrorLoggerService } from './logging';
import {
  HttpExceptionHandler,
  DatabaseExceptionHandler,
  UnexpectedExceptionHandler,
} from './exception-handlers';

/**
 * Global HTTP Exception Filter
 * Handles all HTTP exceptions and provides consistent error responses
 */
@Catch()
@Injectable()
export class HttpExceptionFilter implements ExceptionFilter {
  constructor(
    private readonly configService: ConfigService,
    private readonly securityDetector: SecurityDetectorService,
    private readonly errorLogger: ErrorLoggerService,
    private readonly httpHandler: HttpExceptionHandler,
    private readonly databaseHandler: DatabaseExceptionHandler,
    private readonly unexpectedHandler: UnexpectedExceptionHandler,
  ) {}

  catch(exception: unknown, host: ArgumentsHost): void {
    const ctx = host.switchToHttp();
    const response = ctx.getResponse<Response>();
    const request = ctx.getRequest<Request>();
    const isProduction = this.configService.get('NODE_ENV') === 'production';

    let status: number;
    let message: string | object;
    let error: string;
    let errorCode: string | undefined;
    let requestId: string | undefined;

    // Handle different exception types using dedicated handlers
    if (this.httpHandler.canHandle(exception)) {
      const result = this.httpHandler.handle(exception);
      status = result.status;
      message = result.message;
      error = result.error;
    } else if (this.databaseHandler.canHandle(exception)) {
      const result = this.databaseHandler.handle(exception, isProduction);
      status = result.status;
      message = result.message;
      error = result.error;
      errorCode = result.errorCode;
      requestId = result.requestId;
    } else {
      // Handle unexpected errors
      const result = this.unexpectedHandler.handle(exception, isProduction);
      status = result.status;
      message = result.message;
      error = result.error;
      requestId = result.requestId;

      // Log unexpected errors securely
      this.errorLogger.logUnexpectedError(exception, requestId, request);
    }

    // Create standardized error response
    const errorResponse: StandardizedErrorResponse = {
      statusCode: status,
      timestamp: new Date().toISOString(),
      path: request.url,
      method: request.method,
      error,
      message,
      ...(errorCode && { code: errorCode }),
      ...(requestId && { requestId }),
    };

    // Log security-related errors
    if (this.securityDetector.isSecurityRelated(status, error)) {
      this.errorLogger.logSecurityError(status, error, request, requestId);
    }

    // Log application errors (excluding validation spam)
    if (status !== HttpStatus.BAD_REQUEST || shouldLogBadRequest(exception)) {
      this.errorLogger.logApplicationError(status, message, request, requestId, isProduction);
    }

    response.status(status).json(errorResponse);
  }

}