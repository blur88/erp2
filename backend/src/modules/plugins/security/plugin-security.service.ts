import { Injectable, Logger } from '@nestjs/common';
import { InjectRepository } from '@nestjs/typeorm';
import { Repository } from 'typeorm';
import { EventEmitter2 } from '@nestjs/event-emitter';
import { Plugin } from '../../../database/entities/plugin.entity';
import {
  IPluginSecurityManager,
  IPluginSecurityContext,
  IPluginSecurityScanResult,
  IPluginPermissions,
  IPluginSecurityPolicy,
  IPluginSecurityAudit,
  IPluginResourceLimits,
  IPluginSecurityViolation,
} from '../interfaces/plugin-security.interface';
import * as fs from 'fs/promises';
import * as path from 'path';
import * as crypto from 'crypto';
import { exec } from 'child_process';
import { promisify } from 'util';

const execAsync = promisify(exec);

/**
 * Plugin Security Service
 * 
 * Provides comprehensive security management for plugins including:
 * - Security scanning and validation
 * - Permission and access control
 * - Resource monitoring and limits
 * - Sandboxing and isolation
 * - Security audit logging
 */
@Injectable()
export class PluginSecurityService implements IPluginSecurityManager {
  private readonly logger = new Logger(PluginSecurityService.name);
  private readonly securityPolicies = new Map<string, IPluginSecurityPolicy>();
  private readonly resourceMonitors = new Map<string, NodeJS.Timeout>();
  private readonly securityAudits = new Map<string, IPluginSecurityAudit[]>();

  constructor(
    @InjectRepository(Plugin)
    private readonly pluginRepository: Repository<Plugin>,
    private readonly eventEmitter: EventEmitter2,
  ) {
    this.initializeSecurityPolicies();
  }

  /**
   * Scan plugin for security vulnerabilities
   */
  async scanPlugin(pluginPath: string): Promise<IPluginSecurityScanResult> {
    const startTime = Date.now();
    const scanId = this.generateScanId();

    this.logger.log(`Starting security scan for plugin at: ${pluginPath} (${scanId})`);

    const result: IPluginSecurityScanResult = {
      scanId,
      passed: true,
      vulnerabilities: [],
      warnings: [],
      recommendations: [],
      riskLevel: 'low',
      scanDuration: 0,
      scannedAt: new Date(),
    };

    try {
      // 1. File system security scan
      const filesystemScan = await this.scanFilesystem(pluginPath);
      result.vulnerabilities.push(...filesystemScan.vulnerabilities);
      result.warnings.push(...filesystemScan.warnings);

      // 2. Code security scan
      const codeScan = await this.scanCode(pluginPath);
      result.vulnerabilities.push(...codeScan.vulnerabilities);
      result.warnings.push(...codeScan.warnings);

      // 3. Dependencies scan
      const dependenciesScan = await this.scanDependencies(pluginPath);
      result.vulnerabilities.push(...dependenciesScan.vulnerabilities);
      result.warnings.push(...dependenciesScan.warnings);

      // 4. Permissions scan
      const permissionsScan = await this.scanPermissions(pluginPath);
      result.vulnerabilities.push(...permissionsScan.vulnerabilities);
      result.warnings.push(...permissionsScan.warnings);

      // 5. Manifest validation
      const manifestScan = await this.scanManifest(pluginPath);
      result.vulnerabilities.push(...manifestScan.vulnerabilities);
      result.warnings.push(...manifestScan.warnings);

      // Calculate risk level based on vulnerabilities
      result.riskLevel = this.calculateRiskLevel(result.vulnerabilities);
      result.passed = result.vulnerabilities.filter(v => v.severity === 'critical' || v.severity === 'high').length === 0;
      result.scanDuration = Date.now() - startTime;

      // Generate recommendations
      result.recommendations = this.generateSecurityRecommendations(result);

      // Record audit
      await this.recordSecurityAudit({
        pluginPath,
        action: 'security_scan',
        result: result.passed ? 'passed' : 'failed',
        details: {
          vulnerabilities: result.vulnerabilities.length,
          warnings: result.warnings.length,
          riskLevel: result.riskLevel,
        },
      });

      this.logger.log(`Security scan completed for ${pluginPath}: ${result.passed ? 'PASSED' : 'FAILED'} (${result.riskLevel} risk)`);

      return result;

    } catch (error) {
      this.logger.error(`Security scan failed for ${pluginPath}:`, error);
      
      result.passed = false;
      result.vulnerabilities.push({
        type: 'scan_error',
        severity: 'high',
        title: 'Security scan failed',
        description: error.message,
        file: pluginPath,
      });
      result.scanDuration = Date.now() - startTime;

      return result;
    }
  }

  /**
   * Validate plugin permissions against policy
   */
  async validatePermissions(
    pluginId: string,
    requestedPermissions: IPluginPermissions,
  ): Promise<{ valid: boolean; violations: string[]; allowedPermissions: IPluginPermissions }> {
    this.logger.debug(`Validating permissions for plugin: ${pluginId}`);

    const policy = this.securityPolicies.get(pluginId) || this.getDefaultSecurityPolicy();
    const violations: string[] = [];
    const allowedPermissions: IPluginPermissions = {};

    // Validate database permissions
    if (requestedPermissions.database) {
      allowedPermissions.database = {};
      
      if (requestedPermissions.database.read && !policy.allowDatabaseRead) {
        violations.push('Database read access not permitted');
      } else {
        allowedPermissions.database.read = requestedPermissions.database.read;
      }

      if (requestedPermissions.database.write && !policy.allowDatabaseWrite) {
        violations.push('Database write access not permitted');
      } else {
        allowedPermissions.database.write = requestedPermissions.database.write;
      }

      if (requestedPermissions.database.schema && !policy.allowSchemaChanges) {
        violations.push('Schema changes not permitted');
      } else {
        allowedPermissions.database.schema = requestedPermissions.database.schema;
      }
    }

    // Validate API permissions
    if (requestedPermissions.api) {
      allowedPermissions.api = {};
      
      if (requestedPermissions.api.external && !policy.allowExternalApi) {
        violations.push('External API access not permitted');
      } else {
        allowedPermissions.api.external = requestedPermissions.api.external;
      }

      if (requestedPermissions.api.webhook && !policy.allowWebhooks) {
        violations.push('Webhook access not permitted');
      } else {
        allowedPermissions.api.webhook = requestedPermissions.api.webhook;
      }
    }

    // Validate filesystem permissions
    if (requestedPermissions.filesystem) {
      allowedPermissions.filesystem = {};
      
      if (requestedPermissions.filesystem.write && !policy.allowFilesystemWrite) {
        violations.push('Filesystem write access not permitted');
      } else {
        allowedPermissions.filesystem.write = requestedPermissions.filesystem.write;
      }

      if (requestedPermissions.filesystem.paths) {
        const allowedPaths = requestedPermissions.filesystem.paths.filter(requestedPath =>
          policy.allowedPaths.some(allowedPath => requestedPath.startsWith(allowedPath))
        );
        
        if (allowedPaths.length < requestedPermissions.filesystem.paths.length) {
          const deniedPaths = requestedPermissions.filesystem.paths.filter(p => !allowedPaths.includes(p));
          violations.push(`Access denied to paths: ${deniedPaths.join(', ')}`);
        }
        
        allowedPermissions.filesystem.paths = allowedPaths;
      }
    }

    // Validate network permissions
    if (requestedPermissions.network) {
      allowedPermissions.network = {};
      
      if (requestedPermissions.network.outbound && !policy.allowOutboundNetwork) {
        violations.push('Outbound network access not permitted');
      } else {
        allowedPermissions.network.outbound = requestedPermissions.network.outbound;
      }

      if (requestedPermissions.network.domains) {
        const allowedDomains = requestedPermissions.network.domains.filter(domain =>
          policy.allowedDomains.includes('*') || policy.allowedDomains.includes(domain)
        );
        
        if (allowedDomains.length < requestedPermissions.network.domains.length) {
          violations.push('Some domains not in allowed list');
        }
        
        allowedPermissions.network.domains = allowedDomains;
      }
    }

    const valid = violations.length === 0;

    // Record audit
    await this.recordSecurityAudit({
      pluginId,
      action: 'permission_validation',
      result: valid ? 'allowed' : 'denied',
      details: { violations, requestedPermissions, allowedPermissions },
    });

    return { valid, violations, allowedPermissions };
  }

  /**
   * Create security context for plugin execution
   */
  async createSecurityContext(
    pluginId: string,
    permissions: IPluginPermissions,
  ): Promise<IPluginSecurityContext> {
    this.logger.debug(`Creating security context for plugin: ${pluginId}`);

    const policy = this.securityPolicies.get(pluginId) || this.getDefaultSecurityPolicy();
    const resourceLimits = this.getResourceLimits(pluginId);

    const context: IPluginSecurityContext = {
      pluginId,
      permissions,
      resourceLimits,
      sandboxed: policy.enableSandbox,
      allowedOperations: this.generateAllowedOperations(permissions),
      securityLevel: policy.securityLevel,
      createdAt: new Date(),
    };

    // Start resource monitoring if enabled
    if (policy.enableResourceMonitoring) {
      this.startResourceMonitoring(pluginId, resourceLimits);
    }

    return context;
  }

  /**
   * Check if operation is allowed for plugin
   */
  async checkPermission(
    pluginId: string,
    operation: string,
    resource: string,
  ): Promise<boolean> {
    const plugin = await this.pluginRepository.findOne({
      where: { identifier: pluginId },
    });

    if (!plugin) {
      this.logger.warn(`Permission check for unknown plugin: ${pluginId}`);
      return false;
    }

    const permissions = plugin.permissions as IPluginPermissions;
    if (!permissions) {
      this.logger.warn(`No permissions defined for plugin: ${pluginId}`);
      return false;
    }

    const allowed = this.evaluatePermission(operation, resource, permissions);

    // Record audit for denied operations
    if (!allowed) {
      await this.recordSecurityAudit({
        pluginId,
        action: 'permission_denied',
        result: 'denied',
        details: { operation, resource },
      });

      // Emit security violation event
      await this.eventEmitter.emitAsync('plugin.security.violation', {
        pluginId,
        type: 'permission_denied',
        operation,
        resource,
        timestamp: new Date(),
      });
    }

    return allowed;
  }

  /**
   * Monitor plugin resource usage
   */
  async monitorResources(pluginId: string): Promise<{
    cpu: number;
    memory: number;
    disk: number;
    network: number;
    violations: IPluginSecurityViolation[];
  }> {
    const limits = this.getResourceLimits(pluginId);
    const usage = await this.getCurrentResourceUsage(pluginId);
    const violations: IPluginSecurityViolation[] = [];

    // Check CPU usage
    if (usage.cpu > limits.maxCpuPercent) {
      violations.push({
        type: 'resource_limit_exceeded',
        severity: 'high',
        resource: 'cpu',
        current: usage.cpu,
        limit: limits.maxCpuPercent,
        timestamp: new Date(),
      });
    }

    // Check memory usage
    if (usage.memory > limits.maxMemoryMB * 1024 * 1024) {
      violations.push({
        type: 'resource_limit_exceeded',
        severity: 'high',
        resource: 'memory',
        current: usage.memory,
        limit: limits.maxMemoryMB * 1024 * 1024,
        timestamp: new Date(),
      });
    }

    // Check disk usage
    if (usage.disk > limits.maxDiskMB * 1024 * 1024) {
      violations.push({
        type: 'resource_limit_exceeded',
        severity: 'medium',
        resource: 'disk',
        current: usage.disk,
        limit: limits.maxDiskMB * 1024 * 1024,
        timestamp: new Date(),
      });
    }

    // Handle violations
    for (const violation of violations) {
      await this.handleSecurityViolation(pluginId, violation);
    }

    return {
      cpu: usage.cpu,
      memory: usage.memory,
      disk: usage.disk,
      network: usage.network,
      violations,
    };
  }

  /**
   * Set security policy for plugin
   */
  async setSecurityPolicy(pluginId: string, policy: IPluginSecurityPolicy): Promise<void> {
    this.securityPolicies.set(pluginId, policy);

    // Update plugin record
    const plugin = await this.pluginRepository.findOne({
      where: { identifier: pluginId },
    });

    if (plugin) {
      plugin.securityPolicy = policy;
      await this.pluginRepository.save(plugin);
    }

    // Record audit
    await this.recordSecurityAudit({
      pluginId,
      action: 'security_policy_updated',
      result: 'success',
      details: { policy },
    });

    this.logger.log(`Security policy updated for plugin: ${pluginId}`);
  }

  /**
   * Get security audit trail for plugin
   */
  async getSecurityAudit(pluginId: string, limit = 100): Promise<IPluginSecurityAudit[]> {
    const audits = this.securityAudits.get(pluginId) || [];
    return audits.slice(0, limit);
  }

  /**
   * Quarantine a plugin due to security violations
   */
  async quarantinePlugin(pluginId: string, reason: string): Promise<void> {
    this.logger.warn(`Quarantining plugin ${pluginId}: ${reason}`);

    const plugin = await this.pluginRepository.findOne({
      where: { identifier: pluginId },
    });

    if (plugin) {
      plugin.isActive = false;
      plugin.quarantined = true;
      plugin.quarantineReason = reason;
      plugin.quarantinedAt = new Date();
      await this.pluginRepository.save(plugin);
    }

    // Stop resource monitoring
    this.stopResourceMonitoring(pluginId);

    // Record audit
    await this.recordSecurityAudit({
      pluginId,
      action: 'plugin_quarantined',
      result: 'quarantined',
      details: { reason },
    });

    // Emit quarantine event
    await this.eventEmitter.emitAsync('plugin.security.quarantined', {
      pluginId,
      reason,
      timestamp: new Date(),
    });
  }

  /**
   * Release plugin from quarantine
   */
  async releaseFromQuarantine(pluginId: string): Promise<void> {
    this.logger.log(`Releasing plugin ${pluginId} from quarantine`);

    const plugin = await this.pluginRepository.findOne({
      where: { identifier: pluginId },
    });

    if (plugin) {
      plugin.quarantined = false;
      plugin.quarantineReason = null;
      plugin.quarantinedAt = null;
      await this.pluginRepository.save(plugin);
    }

    // Record audit
    await this.recordSecurityAudit({
      pluginId,
      action: 'quarantine_released',
      result: 'released',
      details: {},
    });
  }

  // Private helper methods

  private async scanFilesystem(pluginPath: string): Promise<{
    vulnerabilities: any[];
    warnings: any[];
  }> {
    const vulnerabilities = [];
    const warnings = [];

    try {
      // Check for suspicious files
      const files = await this.getAllFiles(pluginPath);
      
      for (const file of files) {
        const filename = path.basename(file);
        const content = await fs.readFile(file, 'utf8');

        // Check for executable files in unexpected locations
        if (filename.endsWith('.exe') || filename.endsWith('.sh') || filename.endsWith('.bat')) {
          vulnerabilities.push({
            type: 'suspicious_executable',
            severity: 'high',
            title: 'Suspicious executable file',
            description: `Executable file found: ${filename}`,
            file,
          });
        }

        // Check for hidden files
        if (filename.startsWith('.') && !this.isAllowedHiddenFile(filename)) {
          warnings.push({
            type: 'hidden_file',
            severity: 'low',
            title: 'Hidden file detected',
            description: `Hidden file: ${filename}`,
            file,
          });
        }

        // Check file size
        const stats = await fs.stat(file);
        if (stats.size > 10 * 1024 * 1024) { // 10MB
          warnings.push({
            type: 'large_file',
            severity: 'low',
            title: 'Large file detected',
            description: `File size: ${Math.round(stats.size / 1024 / 1024)}MB`,
            file,
          });
        }
      }

    } catch (error) {
      vulnerabilities.push({
        type: 'filesystem_scan_error',
        severity: 'medium',
        title: 'Filesystem scan error',
        description: error.message,
        file: pluginPath,
      });
    }

    return { vulnerabilities, warnings };
  }

  private async scanCode(pluginPath: string): Promise<{
    vulnerabilities: any[];
    warnings: any[];
  }> {
    const vulnerabilities = [];
    const warnings = [];

    try {
      const jsFiles = await this.getFilesByExtension(pluginPath, ['.js', '.ts']);
      
      for (const file of jsFiles) {
        const content = await fs.readFile(file, 'utf8');
        
        // Check for dangerous patterns
        const dangerousPatterns = [
          { pattern: /eval\s*\(/, type: 'code_injection', severity: 'critical' },
          { pattern: /Function\s*\(/, type: 'code_injection', severity: 'high' },
          { pattern: /child_process|exec|spawn/, type: 'command_execution', severity: 'high' },
          { pattern: /require\s*\(\s*['"]\s*fs\s*['"]/, type: 'file_system_access', severity: 'medium' },
          { pattern: /process\.env/, type: 'environment_access', severity: 'low' },
        ];

        for (const { pattern, type, severity } of dangerousPatterns) {
          const matches = content.match(pattern);
          if (matches) {
            if (severity === 'critical' || severity === 'high') {
              vulnerabilities.push({
                type,
                severity,
                title: `Dangerous code pattern: ${type}`,
                description: `Found: ${matches[0]}`,
                file,
              });
            } else {
              warnings.push({
                type,
                severity,
                title: `Potentially dangerous pattern: ${type}`,
                description: `Found: ${matches[0]}`,
                file,
              });
            }
          }
        }
      }

    } catch (error) {
      vulnerabilities.push({
        type: 'code_scan_error',
        severity: 'medium',
        title: 'Code scan error',
        description: error.message,
        file: pluginPath,
      });
    }

    return { vulnerabilities, warnings };
  }

  private async scanDependencies(pluginPath: string): Promise<{
    vulnerabilities: any[];
    warnings: any[];
  }> {
    const vulnerabilities = [];
    const warnings = [];

    try {
      const packageJsonPath = path.join(pluginPath, 'package.json');
      
      try {
        await fs.access(packageJsonPath);
        const packageContent = await fs.readFile(packageJsonPath, 'utf8');
        const packageJson = JSON.parse(packageContent);

        // Check for suspicious dependencies
        const allDeps = {
          ...packageJson.dependencies,
          ...packageJson.devDependencies,
        };

        const suspiciousDeps = [
          'child_process', 'fs-extra', 'node-pty', 'puppeteer', 'playwright'
        ];

        for (const [dep, version] of Object.entries(allDeps)) {
          if (suspiciousDeps.includes(dep)) {
            warnings.push({
              type: 'suspicious_dependency',
              severity: 'medium',
              title: 'Suspicious dependency',
              description: `Dependency with elevated privileges: ${dep}@${version}`,
              file: packageJsonPath,
            });
          }
        }

        // Run npm audit if npm is available
        try {
          const { stdout } = await execAsync('npm audit --json', { cwd: pluginPath });
          const auditResult = JSON.parse(stdout);
          
          if (auditResult.vulnerabilities) {
            for (const [pkg, vuln] of Object.entries(auditResult.vulnerabilities)) {
              if (vuln.severity === 'critical' || vuln.severity === 'high') {
                vulnerabilities.push({
                  type: 'dependency_vulnerability',
                  severity: vuln.severity,
                  title: `Vulnerable dependency: ${pkg}`,
                  description: vuln.title || 'Known security vulnerability',
                  file: packageJsonPath,
                });
              }
            }
          }
        } catch (auditError) {
          // npm audit failed - not critical
          warnings.push({
            type: 'audit_failed',
            severity: 'low',
            title: 'Dependency audit failed',
            description: 'Could not run npm audit',
            file: packageJsonPath,
          });
        }

      } catch (error) {
        // No package.json or invalid JSON
        warnings.push({
          type: 'no_package_json',
          severity: 'low',
          title: 'No package.json found',
          description: 'Cannot validate dependencies',
          file: pluginPath,
        });
      }

    } catch (error) {
      vulnerabilities.push({
        type: 'dependency_scan_error',
        severity: 'medium',
        title: 'Dependency scan error',
        description: error.message,
        file: pluginPath,
      });
    }

    return { vulnerabilities, warnings };
  }

  private async scanPermissions(pluginPath: string): Promise<{
    vulnerabilities: any[];
    warnings: any[];
  }> {
    const vulnerabilities = [];
    const warnings = [];

    try {
      const manifestPath = path.join(pluginPath, 'plugin.json');
      
      try {
        const manifestContent = await fs.readFile(manifestPath, 'utf8');
        const manifest = JSON.parse(manifestContent);

        if (manifest.permissions) {
          const permissions = manifest.permissions;

          // Check for excessive permissions
          if (permissions.filesystem && permissions.filesystem.write) {
            warnings.push({
              type: 'excessive_permissions',
              severity: 'medium',
              title: 'Filesystem write permission requested',
              description: 'Plugin requests filesystem write access',
              file: manifestPath,
            });
          }

          if (permissions.network && permissions.network.outbound) {
            warnings.push({
              type: 'network_permission',
              severity: 'low',
              title: 'Network access requested',
              description: 'Plugin requests outbound network access',
              file: manifestPath,
            });
          }

          if (permissions.system) {
            vulnerabilities.push({
              type: 'system_permission',
              severity: 'high',
              title: 'System-level permissions requested',
              description: 'Plugin requests system-level access',
              file: manifestPath,
            });
          }
        }

      } catch (error) {
        warnings.push({
          type: 'manifest_read_error',
          severity: 'low',
          title: 'Cannot read manifest',
          description: 'Cannot validate permissions',
          file: manifestPath,
        });
      }

    } catch (error) {
      vulnerabilities.push({
        type: 'permission_scan_error',
        severity: 'medium',
        title: 'Permission scan error',
        description: error.message,
        file: pluginPath,
      });
    }

    return { vulnerabilities, warnings };
  }

  private async scanManifest(pluginPath: string): Promise<{
    vulnerabilities: any[];
    warnings: any[];
  }> {
    const vulnerabilities = [];
    const warnings = [];

    try {
      const manifestPath = path.join(pluginPath, 'plugin.json');
      
      try {
        const manifestContent = await fs.readFile(manifestPath, 'utf8');
        const manifest = JSON.parse(manifestContent);

        // Validate required fields
        const requiredFields = ['identifier', 'name', 'version', 'main'];
        for (const field of requiredFields) {
          if (!manifest[field]) {
            vulnerabilities.push({
              type: 'invalid_manifest',
              severity: 'high',
              title: `Missing required field: ${field}`,
              description: 'Plugin manifest is incomplete',
              file: manifestPath,
            });
          }
        }

        // Check for suspicious URLs
        if (manifest.homepage && !this.isValidUrl(manifest.homepage)) {
          warnings.push({
            type: 'suspicious_url',
            severity: 'low',
            title: 'Invalid homepage URL',
            description: `URL: ${manifest.homepage}`,
            file: manifestPath,
          });
        }

        // Check version format
        if (manifest.version && !this.isValidVersion(manifest.version)) {
          warnings.push({
            type: 'invalid_version',
            severity: 'low',
            title: 'Invalid version format',
            description: `Version: ${manifest.version}`,
            file: manifestPath,
          });
        }

      } catch (error) {
        vulnerabilities.push({
          type: 'manifest_parse_error',
          severity: 'critical',
          title: 'Cannot parse plugin manifest',
          description: error.message,
          file: manifestPath,
        });
      }

    } catch (error) {
      vulnerabilities.push({
        type: 'manifest_scan_error',
        severity: 'high',
        title: 'Manifest scan error',
        description: error.message,
        file: pluginPath,
      });
    }

    return { vulnerabilities, warnings };
  }

  private calculateRiskLevel(vulnerabilities: any[]): 'low' | 'medium' | 'high' | 'critical' {
    const criticalCount = vulnerabilities.filter(v => v.severity === 'critical').length;
    const highCount = vulnerabilities.filter(v => v.severity === 'high').length;
    const mediumCount = vulnerabilities.filter(v => v.severity === 'medium').length;

    if (criticalCount > 0) return 'critical';
    if (highCount > 2) return 'high';
    if (highCount > 0 || mediumCount > 3) return 'medium';
    return 'low';
  }

  private generateSecurityRecommendations(scanResult: IPluginSecurityScanResult): string[] {
    const recommendations = [];

    if (scanResult.vulnerabilities.some(v => v.type === 'code_injection')) {
      recommendations.push('Remove use of eval() and Function() constructors');
    }

    if (scanResult.vulnerabilities.some(v => v.type === 'command_execution')) {
      recommendations.push('Avoid direct command execution, use safer alternatives');
    }

    if (scanResult.vulnerabilities.some(v => v.type === 'dependency_vulnerability')) {
      recommendations.push('Update vulnerable dependencies to latest secure versions');
    }

    if (scanResult.warnings.some(w => w.type === 'excessive_permissions')) {
      recommendations.push('Review and minimize requested permissions');
    }

    return recommendations;
  }

  private async getAllFiles(dir: string): Promise<string[]> {
    const files = [];
    const entries = await fs.readdir(dir, { withFileTypes: true });

    for (const entry of entries) {
      const fullPath = path.join(dir, entry.name);
      
      if (entry.isDirectory()) {
        if (!entry.name.startsWith('.') && entry.name !== 'node_modules') {
          files.push(...await this.getAllFiles(fullPath));
        }
      } else {
        files.push(fullPath);
      }
    }

    return files;
  }

  private async getFilesByExtension(dir: string, extensions: string[]): Promise<string[]> {
    const allFiles = await this.getAllFiles(dir);
    return allFiles.filter(file => extensions.some(ext => file.endsWith(ext)));
  }

  private isAllowedHiddenFile(filename: string): boolean {
    const allowedHiddenFiles = ['.gitignore', '.npmignore', '.eslintrc', '.prettierrc'];
    return allowedHiddenFiles.some(allowed => filename.startsWith(allowed));
  }

  private isValidUrl(url: string): boolean {
    try {
      new URL(url);
      return true;
    } catch {
      return false;
    }
  }

  private isValidVersion(version: string): boolean {
    return /^\d+\.\d+\.\d+/.test(version);
  }

  private generateScanId(): string {
    return `scan_${Date.now()}_${crypto.randomBytes(4).toString('hex')}`;
  }

  private initializeSecurityPolicies(): void {
    // Initialize default security policies
    this.logger.log('Initializing security policies...');
  }

  private getDefaultSecurityPolicy(): IPluginSecurityPolicy {
    return {
      securityLevel: 'medium',
      allowDatabaseRead: true,
      allowDatabaseWrite: false,
      allowSchemaChanges: false,
      allowExternalApi: false,
      allowWebhooks: false,
      allowFilesystemWrite: false,
      allowOutboundNetwork: false,
      enableSandbox: true,
      enableResourceMonitoring: true,
      allowedPaths: ['/tmp/plugins'],
      allowedDomains: [],
      maxConcurrentOperations: 10,
    };
  }

  private getResourceLimits(pluginId: string): IPluginResourceLimits {
    return {
      maxMemoryMB: 256,
      maxCpuPercent: 20,
      maxDiskMB: 100,
      maxNetworkKbps: 1000,
      maxExecutionTime: 30000,
      maxConcurrentConnections: 5,
    };
  }

  private generateAllowedOperations(permissions: IPluginPermissions): string[] {
    const operations = [];

    if (permissions.database?.read) operations.push('database:read');
    if (permissions.database?.write) operations.push('database:write');
    if (permissions.api?.external) operations.push('api:external');
    if (permissions.filesystem?.read) operations.push('filesystem:read');
    if (permissions.filesystem?.write) operations.push('filesystem:write');
    if (permissions.network?.outbound) operations.push('network:outbound');

    return operations;
  }

  private startResourceMonitoring(pluginId: string, limits: IPluginResourceLimits): void {
    // Clear existing monitor
    this.stopResourceMonitoring(pluginId);

    // Start new monitor
    const monitor = setInterval(async () => {
      try {
        await this.monitorResources(pluginId);
      } catch (error) {
        this.logger.error(`Resource monitoring failed for ${pluginId}:`, error);
      }
    }, 5000); // Monitor every 5 seconds

    this.resourceMonitors.set(pluginId, monitor);
  }

  private stopResourceMonitoring(pluginId: string): void {
    const monitor = this.resourceMonitors.get(pluginId);
    if (monitor) {
      clearInterval(monitor);
      this.resourceMonitors.delete(pluginId);
    }
  }

  private async getCurrentResourceUsage(pluginId: string): Promise<{
    cpu: number;
    memory: number;
    disk: number;
    network: number;
  }> {
    // This would integrate with system monitoring tools
    // For now, return mock data
    return {
      cpu: Math.random() * 100,
      memory: Math.random() * 512 * 1024 * 1024,
      disk: Math.random() * 200 * 1024 * 1024,
      network: Math.random() * 1000,
    };
  }

  private evaluatePermission(operation: string, resource: string, permissions: IPluginPermissions): boolean {
    const [category, action] = operation.split(':');

    switch (category) {
      case 'database':
        return permissions.database?.[action] || false;
      case 'api':
        return permissions.api?.[action] || false;
      case 'filesystem':
        return permissions.filesystem?.[action] || false;
      case 'network':
        return permissions.network?.[action] || false;
      case 'system':
        return permissions.system?.[action] || false;
      default:
        return false;
    }
  }

  private async handleSecurityViolation(pluginId: string, violation: IPluginSecurityViolation): Promise<void> {
    this.logger.warn(`Security violation for plugin ${pluginId}:`, violation);

    // Record audit
    await this.recordSecurityAudit({
      pluginId,
      action: 'security_violation',
      result: 'violation',
      details: { violation },
    });

    // Emit security violation event
    await this.eventEmitter.emitAsync('plugin.security.violation', {
      pluginId,
      violation,
      timestamp: new Date(),
    });

    // Take action based on severity
    if (violation.severity === 'critical') {
      await this.quarantinePlugin(pluginId, `Critical security violation: ${violation.type}`);
    }
  }

  private async recordSecurityAudit(audit: Partial<IPluginSecurityAudit>): Promise<void> {
    const auditEntry: IPluginSecurityAudit = {
      id: crypto.randomUUID(),
      pluginId: audit.pluginId || '',
      action: audit.action || 'unknown',
      result: audit.result || 'unknown',
      details: audit.details || {},
      timestamp: new Date(),
      ...audit,
    };

    // Store audit entry
    let audits = this.securityAudits.get(auditEntry.pluginId) || [];
    audits.unshift(auditEntry);

    // Keep only last 1000 entries
    if (audits.length > 1000) {
      audits = audits.slice(0, 1000);
    }

    this.securityAudits.set(auditEntry.pluginId, audits);

    // Emit audit event
    await this.eventEmitter.emitAsync('plugin.security.audit', auditEntry);
  }
}