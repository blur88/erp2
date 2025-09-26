import { Injectable, HttpException } from '@nestjs/common';
import { HttpExceptionResponse } from '../types';

export interface HttpExceptionResult {
  status: number;
  message: string | object;
  error: string;
}

/**
 * Handler for NestJS HTTP exceptions
 */
@Injectable()
export class HttpExceptionHandler {
  /**
   * Process HTTP exceptions and extract relevant information
   */
  handle(exception: HttpException): HttpExceptionResult {
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

    return {
      status,
      message,
      error,
    };
  }

  /**
   * Check if exception is an HTTP exception
   */
  canHandle(exception: unknown): exception is HttpException {
    return exception instanceof HttpException;
  }
}