import {
  Entity,
  Column,
  Index,
  BeforeInsert,
  BeforeUpdate,
} from 'typeorm';
import {
  IsString,
  IsBoolean,
  IsOptional,
  IsEnum,
  MaxLength,
  IsJSON,
  IsUrl,
  IsVersion,
} from 'class-validator';
import { BaseEntity } from './base.entity';

export enum PluginStatus {
  INSTALLED = 'installed',
  ACTIVE = 'active',
  INACTIVE = 'inactive',
  ERROR = 'error',
  UPDATING = 'updating',
  UNINSTALLED = 'uninstalled',
}

export enum PluginType {
  INTEGRATION = 'integration',
  REPORT = 'report',
  WORKFLOW = 'workflow',
  UI_EXTENSION = 'ui_extension',
  DATA_CONNECTOR = 'data_connector',
  PAYMENT_GATEWAY = 'payment_gateway',
  SHIPPING_PROVIDER = 'shipping_provider',
  NOTIFICATION = 'notification',
  ANALYTICS = 'analytics',
  SECURITY = 'security',
  OTHER = 'other',
}

/**
 * Plugin entity for managing ERP system extensions
 * Supports plugin lifecycle management and configuration
 */
@Entity('plugins')
@Index(['name'], { unique: true })
@Index(['identifier'], { unique: true })
@Index(['status'])
@Index(['type'])
@Index(['isActive'])
@Index(['installedDate'])
export class Plugin extends BaseEntity {
  @Column({
    type: 'varchar',
    length: 100,
    unique: true,
    comment: 'Unique plugin identifier/slug',
  })
  @IsString()
  @MaxLength(100)
  identifier: string;

  @Column({
    type: 'varchar',
    length: 200,
    unique: true,
    comment: 'Plugin display name',
  })
  @IsString()
  @MaxLength(200)
  name: string;

  @Column({
    type: 'text',
    comment: 'Plugin description',
  })
  @IsString()
  description: string;

  @Column({
    type: 'varchar',
    length: 20,
    comment: 'Plugin version',
  })
  @IsVersion()
  @MaxLength(20)
  version: string;

  @Column({
    type: 'enum',
    enum: PluginType,
    comment: 'Plugin type/category',
  })
  @IsEnum(PluginType)
  type: PluginType;

  @Column({
    type: 'enum',
    enum: PluginStatus,
    default: PluginStatus.INSTALLED,
    comment: 'Plugin status',
  })
  @IsEnum(PluginStatus)
  status: PluginStatus;

  @Column({
    type: 'boolean',
    default: false,
    comment: 'Whether the plugin is currently active',
  })
  @IsBoolean()
  isActive: boolean;

  // Plugin Information
  @Column({
    type: 'varchar',
    length: 200,
    comment: 'Plugin author/developer',
  })
  @IsString()
  @MaxLength(200)
  author: string;

  @Column({
    type: 'varchar',
    length: 100,
    nullable: true,
    comment: 'Plugin license',
  })
  @IsOptional()
  @IsString()
  @MaxLength(100)
  license?: string;

  @Column({
    type: 'varchar',
    length: 255,
    nullable: true,
    comment: 'Plugin homepage URL',
  })
  @IsOptional()
  @IsUrl()
  @MaxLength(255)
  homepage?: string;

  @Column({
    type: 'varchar',
    length: 255,
    nullable: true,
    comment: 'Plugin repository URL',
  })
  @IsOptional()
  @IsUrl()
  @MaxLength(255)
  repository?: string;

  @Column({
    type: 'varchar',
    length: 255,
    nullable: true,
    comment: 'Plugin icon URL or path',
  })
  @IsOptional()
  @IsString()
  @MaxLength(255)
  iconUrl?: string;

  // Installation Information
  @Column({
    type: 'timestamptz',
    default: () => 'CURRENT_TIMESTAMP',
    comment: 'Installation date',
  })
  installedDate: Date;

  @Column({
    type: 'timestamptz',
    nullable: true,
    comment: 'Last activation date',
  })
  @IsOptional()
  lastActivatedDate?: Date;

  @Column({
    type: 'timestamptz',
    nullable: true,
    comment: 'Last update date',
  })
  @IsOptional()
  lastUpdatedDate?: Date;

  @Column({
    type: 'varchar',
    length: 500,
    nullable: true,
    comment: 'Installation path or location',
  })
  @IsOptional()
  @IsString()
  @MaxLength(500)
  installPath?: string;

  // Dependencies and Requirements
  @Column({
    type: 'json',
    nullable: true,
    comment: 'Plugin dependencies',
  })
  @IsOptional()
  dependencies?: Array<{
    name: string;
    version: string;
    required: boolean;
  }>;

  @Column({
    type: 'json',
    nullable: true,
    comment: 'System requirements',
  })
  @IsOptional()
  requirements?: {
    nodeVersion?: string;
    memoryMin?: string;
    diskSpace?: string;
    permissions?: string[];
  };

  // Configuration
  @Column({
    type: 'json',
    nullable: true,
    comment: 'Plugin configuration schema',
  })
  @IsOptional()
  @IsJSON()
  configSchema?: Record<string, any>;

  @Column({
    type: 'json',
    nullable: true,
    comment: 'Current plugin configuration',
  })
  @IsOptional()
  @IsJSON()
  config?: Record<string, any>;

  @Column({
    type: 'json',
    nullable: true,
    comment: 'Default configuration values',
  })
  @IsOptional()
  @IsJSON()
  defaultConfig?: Record<string, any>;

  // Hooks and Integration Points
  @Column({
    type: 'json',
    nullable: true,
    comment: 'Plugin hooks and event handlers',
  })
  @IsOptional()
  hooks?: Array<{
    event: string;
    handler: string;
    priority: number;
  }>;

  @Column({
    type: 'json',
    nullable: true,
    comment: 'API endpoints provided by plugin',
  })
  @IsOptional()
  endpoints?: Array<{
    path: string;
    method: string;
    handler: string;
    middleware?: string[];
  }>;

  @Column({
    type: 'json',
    nullable: true,
    comment: 'UI components or routes added by plugin',
  })
  @IsOptional()
  uiComponents?: Array<{
    name: string;
    type: 'component' | 'route' | 'menu_item';
    path?: string;
    component?: string;
    permissions?: string[];
  }>;

  // Performance and Statistics
  @Column({
    type: 'json',
    nullable: true,
    comment: 'Plugin performance metrics',
  })
  @IsOptional()
  performanceMetrics?: {
    loadTime?: number;
    memoryUsage?: number;
    cpuUsage?: number;
    errorCount?: number;
    lastError?: {
      message: string;
      timestamp: Date;
      stack?: string;
    };
  };

  @Column({
    type: 'json',
    nullable: true,
    comment: 'Plugin usage statistics',
  })
  @IsOptional()
  usageStats?: {
    activationCount: number;
    lastUsed?: Date;
    featuresUsed?: Record<string, number>;
  };

  // Error Handling
  @Column({
    type: 'text',
    nullable: true,
    comment: 'Last error message',
  })
  @IsOptional()
  @IsString()
  lastError?: string;

  @Column({
    type: 'timestamptz',
    nullable: true,
    comment: 'Last error timestamp',
  })
  @IsOptional()
  lastErrorAt?: Date;

  @Column({
    type: 'int',
    default: 0,
    comment: 'Error count',
  })
  errorCount: number;

  // Additional Information
  @Column({
    type: 'json',
    nullable: true,
    comment: 'Plugin tags for categorization',
  })
  @IsOptional()
  tags?: string[];

  @Column({
    type: 'json',
    nullable: true,
    comment: 'Plugin screenshots or media',
  })
  @IsOptional()
  media?: Array<{
    type: 'screenshot' | 'video' | 'logo';
    url: string;
    title?: string;
    description?: string;
  }>;

  @Column({
    type: 'json',
    nullable: true,
    comment: 'Plugin changelog',
  })
  @IsOptional()
  changelog?: Array<{
    version: string;
    date: Date;
    changes: string[];
  }>;

  @Column({
    type: 'json',
    nullable: true,
    comment: 'Additional plugin metadata',
  })
  @IsOptional()
  metadata?: Record<string, any>;

  // Computed properties
  get hasErrors(): boolean {
    return this.errorCount > 0 || this.status === PluginStatus.ERROR;
  }

  get canActivate(): boolean {
    return [PluginStatus.INSTALLED, PluginStatus.INACTIVE].includes(this.status) && !this.hasErrors;
  }

  get canDeactivate(): boolean {
    return this.status === PluginStatus.ACTIVE;
  }

  get isInstalled(): boolean {
    return ![PluginStatus.UNINSTALLED].includes(this.status);
  }

  get needsUpdate(): boolean {
    // This would be determined by comparing with available versions
    return false; // Placeholder
  }

  // Hooks
  @BeforeInsert()
  @BeforeUpdate()
  updateActivationDate() {
    if (this.isActive && this.status === PluginStatus.ACTIVE && !this.lastActivatedDate) {
      this.lastActivatedDate = new Date();
    }
  }

  // Helper methods
  activate(): void {
    if (this.canActivate) {
      this.isActive = true;
      this.status = PluginStatus.ACTIVE;
      this.lastActivatedDate = new Date();
      this.clearErrors();
    }
  }

  deactivate(): void {
    if (this.canDeactivate) {
      this.isActive = false;
      this.status = PluginStatus.INACTIVE;
    }
  }

  updateConfig(newConfig: Record<string, any>): void {
    this.config = { ...this.config, ...newConfig };
    this.lastUpdatedDate = new Date();
  }

  resetConfig(): void {
    this.config = { ...this.defaultConfig };
    this.lastUpdatedDate = new Date();
  }

  recordError(error: string, stack?: string): void {
    this.lastError = error;
    this.lastErrorAt = new Date();
    this.errorCount += 1;
    this.status = PluginStatus.ERROR;
    this.isActive = false;

    if (!this.performanceMetrics) {
      this.performanceMetrics = {};
    }
    this.performanceMetrics.errorCount = this.errorCount;
    this.performanceMetrics.lastError = {
      message: error,
      timestamp: new Date(),
      stack,
    };
  }

  clearErrors(): void {
    this.lastError = null;
    this.lastErrorAt = null;
    this.errorCount = 0;
    if (this.performanceMetrics) {
      this.performanceMetrics.errorCount = 0;
      delete this.performanceMetrics.lastError;
    }
  }

  updatePerformanceMetrics(metrics: {
    loadTime?: number;
    memoryUsage?: number;
    cpuUsage?: number;
  }): void {
    if (!this.performanceMetrics) {
      this.performanceMetrics = {};
    }
    Object.assign(this.performanceMetrics, metrics);
  }

  recordUsage(feature?: string): void {
    if (!this.usageStats) {
      this.usageStats = {
        activationCount: 0,
        featuresUsed: {},
      };
    }

    this.usageStats.lastUsed = new Date();
    
    if (feature) {
      if (!this.usageStats.featuresUsed) {
        this.usageStats.featuresUsed = {};
      }
      this.usageStats.featuresUsed[feature] = (this.usageStats.featuresUsed[feature] || 0) + 1;
    }
  }

  // Validation methods
  validateConfig(config: Record<string, any>): Array<string> {
    const errors: string[] = [];
    
    if (!this.configSchema) {
      return errors; // No schema to validate against
    }

    // Basic validation - in production, you'd use a proper JSON schema validator
    for (const [key, schema] of Object.entries(this.configSchema)) {
      if (schema.required && !(key in config)) {
        errors.push(`Required configuration key '${key}' is missing`);
      }
    }

    return errors;
  }

  checkDependencies(): Array<string> {
    const missingDeps: string[] = [];
    
    if (this.dependencies) {
      for (const dep of this.dependencies) {
        if (dep.required) {
          // In production, you'd check if the dependency is actually installed
          // For now, we'll assume all dependencies are available
          // missingDeps.push(`Missing required dependency: ${dep.name}@${dep.version}`);
        }
      }
    }

    return missingDeps;
  }

  // Static factory method
  static create(pluginData: {
    identifier: string;
    name: string;
    description: string;
    version: string;
    type: PluginType;
    author: string;
    config?: Record<string, any>;
  }): Partial<Plugin> {
    return {
      identifier: pluginData.identifier,
      name: pluginData.name,
      description: pluginData.description,
      version: pluginData.version,
      type: pluginData.type,
      author: pluginData.author,
      status: PluginStatus.INSTALLED,
      isActive: false,
      installedDate: new Date(),
      config: pluginData.config,
      errorCount: 0,
    };
  }

  // Get summary for dashboard
  getSummary(): {
    name: string;
    version: string;
    status: PluginStatus;
    isActive: boolean;
    hasErrors: boolean;
    errorCount: number;
    lastUsed?: Date;
  } {
    return {
      name: this.name,
      version: this.version,
      status: this.status,
      isActive: this.isActive,
      hasErrors: this.hasErrors,
      errorCount: this.errorCount,
      lastUsed: this.usageStats?.lastUsed,
    };
  }
}