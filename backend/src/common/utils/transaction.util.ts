import { DataSource, EntityManager } from 'typeorm';
import { Injectable, Logger } from '@nestjs/common';
import { InjectDataSource } from '@nestjs/typeorm';

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
    operationDescription?: string
  ): Promise<T> {
    const queryRunner = this.dataSource.createQueryRunner();

    await queryRunner.connect();
    await queryRunner.startTransaction();

    try {
      this.logger.log(`Starting transaction: ${operationDescription || 'Unknown operation'}`);

      const result = await operation(queryRunner.manager);

      await queryRunner.commitTransaction();
      this.logger.log(`Transaction completed successfully: ${operationDescription || 'Unknown operation'}`);

      return result;
    } catch (error) {
      await queryRunner.rollbackTransaction();
      this.logger.error(`Transaction failed and rolled back: ${operationDescription || 'Unknown operation'}`, error.stack);
      throw error;
    } finally {
      await queryRunner.release();
    }
  }
}

/**
 * Decorator for methods that require transactional integrity
 * Use this on service methods that modify financial data
 */
export function Transactional(description?: string) {
  return function (target: any, propertyName: string, descriptor: PropertyDescriptor) {
    const method = descriptor.value;

    descriptor.value = async function (...args: any[]) {
      const transactionManager = this.transactionManager || this.dataSource;

      if (transactionManager && transactionManager.executeInTransaction) {
        return transactionManager.executeInTransaction(async (manager: EntityManager) => {
          // Replace repositories with transactional ones
          const originalRepos = {};
          for (const prop in this) {
            if (prop.endsWith('Repository') && this[prop].target) {
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
        }, description || `${target.constructor.name}.${propertyName}`);
      } else {
        // Fallback to regular execution if transaction manager not available
        return method.apply(this, args);
      }
    };

    return descriptor;
  };
}