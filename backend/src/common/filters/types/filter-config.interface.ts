/**
 * Configuration interface for exception filters
 */
export interface FilterConfig {
  isProduction: boolean;
  enableDetailedLogging: boolean;
  enableSecurityLogging: boolean;
  maxErrorMessageLength: number;
  maxStackTraceLines: number;
}

/**
 * Security-related configuration
 */
export interface SecurityConfig {
  enableSecurityDetection: boolean;
  sensitiveKeywords: string[];
  securityStatusCodes: number[];
}