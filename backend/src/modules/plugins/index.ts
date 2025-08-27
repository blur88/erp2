/**
 * ERP Plugin System
 * 
 * A comprehensive plugin system for the ERP application that provides:
 * - Dynamic plugin loading and lifecycle management
 * - Event-driven architecture with hooks
 * - Secure plugin sandboxing and permissions
 * - Database integration with dynamic entities
 * - Configuration management
 * - Development tools and CLI
 * 
 * This is the main entry point for the plugin system.
 */

// Core Plugin System
export { PluginsModule } from './plugins.module';

// Base Classes and Interfaces
export { BasePlugin } from './core/base-plugin';
export * from './interfaces';

// Plugin Decorators for Development
export * from './decorators/plugin.decorator';

// Core Services
export { PluginRegistryService } from './services/plugin-registry.service';
export { PluginLifecycleService } from './services/plugin-lifecycle.service';
export { PluginConfigurationService } from './services/plugin-configuration.service';

// Feature Services
export { PluginHooksService } from './hooks/plugin-hooks.service';
export { PluginSecurityService } from './security/plugin-security.service';
export { PluginDatabaseService } from './database/plugin-database.service';

// Development Tools
export { PluginBuilder } from './development/plugin-builder';

// DTOs for API
export * from './dto';

// Controllers
export { PluginManagementController } from './controllers/plugin-management.controller';

// Entity Types
export { PluginType, PluginStatus } from '../../database/entities/plugin.entity';

// Example Plugins (for reference)
export { InventoryAlertsPlugin } from './examples/inventory-alerts.plugin';
export { PaymentGatewayPlugin } from './examples/payment-gateway.plugin';

/**
 * Plugin System Version Information
 */
export const PLUGIN_SYSTEM_VERSION = '1.0.0';
export const PLUGIN_API_VERSION = '1.0.0';
export const SUPPORTED_NODE_VERSION = '>=16.0.0';

/**
 * Plugin System Constants
 */
export const PLUGIN_SYSTEM_CONSTANTS = {
  MAX_PLUGINS: 100,
  MAX_MEMORY_PER_PLUGIN_MB: 256,
  DEFAULT_PLUGIN_TIMEOUT_MS: 30000,
  HOOK_EXECUTION_TIMEOUT_MS: 10000,
  SECURITY_SCAN_TIMEOUT_MS: 60000,
  DATABASE_CONNECTION_TIMEOUT_MS: 5000,
} as const;

/**
 * Default Plugin Configuration
 */
export const DEFAULT_PLUGIN_CONFIG = {
  enableAutoDiscovery: true,
  enableSecurityScanning: true,
  enableResourceMonitoring: true,
  enableHealthChecks: true,
  pluginsDirectory: 'plugins',
  maxConcurrentPlugins: 50,
  defaultPermissions: {
    database: { read: true, write: false },
    api: { internal: true, external: false },
    filesystem: { read: true, write: false },
    network: { outbound: false },
  },
} as const;

/**
 * Plugin System Events
 * 
 * Events emitted by the plugin system that can be listened to
 * for monitoring and integration purposes.
 */
export const PLUGIN_SYSTEM_EVENTS = {
  // System events
  SYSTEM_STARTED: 'plugin.system.started',
  SYSTEM_STOPPED: 'plugin.system.stopped',
  SYSTEM_ERROR: 'plugin.system.error',
  
  // Plugin lifecycle events
  PLUGIN_DISCOVERED: 'plugin.discovered',
  PLUGIN_LOADED: 'plugin.loaded',
  PLUGIN_UNLOADED: 'plugin.unloaded',
  PLUGIN_ACTIVATED: 'plugin.activated',
  PLUGIN_DEACTIVATED: 'plugin.deactivated',
  PLUGIN_ERROR: 'plugin.error',
  
  // Security events
  SECURITY_VIOLATION: 'plugin.security.violation',
  SECURITY_SCAN_COMPLETED: 'plugin.security.scan.completed',
  PERMISSION_DENIED: 'plugin.permission.denied',
  
  // Health and monitoring events
  HEALTH_CHECK_COMPLETED: 'plugin.health.check.completed',
  RESOURCE_LIMIT_EXCEEDED: 'plugin.resource.limit.exceeded',
  PERFORMANCE_WARNING: 'plugin.performance.warning',
  
  // Database events
  DATABASE_ENTITY_REGISTERED: 'plugin.database.entity.registered',
  DATABASE_MIGRATION_EXECUTED: 'plugin.database.migration.executed',
  
  // Configuration events
  CONFIG_UPDATED: 'plugin.config.updated',
  CONFIG_VALIDATION_FAILED: 'plugin.config.validation.failed',
} as const;

/**
 * Plugin Development Utilities
 * 
 * Helper functions and utilities for plugin development.
 */
export const PluginUtils = {
  /**
   * Validate plugin identifier format
   */
  isValidPluginIdentifier(identifier: string): boolean {
    return /^[a-z0-9-]+([\/][a-z0-9-]+)?$/.test(identifier);
  },

  /**
   * Validate semantic version format
   */
  isValidVersion(version: string): boolean {
    return /^\d+\.\d+\.\d+(-[\w\d\.-]*)?(\+[\w\d\.-]*)?$/.test(version);
  },

  /**
   * Generate plugin identifier from name
   */
  generatePluginIdentifier(name: string, namespace?: string): string {
    const cleanName = name.toLowerCase()
      .replace(/[^a-z0-9]/g, '-')
      .replace(/-+/g, '-')
      .replace(/^-|-$/g, '');
    
    return namespace ? `${namespace}/${cleanName}` : cleanName;
  },

  /**
   * Parse plugin identifier into namespace and name
   */
  parsePluginIdentifier(identifier: string): { namespace?: string; name: string } {
    const parts = identifier.split('/');
    if (parts.length === 2) {
      return { namespace: parts[0], name: parts[1] };
    }
    return { name: identifier };
  },

  /**
   * Compare plugin versions
   */
  compareVersions(version1: string, version2: string): number {
    const v1Parts = version1.split('.').map(Number);
    const v2Parts = version2.split('.').map(Number);
    
    for (let i = 0; i < Math.max(v1Parts.length, v2Parts.length); i++) {
      const v1Part = v1Parts[i] || 0;
      const v2Part = v2Parts[i] || 0;
      
      if (v1Part > v2Part) return 1;
      if (v1Part < v2Part) return -1;
    }
    
    return 0;
  },
};

/**
 * Plugin System Health Check
 * 
 * Utility to check the health of the plugin system.
 */
export interface PluginSystemHealth {
  status: 'healthy' | 'degraded' | 'unhealthy';
  version: string;
  uptime: number;
  pluginCount: number;
  activePlugins: number;
  memoryUsage: {
    used: number;
    total: number;
    percentage: number;
  };
  errors: string[];
  warnings: string[];
  lastChecked: Date;
}

/**
 * Plugin Development Best Practices
 * 
 * Guidelines and best practices for plugin development.
 */
export const PLUGIN_BEST_PRACTICES = {
  naming: [
    'Use descriptive, kebab-case names for plugin identifiers',
    'Include namespace for organizational plugins (e.g., "acme/inventory-manager")',
    'Keep names concise but meaningful',
  ],
  
  versioning: [
    'Follow semantic versioning (SemVer) for plugin versions',
    'Increment major version for breaking changes',
    'Increment minor version for new features',
    'Increment patch version for bug fixes',
  ],
  
  configuration: [
    'Provide sensible default configurations',
    'Use JSON schema for configuration validation',
    'Document all configuration options clearly',
    'Support environment-specific configurations',
  ],
  
  security: [
    'Request minimal necessary permissions',
    'Validate all input data thoroughly',
    'Use secure communication for external APIs',
    'Implement proper error handling',
    'Avoid storing sensitive data in plain text',
  ],
  
  performance: [
    'Minimize resource usage and memory footprint',
    'Implement proper cleanup in lifecycle methods',
    'Use async/await for non-blocking operations',
    'Cache expensive computations appropriately',
    'Monitor and profile plugin performance',
  ],
  
  reliability: [
    'Implement comprehensive error handling',
    'Provide meaningful health check information',
    'Handle graceful shutdown in onStop method',
    'Test plugin thoroughly before distribution',
    'Document dependencies and requirements',
  ],
  
  compatibility: [
    'Support multiple ERP system versions when possible',
    'Document breaking changes in changelog',
    'Provide migration guides for major updates',
    'Test with different database configurations',
    'Ensure cross-platform compatibility',
  ],
} as const;

/**
 * Plugin System Documentation Links
 */
export const DOCUMENTATION_LINKS = {
  gettingStarted: '/docs/plugins/getting-started',
  apiReference: '/docs/plugins/api-reference',
  examples: '/docs/plugins/examples',
  bestPractices: '/docs/plugins/best-practices',
  troubleshooting: '/docs/plugins/troubleshooting',
  marketplace: '/marketplace',
} as const;