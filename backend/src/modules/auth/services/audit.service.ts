import { Injectable, Logger } from '@nestjs/common';
import { InjectRepository } from '@nestjs/typeorm';
import { Repository } from 'typeorm';
import { AuditLog } from '../../../common/audit/audit-log.entity';

export enum AuditEventType {
  // Authentication events
  LOGIN_SUCCESS = 'LOGIN_SUCCESS',
  LOGIN_FAILED = 'LOGIN_FAILED',
  LOGOUT = 'LOGOUT',
  
  // Account management
  ACCOUNT_CREATED = 'ACCOUNT_CREATED',
  ACCOUNT_LOCKED = 'ACCOUNT_LOCKED',
  ACCOUNT_UNLOCKED = 'ACCOUNT_UNLOCKED',
  ACCOUNT_SUSPENDED = 'ACCOUNT_SUSPENDED',
  ACCOUNT_ACTIVATED = 'ACCOUNT_ACTIVATED',
  
  // Password events
  PASSWORD_CHANGED = 'PASSWORD_CHANGED',
  PASSWORD_RESET_REQUESTED = 'PASSWORD_RESET_REQUESTED',
  PASSWORD_RESET_COMPLETED = 'PASSWORD_RESET_COMPLETED',
  PASSWORD_FAILED_ATTEMPTS = 'PASSWORD_FAILED_ATTEMPTS',
  
  // Session events
  SESSION_CREATED = 'SESSION_CREATED',
  SESSION_EXPIRED = 'SESSION_EXPIRED',
  SESSION_TERMINATED = 'SESSION_TERMINATED',
  
  // Security events
  SUSPICIOUS_ACTIVITY = 'SUSPICIOUS_ACTIVITY',
  RATE_LIMIT_EXCEEDED = 'RATE_LIMIT_EXCEEDED',
  UNAUTHORIZED_ACCESS_ATTEMPT = 'UNAUTHORIZED_ACCESS_ATTEMPT',
  
  // Token events
  TOKEN_ISSUED = 'TOKEN_ISSUED',
  TOKEN_REFRESHED = 'TOKEN_REFRESHED',
  TOKEN_REVOKED = 'TOKEN_REVOKED',
  INVALID_TOKEN_USED = 'INVALID_TOKEN_USED',
}

export enum AuditSeverity {
  LOW = 'LOW',
  MEDIUM = 'MEDIUM',
  HIGH = 'HIGH',
  CRITICAL = 'CRITICAL',
}

export interface AuditContext {
  userId?: string;
  username?: string;
  email?: string;
  ipAddress?: string;
  userAgent?: string;
  sessionId?: string;
  endpoint?: string;
  method?: string;
  resource?: string;
  [key: string]: any;
}

/**
 * Audit Service for Authentication and Security Events
 * Provides comprehensive logging and monitoring of security-related activities
 */
@Injectable()
export class AuditService {
  private readonly logger = new Logger(AuditService.name);

  constructor(
    @InjectRepository(AuditLog)
    private auditLogRepository: Repository<AuditLog>,
  ) {}

  /**
   * Log authentication event
   */
  async logAuthEvent(
    eventType: AuditEventType,
    severity: AuditSeverity,
    description: string,
    context: AuditContext,
    details?: Record<string, any>,
  ): Promise<void> {
    try {
      const auditLog = this.auditLogRepository.create({
        eventType,
        severity,
        description,
        userId: context.userId,
        username: context.username,
        ipAddress: context.ipAddress,
        userAgent: context.userAgent,
        sessionId: context.sessionId,
        endpoint: context.endpoint,
        method: context.method,
        resource: context.resource,
        metadata: {
          ...details,
          timestamp: new Date().toISOString(),
          context,
        },
      });

      await this.auditLogRepository.save(auditLog);

      // Log to application logs for monitoring
      const logLevel = this.getLogLevel(severity);
      const logMessage = this.formatLogMessage(eventType, description, context);
      
      this.logger[logLevel](logMessage);

      // Trigger alerts for critical events
      if (severity === AuditSeverity.CRITICAL) {
        await this.triggerSecurityAlert(eventType, description, context);
      }

    } catch (error) {
      this.logger.error('Failed to create audit log:', error);
      // Don't throw to avoid breaking the main flow
    }
  }

  /**
   * Log successful login
   */
  async logSuccessfulLogin(context: AuditContext): Promise<void> {
    await this.logAuthEvent(
      AuditEventType.LOGIN_SUCCESS,
      AuditSeverity.LOW,
      `User ${context.username} logged in successfully`,
      context,
      {
        loginTime: new Date().toISOString(),
        browserInfo: context.userAgent,
      }
    );
  }

  /**
   * Log failed login attempt
   */
  async logFailedLogin(context: AuditContext, reason: string, attemptCount?: number): Promise<void> {
    const severity = attemptCount && attemptCount >= 5 
      ? AuditSeverity.HIGH 
      : AuditSeverity.MEDIUM;

    await this.logAuthEvent(
      AuditEventType.LOGIN_FAILED,
      severity,
      `Failed login attempt for ${context.username || context.email}: ${reason}`,
      context,
      {
        failureReason: reason,
        attemptCount,
        timestamp: new Date().toISOString(),
      }
    );
  }

  /**
   * Log account lockout
   */
  async logAccountLockout(context: AuditContext, lockDuration: number): Promise<void> {
    await this.logAuthEvent(
      AuditEventType.ACCOUNT_LOCKED,
      AuditSeverity.HIGH,
      `Account ${context.username} locked due to too many failed login attempts`,
      context,
      {
        lockDurationMinutes: lockDuration / (60 * 1000),
        lockTime: new Date().toISOString(),
      }
    );
  }

  /**
   * Log password change
   */
  async logPasswordChange(context: AuditContext, isReset = false): Promise<void> {
    const eventType = isReset ? AuditEventType.PASSWORD_RESET_COMPLETED : AuditEventType.PASSWORD_CHANGED;
    const action = isReset ? 'reset' : 'changed';

    await this.logAuthEvent(
      eventType,
      AuditSeverity.MEDIUM,
      `Password ${action} for user ${context.username}`,
      context,
      {
        isPasswordReset: isReset,
        changeTime: new Date().toISOString(),
      }
    );
  }

  /**
   * Log password reset request
   */
  async logPasswordResetRequest(context: AuditContext): Promise<void> {
    await this.logAuthEvent(
      AuditEventType.PASSWORD_RESET_REQUESTED,
      AuditSeverity.LOW,
      `Password reset requested for ${context.email}`,
      context,
      {
        requestTime: new Date().toISOString(),
      }
    );
  }

  /**
   * Log session events
   */
  async logSessionEvent(
    eventType: AuditEventType.SESSION_CREATED | AuditEventType.SESSION_EXPIRED | AuditEventType.SESSION_TERMINATED,
    context: AuditContext,
  ): Promise<void> {
    const descriptions = {
      [AuditEventType.SESSION_CREATED]: 'Session created',
      [AuditEventType.SESSION_EXPIRED]: 'Session expired',
      [AuditEventType.SESSION_TERMINATED]: 'Session terminated',
    };

    await this.logAuthEvent(
      eventType,
      AuditSeverity.LOW,
      `${descriptions[eventType]} for user ${context.username}`,
      context,
      {
        eventTime: new Date().toISOString(),
      }
    );
  }

  /**
   * Log suspicious activity
   */
  async logSuspiciousActivity(
    description: string, 
    context: AuditContext, 
    riskScore?: number
  ): Promise<void> {
    const severity = riskScore && riskScore >= 8 
      ? AuditSeverity.CRITICAL 
      : AuditSeverity.HIGH;

    await this.logAuthEvent(
      AuditEventType.SUSPICIOUS_ACTIVITY,
      severity,
      description,
      context,
      {
        riskScore,
        detectionTime: new Date().toISOString(),
        requiresInvestigation: severity === AuditSeverity.CRITICAL,
      }
    );
  }

  /**
   * Log rate limiting events
   */
  async logRateLimitExceeded(
    context: AuditContext, 
    endpoint: string, 
    limitType: string
  ): Promise<void> {
    await this.logAuthEvent(
      AuditEventType.RATE_LIMIT_EXCEEDED,
      AuditSeverity.MEDIUM,
      `Rate limit exceeded for ${limitType} on ${endpoint}`,
      { ...context, endpoint },
      {
        limitType,
        endpoint,
        timestamp: new Date().toISOString(),
      }
    );
  }

  /**
   * Log unauthorized access attempts
   */
  async logUnauthorizedAccess(
    context: AuditContext,
    attemptedResource: string,
    requiredPermission: string
  ): Promise<void> {
    await this.logAuthEvent(
      AuditEventType.UNAUTHORIZED_ACCESS_ATTEMPT,
      AuditSeverity.MEDIUM,
      `Unauthorized access attempt to ${attemptedResource}`,
      { ...context, resource: attemptedResource },
      {
        attemptedResource,
        requiredPermission,
        attemptTime: new Date().toISOString(),
      }
    );
  }

  /**
   * Get audit logs with filtering
   */
  async getAuditLogs(
    filters: {
      userId?: string;
      username?: string;
      eventType?: AuditEventType;
      severity?: AuditSeverity;
      startDate?: Date;
      endDate?: Date;
      ipAddress?: string;
    },
    page = 1,
    limit = 50,
  ): Promise<{ logs: AuditLog[]; total: number }> {
    const query = this.auditLogRepository.createQueryBuilder('audit');

    if (filters.userId) {
      query.andWhere('audit.userId = :userId', { userId: filters.userId });
    }

    if (filters.username) {
      query.andWhere('audit.username ILIKE :username', { 
        username: `%${filters.username}%` 
      });
    }

    if (filters.eventType) {
      query.andWhere('audit.eventType = :eventType', { 
        eventType: filters.eventType 
      });
    }

    if (filters.severity) {
      query.andWhere('audit.severity = :severity', { 
        severity: filters.severity 
      });
    }

    if (filters.startDate) {
      query.andWhere('audit.createdAt >= :startDate', { 
        startDate: filters.startDate 
      });
    }

    if (filters.endDate) {
      query.andWhere('audit.createdAt <= :endDate', { 
        endDate: filters.endDate 
      });
    }

    if (filters.ipAddress) {
      query.andWhere('audit.ipAddress = :ipAddress', { 
        ipAddress: filters.ipAddress 
      });
    }

    const total = await query.getCount();
    
    const logs = await query
      .orderBy('audit.createdAt', 'DESC')
      .skip((page - 1) * limit)
      .take(limit)
      .getMany();

    return { logs, total };
  }

  /**
   * Get security statistics
   */
  async getSecurityStats(timeframe: 'day' | 'week' | 'month' = 'week'): Promise<any> {
    const now = new Date();
    const startDate = new Date(now);
    
    switch (timeframe) {
      case 'day':
        startDate.setHours(0, 0, 0, 0);
        break;
      case 'week':
        startDate.setDate(now.getDate() - 7);
        break;
      case 'month':
        startDate.setMonth(now.getMonth() - 1);
        break;
    }

    const query = this.auditLogRepository.createQueryBuilder('audit')
      .select('audit.eventType', 'eventType')
      .addSelect('audit.severity', 'severity')
      .addSelect('COUNT(*)', 'count')
      .where('audit.createdAt >= :startDate', { startDate })
      .groupBy('audit.eventType, audit.severity')
      .orderBy('count', 'DESC');

    const results = await query.getRawMany();

    return {
      timeframe,
      startDate,
      endDate: now,
      events: results,
      totalEvents: results.reduce((sum, r) => sum + parseInt(r.count), 0),
    };
  }

  /**
   * Get log level based on severity
   */
  private getLogLevel(severity: AuditSeverity): string {
    switch (severity) {
      case AuditSeverity.CRITICAL:
        return 'error';
      case AuditSeverity.HIGH:
        return 'warn';
      case AuditSeverity.MEDIUM:
        return 'log';
      case AuditSeverity.LOW:
      default:
        return 'debug';
    }
  }

  /**
   * Format log message for structured logging
   */
  private formatLogMessage(
    eventType: AuditEventType, 
    description: string, 
    context: AuditContext
  ): string {
    return JSON.stringify({
      event: eventType,
      description,
      user: context.username || context.userId,
      ip: context.ipAddress,
      timestamp: new Date().toISOString(),
    });
  }

  /**
   * Trigger security alert for critical events
   */
  private async triggerSecurityAlert(
    eventType: AuditEventType,
    description: string,
    context: AuditContext,
  ): Promise<void> {
    // This would integrate with monitoring/alerting systems
    // For now, just log at error level
    this.logger.error(`SECURITY ALERT: ${eventType} - ${description}`, {
      context,
      timestamp: new Date().toISOString(),
    });
    
    // TODO: Integrate with external alerting systems
    // - Send to monitoring dashboard
    // - Send email/SMS alerts
    // - Post to security chat channels
  }
}