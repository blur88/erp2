import { Injectable } from "@nestjs/common";
import {
  DatabaseErrorCode,
  DatabaseErrorResponse,
} from "../types/error-response.interface";

@Injectable()
export class ErrorClassifierService {
  private readonly CONSTRAINT_MESSAGES = new Map<string, DatabaseErrorResponse>(
    [
      [
        "duplicate",
        {
          code: DatabaseErrorCode.DUPLICATE_ENTRY,
          message: "This value already exists. Please use a unique value.",
        },
      ],
      [
        "foreign",
        {
          code: DatabaseErrorCode.FOREIGN_KEY_VIOLATION,
          message: "Referenced record does not exist or has been removed.",
        },
      ],
      [
        "null",
        {
          code: DatabaseErrorCode.NOT_NULL_VIOLATION,
          message:
            "Required field is missing. Please provide all required information.",
        },
      ],
      [
        "check",
        {
          code: DatabaseErrorCode.CHECK_CONSTRAINT,
          message:
            "Invalid data format. Please check your input and try again.",
        },
      ],
    ],
  );

  getConstraintType(errorMessage: string): string {
    if (
      errorMessage.includes("duplicate key") ||
      errorMessage.includes("already exists")
    ) {
      return "duplicate";
    }
    if (
      errorMessage.includes("foreign key") ||
      errorMessage.includes("violates foreign key")
    ) {
      return "foreign";
    }
    if (
      errorMessage.includes("not null") ||
      errorMessage.includes("null value")
    ) {
      return "null";
    }
    if (
      errorMessage.includes("check constraint") ||
      errorMessage.includes("violates check")
    ) {
      return "check";
    }
    return "unknown";
  }

  getErrorResponse(
    constraintType: string,
    isProduction: boolean,
  ): DatabaseErrorResponse {
    return (
      this.CONSTRAINT_MESSAGES.get(constraintType) || {
        code: DatabaseErrorCode.UNKNOWN_ERROR,
        message: isProduction
          ? "Database operation failed. Please try again or contact support."
          : "An error occurred while processing your request.",
      }
    );
  }

  getGenericError(
    isProduction: boolean,
    requestId?: string,
  ): DatabaseErrorResponse {
    return {
      code: DatabaseErrorCode.UNKNOWN_ERROR,
      message: isProduction
        ? "Database operation failed. Please try again or contact support."
        : "An error occurred while processing your request.",
      requestId: requestId || `err_${Date.now()}`,
    };
  }
}
