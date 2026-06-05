import { Injectable, Logger } from "@nestjs/common";

@Injectable()
export class ErrorSanitizerService {
  private readonly logger = new Logger(ErrorSanitizerService.name);

  sanitizePath(path: string): string {
    if (!path) return "[UNKNOWN_PATH]";
    return path.replace(
      /([?&])(password|token|key|secret)=[^&]*/gi,
      "$1$2=[REDACTED]",
    );
  }

  sanitizeIP(ip: string): string {
    if (!ip) return "[UNKNOWN]";
    if (ip.includes(".")) {
      return ip.replace(/\d+$/, "xxx");
    }
    return ip.replace(/:([^:]+):([^:]+)$/, ":xxx:xxx");
  }

  sanitizeUserAgent(userAgent: string): string {
    if (!userAgent) return "[UNKNOWN]";
    if (userAgent.length > 1000) return "[USER_AGENT_TOO_LONG]";
    return userAgent.replace(/\d{1,10}\.\d{1,10}\.\d{1,10}/g, "x.x.x");
  }

  sanitizeStackTrace(stack: string, maxLines = 5): string {
    if (!stack) return "[NO_STACK]";
    try {
      return stack
        .split("\n")
        .slice(0, maxLines)
        .map((line) => line.replace(/\/[^\s]+\//g, "/[PATH]/"))
        .join("\n");
    } catch {
      return "[STACK_SANITIZATION_ERROR]";
    }
  }

  sanitizeErrorMessage(message: string): string {
    if (!message || typeof message !== "string") return "[INVALID_MESSAGE]";
    if (message.length > 5000) return "[MESSAGE_TOO_LONG]";
    try {
      return message
        .replace(/password\s*=\s*[^\s]+/gi, "password=[REDACTED]")
        .replace(/token\s*=\s*[^\s]+/gi, "token=[REDACTED]")
        .replace(/key\s*=\s*[^\s]+/gi, "key=[REDACTED]")
        .replace(/secret\s*=\s*[^\s]+/gi, "secret=[REDACTED]")
        .replace(/table\s+"[a-zA-Z0-9_]{1,64}"/gi, 'table "[TABLE]"')
        .replace(/column\s+"[a-zA-Z0-9_]{1,64}"/gi, 'column "[COLUMN]"')
        .replace(
          /constraint\s+"[a-zA-Z0-9_]{1,64}"/gi,
          'constraint "[CONSTRAINT]"',
        )
        .replace(/Key\s+\([a-zA-Z0-9_,\s]{1,200}\)/gi, "Key ([FIELDS])")
        .replace(/=\s*\([^)]{1,100}\)/gi, "=([VALUE])")
        .replace(/index\s+"[a-zA-Z0-9_]{1,64}"/gi, 'index "[INDEX]"')
        .replace(/schema\s+"[a-zA-Z0-9_]{1,64}"/gi, 'schema "[SCHEMA]"')
        .replace(/database\s+"[a-zA-Z0-9_]{1,64}"/gi, 'database "[DATABASE]"');
    } catch {
      this.logger.warn("Regex processing failed during message sanitization");
      return "[SANITIZATION_ERROR]";
    }
  }

  containsSensitiveInfo(message: string): boolean {
    if (!message || typeof message !== "string") return false;
    if (message.length > 5000) return true;
    try {
      const patterns = [
        /password\s*[:=]/i,
        /token\s*[:=]/i,
        /key\s*[:=]/i,
        /secret\s*[:=]/i,
        /credential/i,
        /authorization\s*:/i,
        /table\s+"[a-zA-Z0-9_]{1,64}"/i,
        /column\s+"[a-zA-Z0-9_]{1,64}"/i,
        /constraint\s+"[a-zA-Z0-9_]{1,64}"/i,
        /Key\s+\([a-zA-Z0-9_,\s]{1,200}\)/i,
        /index\s+"[a-zA-Z0-9_]{1,64}"/i,
        /schema\s+"[a-zA-Z0-9_]{1,64}"/i,
      ];
      return patterns.some((pattern) => pattern.test(message));
    } catch {
      return true;
    }
  }
}
