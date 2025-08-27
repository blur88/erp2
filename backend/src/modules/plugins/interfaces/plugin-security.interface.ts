/**
 * Plugin security context for runtime execution
 */
export interface IPluginSecurityContext {
  pluginId: string;
  permissions: IPluginPermissions;
  resourceLimits: IPluginResourceLimits;
  sandboxed: boolean;
  allowedOperations: string[];
  securityLevel: 'low' | 'medium' | 'high' | 'critical';
  createdAt: Date;
  userId?: string;
  sessionId?: string;
  ipAddress?: string;
  userAgent?: string;
}

/**
 * Plugin security permissions - Legacy interface for backward compatibility
 * Use IPluginPermissions from plugin.interface.ts for new implementations
 */
export interface IPluginSecurityPermissions {
  // Database permissions
  database?: {
    read?: string[]; // Table names plugin can read from
    write?: string[]; // Table names plugin can write to
    create?: string[]; // Table names plugin can create
    delete?: string[]; // Table names plugin can delete from
    execute?: string[]; // Stored procedures plugin can execute
    schema?: boolean; // Can modify database schema
  };

  // API permissions
  api?: {
    internal?: string[]; // Internal API endpoints plugin can call
    external?: string[]; // External domains plugin can make requests to
    webhook?: boolean; // Can register webhook endpoints
    rateLimit?: {
      requests: number;
      windowMs: number;
    };
  };

  // File system permissions
  filesystem?: {
    read?: string[]; // Paths plugin can read from
    write?: string[]; // Paths plugin can write to
    execute?: string[]; // Executables plugin can run
    upload?: boolean; // Can handle file uploads
    maxFileSize?: number; // Maximum file size in bytes
  };

  // Network permissions
  network?: {
    outbound?: {
      domains?: string[]; // Domains plugin can connect to
      ports?: number[]; // Ports plugin can connect to
      protocols?: string[]; // Protocols plugin can use
    };
    inbound?: {
      ports?: number[]; // Ports plugin can listen on
      protocols?: string[]; // Protocols plugin can accept
    };
  };

  // System permissions
  system?: {
    environment?: string[]; // Environment variables plugin can access
    processes?: boolean; // Can spawn processes
    services?: string[]; // System services plugin can interact with
    scheduler?: boolean; // Can schedule tasks
  };

  // UI permissions
  ui?: {
    routes?: string[]; // UI routes plugin can register
    components?: string[]; // UI component types plugin can register
    menu?: string[]; // Menu sections plugin can modify
    dashboard?: boolean; // Can add dashboard widgets
  };

  // User data permissions
  userData?: {
    read?: string[]; // User data fields plugin can read
    write?: string[]; // User data fields plugin can modify
    pii?: boolean; // Can access personally identifiable information
    audit?: boolean; // Can access audit logs
  };

  // ERP module permissions
  modules?: {
    inventory?: string[]; // Inventory operations plugin can perform
    sales?: string[]; // Sales operations plugin can perform
    purchasing?: string[]; // Purchasing operations plugin can perform
    accounting?: string[]; // Accounting operations plugin can perform
    hr?: string[]; // HR operations plugin can perform
    crm?: string[]; // CRM operations plugin can perform
  };
}

/**
 * Plugin security restrictions
 */
export interface IPluginSecurityRestrictions {
  // Resource limits
  resources?: {
    maxMemoryMB?: number;
    maxCpuPercent?: number;
    maxDiskMB?: number;
    maxConnections?: number;
    maxExecutionTimeMs?: number;
  };

  // Time-based restrictions
  timeRestrictions?: {
    allowedHours?: number[]; // Hours of day (0-23) plugin can run
    allowedDays?: number[]; // Days of week (0-6) plugin can run
    timezone?: string;
  };

  // IP restrictions
  ipRestrictions?: {
    allowedIPs?: string[];
    blockedIPs?: string[];
    requireVPN?: boolean;
  };

  // User restrictions
  userRestrictions?: {
    allowedUsers?: string[];
    blockedUsers?: string[];
    requiredRoles?: string[];
    minimumPermissionLevel?: number;
  };

  // Sandboxing options
  sandbox?: {
    isolateProcess?: boolean;
    isolateFileSystem?: boolean;
    isolateNetwork?: boolean;
    containerized?: boolean;
  };

  // Security scanning
  scanning?: {
    scanCode?: boolean;
    scanDependencies?: boolean;
    allowUnsigned?: boolean;
    requireCodeSigning?: boolean;
  };
}

/**
 * Plugin security audit log
 */
export interface IPluginSecurityAuditLog {
  id: string;
  pluginId: string;
  eventType: 'permission_check' | 'access_denied' | 'resource_exceeded' | 'security_violation';
  timestamp: Date;
  userId?: string;
  ipAddress?: string;
  userAgent?: string;
  details: {
    operation?: string;
    resource?: string;
    permission?: string;
    value?: any;
    limit?: any;
    result: 'allowed' | 'denied' | 'warning';
    reason?: string;
  };
  severity: 'low' | 'medium' | 'high' | 'critical';
}

/**
 * Plugin security manager interface
 */
export interface IPluginSecurityManager {
  /**
   * Check if plugin has permission for operation
   */
  checkPermission(
    pluginId: string,
    operation: string,
    resource: string,
    context?: IPluginSecurityContext
  ): Promise<boolean>;

  /**
   * Enforce security restrictions
   */
  enforceRestrictions(
    pluginId: string,
    context: IPluginSecurityContext
  ): Promise<void>;

  /**
   * Create security context for plugin
   */
  createContext(
    pluginId: string,
    userId?: string,
    additionalContext?: Record<string, any>
  ): Promise<IPluginSecurityContext>;

  /**
   * Validate plugin security configuration
   */
  validateSecurityConfig(
    config: IPluginSecurityPermissions & IPluginSecurityRestrictions
  ): Promise<string[]>;

  /**
   * Audit plugin security event
   */
  audit(log: Omit<IPluginSecurityAuditLog, 'id' | 'timestamp'>): Promise<void>;

  /**
   * Get plugin security audit logs
   */
  getAuditLogs(
    pluginId: string,
    options?: {
      startDate?: Date;
      endDate?: Date;
      eventType?: string;
      severity?: string;
      limit?: number;
    }
  ): Promise<IPluginSecurityAuditLog[]>;

  /**
   * Scan plugin for security vulnerabilities
   */
  scanPlugin(pluginPath: string): Promise<IPluginSecurityScanResult>;

  /**
   * Validate plugin permissions against policy
   */
  validatePermissions(
    pluginId: string,
    requestedPermissions: any,
  ): Promise<{
    valid: boolean;
    violations: string[];
    allowedPermissions: any;
  }>;

  /**
   * Create security context for plugin execution
   */
  createSecurityContext(
    pluginId: string,
    permissions: any,
  ): Promise<IPluginSecurityContext>;

  /**
   * Monitor plugin resource usage
   */
  monitorResources(pluginId: string): Promise<{
    cpu: number;
    memory: number;
    disk: number;
    network: number;
    violations: IPluginSecurityViolation[];
  }>;

  /**
   * Set security policy for plugin
   */
  setSecurityPolicy(pluginId: string, policy: IPluginSecurityPolicy): Promise<void>;

  /**
   * Get security audit trail for plugin
   */
  getSecurityAudit(pluginId: string, limit?: number): Promise<IPluginSecurityAudit[]>;

  /**
   * Quarantine a plugin due to security violations
   */
  quarantinePlugin(pluginId: string, reason: string): Promise<void>;

  /**
   * Release plugin from quarantine
   */
  releaseFromQuarantine(pluginId: string): Promise<void>;

  /**
   * Generate security report for plugin
   */
  generateSecurityReport(pluginId: string): Promise<IPluginSecurityReport>;
}

/**
 * Plugin security scan result
 */
export interface IPluginSecurityScanResult {
  scanId: string;
  passed: boolean;
  vulnerabilities: IPluginSecurityVulnerability[];
  warnings: IPluginSecurityWarning[];
  recommendations: string[];
  riskLevel: 'low' | 'medium' | 'high' | 'critical';
  scanDuration: number;
  scannedAt: Date;
  pluginId?: string;
  scanDate?: Date;
  riskScore?: number;
}

/**
 * Security vulnerability found in plugin
 */
export interface IPluginSecurityVulnerability {
  type: string;
  severity: 'low' | 'medium' | 'high' | 'critical';
  title: string;
  description: string;
  file?: string;
  line?: number;
  cve?: string;
  fixAvailable?: boolean;
  impact?: string;
  recommendation?: string;
  cwe?: string; // Common Weakness Enumeration ID
  cvss?: number; // Common Vulnerability Scoring System score
  references?: string[];
}

/**
 * Legacy plugin vulnerability interface for backward compatibility
 */
export interface IPluginVulnerability extends IPluginSecurityVulnerability {
  type: 'code' | 'dependency' | 'permission' | 'configuration';
  impact: string;
  recommendation: string;
}

/**
 * Security warning for plugin
 */
export interface IPluginSecurityWarning {
  type: string;
  severity: 'low' | 'medium' | 'high';
  title: string;
  description: string;
  file?: string;
  line?: number;
  recommendation?: string;
}

/**
 * Plugin security report
 */
export interface IPluginSecurityReport {
  pluginId: string;
  reportDate: Date;
  securityScore: number;
  permissions: IPluginSecurityPermissions;
  restrictions: IPluginSecurityRestrictions;
  auditSummary: {
    totalEvents: number;
    violationCount: number;
    lastViolation?: Date;
  };
  vulnerabilities: IPluginVulnerability[];
  recommendations: string[];
  complianceStatus: {
    gdpr?: boolean;
    sox?: boolean;
    hipaa?: boolean;
    custom?: Record<string, boolean>;
  };
}

/**
 * Plugin security policy
 */
export interface IPluginSecurityPolicy {
  securityLevel: 'low' | 'medium' | 'high' | 'critical';
  allowDatabaseRead: boolean;
  allowDatabaseWrite: boolean;
  allowSchemaChanges: boolean;
  allowExternalApi: boolean;
  allowWebhooks: boolean;
  allowFilesystemWrite: boolean;
  allowOutboundNetwork: boolean;
  enableSandbox: boolean;
  enableResourceMonitoring: boolean;
  allowedPaths: string[];
  allowedDomains: string[];
  maxConcurrentOperations: number;
  customRules?: IPluginSecurityRule[];
}

/**
 * Custom security rule
 */
export interface IPluginSecurityRule {
  name: string;
  description: string;
  type: 'code_pattern' | 'file_pattern' | 'permission' | 'resource';
  pattern: string | RegExp;
  action: 'allow' | 'deny' | 'warn' | 'log';
  severity: 'low' | 'medium' | 'high' | 'critical';
}

/**
 * Resource limits for plugin execution
 */
export interface IPluginResourceLimits {
  maxMemoryMB: number;
  maxCpuPercent: number;
  maxDiskMB: number;
  maxNetworkKbps: number;
  maxExecutionTime: number;
  maxConcurrentConnections: number;
  maxFileDescriptors?: number;
  maxProcesses?: number;
}

/**
 * Security violation detected during plugin execution
 */
export interface IPluginSecurityViolation {
  type: 'permission_denied' | 'resource_limit_exceeded' | 'suspicious_activity' | 'policy_violation';
  severity: 'low' | 'medium' | 'high' | 'critical';
  resource?: string;
  current?: number;
  limit?: number;
  description?: string;
  timestamp: Date;
}

/**
 * Security audit entry - Enhanced version
 */
export interface IPluginSecurityAudit {
  id: string;
  pluginId?: string;
  pluginPath?: string;
  action: string;
  result: 'success' | 'failure' | 'denied' | 'allowed' | 'quarantined' | 'released' | 'violation' | 'unknown';
  details: Record<string, any>;
  userId?: string;
  ip?: string;
  userAgent?: string;
  timestamp: Date;
}

/**
 * Plugin sandbox configuration
 */
export interface IPluginSandboxConfig {
  enabled: boolean;
  isolationLevel: 'none' | 'process' | 'container' | 'vm';
  allowedModules: string[];
  blockedModules: string[];
  allowedGlobals: string[];
  allowedRequire: boolean;
  allowedEval: boolean;
  allowedProcess: boolean;
  timeoutMs: number;
  memoryLimitMB: number;
}

/**
 * Plugin security events
 */
export enum PluginSecurityEvents {
  PERMISSION_DENIED = 'plugin.security.permission.denied',
  RESOURCE_EXCEEDED = 'plugin.security.resource.exceeded',
  VULNERABILITY_DETECTED = 'plugin.security.vulnerability.detected',
  SECURITY_SCAN_COMPLETED = 'plugin.security.scan.completed',
  AUDIT_LOG_CREATED = 'plugin.security.audit.created',
  SECURITY_VIOLATION = 'plugin.security.violation',
  SCAN_STARTED = 'plugin.security.scan.started',
  SCAN_FAILED = 'plugin.security.scan.failed',
  QUARANTINED = 'plugin.security.quarantined',
  RELEASED = 'plugin.security.released',
}