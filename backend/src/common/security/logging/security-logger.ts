import { Logger } from '@nestjs/common';

export interface ThreatDetectionLog {
  threats: string;
  context: string;
  path: string;
  method: string;
  ip: string;
  userAgent?: string;
  sample: string;
}

export interface HeaderInjectionLog {
  header: string;
  value: string;
  ip: string;
  path: string;
}

export interface ExcessiveHeaderLengthLog {
  header: string;
  length: number;
  ip: string;
  path: string;
}

export interface SuspiciousContentTypeLog {
  contentType: string;
  method: string;
  path: string;
  ip: string;
}

/**
 * Security Event Logger
 * Centralized logging for security-related events
 */
export class SecurityLogger {
  private readonly logger = new Logger('SecurityMonitor');

  logThreatDetection(data: ThreatDetectionLog): void {
    this.logger.warn(`Critical security threat detected in ${data.context}:`, {
      threats: data.threats,
      path: data.path,
      method: data.method,
      ip: data.ip,
      userAgent: data.userAgent,
      sample: data.sample,
    });
  }

  logHeaderInjection(data: HeaderInjectionLog): void {
    this.logger.warn('Header injection attempt detected:', {
      header: data.header,
      value: data.value,
      ip: data.ip,
      path: data.path,
    });
  }

  logExcessiveHeaderLength(data: ExcessiveHeaderLengthLog): void {
    this.logger.warn('Excessively long header detected:', {
      header: data.header,
      length: data.length,
      ip: data.ip,
      path: data.path,
    });
  }

  logSuspiciousContentType(data: SuspiciousContentTypeLog): void {
    this.logger.warn('Suspicious Content-Type detected:', {
      contentType: data.contentType,
      method: data.method,
      path: data.path,
      ip: data.ip,
    });
  }

  logError(message: string, error: any): void {
    this.logger.error(message, error);
  }
}