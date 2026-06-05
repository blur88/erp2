export enum DatabaseErrorCode {
  DUPLICATE_ENTRY = "DB_001",
  FOREIGN_KEY_VIOLATION = "DB_002",
  NOT_NULL_VIOLATION = "DB_003",
  CHECK_CONSTRAINT = "DB_004",
  UNKNOWN_ERROR = "DB_999",
}

export interface DatabaseErrorResponse {
  code: DatabaseErrorCode;
  message: string;
  requestId?: string;
}

export interface HttpExceptionResponse {
  message?: string | string[];
  error?: string;
  statusCode?: number;
}

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
