import { Injectable, Logger } from '@nestjs/common';
import { InjectRepository } from '@nestjs/typeorm';
import { Repository, Between, Like } from 'typeorm';
import { AuditLog } from '@/database/entities/audit-log.entity';
import { CreateAuditLogDto, QueryAuditLogsDto } from '../dto';

export interface PaginatedResponse<T> {
  data: T[];
  meta: {
    page: number;
    limit: number;
    total: number;
    totalPages: number;
  };
}

@Injectable()
export class AuditLogService {
  private readonly logger = new Logger(AuditLogService.name);

  constructor(
    @InjectRepository(AuditLog)
    private readonly auditLogRepository: Repository<AuditLog>,
  ) {}

  /**
   * Create a new audit log entry
   */
  async create(createDto: CreateAuditLogDto): Promise<AuditLog> {
    try {
      const auditLog = this.auditLogRepository.create(createDto);
      return await this.auditLogRepository.save(auditLog);
    } catch (error) {
      this.logger.error(`Failed to create audit log: ${error.message}`, error.stack);
      // Don't throw error - audit logging should not break application flow
      return null;
    }
  }

  /**
   * Log an action (simplified method for easier use)
   */
  async log(
    action: string,
    entityType: string,
    description: string,
    options?: {
      entityId?: string;
      userId?: string;
      username?: string;
      oldValues?: any;
      newValues?: any;
      ipAddress?: string;
      userAgent?: string;
      metadata?: any;
    },
  ): Promise<void> {
    try {
      await this.create({
        userId: options?.userId || 'system',
        username: options?.username,
        action,
        entityType,
        entityId: options?.entityId,
        description,
        oldValues: options?.oldValues,
        newValues: options?.newValues,
        ipAddress: options?.ipAddress,
        userAgent: options?.userAgent,
        metadata: options?.metadata,
      });
    } catch (error) {
      this.logger.error(`Failed to log audit: ${error.message}`);
    }
  }

  /**
   * Find all audit logs with filtering and pagination
   */
  async findAll(query: QueryAuditLogsDto): Promise<PaginatedResponse<AuditLog>> {
    const {
      page = 1,
      limit = 20,
      search,
      action,
      entityType,
      entityId,
      userId,
      username,
      ipAddress,
      startDate,
      endDate,
      sortBy = 'createdAt',
      sortOrder = 'DESC',
    } = query;

    const skip = (page - 1) * limit;

    // Build where clause
    const where: any = {
      isActive: true,
    };

    if (search) {
      where.description = Like(`%${search}%`);
    }

    if (action) {
      where.action = action;
    }

    if (entityType) {
      where.entityType = entityType;
    }

    if (entityId) {
      where.entityId = entityId;
    }

    if (userId) {
      where.userId = userId;
    }

    if (username) {
      where.username = Like(`%${username}%`);
    }

    if (ipAddress) {
      where.ipAddress = ipAddress;
    }

    if (startDate && endDate) {
      where.createdAt = Between(new Date(startDate), new Date(endDate));
    } else if (startDate) {
      where.createdAt = Between(new Date(startDate), new Date());
    }

    // Execute query
    const [data, total] = await this.auditLogRepository.findAndCount({
      where,
      order: { [sortBy]: sortOrder },
      skip,
      take: limit,
    });

    return {
      data,
      meta: {
        page,
        limit,
        total,
        totalPages: Math.ceil(total / limit),
      },
    };
  }

  /**
   * Find audit logs for a specific entity
   */
  async findByEntity(entityType: string, entityId: string): Promise<AuditLog[]> {
    return this.auditLogRepository.find({
      where: {
        entityType,
        entityId,
        isActive: true,
      },
      order: {
        createdAt: 'DESC',
      },
    });
  }

  /**
   * Find audit logs for a specific user
   */
  async findByUser(userId: string, limit: number = 50): Promise<AuditLog[]> {
    return this.auditLogRepository.find({
      where: {
        userId,
        isActive: true,
      },
      order: {
        createdAt: 'DESC',
      },
      take: limit,
    });
  }

  /**
   * Get audit log statistics
   */
  async getStatistics(startDate?: Date, endDate?: Date): Promise<any> {
    const query = this.auditLogRepository
      .createQueryBuilder('audit')
      .where('audit.isActive = :isActive', { isActive: true });

    if (startDate && endDate) {
      query.andWhere('audit.createdAt BETWEEN :startDate AND :endDate', {
        startDate,
        endDate,
      });
    }

    const [actionCounts, entityCounts, userCounts, total] = await Promise.all([
      // Count by action
      query
        .clone()
        .select('audit.action', 'action')
        .addSelect('COUNT(*)', 'count')
        .groupBy('audit.action')
        .getRawMany(),

      // Count by entity type
      query
        .clone()
        .select('audit.entityType', 'entityType')
        .addSelect('COUNT(*)', 'count')
        .groupBy('audit.entityType')
        .getRawMany(),

      // Count by user
      query
        .clone()
        .select('audit.userId', 'userId')
        .addSelect('audit.username', 'username')
        .addSelect('COUNT(*)', 'count')
        .groupBy('audit.userId')
        .addGroupBy('audit.username')
        .orderBy('count', 'DESC')
        .limit(10)
        .getRawMany(),

      // Total count
      query.getCount(),
    ]);

    return {
      total,
      byAction: actionCounts,
      byEntityType: entityCounts,
      topUsers: userCounts,
    };
  }

  /**
   * Clean up old audit logs (for maintenance)
   */
  async cleanup(daysToKeep: number = 90): Promise<number> {
    const cutoffDate = new Date();
    cutoffDate.setDate(cutoffDate.getDate() - daysToKeep);

    const result = await this.auditLogRepository
      .createQueryBuilder()
      .softDelete()
      .where('createdAt < :cutoffDate', { cutoffDate })
      .execute();

    return result.affected || 0;
  }
}
