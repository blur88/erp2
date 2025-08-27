import { Type } from '@nestjs/common';
import { PluginType, PluginStatus } from '../../../database/entities/plugin.entity';

/**
 * Plugin metadata interface
 */
export interface IPluginMetadata {
  identifier: string;
  name: string;
  version: string;
  description: string;
  author: string;
  license?: string;
  homepage?: string;
  repository?: string;
  iconUrl?: string;
  type: PluginType;
  tags?: string[];
  dependencies?: IPluginDependency[];
  requirements?: IPluginRequirements;
}

/**
 * Plugin dependency interface
 */
export interface IPluginDependency {
  name: string;
  version: string;
  required: boolean;
  type: 'plugin' | 'npm' | 'system';
}

/**
 * Plugin system requirements
 */
export interface IPluginRequirements {
  nodeVersion?: string;
  memoryMin?: string;
  diskSpace?: string;
  permissions?: string[];
  erpVersion?: string;
}

/**
 * Plugin configuration schema
 */
export interface IPluginConfigSchema {
  [key: string]: {
    type: 'string' | 'number' | 'boolean' | 'object' | 'array';
    required?: boolean;
    default?: any;
    description?: string;
    validation?: {
      min?: number;
      max?: number;
      pattern?: string;
      enum?: any[];
    };
  };
}

/**
 * Plugin hook definition
 */
export interface IPluginHook {
  event: string;
  handler: string;
  priority: number;
  async?: boolean;
}

/**
 * Plugin API endpoint definition
 */
export interface IPluginEndpoint {
  path: string;
  method: 'GET' | 'POST' | 'PUT' | 'DELETE' | 'PATCH';
  handler: string;
  middleware?: string[];
  permissions?: string[];
  rateLimit?: {
    windowMs: number;
    max: number;
  };
}

/**
 * Plugin UI component definition
 */
export interface IPluginUIComponent {
  name: string;
  type: 'component' | 'route' | 'menu_item' | 'widget' | 'page';
  path?: string;
  component?: string;
  permissions?: string[];
  props?: Record<string, any>;
}

/**
 * Plugin migration definition
 */
export interface IPluginMigration {
  version: string;
  up: () => Promise<void>;
  down: () => Promise<void>;
  description?: string;
}

/**
 * Plugin context interface - runtime context passed to plugins
 */
export interface IPluginContext {
  pluginId: string;
  config: Record<string, any>;
  logger: any;
  database: any;
  httpService: any;
  eventEmitter: any;
  cacheManager: any;
  configService: any;
  authService: any;
  permissionService: any;
}

/**
 * Plugin execution result
 */
export interface IPluginExecutionResult {
  success: boolean;
  data?: any;
  error?: string;
  metadata?: Record<string, any>;
}

/**
 * Plugin health check result
 */
export interface IPluginHealthCheck {
  status: 'healthy' | 'unhealthy' | 'degraded';
  message?: string;
  details?: Record<string, any>;
  timestamp: Date;
}

/**
 * Main plugin interface that all plugins must implement
 */
export interface IPlugin {
  /**
   * Plugin metadata
   */
  readonly metadata: IPluginMetadata;

  /**
   * Plugin configuration schema
   */
  readonly configSchema?: IPluginConfigSchema;

  /**
   * Default configuration
   */
  readonly defaultConfig?: Record<string, any>;

  /**
   * Plugin hooks
   */
  readonly hooks?: IPluginHook[];

  /**
   * Plugin API endpoints
   */
  readonly endpoints?: IPluginEndpoint[];

  /**
   * Plugin UI components
   */
  readonly uiComponents?: IPluginUIComponent[];

  /**
   * Plugin migrations
   */
  readonly migrations?: IPluginMigration[];

  /**
   * Initialize the plugin
   */
  initialize(context: IPluginContext): Promise<void>;

  /**
   * Start/activate the plugin
   */
  start(): Promise<void>;

  /**
   * Stop/deactivate the plugin
   */
  stop(): Promise<void>;

  /**
   * Destroy the plugin and clean up resources
   */
  destroy(): Promise<void>;

  /**
   * Configure the plugin
   */
  configure(config: Record<string, any>): Promise<void>;

  /**
   * Validate plugin configuration
   */
  validateConfig(config: Record<string, any>): Promise<string[]>;

  /**
   * Execute a plugin method
   */
  execute(method: string, params?: any): Promise<IPluginExecutionResult>;

  /**
   * Get plugin health status
   */
  getHealth(): Promise<IPluginHealthCheck>;

  /**
   * Handle plugin events
   */
  onEvent(event: string, data: any): Promise<void>;
}

/**
 * Plugin factory interface for creating plugin instances
 */
export interface IPluginFactory {
  create(): IPlugin;
}

/**
 * Plugin module interface for NestJS integration
 */
export interface IPluginModule {
  forRoot?(config?: Record<string, any>): Type<any>;
  forFeature?(config?: Record<string, any>): Type<any>;
}

/**
 * Plugin installer interface
 */
export interface IPluginInstaller {
  install(pluginPath: string, options?: Record<string, any>): Promise<void>;
  uninstall(pluginId: string, options?: Record<string, any>): Promise<void>;
  update(pluginId: string, version?: string): Promise<void>;
  validate(pluginPath: string): Promise<string[]>;
}

/**
 * Plugin store/marketplace interface
 */
export interface IPluginStore {
  search(query: string, filters?: Record<string, any>): Promise<IPluginMetadata[]>;
  getPlugin(pluginId: string): Promise<IPluginMetadata>;
  downloadPlugin(pluginId: string, version?: string): Promise<Buffer>;
  getVersions(pluginId: string): Promise<string[]>;
  getPopular(limit?: number): Promise<IPluginMetadata[]>;
  getCategory(category: PluginType): Promise<IPluginMetadata[]>;
}

/**
 * Plugin events
 */
export enum PluginEvents {
  BEFORE_INSTALL = 'plugin.before.install',
  AFTER_INSTALL = 'plugin.after.install',
  BEFORE_UNINSTALL = 'plugin.before.uninstall',
  AFTER_UNINSTALL = 'plugin.after.uninstall',
  BEFORE_ACTIVATE = 'plugin.before.activate',
  AFTER_ACTIVATE = 'plugin.after.activate',
  BEFORE_DEACTIVATE = 'plugin.before.deactivate',
  AFTER_DEACTIVATE = 'plugin.after.deactivate',
  BEFORE_UPDATE = 'plugin.before.update',
  AFTER_UPDATE = 'plugin.after.update',
  BEFORE_CONFIGURE = 'plugin.before.configure',
  AFTER_CONFIGURE = 'plugin.after.configure',
  ERROR = 'plugin.error',
  HEALTH_CHECK = 'plugin.health.check',
}

/**
 * Plugin registry interface
 */
export interface IPluginRegistry {
  register(plugin: IPlugin): Promise<void>;
  unregister(pluginId: string): Promise<void>;
  get(pluginId: string): IPlugin | undefined;
  getAll(): IPlugin[];
  getByType(type: PluginType): IPlugin[];
  getByStatus(status: PluginStatus): IPlugin[];
  has(pluginId: string): boolean;
  clear(): void;
}

/**
 * Plugin permissions
 */
export interface IPluginPermissions {
  database?: {
    read?: boolean;
    write?: boolean;
    create?: boolean;
    delete?: boolean;
    schema?: boolean;
  };
  api?: {
    internal?: boolean;
    external?: boolean;
    webhook?: boolean;
  };
  filesystem?: {
    read?: boolean;
    write?: boolean;
    execute?: boolean;
    paths?: string[];
  };
  network?: {
    outbound?: boolean;
    inbound?: boolean;
    domains?: string[];
  };
  system?: {
    environment?: boolean;
    process?: boolean;
    services?: string[];
  };
  ui?: {
    routes?: boolean;
    components?: boolean;
    menu?: boolean;
  };
}