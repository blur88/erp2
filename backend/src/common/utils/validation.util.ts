import {
  NotFoundException,
  BadRequestException,
  ConflictException,
} from "@nestjs/common";

/**
 * Standardized validation patterns for restore and delete operations
 */
export class ValidationUtil {
  /**
   * Standard validation for entity restore operations
   */
  static validateForRestore<T extends { id: string; deletedAt?: Date | null }>(
    entity: T | null,
    entityName: string,
    id: string,
  ): void {
    if (!entity) {
      throw new NotFoundException(`${entityName} with ID '${id}' not found`);
    }

    if (!entity.deletedAt) {
      throw new BadRequestException(
        `${entityName} with ID '${id}' is not deleted`,
      );
    }
  }

  /**
   * Standard validation for permanent delete operations
   */
  static validateForPermanentDelete<
    T extends { id: string; deletedAt?: Date | null },
  >(entity: T | null, entityName: string, id: string): void {
    if (!entity) {
      throw new NotFoundException(`${entityName} with ID '${id}' not found`);
    }

    if (!entity.deletedAt) {
      throw new BadRequestException(
        `${entityName} must be soft-deleted first before permanent deletion. Use regular delete endpoint first.`,
      );
    }
  }

  /**
   * Check for unique constraint violations during restore
   */
  static validateUniquenessForRestore(
    existingEntity: any,
    fieldName: string,
    fieldValue: string,
    entityName: string,
  ): void {
    if (existingEntity) {
      if (existingEntity.deletedAt) {
        throw new ConflictException(
          `${entityName} with ${fieldName} '${fieldValue}' was previously deleted but cannot be reused. ` +
            `Please choose a different ${fieldName} or restore the deleted ${entityName.toLowerCase()}.`,
        );
      } else {
        throw new ConflictException(
          `${entityName} with ${fieldName} '${fieldValue}' already exists`,
        );
      }
    }
  }

  /**
   * Standard dependency check message formatting
   */
  static createDependencyErrorMessage(
    entityName: string,
    dependencies: Array<{ name: string; count: number }>,
  ): string {
    const dependencyList = dependencies
      .filter((dep) => dep.count > 0)
      .map((dep) => `${dep.count} ${dep.name}${dep.count > 1 ? "s" : ""}`)
      .join(", ");

    return `Cannot permanently delete ${entityName.toLowerCase()} with active dependencies: ${dependencyList}`;
  }

  /**
   * Validate business rules for financial entities
   */
  static validateFinancialEntityDeletion(
    entityName: string,
    hasInvoices: boolean,
    hasPayments: boolean,
    isCompleted: boolean = false,
  ): void {
    if (hasInvoices) {
      throw new BadRequestException(
        `Cannot permanently delete ${entityName.toLowerCase()} with associated invoices (financial audit trail must be preserved)`,
      );
    }

    if (hasPayments) {
      throw new BadRequestException(
        `Cannot permanently delete ${entityName.toLowerCase()} with associated payments (financial audit trail must be preserved)`,
      );
    }

    if (isCompleted) {
      throw new BadRequestException(
        `Cannot permanently delete completed ${entityName.toLowerCase()} (business audit trail must be preserved)`,
      );
    }
  }
}

/**
 * Standard error details for bulk operations
 */
export interface BulkOperationError {
  id: string;
  reason: string;
  errorCode?: string;
  details?: any;
}

/**
 * Standard response format for bulk operations
 */
export interface BulkOperationResponse {
  successCount: number;
  failedCount: number;
  failedItems: BulkOperationError[];
  summary: string;
}

/**
 * Helper to create standardized bulk operation responses
 */
export class BulkOperationUtil {
  static createResponse(
    operation: string,
    entityName: string,
    successCount: number,
    failedItems: BulkOperationError[],
  ): BulkOperationResponse {
    const failedCount = failedItems.length;
    const total = successCount + failedCount;

    let summary: string;
    if (failedCount === 0) {
      summary = `Successfully ${operation} ${successCount} ${entityName}${successCount !== 1 ? "s" : ""}`;
    } else if (successCount === 0) {
      summary = `Failed to ${operation} all ${total} ${entityName}${total !== 1 ? "s" : ""}`;
    } else {
      summary = `${operation} completed: ${successCount} succeeded, ${failedCount} failed out of ${total} ${entityName}${total !== 1 ? "s" : ""}`;
    }

    return {
      successCount,
      failedCount,
      failedItems,
      summary,
    };
  }

  static addFailure(
    failedItems: BulkOperationError[],
    id: string,
    reason: string,
    errorCode?: string,
    details?: any,
  ): void {
    failedItems.push({ id, reason, errorCode, details });
  }
}
