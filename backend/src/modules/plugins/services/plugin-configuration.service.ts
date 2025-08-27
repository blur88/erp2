import { Injectable, Logger } from '@nestjs/common';
import { InjectRepository } from '@nestjs/typeorm';
import { Repository } from 'typeorm';
import { EventEmitter2 } from '@nestjs/event-emitter';
import { Plugin } from '../../../database/entities/plugin.entity';
import { IPluginConfigSchema } from '../interfaces';
import * as Ajv from 'ajv';
import * as addFormats from 'ajv-formats';

export interface IPluginConfigurationService {
  /**
   * Get plugin configuration
   */
  getConfig(pluginId: string): Promise<Record<string, any>>;

  /**
   * Set plugin configuration
   */
  setConfig(pluginId: string, config: Record<string, any>, options?: {
    validate?: boolean;
    merge?: boolean;
    userId?: string;
  }): Promise<void>;

  /**
   * Update specific configuration keys
   */
  updateConfig(pluginId: string, updates: Record<string, any>, options?: {
    validate?: boolean;
    userId?: string;
  }): Promise<void>;

  /**
   * Reset configuration to defaults
   */
  resetConfig(pluginId: string, keys?: string[]): Promise<void>;

  /**
   * Validate configuration against schema
   */
  validateConfig(pluginId: string, config: Record<string, any>): Promise<string[]>;

  /**
   * Get configuration schema
   */
  getConfigSchema(pluginId: string): Promise<IPluginConfigSchema | null>;

  /**
   * Set configuration schema
   */
  setConfigSchema(pluginId: string, schema: IPluginConfigSchema): Promise<void>;

  /**
   * Get default configuration
   */
  getDefaultConfig(pluginId: string): Promise<Record<string, any>>;

  /**
   * Export plugin configuration
   */
  exportConfig(pluginId: string): Promise<{
    pluginId: string;
    version: string;
    config: Record<string, any>;
    schema: IPluginConfigSchema | null;
    exportedAt: Date;
  }>;

  /**
   * Import plugin configuration
   */
  importConfig(configData: {
    pluginId: string;
    version?: string;
    config: Record<string, any>;
  }, options?: {
    validate?: boolean;
    merge?: boolean;
    userId?: string;
  }): Promise<void>;

  /**
   * Get configuration history
   */
  getConfigHistory(pluginId: string, limit?: number): Promise<Array<{
    id: string;
    config: Record<string, any>;
    changedAt: Date;
    changedBy?: string;
    changes: Array<{
      key: string;
      oldValue: any;
      newValue: any;
    }>;
  }>>;

  /**
   * Backup current configuration
   */
  backupConfig(pluginId: string, label?: string): Promise<string>;

  /**
   * Restore configuration from backup
   */
  restoreConfig(pluginId: string, backupId: string): Promise<void>;
}

@Injectable()
export class PluginConfigurationService implements IPluginConfigurationService {
  private readonly logger = new Logger(PluginConfigurationService.name);
  private readonly ajv: Ajv.default;
  private readonly configHistory = new Map<string, Array<any>>();
  private readonly configBackups = new Map<string, Array<any>>();

  constructor(
    @InjectRepository(Plugin)
    private readonly pluginRepository: Repository<Plugin>,
    private readonly eventEmitter: EventEmitter2,
  ) {
    // Initialize AJV for JSON schema validation
    this.ajv = new Ajv.default({ allErrors: true, strict: false });
    addFormats.default(this.ajv);
  }

  /**
   * Get plugin configuration
   */
  async getConfig(pluginId: string): Promise<Record<string, any>> {
    const plugin = await this.getPluginEntity(pluginId);
    return plugin.config || plugin.defaultConfig || {};
  }

  /**
   * Set plugin configuration
   */
  async setConfig(
    pluginId: string,
    config: Record<string, any>,
    options: {
      validate?: boolean;
      merge?: boolean;
      userId?: string;
    } = {},
  ): Promise<void> {
    const plugin = await this.getPluginEntity(pluginId);
    const currentConfig = plugin.config || {};

    // Validate configuration if requested
    if (options.validate !== false) {
      const errors = await this.validateConfig(pluginId, config);
      if (errors.length > 0) {
        throw new Error(`Configuration validation failed: ${errors.join(', ')}`);
      }
    }

    // Merge or replace configuration
    const newConfig = options.merge !== false 
      ? { ...currentConfig, ...config }
      : config;

    // Track changes for history
    const changes = this.calculateChanges(currentConfig, newConfig);

    // Update plugin configuration
    plugin.config = newConfig;
    plugin.lastUpdatedDate = new Date();
    
    await this.pluginRepository.save(plugin);

    // Record in history
    this.recordConfigChange(pluginId, newConfig, changes, options.userId);

    // Emit configuration changed event
    await this.eventEmitter.emitAsync('plugin.config.changed', {
      pluginId,
      oldConfig: currentConfig,
      newConfig,
      changes,
      userId: options.userId,
    });

    this.logger.log(`Configuration updated for plugin: ${pluginId}`);
  }

  /**
   * Update specific configuration keys
   */
  async updateConfig(
    pluginId: string,
    updates: Record<string, any>,
    options: {
      validate?: boolean;
      userId?: string;
    } = {},
  ): Promise<void> {
    await this.setConfig(pluginId, updates, { ...options, merge: true });
  }

  /**
   * Reset configuration to defaults
   */
  async resetConfig(pluginId: string, keys?: string[]): Promise<void> {
    const plugin = await this.getPluginEntity(pluginId);
    const currentConfig = plugin.config || {};
    const defaultConfig = plugin.defaultConfig || {};

    let newConfig: Record<string, any>;

    if (keys && keys.length > 0) {
      // Reset only specific keys
      newConfig = { ...currentConfig };
      for (const key of keys) {
        if (defaultConfig.hasOwnProperty(key)) {
          newConfig[key] = defaultConfig[key];
        } else {
          delete newConfig[key];
        }
      }
    } else {
      // Reset all configuration
      newConfig = { ...defaultConfig };
    }

    await this.setConfig(pluginId, newConfig, { merge: false });

    this.logger.log(`Configuration reset for plugin: ${pluginId}${keys ? ` (keys: ${keys.join(', ')})` : ''}`);
  }

  /**
   * Validate configuration against schema
   */
  async validateConfig(pluginId: string, config: Record<string, any>): Promise<string[]> {
    const plugin = await this.getPluginEntity(pluginId);
    const schema = plugin.configSchema;

    if (!schema) {
      return []; // No schema to validate against
    }

    const errors: string[] = [];

    // Convert plugin schema to JSON schema
    const jsonSchema = this.convertToJsonSchema(schema);

    // Validate using AJV
    const validate = this.ajv.compile(jsonSchema);
    const valid = validate(config);

    if (!valid && validate.errors) {
      for (const error of validate.errors) {
        const path = error.instancePath || error.schemaPath;
        errors.push(`${path}: ${error.message}`);
      }
    }

    // Additional custom validation
    for (const [key, fieldSchema] of Object.entries(schema)) {
      const value = config[key];

      // Check required fields
      if (fieldSchema.required && (value === undefined || value === null)) {
        errors.push(`Required configuration key '${key}' is missing`);
        continue;
      }

      // Skip further validation if value is not provided and not required
      if (value === undefined || value === null) {
        continue;
      }

      // Custom validation rules
      if (fieldSchema.validation) {
        const validation = fieldSchema.validation;

        // Min/Max validation for numbers
        if (fieldSchema.type === 'number') {
          if (validation.min !== undefined && value < validation.min) {
            errors.push(`Configuration key '${key}' should be at least ${validation.min}`);
          }
          if (validation.max !== undefined && value > validation.max) {
            errors.push(`Configuration key '${key}' should be at most ${validation.max}`);
          }
        }

        // Pattern validation for strings
        if (fieldSchema.type === 'string' && validation.pattern) {
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

    return errors;
  }

  /**
   * Get configuration schema
   */
  async getConfigSchema(pluginId: string): Promise<IPluginConfigSchema | null> {
    const plugin = await this.getPluginEntity(pluginId);
    return plugin.configSchema || null;
  }

  /**
   * Set configuration schema
   */
  async setConfigSchema(pluginId: string, schema: IPluginConfigSchema): Promise<void> {
    const plugin = await this.getPluginEntity(pluginId);
    
    plugin.configSchema = schema;
    plugin.lastUpdatedDate = new Date();
    
    await this.pluginRepository.save(plugin);

    // Emit schema changed event
    await this.eventEmitter.emitAsync('plugin.config.schema.changed', {
      pluginId,
      schema,
    });

    this.logger.log(`Configuration schema updated for plugin: ${pluginId}`);
  }

  /**
   * Get default configuration
   */
  async getDefaultConfig(pluginId: string): Promise<Record<string, any>> {
    const plugin = await this.getPluginEntity(pluginId);
    return plugin.defaultConfig || {};
  }

  /**
   * Export plugin configuration
   */
  async exportConfig(pluginId: string): Promise<{
    pluginId: string;
    version: string;
    config: Record<string, any>;
    schema: IPluginConfigSchema | null;
    exportedAt: Date;
  }> {
    const plugin = await this.getPluginEntity(pluginId);

    return {
      pluginId: plugin.identifier,
      version: plugin.version,
      config: plugin.config || {},
      schema: plugin.configSchema || null,
      exportedAt: new Date(),
    };
  }

  /**
   * Import plugin configuration
   */
  async importConfig(
    configData: {
      pluginId: string;
      version?: string;
      config: Record<string, any>;
    },
    options: {
      validate?: boolean;
      merge?: boolean;
      userId?: string;
    } = {},
  ): Promise<void> {
    const { pluginId, config } = configData;

    // Verify plugin exists
    await this.getPluginEntity(pluginId);

    // Set the imported configuration
    await this.setConfig(pluginId, config, options);

    // Emit import event
    await this.eventEmitter.emitAsync('plugin.config.imported', {
      pluginId,
      importedConfig: config,
      userId: options.userId,
    });

    this.logger.log(`Configuration imported for plugin: ${pluginId}`);
  }

  /**
   * Get configuration history
   */
  async getConfigHistory(pluginId: string, limit = 10): Promise<Array<{
    id: string;
    config: Record<string, any>;
    changedAt: Date;
    changedBy?: string;
    changes: Array<{
      key: string;
      oldValue: any;
      newValue: any;
    }>;
  }>> {
    const history = this.configHistory.get(pluginId) || [];
    return history.slice(0, limit);
  }

  /**
   * Backup current configuration
   */
  async backupConfig(pluginId: string, label?: string): Promise<string> {
    const plugin = await this.getPluginEntity(pluginId);
    const backupId = `backup_${Date.now()}_${Math.random().toString(36).substring(2)}`;

    const backup = {
      id: backupId,
      pluginId,
      label: label || `Backup ${new Date().toISOString()}`,
      config: plugin.config || {},
      schema: plugin.configSchema || null,
      createdAt: new Date(),
    };

    // Store backup
    let backups = this.configBackups.get(pluginId) || [];
    backups.unshift(backup);

    // Keep only last 10 backups
    if (backups.length > 10) {
      backups = backups.slice(0, 10);
    }

    this.configBackups.set(pluginId, backups);

    this.logger.log(`Configuration backup created for plugin: ${pluginId} (${backupId})`);

    return backupId;
  }

  /**
   * Restore configuration from backup
   */
  async restoreConfig(pluginId: string, backupId: string): Promise<void> {
    const backups = this.configBackups.get(pluginId) || [];
    const backup = backups.find(b => b.id === backupId);

    if (!backup) {
      throw new Error(`Backup not found: ${backupId}`);
    }

    // Restore configuration
    await this.setConfig(pluginId, backup.config, { merge: false });

    // Emit restore event
    await this.eventEmitter.emitAsync('plugin.config.restored', {
      pluginId,
      backupId,
      restoredConfig: backup.config,
    });

    this.logger.log(`Configuration restored from backup for plugin: ${pluginId} (${backupId})`);
  }

  /**
   * Get all backups for a plugin
   */
  async getBackups(pluginId: string): Promise<Array<{
    id: string;
    label: string;
    createdAt: Date;
  }>> {
    const backups = this.configBackups.get(pluginId) || [];
    return backups.map(backup => ({
      id: backup.id,
      label: backup.label,
      createdAt: backup.createdAt,
    }));
  }

  /**
   * Delete a backup
   */
  async deleteBackup(pluginId: string, backupId: string): Promise<void> {
    const backups = this.configBackups.get(pluginId) || [];
    const updatedBackups = backups.filter(backup => backup.id !== backupId);
    
    this.configBackups.set(pluginId, updatedBackups);

    this.logger.log(`Backup deleted for plugin: ${pluginId} (${backupId})`);
  }

  // Private helper methods

  private async getPluginEntity(pluginId: string): Promise<Plugin> {
    const plugin = await this.pluginRepository.findOne({
      where: { identifier: pluginId },
    });

    if (!plugin) {
      throw new Error(`Plugin not found: ${pluginId}`);
    }

    return plugin;
  }

  private convertToJsonSchema(pluginSchema: IPluginConfigSchema): any {
    const jsonSchema: any = {
      type: 'object',
      properties: {},
      required: [],
    };

    for (const [key, fieldSchema] of Object.entries(pluginSchema)) {
      jsonSchema.properties[key] = {
        type: fieldSchema.type,
        description: fieldSchema.description,
      };

      if (fieldSchema.required) {
        jsonSchema.required.push(key);
      }

      if (fieldSchema.default !== undefined) {
        jsonSchema.properties[key].default = fieldSchema.default;
      }

      if (fieldSchema.validation) {
        const validation = fieldSchema.validation;
        
        if (validation.min !== undefined) {
          jsonSchema.properties[key].minimum = validation.min;
        }
        if (validation.max !== undefined) {
          jsonSchema.properties[key].maximum = validation.max;
        }
        if (validation.pattern) {
          jsonSchema.properties[key].pattern = validation.pattern;
        }
        if (validation.enum) {
          jsonSchema.properties[key].enum = validation.enum;
        }
      }
    }

    return jsonSchema;
  }

  private calculateChanges(
    oldConfig: Record<string, any>,
    newConfig: Record<string, any>,
  ): Array<{ key: string; oldValue: any; newValue: any }> {
    const changes = [];
    const allKeys = new Set([...Object.keys(oldConfig), ...Object.keys(newConfig)]);

    for (const key of allKeys) {
      const oldValue = oldConfig[key];
      const newValue = newConfig[key];

      if (JSON.stringify(oldValue) !== JSON.stringify(newValue)) {
        changes.push({ key, oldValue, newValue });
      }
    }

    return changes;
  }

  private recordConfigChange(
    pluginId: string,
    config: Record<string, any>,
    changes: Array<{ key: string; oldValue: any; newValue: any }>,
    userId?: string,
  ): void {
    const historyEntry = {
      id: `change_${Date.now()}_${Math.random().toString(36).substring(2)}`,
      config: { ...config },
      changedAt: new Date(),
      changedBy: userId,
      changes,
    };

    let history = this.configHistory.get(pluginId) || [];
    history.unshift(historyEntry);

    // Keep only last 50 changes
    if (history.length > 50) {
      history = history.slice(0, 50);
    }

    this.configHistory.set(pluginId, history);
  }
}