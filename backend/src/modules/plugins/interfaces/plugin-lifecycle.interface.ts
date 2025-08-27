import { PluginStatus } from '../../../database/entities/plugin.entity';

/**
 * Plugin lifecycle state
 */
export interface IPluginLifecycleState {
  pluginId: string;
  status: PluginStatus;
  isActive: boolean;
  version: string;
  installedAt: Date;
  lastActivated?: Date;
  lastDeactivated?: Date;
  errorCount: number;
  lastError?: string;
}

/**
 * Plugin lifecycle operation
 */
export interface IPluginLifecycleOperation {
  operation: 'install' | 'uninstall' | 'activate' | 'deactivate' | 'update' | 'configure';
  pluginId: string;
  version?: string;
  config?: Record<string, any>;
  options?: Record<string, any>;
  timestamp: Date;
  userId?: string;
}

/**
 * Plugin lifecycle result
 */
export interface IPluginLifecycleResult {
  success: boolean;
  operation: string;
  pluginId: string;
  message?: string;
  error?: string;
  data?: any;
  rollback?: () => Promise<void>;
}

/**
 * Plugin lifecycle manager interface
 */
export interface IPluginLifecycleManager {
  /**
   * Install a plugin from a package or path
   */
  install(source: string | Buffer, options?: {
    force?: boolean;
    skipValidation?: boolean;
    userId?: string;
  }): Promise<IPluginLifecycleResult>;

  /**
   * Uninstall a plugin
   */
  uninstall(pluginId: string, options?: {
    keepData?: boolean;
    force?: boolean;
    userId?: string;
  }): Promise<IPluginLifecycleResult>;

  /**
   * Activate a plugin
   */
  activate(pluginId: string, options?: {
    userId?: string;
  }): Promise<IPluginLifecycleResult>;

  /**
   * Deactivate a plugin
   */
  deactivate(pluginId: string, options?: {
    userId?: string;
  }): Promise<IPluginLifecycleResult>;

  /**
   * Update a plugin
   */
  update(pluginId: string, version?: string, options?: {
    force?: boolean;
    backup?: boolean;
    userId?: string;
  }): Promise<IPluginLifecycleResult>;

  /**
   * Configure a plugin
   */
  configure(pluginId: string, config: Record<string, any>, options?: {
    validate?: boolean;
    merge?: boolean;
    userId?: string;
  }): Promise<IPluginLifecycleResult>;

  /**
   * Get plugin lifecycle state
   */
  getState(pluginId: string): Promise<IPluginLifecycleState>;

  /**
   * Get all plugin states
   */
  getAllStates(): Promise<IPluginLifecycleState[]>;

  /**
   * Validate plugin dependencies
   */
  validateDependencies(pluginId: string): Promise<string[]>;

  /**
   * Restart a plugin
   */
  restart(pluginId: string, options?: {
    userId?: string;
  }): Promise<IPluginLifecycleResult>;

  /**
   * Rollback a plugin operation
   */
  rollback(operationId: string): Promise<IPluginLifecycleResult>;
}

/**
 * Plugin lifecycle events
 */
export enum PluginLifecycleEvents {
  STATE_CHANGED = 'plugin.lifecycle.state.changed',
  OPERATION_STARTED = 'plugin.lifecycle.operation.started',
  OPERATION_COMPLETED = 'plugin.lifecycle.operation.completed',
  OPERATION_FAILED = 'plugin.lifecycle.operation.failed',
  DEPENDENCY_RESOLVED = 'plugin.lifecycle.dependency.resolved',
  DEPENDENCY_FAILED = 'plugin.lifecycle.dependency.failed',
}

/**
 * Plugin startup options
 */
export interface IPluginStartupOptions {
  autoActivate?: boolean;
  loadOrder?: number;
  dependencies?: string[];
  timeout?: number;
  retries?: number;
  healthCheck?: boolean;
}