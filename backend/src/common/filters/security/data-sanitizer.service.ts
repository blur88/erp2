import { Injectable, Logger } from '@nestjs/common';

/**
 * Service for sanitizing sensitive data in error messages and logs
 */
@Injectable()
export class DataSanitizerService {
  private readonly logger = new Logger(DataSanitizerService.name);

  /**
   * Sanitize request path by removing sensitive parameters
   */
  sanitizePath(path: string): string {
    if (!path) return '[UNKNOWN_PATH]';
    // Remove potential sensitive parameters but keep structure
    return path.replace(/([?&])(password|token|key|secret)=[^&]*/gi, '$1$2=[REDACTED]');
  }

  /**
   * Sanitize IP address for privacy
   */
  sanitizeIP(ip: string): string {
    if (!ip) return '[UNKNOWN]';
    // Mask last octet for IPv4, last groups for IPv6
    if (ip.includes('.')) {
      return ip.replace(/\d+$/, 'xxx');
    }
    return ip.replace(/:([^:]+):([^:]+)$/, ':xxx:xxx');
  }

  /**
   * Sanitize user agent string
   */
  sanitizeUserAgent(userAgent: string): string {
    if (!userAgent) return '[UNKNOWN]';
    // Keep browser info but remove detailed version numbers
    return userAgent.replace(/\d+\.\d+\.\d+/g, 'x.x.x');
  }

  /**
   * Sanitize error messages to prevent information disclosure
   */
  sanitizeErrorMessage(message: string): string {
    if (!message || typeof message !== 'string') {
      return '[INVALID_MESSAGE]';
    }

    // Limit processing to reasonable message length to prevent ReDoS
    if (message.length > 5000) {
      return '[MESSAGE_TOO_LONG]';
    }

    try {
      return message
        .replace(/password\s*=\s*[^\s]+/gi, 'password=[REDACTED]')
        .replace(/token\s*=\s*[^\s]+/gi, 'token=[REDACTED]')
        .replace(/key\s*=\s*[^\s]+/gi, 'key=[REDACTED]')
        .replace(/secret\s*=\s*[^\s]+/gi, 'secret=[REDACTED]');
    } catch (regexError) {
      this.logger.warn('Regex processing failed during message sanitization');
      return '[SANITIZATION_ERROR]';
    }
  }

  /**
   * Sanitize stack trace for safe logging
   */
  sanitizeStackTrace(stack: string, maxLines: number = 5): string {
    if (!stack) return '[NO_STACK]';
    
    try {
      // Remove potential file paths and keep only relevant error info
      return stack
        .split('\n')
        .slice(0, maxLines) // Limit stack trace length
        .map(line => line.replace(/\/[^\s]+\//g, '/[PATH]/'))
        .join('\n');
    } catch (error) {
      this.logger.warn('Failed to sanitize stack trace');
      return '[STACK_SANITIZATION_ERROR]';
    }
  }

  /**
   * Check if message contains sensitive information
   */
  containsSensitiveInfo(message: string): boolean {
    if (!message || typeof message !== 'string') {
      return false;
    }

    // Limit processing to reasonable message length
    if (message.length > 5000) {
      return true; // Assume sensitive if unusually long
    }

    try {
      // Use simple, bounded regex patterns to prevent ReDoS
      const sensitivePatterns = [
        /password\s*[:=]/i,
        /token\s*[:=]/i,
        /key\s*[:=]/i,
        /secret\s*[:=]/i,
        /credential/i,
        /authorization\s*:/i,
      ];

      return sensitivePatterns.some(pattern => pattern.test(message));
    } catch (regexError) {
      this.logger.warn('Regex processing failed during sensitive info check');
      return true; // Assume sensitive on error to be safe
    }
  }
}