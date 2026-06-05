import { ArgumentsHost, Catch, ExceptionFilter, HttpException, HttpStatus, Injectable } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { Request, Response } from 'express';
import { QueryFailedError } from 'typeorm';
import {
  HttpExceptionResponse,
  StandardizedErrorResponse,
} from './types/error-response.interface';
import { shouldLogBadRequest } from './utils/error-classification.util';
import { ErrorClassifierService } from './services/error-classifier.service';
import { ErrorLoggerService } from './services/error-logger.service';
import { ErrorSanitizerService } from './services/error-sanitizer.service';
import { IdGeneratorService } from './services/id-generator.service';
import { SecurityDetectorService } from './services/security-detector.service';

@Catch()
@Injectable()
export class HttpExceptionFilter implements ExceptionFilter {
  constructor(
    private readonly configService: ConfigService,
    private readonly securityDetector: SecurityDetectorService,
    private readonly errorLogger: ErrorLoggerService,
    private readonly errorClassifier: ErrorClassifierService,
    private readonly errorSanitizer: ErrorSanitizerService,
    private readonly idGenerator: IdGeneratorService,
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

    if (exception instanceof HttpException) {
      ({ status, message, error } = this.handleHttp(exception));
    } else if (exception instanceof QueryFailedError) {
      ({ status, message, error, errorCode, requestId } = this.handleDatabase(exception, isProduction, request));
    } else {
      ({ status, message, error, requestId } = this.handleUnexpected(isProduction));
      this.errorLogger.logUnexpectedError(exception, requestId, request);
    }

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

    if (this.securityDetector.isSecurityRelated(status, error)) {
      this.errorLogger.logSecurityError(status, error, request, requestId);
    }

    if (!(exception instanceof QueryFailedError) && (status !== HttpStatus.BAD_REQUEST || shouldLogBadRequest(exception))) {
      this.errorLogger.logApplicationError(status, message, request, requestId, isProduction);
    }

    response.status(status).json(errorResponse);
  }

  private handleHttp(exception: HttpException): { status: number; message: string | object; error: string } {
    const status = exception.getStatus();
    const exceptionResponse = exception.getResponse();
    let message: string | object;
    let error: string;

    if (typeof exceptionResponse === 'object') {
      const responseObj = exceptionResponse as HttpExceptionResponse;
      message = responseObj.message || exceptionResponse;
      error = responseObj.error || exception.name;
    } else {
      message = exceptionResponse;
      error = exception.name;
    }

    return { status, message, error };
  }

  private handleDatabase(
    exception: QueryFailedError,
    isProduction: boolean,
    request: Request,
  ): { status: number; message: string; error: string; errorCode: string; requestId: string } {
    const rawMessage = exception.message;

    if (!rawMessage || typeof rawMessage !== 'string' || rawMessage.length > 10000) {
      const fallback = this.errorClassifier.getGenericError(isProduction);
      return {
        status: HttpStatus.BAD_REQUEST,
        message: fallback.message,
        error: 'Database Error',
        errorCode: fallback.code,
        requestId: fallback.requestId || this.idGenerator.generateRequestId(),
      };
    }

    const requestId = this.idGenerator.generateRequestId();
    this.errorLogger.logDatabaseError(rawMessage, request, requestId);

    const constraintType = this.errorClassifier.getConstraintType(rawMessage.toLowerCase());
    const dbError = this.errorClassifier.getErrorResponse(constraintType, isProduction);

    return {
      status: HttpStatus.BAD_REQUEST,
      message: dbError.message,
      error: 'Database Error',
      errorCode: dbError.code,
      requestId,
    };
  }

  private handleUnexpected(isProduction: boolean): { status: number; message: string; error: string; requestId: string } {
    const requestId = this.idGenerator.generateRequestId();
    const message = isProduction
      ? 'An unexpected error occurred. Please try again or contact support.'
      : 'An unexpected error occurred';

    return {
      status: HttpStatus.INTERNAL_SERVER_ERROR,
      message,
      error: 'Internal Server Error',
      requestId,
    };
  }
}
