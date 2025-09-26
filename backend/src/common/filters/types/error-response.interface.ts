/**
 * Interface for HTTP exception response objects
 */
export interface HttpExceptionResponse {
  message?: string | string[];
  error?: string;
  statusCode?: number;
}

/**
 * Interface for standardized error response
 */
export interface StandardizedErrorResponse {
  statusCode: number;
  timestamp: string;
  path: string;
  method: string;
  error: string;
  message: string | object;
  code?: string;
  requestId?: string;
}