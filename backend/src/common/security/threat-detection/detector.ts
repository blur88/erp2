import { BadRequestException } from '@nestjs/common';
import type { Request } from 'express';
import sanitizeHtml from 'sanitize-html';
import { ThreatPatterns } from './patterns';
import { SecurityLogger } from '../logging/security-logger';

export class ThreatDetector {
  constructor(private readonly logger: SecurityLogger) {}

  detectThreats(obj: any, context: string, req: Request): void {
    if (obj === null || obj === undefined) {
      return;
    }

    if (Array.isArray(obj)) {
      obj.forEach((item, index) =>
        this.detectThreats(item, `${context}[${index}]`, req),
      );
      return;
    }

    if (typeof obj === 'object') {
      for (const [key, value] of Object.entries(obj)) {
        this.checkStringForThreats(key, `${context}.${key}(key)`, req);
        this.detectThreats(value, `${context}.${key}`, req);
      }
      return;
    }

    if (typeof obj === 'string') {
      this.checkStringForThreats(obj, context, req);
    }
  }

  private checkStringForThreats(
    input: string,
    context: string,
    req: Request,
  ): void {
    if (!input || typeof input !== 'string') {
      return;
    }

    // XSS: block immediately after logging.
    if (this.detectXssThreats(input)) {
      this.logger.logThreatDetection({
        threats: 'CRITICAL_XSS',
        context,
        path: req.path,
        method: req.method,
        ip: req.ip,
        userAgent: req.headers['user-agent']?.substring(0, 100),
        sample: input.substring(0, 200),
      });
      throw new BadRequestException(
        'Request contains potentially malicious content',
      );
    }

    const threats: string[] = [];

    if (this.detectSqlThreats(input)) {
      threats.push('CRITICAL_SQL_INJECTION');
    }

    if (this.detectNoSqlThreats(input)) {
      threats.push('CRITICAL_NOSQL_INJECTION');
    }

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
    const sanitized = sanitizeHtml(input, {
      allowedTags: [],
      allowedAttributes: {},
    });
    // sanitize-html encodes bare < and > as &lt;/&gt; in plain text (not HTML tags).
    // Allow that: only block when sanitized output is not simply the bracket-encoded input.
    return sanitized !== input && sanitized !== this.escapeAngleBrackets(input);
  }

  private escapeAngleBrackets(input: string): string {
    return input.replace(/</g, '&lt;').replace(/>/g, '&gt;');
  }

  private detectSqlThreats(input: string): boolean {
    return ThreatPatterns.CRITICAL_SQL_PATTERNS.some((pattern) =>
      pattern.test(input),
    );
  }

  private detectNoSqlThreats(input: string): boolean {
    return ThreatPatterns.CRITICAL_NOSQL_PATTERNS.some((pattern) =>
      pattern.test(input),
    );
  }
}
