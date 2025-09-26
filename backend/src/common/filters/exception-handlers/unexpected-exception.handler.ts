import { Injectable, HttpStatus } from '@nestjs/common';
import { generateSecureRequestId } from '../utils';

export interface UnexpectedExceptionResult {
  status: number;
  message: string;
  error: string;
  requestId: string;
}

/**
 * Handler for unexpected exceptions that don't fit other categories
 */
@Injectable()
export class UnexpectedExceptionHandler {
  /**
   * Process unexpected exceptions with secure error messages
   */
  handle(exception: unknown, isProduction = false): UnexpectedExceptionResult {
    const requestId = generateSecureRequestId();
    
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

  /**
   * Check if this handler should process the exception
   * This is the fallback handler, so it accepts any exception
   */
  canHandle(exception: unknown): boolean {
    // This handler accepts any exception as a fallback
    return true;
  }
}