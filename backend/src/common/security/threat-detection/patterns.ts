/**
 * Security Threat Patterns
 * Defines various security threat detection patterns
 */
export class ThreatPatterns {
  // Critical XSS patterns - only the most dangerous ones
  static readonly CRITICAL_XSS_PATTERNS = [
    /<script[^>]*>.*?<\/script>/gim,
    /<iframe[^>]*src\s*=\s*["']?javascript:/gim,
    /javascript:\s*(alert|eval|document\.)/gim,
    /vbscript:\s*(alert|eval|document\.)/gim,
    /data:text\/html[^;]*;base64/gim,
    /on(load|error|click|focus|blur)\s*=\s*["']?[^"']*\beval\b/gim,
  ];

  // High-risk SQL injection patterns - avoid false positives
  static readonly CRITICAL_SQL_PATTERNS = [
    /\b(UNION\s+SELECT|DROP\s+TABLE|DELETE\s+FROM)\b/gim,
    /('\s*OR\s*'[^']*'\s*=\s*'|'\s*OR\s*1\s*=\s*1)/gim,
    /(;\s*(DROP|DELETE|UPDATE|INSERT|CREATE))\b/gim,
    /\b(EXEC|EXECUTE)\s*\(/gim,
  ];

  // MongoDB injection - specific operators only
  static readonly CRITICAL_NOSQL_PATTERNS = [
    /\$where.*function/gim,
    /\$regex.*\.\*/gim,
    /\$ne.*null/gim,
  ];
}