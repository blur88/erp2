/**
 * Configuration interface for exception filters
 */
interface FilterConfig {
  isProduction: boolean;
  enableDetailedLogging: boolean;
  enableSecurityLogging: boolean;
  maxErrorMessageLength: number;
  maxStackTraceLines: number;
}

/**
 * Security-related configuration
 */
interface SecurityConfig {
  enableSecurityDetection: boolean;
  sensitiveKeywords: string[];
  securityStatusCodes: number[];
}
