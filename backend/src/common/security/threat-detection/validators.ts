import type { Request } from 'express';
import { SecurityLogger } from '../logging/security-logger';

/**
 * Request Validators
 * Validates various aspects of HTTP requests for security threats
 */
export class RequestValidators {
  constructor(private readonly logger: SecurityLogger) {}

  /**
   * Validate request headers for suspicious content
   */
  validateHeaders(req: Request): void {
    const suspiciousHeaders = ['x-forwarded-for', 'x-real-ip', 'user-agent'];
    
    for (const header of suspiciousHeaders) {
      const value = req.headers[header];
      if (typeof value === 'string') {
        this.validateHeaderInjection(header, value, req);
        this.validateHeaderLength(header, value, req);
      }
    }
  }

  /**
   * Validate Content-Type header (detection only)
   */
  validateContentType(req: Request): void {
    const contentType = req.headers['content-type'];
    
    if (contentType && typeof contentType === 'string') {
      const suspiciousTypes = [
        'text/html',
        'text/javascript',
        'application/javascript',
        'text/vbscript',
      ];

      const isSuspicious = suspiciousTypes.some(type => 
        contentType.toLowerCase().includes(type.toLowerCase())
      );

      if (isSuspicious && req.method !== 'GET') {
        this.logger.logSuspiciousContentType({
          contentType,
          method: req.method,
          path: req.path,
          ip: req.ip,
        });
      }
    }
  }

  private validateHeaderInjection(header: string, value: string, req: Request): void {
    // Check for header injection attempts (detection only)
    if (value.includes('\n') || value.includes('\r')) {
      this.logger.logHeaderInjection({
        header,
        value: value.substring(0, 100),
        ip: req.ip,
        path: req.path,
      });
    }
  }

  private validateHeaderLength(header: string, value: string, req: Request): void {
    // Check for excessively long headers (detection only)
    if (value.length > 2000) {
      this.logger.logExcessiveHeaderLength({
        header,
        length: value.length,
        ip: req.ip,
        path: req.path,
      });
    }
  }
}