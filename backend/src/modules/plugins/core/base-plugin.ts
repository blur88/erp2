import { Logger } from '@nestjs/common';
import {
  IPlugin,
  IPluginMetadata,
  IPluginConfigSchema,
  IPluginContext,
  IPluginExecutionResult,
  IPluginHealthCheck,
  IPluginHook,
  IPluginEndpoint,
  IPluginUIComponent,
  IPluginMigration,
} from '../interfaces';

/**
 * Abstract base class for all plugins
 * Provides common functionality and structure
 */
export abstract class BasePlugin implements IPlugin {
  protected logger: Logger;
  protected context: IPluginContext;
  protected isInitialized = false;
  protected isStarted = false;

  constructor() {
    this.logger = new Logger(this.constructor.name);
  }

  /**
   * Plugin metadata - must be implemented by each plugin
   */
  abstract readonly metadata: IPluginMetadata;

  /**
   * Plugin configuration schema - optional
   */
  readonly configSchema?: IPluginConfigSchema;

  /**
   * Default configuration - optional
   */
  readonly defaultConfig?: Record<string, any>;

  /**
   * Plugin hooks - optional
   */
  readonly hooks?: IPluginHook[];

  /**
   * Plugin API endpoints - optional
   */
  readonly endpoints?: IPluginEndpoint[];

  /**
   * Plugin UI components - optional
   */
  readonly uiComponents?: IPluginUIComponent[];

  /**
   * Plugin migrations - optional
   */
  readonly migrations?: IPluginMigration[];

  /**
   * Initialize the plugin with context
   */
  async initialize(context: IPluginContext): Promise<void> {
    if (this.isInitialized) {
      this.logger.warn(`Plugin ${this.metadata.identifier} is already initialized`);
      return;
    }

    try {
      this.context = context;
      this.logger.log(`Initializing plugin ${this.metadata.identifier}`);

      await this.onInitialize();
      this.isInitialized = true;

      this.logger.log(`Plugin ${this.metadata.identifier} initialized successfully`);
    } catch (error) {
      this.logger.error(`Failed to initialize plugin ${this.metadata.identifier}:`, error);
      throw error;
    }
  }

  /**
   * Start/activate the plugin
   */
  async start(): Promise<void> {
    if (!this.isInitialized) {
      throw new Error(`Plugin ${this.metadata.identifier} must be initialized before starting`);
    }

    if (this.isStarted) {
      this.logger.warn(`Plugin ${this.metadata.identifier} is already started`);
      return;
    }

    try {
      this.logger.log(`Starting plugin ${this.metadata.identifier}`);
      
      await this.onStart();
      this.isStarted = true;

      this.logger.log(`Plugin ${this.metadata.identifier} started successfully`);
    } catch (error) {
      this.logger.error(`Failed to start plugin ${this.metadata.identifier}:`, error);
      throw error;
    }
  }

  /**
   * Stop/deactivate the plugin
   */
  async stop(): Promise<void> {
    if (!this.isStarted) {
      this.logger.warn(`Plugin ${this.metadata.identifier} is not started`);
      return;
    }

    try {
      this.logger.log(`Stopping plugin ${this.metadata.identifier}`);
      
      await this.onStop();
      this.isStarted = false;

      this.logger.log(`Plugin ${this.metadata.identifier} stopped successfully`);
    } catch (error) {
      this.logger.error(`Failed to stop plugin ${this.metadata.identifier}:`, error);
      throw error;
    }
  }

  /**
   * Destroy the plugin and clean up resources
   */
  async destroy(): Promise<void> {
    try {
      if (this.isStarted) {
        await this.stop();
      }

      this.logger.log(`Destroying plugin ${this.metadata.identifier}`);
      
      await this.onDestroy();
      this.isInitialized = false;

      this.logger.log(`Plugin ${this.metadata.identifier} destroyed successfully`);
    } catch (error) {
      this.logger.error(`Failed to destroy plugin ${this.metadata.identifier}:`, error);
      throw error;
    }
  }

  /**
   * Configure the plugin
   */
  async configure(config: Record<string, any>): Promise<void> {
    try {
      this.logger.log(`Configuring plugin ${this.metadata.identifier}`);
      
      // Validate configuration
      const errors = await this.validateConfig(config);
      if (errors.length > 0) {
        throw new Error(`Configuration validation failed: ${errors.join(', ')}`);
      }

      // Merge with existing configuration
      this.context.config = { ...this.context.config, ...config };
      
      await this.onConfigure(config);

      this.logger.log(`Plugin ${this.metadata.identifier} configured successfully`);
    } catch (error) {
      this.logger.error(`Failed to configure plugin ${this.metadata.identifier}:`, error);
      throw error;
    }
  }

  /**
   * Validate plugin configuration
   */
  async validateConfig(config: Record<string, any>): Promise<string[]> {
    const errors: string[] = [];

    if (!this.configSchema) {
      return errors; // No schema to validate against
    }

    for (const [key, schema] of Object.entries(this.configSchema)) {
      const value = config[key];

      // Check required fields
      if (schema.required && (value === undefined || value === null)) {
        errors.push(`Required configuration key '${key}' is missing`);
        continue;
      }

      // Skip validation if value is not provided and not required
      if (value === undefined || value === null) {
        continue;
      }

      // Type validation
      if (schema.type && typeof value !== schema.type) {
        errors.push(`Configuration key '${key}' should be of type '${schema.type}', got '${typeof value}'`);
        continue;
      }

      // Validation rules
      if (schema.validation) {
        const validation = schema.validation;

        // Min/Max validation for numbers
        if (schema.type === 'number') {
          if (validation.min !== undefined && value < validation.min) {
            errors.push(`Configuration key '${key}' should be at least ${validation.min}`);
          }
          if (validation.max !== undefined && value > validation.max) {
            errors.push(`Configuration key '${key}' should be at most ${validation.max}`);
          }
        }

        // Pattern validation for strings
        if (schema.type === 'string' && validation.pattern) {
          const regex = new RegExp(validation.pattern);
          if (!regex.test(value)) {
            errors.push(`Configuration key '${key}' does not match required pattern`);
          }
        }

        // Enum validation
        if (validation.enum && !validation.enum.includes(value)) {
          errors.push(`Configuration key '${key}' must be one of: ${validation.enum.join(', ')}`);
        }
      }
    }

    // Allow plugins to add custom validation
    const customErrors = await this.onValidateConfig(config);
    errors.push(...customErrors);

    return errors;
  }

  /**
   * Execute a plugin method
   */
  async execute(method: string, params?: any): Promise<IPluginExecutionResult> {
    try {
      if (!this.isStarted) {
        return {
          success: false,
          error: `Plugin ${this.metadata.identifier} is not started`,
        };
      }

      this.logger.debug(`Executing method '${method}' on plugin ${this.metadata.identifier}`);
      
      const result = await this.onExecute(method, params);
      
      this.logger.debug(`Method '${method}' executed successfully on plugin ${this.metadata.identifier}`);
      
      return {
        success: true,
        data: result,
      };
    } catch (error) {
      this.logger.error(`Failed to execute method '${method}' on plugin ${this.metadata.identifier}:`, error);
      
      return {
        success: false,
        error: error.message,
      };
    }
  }

  /**
   * Get plugin health status
   */
  async getHealth(): Promise<IPluginHealthCheck> {
    try {
      const health = await this.onHealthCheck();
      
      return {
        status: health?.status || 'healthy',
        message: health?.message,
        details: health?.details,
        timestamp: new Date(),
      };
    } catch (error) {
      this.logger.error(`Health check failed for plugin ${this.metadata.identifier}:`, error);
      
      return {
        status: 'unhealthy',
        message: error.message,
        timestamp: new Date(),
      };
    }
  }

  /**
   * Handle plugin events
   */
  async onEvent(event: string, data: any): Promise<void> {
    try {
      this.logger.debug(`Plugin ${this.metadata.identifier} received event: ${event}`);
      await this.onPluginEvent(event, data);
    } catch (error) {
      this.logger.error(`Error handling event '${event}' in plugin ${this.metadata.identifier}:`, error);
      throw error;
    }
  }

  // Protected lifecycle hooks for plugins to override

  /**
   * Called during plugin initialization
   * Override to perform initialization logic
   */
  protected async onInitialize(): Promise<void> {
    // Default implementation - do nothing
  }

  /**
   * Called when plugin is started
   * Override to perform startup logic
   */
  protected async onStart(): Promise<void> {
    // Default implementation - do nothing
  }

  /**
   * Called when plugin is stopped
   * Override to perform shutdown logic
   */
  protected async onStop(): Promise<void> {
    // Default implementation - do nothing
  }

  /**
   * Called when plugin is destroyed
   * Override to perform cleanup logic
   */
  protected async onDestroy(): Promise<void> {
    // Default implementation - do nothing
  }

  /**
   * Called when plugin is configured
   * Override to handle configuration changes
   */
  protected async onConfigure(config: Record<string, any>): Promise<void> {
    // Default implementation - do nothing
  }

  /**
   * Called for custom configuration validation
   * Override to add plugin-specific validation logic
   */
  protected async onValidateConfig(config: Record<string, any>): Promise<string[]> {
    // Default implementation - no custom validation
    return [];
  }

  /**
   * Called when a method is executed on the plugin
   * Override to handle method execution
   */
  protected async onExecute(method: string, params?: any): Promise<any> {
    throw new Error(`Method '${method}' is not implemented by plugin ${this.metadata.identifier}`);
  }

  /**
   * Called during health check
   * Override to provide custom health check logic
   */
  protected async onHealthCheck(): Promise<Partial<IPluginHealthCheck>> {
    // Default implementation - healthy if started
    return {
      status: this.isStarted ? 'healthy' : 'unhealthy',
      message: this.isStarted ? 'Plugin is running' : 'Plugin is not started',
    };
  }

  /**
   * Called when plugin receives an event
   * Override to handle plugin events
   */
  protected async onPluginEvent(event: string, data: any): Promise<void> {
    // Default implementation - do nothing
  }

  // Protected utility methods

  /**
   * Get configuration value with default
   */
  protected getConfig<T>(key: string, defaultValue?: T): T {
    return this.context.config?.[key] ?? defaultValue;
  }

  /**
   * Get all configuration
   */
  protected getAllConfig(): Record<string, any> {
    return this.context.config || {};
  }

  /**
   * Check if plugin is ready to execute operations
   */
  protected checkReady(): void {
    if (!this.isInitialized) {
      throw new Error(`Plugin ${this.metadata.identifier} is not initialized`);
    }
    if (!this.isStarted) {
      throw new Error(`Plugin ${this.metadata.identifier} is not started`);
    }
  }

  /**
   * Get plugin status information
   */
  getStatus(): {
    identifier: string;
    name: string;
    version: string;
    isInitialized: boolean;
    isStarted: boolean;
  } {
    return {
      identifier: this.metadata.identifier,
      name: this.metadata.name,
      version: this.metadata.version,
      isInitialized: this.isInitialized,
      isStarted: this.isStarted,
    };
  }
}