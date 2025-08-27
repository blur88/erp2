import { Injectable, NestMiddleware, Logger } from '@nestjs/common';
import { Request, Response, NextFunction } from 'express';

/**
 * Input Sanitization Middleware
 * Sanitizes request data to prevent XSS and injection attacks
 */
@Injectable()
export class InputSanitizationMiddleware implements NestMiddleware {
  private readonly logger = new Logger(InputSanitizationMiddleware.name);

  // Patterns to detect and sanitize
  private readonly xssPatterns = [
    /<script[^>]*>.*?<\/script>/gim,
    /<iframe[^>]*>.*?<\/iframe>/gim,
    /<object[^>]*>.*?<\/object>/gim,
    /<embed[^>]*>/gim,
    /<applet[^>]*>.*?<\/applet>/gim,
    /<meta[^>]*>/gim,
    /<link[^>]*>/gim,
    /javascript:/gim,
    /vbscript:/gim,
    /data:text\/html/gim,
    /on\w+\s*=/gim, // Event handlers like onclick, onload, etc.
  ];

  private readonly sqlInjectionPatterns = [
    /(\b(SELECT|INSERT|UPDATE|DELETE|DROP|CREATE|ALTER|EXEC|EXECUTE)\b)/gim,
    /(\b(UNION|OR|AND)\b.*\b(SELECT|INSERT|UPDATE|DELETE)\b)/gim,
    /(;|\||&|%|'|"|`)/gim, // Basic SQL injection characters
    /(\bOR\b.*=.*)/gim,
    /(\bAND\b.*=.*)/gim,
    /(1=1|1\s*=\s*1)/gim,
    /(1=0|1\s*=\s*0)/gim,
  ];

  private readonly noSqlInjectionPatterns = [
    /\$where/gim,
    /\$ne/gim,
    /\$gt/gim,
    /\$lt/gim,
    /\$gte/gim,
    /\$lte/gim,
    /\$in/gim,
    /\$nin/gim,
    /\$regex/gim,
    /\$exists/gim,
  ];

  // Common bypass attempts
  private readonly bypassPatterns = [
    /(%3C|&lt;)script/gim,
    /(%3E|&gt;)/gim,
    /(%22|&quot;|&#34;)/gim,
    /(%27|&#39;)/gim,
    /(%2F|&#47;)/gim,
    /(%5C|&#92;)/gim,
  ];

  use(req: Request, res: Response, next: NextFunction): void {
    try {
      // Skip sanitization for certain endpoints that need raw data
      const skipPaths = ['/api/upload', '/api/webhooks'];
      const shouldSkip = skipPaths.some(path => req.path.startsWith(path));

      if (!shouldSkip) {
        // Sanitize request body
        if (req.body) {
          req.body = this.sanitizeObject(req.body, 'body');
        }

        // Sanitize query parameters
        if (req.query) {
          req.query = this.sanitizeObject(req.query, 'query');
        }

        // Sanitize URL parameters
        if (req.params) {
          req.params = this.sanitizeObject(req.params, 'params');
        }

        // Check for suspicious patterns in headers
        this.validateHeaders(req);

        // Validate Content-Type
        this.validateContentType(req);
      }

      next();
    } catch (error) {
      this.logger.error('Input sanitization error:', error);
      // Continue processing even if sanitization fails to avoid breaking the app
      next();
    }
  }

  /**
   * Recursively sanitize object properties
   */
  private sanitizeObject(obj: any, context: string): any {
    if (obj === null || obj === undefined) {
      return obj;
    }

    if (Array.isArray(obj)) {
      return obj.map((item, index) => 
        this.sanitizeObject(item, `${context}[${index}]`)
      );
    }

    if (typeof obj === 'object') {
      const sanitized: any = {};
      for (const [key, value] of Object.entries(obj)) {
        const sanitizedKey = this.sanitizeString(key, `${context}.${key}`);
        sanitized[sanitizedKey] = this.sanitizeObject(value, `${context}.${key}`);
      }
      return sanitized;
    }

    if (typeof obj === 'string') {
      return this.sanitizeString(obj, context);
    }

    return obj;
  }

  /**
   * Sanitize string values
   */
  private sanitizeString(input: string, context: string): string {
    if (!input || typeof input !== 'string') {
      return input;
    }

    let sanitized = input;
    let threats: string[] = [];

    // Detect and log XSS attempts
    for (const pattern of this.xssPatterns) {
      if (pattern.test(sanitized)) {
        threats.push('XSS');
        sanitized = sanitized.replace(pattern, '');
      }
    }

    // Detect and log SQL injection attempts
    for (const pattern of this.sqlInjectionPatterns) {
      if (pattern.test(sanitized)) {
        threats.push('SQL_INJECTION');
        // For SQL injection, we're more aggressive and encode suspicious characters
        sanitized = this.encodeSqlCharacters(sanitized);
      }
    }

    // Detect and log NoSQL injection attempts
    for (const pattern of this.noSqlInjectionPatterns) {
      if (pattern.test(sanitized)) {
        threats.push('NOSQL_INJECTION');
        sanitized = sanitized.replace(pattern, '');
      }
    }

    // Handle bypass attempts
    for (const pattern of this.bypassPatterns) {
      if (pattern.test(sanitized)) {
        threats.push('BYPASS_ATTEMPT');
        sanitized = this.decodeAndSanitize(sanitized);
      }
    }

    // Log threats if detected
    if (threats.length > 0) {
      this.logger.warn(`Security threats detected in ${context}:`, {
        threats: threats.join(', '),
        original: input.substring(0, 100), // Log first 100 chars
        sanitized: sanitized.substring(0, 100),
      });
    }

    // Additional HTML entity encoding for safety
    sanitized = this.htmlEncode(sanitized);

    // Limit string length to prevent DoS
    if (sanitized.length > 10000) {
      this.logger.warn(`String length exceeded limit in ${context}:`, {
        length: sanitized.length,
        truncated: true,
      });
      sanitized = sanitized.substring(0, 10000);
    }

    return sanitized;
  }

  /**
   * Encode HTML entities
   */
  private htmlEncode(input: string): string {
    return input
      .replace(/&/g, '&amp;')
      .replace(/</g, '&lt;')
      .replace(/>/g, '&gt;')
      .replace(/"/g, '&quot;')
      .replace(/'/g, '&#39;')
      .replace(/\//g, '&#47;');
  }

  /**
   * Encode SQL-specific characters
   */
  private encodeSqlCharacters(input: string): string {
    return input
      .replace(/'/g, "''") // Escape single quotes
      .replace(/;/g, '') // Remove semicolons
      .replace(/--/g, '') // Remove SQL comments
      .replace(/\/\*/g, '') // Remove SQL block comments
      .replace(/\*\//g, '');
  }

  /**
   * Decode and sanitize bypass attempts
   */
  private decodeAndSanitize(input: string): string {
    let decoded = input;
    
    // Decode common URL encodings
    try {
      decoded = decodeURIComponent(decoded);
    } catch (e) {
      // Invalid encoding, use original
      decoded = input;
    }

    // Decode HTML entities
    decoded = decoded
      .replace(/&lt;/g, '<')
      .replace(/&gt;/g, '>')
      .replace(/&quot;/g, '"')
      .replace(/&#39;/g, "'")
      .replace(/&#47;/g, '/')
      .replace(/&amp;/g, '&');

    // Re-sanitize the decoded content
    return this.htmlEncode(decoded);
  }

  /**
   * Validate request headers for suspicious content
   */
  private validateHeaders(req: Request): void {
    const suspiciousHeaders = ['x-forwarded-for', 'x-real-ip', 'user-agent'];
    
    for (const header of suspiciousHeaders) {
      const value = req.headers[header];
      if (typeof value === 'string') {
        // Check for header injection attempts
        if (value.includes('\n') || value.includes('\r')) {
          this.logger.warn('Header injection attempt detected:', {
            header,
            value: value.substring(0, 100),
            ip: req.ip,
          });
          // Remove newlines from headers
          req.headers[header] = value.replace(/[\r\n]/g, '');
        }

        // Check for excessively long headers
        if (value.length > 1000) {
          this.logger.warn('Excessively long header detected:', {
            header,
            length: value.length,
            ip: req.ip,
          });
          // Truncate long headers
          req.headers[header] = value.substring(0, 1000);
        }
      }
    }
  }

  /**
   * Validate Content-Type header
   */
  private validateContentType(req: Request): void {
    const contentType = req.headers['content-type'];
    
    if (contentType && typeof contentType === 'string') {
      // List of allowed content types
      const allowedTypes = [
        'application/json',
        'application/x-www-form-urlencoded',
        'multipart/form-data',
        'text/plain',
        'text/csv',
        'application/pdf',
        'image/jpeg',
        'image/png',
        'image/gif',
        'image/webp',
      ];

      const isAllowed = allowedTypes.some(type => 
        contentType.toLowerCase().includes(type.toLowerCase())
      );

      if (!isAllowed && req.method !== 'GET' && req.method !== 'DELETE') {
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
   * Check if string contains only safe characters
   */
  private isOnlySafeCharacters(input: string): boolean {
    // Allow alphanumeric, spaces, and common punctuation
    const safePattern = /^[a-zA-Z0-9\s\.\,\!\?\-\(\)\[\]\{\}@#$%^&*_+=:;]*$/;
    return safePattern.test(input);
  }

  /**
   * Get sanitization statistics
   */
  getStats(): {
    threatsBlocked: number;
    requestsProcessed: number;
  } {
    // In a real implementation, you might track these in Redis or memory
    return {
      threatsBlocked: 0,
      requestsProcessed: 0,
    };
  }
}