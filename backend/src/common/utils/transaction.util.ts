import { DataSource, EntityManager, QueryRunner } from "typeorm";
import { Injectable, BadRequestException, Logger } from "@nestjs/common";
import { InjectDataSource } from "@nestjs/typeorm";
import { Customer } from "../../database/entities/customer.entity";

/**
 * Transaction manager for financial operations requiring atomicity
 */
@Injectable()
export class TransactionManager {
  private readonly logger = new Logger(TransactionManager.name);

  constructor(
    @InjectDataSource()
    private readonly dataSource: DataSource,
  ) {}

  /**
   * Execute operations within a database transaction
   * Ensures all operations succeed or all are rolled back
   */
  async executeInTransaction<T>(
    operation: (manager: EntityManager) => Promise<T>,
    operationDescription?: string,
  ): Promise<T> {
    const queryRunner = this.dataSource.createQueryRunner();

    await queryRunner.connect();
    await queryRunner.startTransaction();

    try {
      this.logger.log(
        `Starting transaction: ${operationDescription || "Unknown operation"}`,
      );

      const result = await operation(queryRunner.manager);

      await queryRunner.commitTransaction();
      this.logger.log(
        `Transaction completed successfully: ${operationDescription || "Unknown operation"}`,
      );

      return result;
    } catch (error) {
      await queryRunner.rollbackTransaction();
      this.logger.error(
        `Transaction failed and rolled back: ${operationDescription || "Unknown operation"}`,
        error.stack,
      );
      throw error;
    } finally {
      await queryRunner.release();
    }
  }

  /**
   * Execute financial entity deletion with customer metric updates
   * Ensures customer totals remain accurate
   */
  async executeFinancialDeletion(
    entityId: string,
    entityType: "sales-order" | "invoice" | "payment",
    customerId: string,
    amount: number,
    operation: (manager: EntityManager) => Promise<void>,
  ): Promise<void> {
    await this.executeInTransaction(async (manager) => {
      // Update customer metrics first
      const customer = await manager.findOne(Customer, {
        where: { id: customerId },
      });
      if (customer) {
        switch (entityType) {
          case "sales-order":
            (customer as any).totalSales = Math.max(
              0,
              Number((customer as any).totalSales || 0) - amount,
            );
            (customer as any).totalOrders = Math.max(
              0,
              ((customer as any).totalOrders || 0) - 1,
            );
            break;
          case "invoice":
            // Update invoice-specific metrics if they exist
            break;
          case "payment":
            // Update payment-specific metrics if they exist
            break;
        }
        await manager.save(Customer, customer);
      }

      // Execute the deletion operation
      await operation(manager);
    }, `Financial deletion: ${entityType} ${entityId}`);
  }

  /**
   * Execute bulk financial operations with consistency guarantees
   */
  async executeBulkFinancialOperation<T>(
    items: Array<{ id: string; customerId?: string; amount?: number }>,
    operationType: string,
    operation: (
      manager: EntityManager,
      items: Array<{ id: string; customerId?: string; amount?: number }>,
    ) => Promise<T>,
  ): Promise<T> {
    return this.executeInTransaction(async (manager) => {
      return await operation(manager, items);
    }, `Bulk ${operationType} operation (${items.length} items)`);
  }

  /**
   * Validate financial data consistency
   * Checks that related financial records match expected totals
   */
  async validateFinancialConsistency(
    customerId: string,
    manager?: EntityManager,
  ): Promise<{ isValid: boolean; discrepancies: string[] }> {
    const em = manager || this.dataSource.manager;
    const discrepancies: string[] = [];

    try {
      // Get customer current totals (including soft-deleted customers)
      const customer = await em.getRepository(Customer).findOne({
        where: { id: customerId },
        withDeleted: true,
      });
      if (!customer) {
        return { isValid: false, discrepancies: ["Customer not found"] };
      }

      // Calculate actual sales from orders
      const orderTotals = await em
        .createQueryBuilder()
        .select("COALESCE(SUM(totalAmount), 0)", "total")
        .from("SalesOrder", "order")
        .where("order.customerId = :customerId", { customerId })
        .andWhere("order.status = :status", { status: "confirmed" })
        .getRawOne();

      const actualSales = parseFloat(orderTotals.total) || 0;
      const recordedSales = Number(customer.totalSales || 0);

      if (Math.abs(actualSales - recordedSales) > 0.01) {
        discrepancies.push(
          `Sales total mismatch: recorded ${recordedSales}, actual ${actualSales}`,
        );
      }

      // Count actual orders
      const orderCount = await em
        .createQueryBuilder()
        .select("COUNT(*)", "count")
        .from("SalesOrder", "order")
        .where("order.customerId = :customerId", { customerId })
        .andWhere("order.status = :status", { status: "confirmed" })
        .getRawOne();

      const actualOrders = parseInt(orderCount.count) || 0;
      const recordedOrders = customer.totalOrders || 0;

      if (actualOrders !== recordedOrders) {
        discrepancies.push(
          `Order count mismatch: recorded ${recordedOrders}, actual ${actualOrders}`,
        );
      }

      return { isValid: discrepancies.length === 0, discrepancies };
    } catch (error) {
      this.logger.error(
        `Financial consistency validation failed for customer ${customerId}`,
        error.stack,
      );
      return {
        isValid: false,
        discrepancies: [`Validation error: ${error.message}`],
      };
    }
  }

  /**
   * Auto-correct customer financial totals based on actual data
   * Use with caution - only for data integrity repairs
   */
  async correctCustomerTotals(customerId: string): Promise<void> {
    await this.executeInTransaction(async (manager) => {
      const customer = await manager.getRepository(Customer).findOne({
        where: { id: customerId },
        withDeleted: true,
      });
      if (!customer) {
        throw new BadRequestException(`Customer ${customerId} not found`);
      }

      // Calculate correct totals from actual data
      const orderTotals = await manager
        .createQueryBuilder()
        .select([
          "COALESCE(SUM(totalAmount), 0) as totalSales",
          "COUNT(*) as totalOrders",
        ])
        .from("SalesOrder", "order")
        .where("order.customerId = :customerId", { customerId })
        .andWhere("order.status = :status", { status: "confirmed" })
        .getRawOne();

      (customer as any).totalSales = parseFloat(orderTotals.totalSales) || 0;
      (customer as any).totalOrders = parseInt(orderTotals.totalOrders) || 0;

      await manager.save(Customer, customer);

      this.logger.log(
        `Corrected customer totals for ${customerId}: sales=${customer.totalSales}, orders=${customer.totalOrders}`,
      );
    }, `Customer totals correction for ${customerId}`);
  }
}

/**
 * Decorator for methods that require transactional integrity
 * Use this on service methods that modify financial data
 */
export function Transactional(description?: string) {
  return function (
    target: any,
    propertyName: string,
    descriptor: PropertyDescriptor,
  ) {
    const method = descriptor.value;

    descriptor.value = async function (...args: any[]) {
      const transactionManager = this.transactionManager || this.dataSource;

      if (transactionManager && transactionManager.executeInTransaction) {
        return transactionManager.executeInTransaction(
          async (manager: EntityManager) => {
            // Replace repositories with transactional ones
            const originalRepos = {};
            for (const prop in this) {
              if (prop.endsWith("Repository") && this[prop].target) {
                originalRepos[prop] = this[prop];
                this[prop] = manager.getRepository(this[prop].target);
              }
            }

            try {
              return await method.apply(this, args);
            } finally {
              // Restore original repositories
              for (const prop in originalRepos) {
                this[prop] = originalRepos[prop];
              }
            }
          },
          description || `${target.constructor.name}.${propertyName}`,
        );
      } else {
        // Fallback to regular execution if transaction manager not available
        return method.apply(this, args);
      }
    };

    return descriptor;
  };
}
