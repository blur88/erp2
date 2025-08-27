import { Entity, Column, Index, CreateDateColumn } from 'typeorm';
import { BaseEntity } from '../../database/entities/base.entity';
import { UserRole } from '../../database/entities/user.entity';

export enum AuditAction {
  LOGIN = 'login',
  LOGIN_FAILED = 'login_failed',
  LOGOUT = 'logout',
  PASSWORD_CHANGE = 'password_change',
  PASSWORD_RESET_REQUEST = 'password_reset_request',
  PASSWORD_RESET_CONFIRM = 'password_reset_confirm',
  ACCOUNT_LOCKED = 'account_locked',
  ACCOUNT_UNLOCKED = 'account_unlocked',
  TOKEN_REFRESH = 'token_refresh',
  TOKEN_BLACKLIST = 'token_blacklist',
  PROFILE_UPDATE = 'profile_update',
  ROLE_CHANGE = 'role_change',
  ACCOUNT_STATUS_CHANGE = 'account_status_change',
  UNAUTHORIZED_ACCESS = 'unauthorized_access',
  PERMISSION_DENIED = 'permission_denied',
  SUSPICIOUS_ACTIVITY = 'suspicious_activity',
}

export enum AuditLevel {
  INFO = 'info',
  WARNING = 'warning',
  ERROR = 'error',
  CRITICAL = 'critical',
}

/**
 * Audit Log Entity
 * Tracks all security-related events in the system
 */
@Entity('audit_logs')
@Index(['userId', 'action'])
@Index(['action', 'level'])
@Index(['ipAddress', 'createdAt'])
@Index(['sessionId'])
@Index(['createdAt'])
export class AuditLog extends BaseEntity {
  @Column({
    type: 'uuid',
    nullable: true,
    comment: 'ID of the user who performed the action',
  })
  @Index()
  userId?: string;

  @Column({
    type: 'varchar',
    length: 50,
    nullable: true,
    comment: 'Username of the user who performed the action',
  })
  username?: string;

  @Column({
    type: 'enum',
    enum: UserRole,
    nullable: true,
    comment: 'Role of the user at the time of action',
  })
  userRole?: UserRole;

  @Column({
    type: 'uuid',
    nullable: true,
    comment: 'Session ID associated with the action',
  })
  @Index()
  sessionId?: string;

  @Column({
    type: 'enum',
    enum: AuditAction,
    comment: 'Type of action performed',
  })
  @Index()
  action: AuditAction;

  @Column({
    type: 'enum',
    enum: AuditLevel,
    default: AuditLevel.INFO,
    comment: 'Severity level of the audit event',
  })
  @Index()
  level: AuditLevel;

  @Column({
    type: 'text',
    comment: 'Description of the action performed',
  })
  description: string;

  @Column({
    type: 'varchar',
    length: 45,
    nullable: true,
    comment: 'IP address from which the action was performed',
  })
  @Index()
  ipAddress?: string;

  @Column({
    type: 'varchar',
    length: 500,
    nullable: true,
    comment: 'User agent string from the request',
  })
  userAgent?: string;

  @Column({
    type: 'varchar',
    length: 200,
    nullable: true,
    comment: 'API endpoint or resource accessed',
  })
  resource?: string;

  @Column({
    type: 'varchar',
    length: 10,
    nullable: true,
    comment: 'HTTP method used',
  })
  method?: string;

  @Column({
    type: 'int',
    nullable: true,
    comment: 'HTTP status code returned',
  })
  statusCode?: number;

  @Column({
    type: 'jsonb',
    nullable: true,
    comment: 'Additional context data for the audit event',
  })
  metadata?: Record<string, any>;

  @Column({
    type: 'text',
    nullable: true,
    comment: 'Error message if the action failed',
  })
  errorMessage?: string;

  @Column({
    type: 'int',
    default: 0,
    comment: 'Duration of the action in milliseconds',
  })
  duration?: number;

  @CreateDateColumn({
    type: 'timestamptz',
    comment: 'Timestamp when the audit event occurred',
  })
  createdAt: Date;

  @Column({
    type: 'varchar',
    length: 64,
    nullable: true,
    comment: 'Hash of the request for integrity verification',
  })
  requestHash?: string;

  @Column({
    type: 'boolean',
    default: false,
    comment: 'Whether this event represents a security risk',
  })
  isSecurityEvent: boolean;

  @Column({
    type: 'varchar',
    length: 100,
    nullable: true,
    comment: 'Geographic location based on IP address',
  })
  location?: string;

  @Column({
    type: 'varchar',
    length: 50,
    nullable: true,
    comment: 'Device type (mobile, desktop, tablet)',
  })
  deviceType?: string;
}