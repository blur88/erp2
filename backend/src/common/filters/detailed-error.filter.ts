import {
  ExceptionFilter,
  Catch,
  ArgumentsHost,
  BadRequestException,
  HttpStatus,
} from '@nestjs/common';
import { Response } from 'express';

@Catch(BadRequestException)
export class DetailedErrorFilter implements ExceptionFilter {
  catch(exception: BadRequestException, host: ArgumentsHost) {
    const ctx = host.switchToHttp();
    const response = ctx.getResponse<Response>();
    const request = ctx.getRequest<Request>();
    const status = exception.getStatus();

    // Get the response from the exception
    const exceptionResponse = exception.getResponse();

    // If the exception response is an object with our detailed structure, use it
    if (typeof exceptionResponse === 'object' && exceptionResponse !== null) {
      const detailedResponse = exceptionResponse as any;

      // Check if this is our custom detailed error (has specific properties)
      if (detailedResponse.error &&
          (detailedResponse.error === 'DELETION_PREVENTED_BY_DEPENDENCIES' ||
           detailedResponse.error === 'PERMANENT_DELETE_PREVENTED_BY_DEPENDENCIES')) {

        // Return the full detailed error response
        return response.status(status).json({
          statusCode: status,
          timestamp: new Date().toISOString(),
          path: request.url,
          method: request.method,
          ...detailedResponse
        });
      }
    }

    // For other BadRequestExceptions, use the default format
    const defaultResponse = {
      statusCode: status,
      timestamp: new Date().toISOString(),
      path: request.url,
      method: request.method,
      message: typeof exceptionResponse === 'string' ? exceptionResponse : (exceptionResponse as any).message,
    };

    response.status(status).json(defaultResponse);
  }
}