import { Injectable, NestMiddleware, Logger } from '@nestjs/common';
import { Request, Response, NextFunction } from 'express';

/**
 * Security Monitoring Middleware
 * Detects and logs potential security threats without modifying data
 */
@Injectable()
export class InputSanitizationMiddleware implements NestMiddleware {
  private readonly logger = new Logger(InputSanitizationMiddleware.name);

  // Critical XSS patterns - only the most dangerous ones
  private readonly criticalXssPatterns = [
    /<script[^>]*>.*?<\/script>/gim,
    /<iframe[^>]*src\s*=\s*["']?javascript:/gim,
    /javascript:\s*(alert|eval|document\.)/gim,
    /vbscript:\s*(alert|eval|document\.)/gim,
    /data:text\/html[^;]*;base64/gim,
    /on(load|error|click|focus|blur)\s*=\s*["']?[^"']*\beval\b/gim,
  ];

  // High-risk SQL injection patterns - avoid false positives
  private readonly criticalSqlPatterns = [
    /\b(UNION\s+SELECT|DROP\s+TABLE|DELETE\s+FROM)\b/gim,
    /('\s*OR\s*'[^']*'\s*=\s*'|'\s*OR\s*1\s*=\s*1)/gim,
    /(;\s*(DROP|DELETE|UPDATE|INSERT|CREATE))\b/gim,
    /\b(EXEC|EXECUTE)\s*\(/gim,
  ];

  // MongoDB injection - specific operators only
  private readonly criticalNoSqlPatterns = [
    /\$where.*function/gim,
    /\$regex.*\.\*/gim,
    /\$ne.*null/gim,
  ];

  use(req: Request, res: Response, next: NextFunction): void {
    try {
      // Skip monitoring for certain endpoints
      const skipPaths = ['/api/upload', '/api/webhooks', '/api/docs'];
      const shouldSkip = skipPaths.some(path => req.path.startsWith(path));

      if (!shouldSkip) {
        // Monitor request body for threats (detection only)
        if (req.body) {
          this.detectThreats(req.body, 'body', req);
        }

        // Monitor query parameters for threats
        if (req.query) {
          this.detectThreats(req.query, 'query', req);
        }

        // Monitor URL parameters for threats
        if (req.params) {
          this.detectThreats(req.params, 'params', req);
        }

        // Check for suspicious patterns in headers
        this.validateHeaders(req);

        // Validate Content-Type
        this.validateContentType(req);
      }

      next();
    } catch (error) {
      this.logger.error('Security monitoring error:', error);
      // Continue processing even if monitoring fails
      next();
    }
  }

  /**
   * Recursively detect threats in object properties (detection only)
   */
  private detectThreats(obj: any, context: string, req: Request): void {
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
    for (const pattern of this.criticalXssPatterns) {
      if (pattern.test(input)) {
        threats.push('CRITICAL_XSS');
        break; // One detection per category is enough
      }
    }

    // Check for critical SQL injection patterns
    for (const pattern of this.criticalSqlPatterns) {
      if (pattern.test(input)) {
        threats.push('CRITICAL_SQL_INJECTION');
        break;
      }
    }

    // Check for critical NoSQL injection patterns
    for (const pattern of this.criticalNoSqlPatterns) {
      if (pattern.test(input)) {
        threats.push('CRITICAL_NOSQL_INJECTION');
        break;
      }
    }

    // Log only if critical threats detected
    if (threats.length > 0) {
      this.logger.warn(`Critical security threat detected in ${context}:`, {
        threats: threats.join(', '),
        path: req.path,
        method: req.method,
        ip: req.ip,
        userAgent: req.headers['user-agent']?.substring(0, 100),
        sample: input.substring(0, 200), // Log more context for analysis
      });
    }
  }


  /**
   * Validate request headers for suspicious content
   */
  private validateHeaders(req: Request): void {
    const suspiciousHeaders = ['x-forwarded-for', 'x-real-ip', 'user-agent'];
    
    for (const header of suspiciousHeaders) {
      const value = req.headers[header];
      if (typeof value === 'string') {
        // Check for header injection attempts (detection only)
        if (value.includes('\n') || value.includes('\r')) {
          this.logger.warn('Header injection attempt detected:', {
            header,
            value: value.substring(0, 100),
            ip: req.ip,
            path: req.path,
          });
        }

        // Check for excessively long headers (detection only)
        if (value.length > 2000) {
          this.logger.warn('Excessively long header detected:', {
            header,
            length: value.length,
            ip: req.ip,
            path: req.path,
          });
        }
      }
    }
  }

  /**
   * Validate Content-Type header (detection only)
   */
  private validateContentType(req: Request): void {
    const contentType = req.headers['content-type'];
    
    if (contentType && typeof contentType === 'string') {
      // Check for suspicious content types that might indicate attacks
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
        this.logger.warn('Suspicious Content-Type detected:', {
          contentType,
          method: req.method,
          path: req.path,
          ip: req.ip,
        });
      }
    }
  }

  /**
   * Get security monitoring statistics
   */
  getStats(): {
    threatsDetected: number;
    requestsMonitored: number;
  } {
    // In a real implementation, you might track these in Redis or memory
    return {
      threatsDetected: 0,
      requestsMonitored: 0,
    };
  }
}