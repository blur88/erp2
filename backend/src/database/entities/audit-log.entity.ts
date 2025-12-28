import { Entity, Column, Index } from 'typeorm';
import { BaseEntity } from './base.entity';

/**
 * AuditLog entity for tracking all user actions and changes in the system
 */
@Entity('audit_logs')
@Index(['action'])
@Index(['entityType'])
@Index(['entityId'])
@Index(['userId'])
@Index(['createdAt'])
export class AuditLog extends BaseEntity {
  /**
   * User ID who performed the action (using 'system' for system-generated actions)
   */
  @Column({ type: 'varchar', length: 100 })
  userId: string;

  /**
   * Username for display purposes
   */
  @Column({ type: 'varchar', length: 255, nullable: true })
  username?: string;

  /**
   * Action performed (CREATE, UPDATE, DELETE, RESTORE, etc.)
   */
  @Column({ type: 'varchar', length: 50 })
  action: string;

  /**
   * Type of entity affected (Product, Category, SalesOrder, etc.)
   */
  @Column({ type: 'varchar', length: 100 })
  entityType: string;

  /**
   * ID of the affected entity
   */
  @Column({ type: 'uuid', nullable: true })
  entityId?: string;

  /**
   * Human-readable description of the action
   */
  @Column({ type: 'text' })
  description: string;

  /**
   * Previous state of the entity (JSON)
   */
  @Column({ type: 'jsonb', nullable: true })
  oldValues?: any;

  /**
   * New state of the entity (JSON)
   */
  @Column({ type: 'jsonb', nullable: true })
  newValues?: any;

  /**
   * IP address of the user
   */
  @Column({ type: 'varchar', length: 45, nullable: true })
  ipAddress?: string;

  /**
   * User agent string
   */
  @Column({ type: 'text', nullable: true })
  userAgent?: string;

  /**
   * Additional metadata (JSON)
   */
  @Column({ type: 'jsonb', nullable: true })
  metadata?: any;
}
