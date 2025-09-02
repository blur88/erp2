import { Injectable, Logger } from '@nestjs/common';
import { InjectRepository } from '@nestjs/typeorm';
import { Repository } from 'typeorm';
import { AuditLog } from '../../../common/audit/audit-log.entity';

export type InventoryEventType =
  | 'PRODUCT_CREATED'
  | 'PRODUCT_UPDATED'
  | 'PRODUCT_DELETED'
  | 'PRODUCT_PERMANENTLY_DELETED'
  | 'PRODUCT_PRICE_UPDATED'
  | 'CATEGORY_CREATED'
  | 'CATEGORY_UPDATED'
  | 'CATEGORY_DELETED'
  | 'CATEGORY_PERMANENTLY_DELETED'
  | 'CATEGORY_RESTORED'
  | 'CATEGORY_MOVED'
  | 'CATEGORY_BULK_UPDATED'
  | 'STOCK_MOVEMENT_CREATED'
  | 'STOCK_MOVEMENT_REVERSED'
  | 'STOCK_RESERVED'
  | 'STOCK_RELEASED'
  | 'STOCK_TRANSFERRED'
  | 'STOCK_ADJUSTMENT_CREATED'
  | 'STOCK_ADJUSTMENT_UPDATED'
  | 'STOCK_ADJUSTMENT_APPROVED'
  | 'STOCK_ADJUSTMENT_REJECTED'
  | 'STOCK_ADJUSTMENT_CANCELLED'
  | 'STOCK_ADJUSTMENT_BULK_CREATED';

@Injectable()
export class AuditService {
  private readonly logger = new Logger(AuditService.name);

  constructor(
    @InjectRepository(AuditLog)
    private readonly auditLogRepository: Repository<AuditLog>,
  ) {}

  /**
   * Log a product-related event
   */
  async logProductEvent(
    productId: string,
    eventType: InventoryEventType,
    description: string,
    userId?: string,
    metadata?: Record<string, any>,
  ): Promise<void> {
    try {
      const auditLog = this.auditLogRepository.create({
        entityType: 'Product',
        entityId: productId,
        action: eventType as any,
        description,
        userId,
        metadata: {
          module: 'inventory',
          subModule: 'product',
          ...metadata,
        },
        createdAt: new Date(),
      } as any);

      await this.auditLogRepository.save(auditLog);
      
      this.logger.log(`Product audit logged: ${eventType} for product ${productId}`);
    } catch (error) {
      this.logger.error(`Failed to log product audit event: ${error.message}`, error.stack);
    }
  }

  /**
   * Log a category-related event
   */
  async logCategoryEvent(
    categoryId: string,
    eventType: InventoryEventType,
    description: string,
    userId?: string,
    metadata?: Record<string, any>,
  ): Promise<void> {
    try {
      const auditLog = this.auditLogRepository.create({
        entityType: 'Category',
        entityId: categoryId,
        action: eventType as any,
        description,
        userId,
        metadata: {
          module: 'inventory',
          subModule: 'category',
          ...metadata,
        },
        createdAt: new Date(),
      } as any);

      await this.auditLogRepository.save(auditLog);
      
      this.logger.log(`Category audit logged: ${eventType} for category ${categoryId}`);
    } catch (error) {
      this.logger.error(`Failed to log category audit event: ${error.message}`, error.stack);
    }
  }

  /**
   * Log a stock-related event
   */
  async logStockEvent(
    productId: string | null,
    eventType: InventoryEventType,
    description: string,
    userId?: string,
    metadata?: Record<string, any>,
  ): Promise<void> {
    try {
      const auditLog = this.auditLogRepository.create({
        entityType: 'Stock',
        entityId: productId,
        action: eventType as any,
        description,
        userId,
        metadata: {
          module: 'inventory',
          subModule: 'stock',
          ...metadata,
        },
        createdAt: new Date(),
      } as any);

      await this.auditLogRepository.save(auditLog);
      
      this.logger.log(`Stock audit logged: ${eventType}${productId ? ` for product ${productId}` : ''}`);
    } catch (error) {
      this.logger.error(`Failed to log stock audit event: ${error.message}`, error.stack);
    }
  }

  /**
   * Get audit trail for a specific entity
   */
  async getAuditTrail(
    entityType: 'Product' | 'Category' | 'Stock',
    entityId: string,
    limit = 50,
  ): Promise<AuditLog[]> {
    return this.auditLogRepository.find({
      where: {
        entityType: entityType as any,
        entityId,
      } as any,
      order: {
        createdAt: 'DESC',
      },
      take: limit,
    });
  }

  /**
   * Get recent inventory activities
   */
  async getRecentActivities(
    userId?: string,
    eventTypes?: InventoryEventType[],
    limit = 100,
  ): Promise<AuditLog[]> {
    const queryBuilder = this.auditLogRepository
      .createQueryBuilder('audit')
      .where("audit.metadata->>'module' = 'inventory'")
      .orderBy('audit.createdAt', 'DESC')
      .limit(limit);

    if (userId) {
      queryBuilder.andWhere('audit.userId = :userId', { userId });
    }

    if (eventTypes && eventTypes.length > 0) {
      queryBuilder.andWhere('audit.action IN (:...eventTypes)', { eventTypes });
    }

    return queryBuilder.getMany();
  }

  /**
   * Get activity summary for a date range
   */
  async getActivitySummary(
    fromDate: Date,
    toDate: Date,
  ): Promise<{
    totalActivities: number;
    activitiesByType: Record<string, number>;
    activitiesByUser: Record<string, number>;
    activitiesByEntity: Record<string, number>;
  }> {
    const activities = await this.auditLogRepository
      .createQueryBuilder('audit')
      .where("audit.metadata->>'module' = 'inventory'")
      .andWhere('audit.createdAt BETWEEN :fromDate AND :toDate', { fromDate, toDate })
      .getMany();

    const summary = {
      totalActivities: activities.length,
      activitiesByType: {} as Record<string, number>,
      activitiesByUser: {} as Record<string, number>,
      activitiesByEntity: {} as Record<string, number>,
    };

    activities.forEach(activity => {
      // Count by action type
      summary.activitiesByType[activity.action] = (summary.activitiesByType[activity.action] || 0) + 1;

      // Count by user
      if (activity.userId) {
        summary.activitiesByUser[activity.userId] = (summary.activitiesByUser[activity.userId] || 0) + 1;
      }

      // Count by entity type
      const entityType = (activity.metadata as any)?.entityType || 'Unknown';
      summary.activitiesByEntity[entityType] = (summary.activitiesByEntity[entityType] || 0) + 1;
    });

    return summary;
  }

  /**
   * Get stock movement audit trail for a product
   */
  async getStockMovementAudit(
    productId: string,
    fromDate?: Date,
    toDate?: Date,
  ): Promise<AuditLog[]> {
    const queryBuilder = this.auditLogRepository
      .createQueryBuilder('audit')
      .where('audit.entityId = :productId', { productId })
      .andWhere("audit.metadata->>'entityType' = :entityType", { entityType: 'Stock' })
      .orderBy('audit.createdAt', 'DESC');

    if (fromDate) {
      queryBuilder.andWhere('audit.createdAt >= :fromDate', { fromDate });
    }

    if (toDate) {
      queryBuilder.andWhere('audit.createdAt <= :toDate', { toDate });
    }

    return queryBuilder.getMany();
  }

  /**
   * Get price change history for a product
   */
  async getPriceChangeHistory(productId: string): Promise<AuditLog[]> {
    return this.auditLogRepository.find({
      where: [
        {
          entityType: 'Product' as any,
          entityId: productId,
          action: 'PRODUCT_PRICE_UPDATED' as any,
        },
        {
          entityType: 'Product' as any,
          entityId: productId,
          action: 'PRODUCT_UPDATED' as any,
        },
      ] as any,
      order: {
        createdAt: 'DESC',
      },
    });
  }

  /**
   * Get user activity in inventory module
   */
  async getUserInventoryActivity(
    userId: string,
    fromDate?: Date,
    toDate?: Date,
    limit = 100,
  ): Promise<AuditLog[]> {
    const queryBuilder = this.auditLogRepository
      .createQueryBuilder('audit')
      .where('audit.userId = :userId', { userId })
      .andWhere("audit.metadata->>'module' = 'inventory'")
      .orderBy('audit.createdAt', 'DESC')
      .limit(limit);

    if (fromDate) {
      queryBuilder.andWhere('audit.createdAt >= :fromDate', { fromDate });
    }

    if (toDate) {
      queryBuilder.andWhere('audit.createdAt <= :toDate', { toDate });
    }

    return queryBuilder.getMany();
  }

  /**
   * Clean up old audit logs (to be called by a scheduled job)
   */
  async cleanupOldAuditLogs(retentionDays = 365): Promise<number> {
    const cutoffDate = new Date();
    cutoffDate.setDate(cutoffDate.getDate() - retentionDays);

    const result = await this.auditLogRepository
      .createQueryBuilder()
      .delete()
      .from(AuditLog)
      .where("metadata->>'module' = 'inventory'")
      .andWhere('timestamp < :cutoffDate', { cutoffDate })
      .execute();

    this.logger.log(`Cleaned up ${result.affected} old inventory audit logs older than ${retentionDays} days`);
    
    return result.affected || 0;
  }

  /**
   * Log bulk operation
   */
  async logBulkOperation(
    operation: string,
    entityType: 'Product' | 'Category' | 'Stock',
    entityIds: string[],
    description: string,
    userId?: string,
    metadata?: Record<string, any>,
  ): Promise<void> {
    try {
      const bulkAuditLog = this.auditLogRepository.create({
        entityType: 'BulkOperation',
        entityId: null,
        action: `BULK_${operation.toUpperCase()}` as any,
        description,
        userId,
        metadata: {
          module: 'inventory',
          subModule: entityType.toLowerCase(),
          bulkOperation: true,
          affectedEntities: entityIds,
          entityCount: entityIds.length,
          ...metadata,
        },
        createdAt: new Date(),
      } as any);

      await this.auditLogRepository.save(bulkAuditLog);
      
      this.logger.log(`Bulk operation audit logged: ${operation} affecting ${entityIds.length} ${entityType.toLowerCase()}s`);
    } catch (error) {
      this.logger.error(`Failed to log bulk operation audit event: ${error.message}`, error.stack);
    }
  }

  /**
   * Export audit logs for compliance
   */
  async exportAuditLogs(
    fromDate: Date,
    toDate: Date,
    entityType?: 'Product' | 'Category' | 'Stock',
    userId?: string,
  ): Promise<AuditLog[]> {
    const queryBuilder = this.auditLogRepository
      .createQueryBuilder('audit')
      .where("audit.metadata->>'module' = 'inventory'")
      .andWhere('audit.createdAt BETWEEN :fromDate AND :toDate', { fromDate, toDate })
      .orderBy('audit.createdAt', 'DESC');

    if (entityType) {
      queryBuilder.andWhere("audit.metadata->>'entityType' = :entityType", { entityType });
    }

    if (userId) {
      queryBuilder.andWhere('audit.userId = :userId', { userId });
    }

    const auditLogs = await queryBuilder.getMany();
    
    this.logger.log(`Exported ${auditLogs.length} audit logs for compliance`);
    
    return auditLogs;
  }
}