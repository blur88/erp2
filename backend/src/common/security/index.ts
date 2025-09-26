// Threat Detection
export { ThreatPatterns } from './threat-detection/patterns';
export { ThreatDetector } from './threat-detection/detector';
export { RequestValidators } from './threat-detection/validators';

// Logging
export { 
  SecurityLogger,
  ThreatDetectionLog,
  HeaderInjectionLog,
  ExcessiveHeaderLengthLog,
  SuspiciousContentTypeLog
} from './logging/security-logger';

// Middleware
export { SecurityMonitoringMiddleware } from './middleware/security-monitoring.middleware';
export { SecurityApplicationService } from './middleware/security-application.service';

// Configuration
export { SecurityConfig, SecurityConfigBuilder } from './config/security.config';

// Legacy exports for backward compatibility
export { SecurityMonitoringMiddleware as InputSanitizationMiddleware } from './middleware/security-monitoring.middleware';
export { SecurityApplicationService as SecurityConfigService } from './middleware/security-application.service';