import { Request } from 'express';
import { ThreatPatterns } from './patterns';
import { SecurityLogger } from '../logging/security-logger';

interface ThreatDetectionContext {
  input: string;
  context: string;
  request: Request;
}

/**
 * Threat Detection Service
 * Handles detection of various security threats in input data
 */
export class ThreatDetector {
  constructor(private readonly logger: SecurityLogger) {}

  /**
   * Recursively detect threats in object properties (detection only)
   */
  detectThreats(obj: any, context: string, req: Request): void {
    if (obj === null || obj === undefined) {
      return;
    }

    if (Array.isArray(obj)) {
      obj.forEach((item, index) => 
        this.detectThreats(item, `${context}[${index}]`, req)
      );
      return;
    }

    if (typeof obj === 'object') {
      for (const [key, value] of Object.entries(obj)) {
        // Check key for threats
        this.checkStringForThreats(key, `${context}.${key}(key)`, req);
        // Check value recursively
        this.detectThreats(value, `${context}.${key}`, req);
      }
      return;
    }

    if (typeof obj === 'string') {
      this.checkStringForThreats(obj, context, req);
    }
  }

  /**
   * Check string for security threats (detection only - no modification)
   */
  private checkStringForThreats(input: string, context: string, req: Request): void {
    if (!input || typeof input !== 'string') {
      return;
    }

    const threats: string[] = [];

    // Check for critical XSS patterns
    if (this.detectXssThreats(input)) {
      threats.push('CRITICAL_XSS');
    }

    // Check for critical SQL injection patterns
    if (this.detectSqlThreats(input)) {
      threats.push('CRITICAL_SQL_INJECTION');
    }

    // Check for critical NoSQL injection patterns
    if (this.detectNoSqlThreats(input)) {
      threats.push('CRITICAL_NOSQL_INJECTION');
    }

    // Log only if critical threats detected
    if (threats.length > 0) {
      this.logger.logThreatDetection({
        threats: threats.join(', '),
        context,
        path: req.path,
        method: req.method,
        ip: req.ip,
        userAgent: req.headers['user-agent']?.substring(0, 100),
        sample: input.substring(0, 200),
      });
    }
  }

  private detectXssThreats(input: string): boolean {
    return ThreatPatterns.CRITICAL_XSS_PATTERNS.some(pattern => pattern.test(input));
  }

  private detectSqlThreats(input: string): boolean {
    return ThreatPatterns.CRITICAL_SQL_PATTERNS.some(pattern => pattern.test(input));
  }

  private detectNoSqlThreats(input: string): boolean {
    return ThreatPatterns.CRITICAL_NOSQL_PATTERNS.some(pattern => pattern.test(input));
  }
}
