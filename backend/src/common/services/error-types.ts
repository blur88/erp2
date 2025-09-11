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