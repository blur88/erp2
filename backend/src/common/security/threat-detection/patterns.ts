export class ThreatPatterns {
  // High-risk SQL injection patterns - avoid false positives
  static readonly CRITICAL_SQL_PATTERNS = [
    /\b(UNION\s+SELECT|DROP\s+TABLE|DELETE\s+FROM)\b/gim,
    /('\s*OR\s*'[^']*'\s*=\s*'|'\s*OR\s*1\s*=\s*1)/gim,
    /(;\s*(DROP|DELETE|UPDATE|INSERT|CREATE))\b/gim,
    /\b(EXEC|EXECUTE)\s*\(/gim,
  ];

  // NoSQL injection - specific operators only
  static readonly CRITICAL_NOSQL_PATTERNS = [
    /\$where.*function/gim,
    /\$regex.*\.\*/gim,
    /\$ne.*null/gim,
  ];
}
