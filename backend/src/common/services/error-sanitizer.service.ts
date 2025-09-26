import { Injectable, Logger } from '@nestjs/common';

@Injectable()
export class ErrorSanitizerService {
  private readonly logger = new Logger(ErrorSanitizerService.name);

  /**
   * Sanitize error messages to prevent information disclosure using ReDoS-safe patterns
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
      // Use simple, non-backtracking regex patterns to prevent ReDoS
      return message
        .replace(/table\s+"[a-zA-Z0-9_]{1,64}"/gi, 'table "[TABLE]"')
        .replace(/column\s+"[a-zA-Z0-9_]{1,64}"/gi, 'column "[COLUMN]"')
        .replace(/constraint\s+"[a-zA-Z0-9_]{1,64}"/gi, 'constraint "[CONSTRAINT]"')
        .replace(/Key\s+\([a-zA-Z0-9_,\s]{1,200}\)/gi, 'Key ([FIELDS])')
        .replace(/=\s*\([^)]{1,100}\)/gi, '=([VALUE])')
        // Additional sanitization for common database identifiers
        .replace(/index\s+"[a-zA-Z0-9_]{1,64}"/gi, 'index "[INDEX]"')
        .replace(/schema\s+"[a-zA-Z0-9_]{1,64}"/gi, 'schema "[SCHEMA]"')
        .replace(/database\s+"[a-zA-Z0-9_]{1,64}"/gi, 'database "[DATABASE]"');
    } catch (regexError) {
      this.logger.warn('Regex processing failed during message sanitization');
      return '[SANITIZATION_ERROR]';
    }
  }

  /**
   * Check if error contains sensitive database information using ReDoS-safe patterns
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
        /table\s+"[a-zA-Z0-9_]{1,64}"/i,
        /column\s+"[a-zA-Z0-9_]{1,64}"/i,
        /constraint\s+"[a-zA-Z0-9_]{1,64}"/i,
        /Key\s+\([a-zA-Z0-9_,\s]{1,200}\)/i,
        /index\s+"[a-zA-Z0-9_]{1,64}"/i,
        /schema\s+"[a-zA-Z0-9_]{1,64}"/i,
      ];

      return sensitivePatterns.some(pattern => pattern.test(message));
    } catch (regexError) {
      this.logger.warn('Regex processing failed during sensitive info check');
      return true; // Assume sensitive on error to be safe
    }
  }
}