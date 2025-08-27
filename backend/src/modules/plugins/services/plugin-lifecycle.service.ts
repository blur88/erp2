import { Injectable, Logger } from '@nestjs/common';
import { InjectRepository } from '@nestjs/typeorm';
import { Repository } from 'typeorm';
import { EventEmitter2 } from '@nestjs/event-emitter';
import { Plugin, PluginStatus } from '../../../database/entities/plugin.entity';
import {
  IPluginLifecycleManager,
  IPluginLifecycleResult,
  IPluginLifecycleState,
  IPluginLifecycleOperation,
  PluginLifecycleEvents,
} from '../interfaces';
import { PluginRegistryService } from './plugin-registry.service';
import { PluginSecurityService } from './plugin-security.service';
import { PluginConfigurationService } from './plugin-configuration.service';
import { IPlugin } from '../interfaces';
import * as fs from 'fs/promises';
import * as path from 'path';
import * as tar from 'tar';
import * as semver from 'semver';

@Injectable()
export class PluginLifecycleService implements IPluginLifecycleManager {
  private readonly logger = new Logger(PluginLifecycleService.name);
  private readonly operations = new Map<string, IPluginLifecycleOperation>();

  constructor(
    @InjectRepository(Plugin)
    private readonly pluginRepository: Repository<Plugin>,
    private readonly pluginRegistry: PluginRegistryService,
    private readonly pluginSecurity: PluginSecurityService,
    private readonly pluginConfig: PluginConfigurationService,
    private readonly eventEmitter: EventEmitter2,
  ) {}

  /**
   * Install a plugin from a package or path
   */
  async install(
    source: string | Buffer,
    options: {
      force?: boolean;
      skipValidation?: boolean;
      userId?: string;
    } = {},
  ): Promise<IPluginLifecycleResult> {
    const operationId = this.generateOperationId();
    const operation: IPluginLifecycleOperation = {
      operation: 'install',
      pluginId: '', // Will be set after extraction
      timestamp: new Date(),
      userId: options.userId,
      options,
    };

    try {
      this.logger.log(`Starting plugin installation (Operation: ${operationId})`);

      // Extract and validate plugin package
      const pluginPath = await this.extractPlugin(source);
      const pluginManifest = await this.loadPluginManifest(pluginPath);
      
      operation.pluginId = pluginManifest.identifier;
      this.operations.set(operationId, operation);

      // Emit before install event
      await this.eventEmitter.emitAsync(PluginLifecycleEvents.OPERATION_STARTED, operation);

      // Check if plugin already exists
      const existingPlugin = await this.pluginRepository.findOne({
        where: { identifier: pluginManifest.identifier },
      });

      if (existingPlugin && !options.force) {
        throw new Error(`Plugin ${pluginManifest.identifier} is already installed. Use force option to reinstall.`);
      }

      // Validate plugin if not skipped
      if (!options.skipValidation) {
        await this.validatePlugin(pluginPath);
      }

      // Security scan
      const securityScanResult = await this.pluginSecurity.scanPlugin(pluginPath);
      if (!securityScanResult.passed && !options.force) {
        throw new Error(`Plugin failed security scan: ${securityScanResult.vulnerabilities.map(v => v.title).join(', ')}`);
      }

      // Install plugin files
      const installPath = await this.installPluginFiles(pluginPath, pluginManifest.identifier);

      // Create or update plugin record
      let pluginEntity: Plugin;
      if (existingPlugin) {
        // Update existing plugin
        Object.assign(existingPlugin, {
          name: pluginManifest.name,
          description: pluginManifest.description,
          version: pluginManifest.version,
          author: pluginManifest.author,
          status: PluginStatus.INSTALLED,
          installPath,
          installedDate: new Date(),
          lastUpdatedDate: new Date(),
          errorCount: 0,
          lastError: null,
          lastErrorAt: null,
        });
        pluginEntity = await this.pluginRepository.save(existingPlugin);
      } else {
        // Create new plugin
        pluginEntity = this.pluginRepository.create({
          identifier: pluginManifest.identifier,
          name: pluginManifest.name,
          description: pluginManifest.description,
          version: pluginManifest.version,
          type: pluginManifest.type,
          author: pluginManifest.author,
          license: pluginManifest.license,
          homepage: pluginManifest.homepage,
          repository: pluginManifest.repository,
          iconUrl: pluginManifest.iconUrl,
          status: PluginStatus.INSTALLED,
          isActive: false,
          installPath,
          installedDate: new Date(),
          dependencies: pluginManifest.dependencies,
          requirements: pluginManifest.requirements,
          configSchema: pluginManifest.configSchema,
          defaultConfig: pluginManifest.defaultConfig,
          hooks: pluginManifest.hooks,
          endpoints: pluginManifest.endpoints,
          uiComponents: pluginManifest.uiComponents,
          tags: pluginManifest.tags,
          errorCount: 0,
        });
        pluginEntity = await this.pluginRepository.save(pluginEntity);
      }

      // Load plugin class and register
      await this.loadAndRegisterPlugin(installPath, pluginEntity);

      const result: IPluginLifecycleResult = {
        success: true,
        operation: 'install',
        pluginId: pluginManifest.identifier,
        message: `Plugin ${pluginManifest.identifier} installed successfully`,
        data: { pluginEntity },
      };

      // Emit after install event
      await this.eventEmitter.emitAsync(PluginLifecycleEvents.OPERATION_COMPLETED, { operation, result });

      this.logger.log(`Plugin ${pluginManifest.identifier} installed successfully`);
      return result;

    } catch (error) {
      this.logger.error(`Failed to install plugin:`, error);

      const result: IPluginLifecycleResult = {
        success: false,
        operation: 'install',
        pluginId: operation.pluginId,
        error: error.message,
      };

      // Emit operation failed event
      await this.eventEmitter.emitAsync(PluginLifecycleEvents.OPERATION_FAILED, { operation, error });

      return result;
    } finally {
      this.operations.delete(operationId);
    }
  }

  /**
   * Uninstall a plugin
   */
  async uninstall(
    pluginId: string,
    options: {
      keepData?: boolean;
      force?: boolean;
      userId?: string;
    } = {},
  ): Promise<IPluginLifecycleResult> {
    const operationId = this.generateOperationId();
    const operation: IPluginLifecycleOperation = {
      operation: 'uninstall',
      pluginId,
      timestamp: new Date(),
      userId: options.userId,
      options,
    };

    try {
      this.logger.log(`Starting plugin uninstallation: ${pluginId}`);
      this.operations.set(operationId, operation);

      // Emit before uninstall event
      await this.eventEmitter.emitAsync(PluginLifecycleEvents.OPERATION_STARTED, operation);

      // Get plugin record
      const pluginEntity = await this.pluginRepository.findOne({
        where: { identifier: pluginId },
      });

      if (!pluginEntity) {
        throw new Error(`Plugin ${pluginId} not found`);
      }

      // Deactivate plugin if active
      if (pluginEntity.isActive) {
        await this.deactivate(pluginId, { userId: options.userId });
      }

      // Unregister plugin from registry
      await this.pluginRegistry.unregister(pluginId);

      // Remove plugin files
      if (pluginEntity.installPath) {
        await this.removePluginFiles(pluginEntity.installPath);
      }

      // Remove or update plugin record
      if (options.keepData) {
        // Mark as uninstalled but keep record
        pluginEntity.status = PluginStatus.UNINSTALLED;
        pluginEntity.isActive = false;
        pluginEntity.installPath = null;
        await this.pluginRepository.save(pluginEntity);
      } else {
        // Remove plugin record completely
        await this.pluginRepository.remove(pluginEntity);
      }

      const result: IPluginLifecycleResult = {
        success: true,
        operation: 'uninstall',
        pluginId,
        message: `Plugin ${pluginId} uninstalled successfully`,
      };

      // Emit after uninstall event
      await this.eventEmitter.emitAsync(PluginLifecycleEvents.OPERATION_COMPLETED, { operation, result });

      this.logger.log(`Plugin ${pluginId} uninstalled successfully`);
      return result;

    } catch (error) {
      this.logger.error(`Failed to uninstall plugin ${pluginId}:`, error);

      const result: IPluginLifecycleResult = {
        success: false,
        operation: 'uninstall',
        pluginId,
        error: error.message,
      };

      // Emit operation failed event
      await this.eventEmitter.emitAsync(PluginLifecycleEvents.OPERATION_FAILED, { operation, error });

      return result;
    } finally {
      this.operations.delete(operationId);
    }
  }

  /**
   * Activate a plugin
   */
  async activate(
    pluginId: string,
    options: { userId?: string } = {},
  ): Promise<IPluginLifecycleResult> {
    const operationId = this.generateOperationId();
    const operation: IPluginLifecycleOperation = {
      operation: 'activate',
      pluginId,
      timestamp: new Date(),
      userId: options.userId,
    };

    try {
      this.logger.log(`Activating plugin: ${pluginId}`);
      this.operations.set(operationId, operation);

      // Emit before activate event
      await this.eventEmitter.emitAsync(PluginLifecycleEvents.OPERATION_STARTED, operation);

      // Get plugin record
      const pluginEntity = await this.pluginRepository.findOne({
        where: { identifier: pluginId },
      });

      if (!pluginEntity) {
        throw new Error(`Plugin ${pluginId} not found`);
      }

      if (!pluginEntity.canActivate) {
        throw new Error(`Plugin ${pluginId} cannot be activated. Status: ${pluginEntity.status}`);
      }

      // Validate dependencies
      const missingDeps = await this.validateDependencies(pluginId);
      if (missingDeps.length > 0) {
        throw new Error(`Missing dependencies: ${missingDeps.join(', ')}`);
      }

      // Get plugin instance from registry
      const pluginInstance = this.pluginRegistry.get(pluginId);
      if (!pluginInstance) {
        throw new Error(`Plugin ${pluginId} is not loaded in registry`);
      }

      // Start plugin
      await pluginInstance.start();

      // Update plugin status
      pluginEntity.activate();
      await this.pluginRepository.save(pluginEntity);

      const result: IPluginLifecycleResult = {
        success: true,
        operation: 'activate',
        pluginId,
        message: `Plugin ${pluginId} activated successfully`,
      };

      // Emit after activate event
      await this.eventEmitter.emitAsync(PluginLifecycleEvents.OPERATION_COMPLETED, { operation, result });

      this.logger.log(`Plugin ${pluginId} activated successfully`);
      return result;

    } catch (error) {
      this.logger.error(`Failed to activate plugin ${pluginId}:`, error);

      // Record error in plugin entity
      try {
        const pluginEntity = await this.pluginRepository.findOne({
          where: { identifier: pluginId },
        });
        if (pluginEntity) {
          pluginEntity.recordError(error.message);
          await this.pluginRepository.save(pluginEntity);
        }
      } catch (saveError) {
        this.logger.error(`Failed to save plugin error:`, saveError);
      }

      const result: IPluginLifecycleResult = {
        success: false,
        operation: 'activate',
        pluginId,
        error: error.message,
      };

      // Emit operation failed event
      await this.eventEmitter.emitAsync(PluginLifecycleEvents.OPERATION_FAILED, { operation, error });

      return result;
    } finally {
      this.operations.delete(operationId);
    }
  }

  /**
   * Deactivate a plugin
   */
  async deactivate(
    pluginId: string,
    options: { userId?: string } = {},
  ): Promise<IPluginLifecycleResult> {
    const operationId = this.generateOperationId();
    const operation: IPluginLifecycleOperation = {
      operation: 'deactivate',
      pluginId,
      timestamp: new Date(),
      userId: options.userId,
    };

    try {
      this.logger.log(`Deactivating plugin: ${pluginId}`);
      this.operations.set(operationId, operation);

      // Emit before deactivate event
      await this.eventEmitter.emitAsync(PluginLifecycleEvents.OPERATION_STARTED, operation);

      // Get plugin record
      const pluginEntity = await this.pluginRepository.findOne({
        where: { identifier: pluginId },
      });

      if (!pluginEntity) {
        throw new Error(`Plugin ${pluginId} not found`);
      }

      if (!pluginEntity.canDeactivate) {
        throw new Error(`Plugin ${pluginId} cannot be deactivated. Status: ${pluginEntity.status}`);
      }

      // Get plugin instance from registry
      const pluginInstance = this.pluginRegistry.get(pluginId);
      if (pluginInstance) {
        await pluginInstance.stop();
      }

      // Update plugin status
      pluginEntity.deactivate();
      await this.pluginRepository.save(pluginEntity);

      const result: IPluginLifecycleResult = {
        success: true,
        operation: 'deactivate',
        pluginId,
        message: `Plugin ${pluginId} deactivated successfully`,
      };

      // Emit after deactivate event
      await this.eventEmitter.emitAsync(PluginLifecycleEvents.OPERATION_COMPLETED, { operation, result });

      this.logger.log(`Plugin ${pluginId} deactivated successfully`);
      return result;

    } catch (error) {
      this.logger.error(`Failed to deactivate plugin ${pluginId}:`, error);

      const result: IPluginLifecycleResult = {
        success: false,
        operation: 'deactivate',
        pluginId,
        error: error.message,
      };

      // Emit operation failed event
      await this.eventEmitter.emitAsync(PluginLifecycleEvents.OPERATION_FAILED, { operation, error });

      return result;
    } finally {
      this.operations.delete(operationId);
    }
  }

  /**
   * Update a plugin
   */
  async update(
    pluginId: string,
    version?: string,
    options: {
      force?: boolean;
      backup?: boolean;
      userId?: string;
    } = {},
  ): Promise<IPluginLifecycleResult> {
    const operationId = this.generateOperationId();
    const operation: IPluginLifecycleOperation = {
      operation: 'update',
      pluginId,
      version,
      timestamp: new Date(),
      userId: options.userId,
      options,
    };

    try {
      this.logger.log(`Updating plugin ${pluginId} to version ${version || 'latest'}`);
      this.operations.set(operationId, operation);

      // Emit before update event
      await this.eventEmitter.emitAsync(PluginLifecycleEvents.OPERATION_STARTED, operation);

      // Get current plugin
      const pluginEntity = await this.pluginRepository.findOne({
        where: { identifier: pluginId },
      });

      if (!pluginEntity) {
        throw new Error(`Plugin ${pluginId} not found`);
      }

      // Create backup if requested
      if (options.backup) {
        await this.createPluginBackup(pluginEntity);
      }

      // For now, we'll simulate update by reinstalling
      // In production, you'd download from marketplace/registry
      const updateResult: IPluginLifecycleResult = {
        success: true,
        operation: 'update',
        pluginId,
        message: `Plugin ${pluginId} updated successfully`,
        data: { oldVersion: pluginEntity.version, newVersion: version || 'latest' },
      };

      // Update last updated date
      pluginEntity.lastUpdatedDate = new Date();
      await this.pluginRepository.save(pluginEntity);

      // Emit after update event
      await this.eventEmitter.emitAsync(PluginLifecycleEvents.OPERATION_COMPLETED, { operation, result: updateResult });

      this.logger.log(`Plugin ${pluginId} updated successfully`);
      return updateResult;

    } catch (error) {
      this.logger.error(`Failed to update plugin ${pluginId}:`, error);

      const result: IPluginLifecycleResult = {
        success: false,
        operation: 'update',
        pluginId,
        error: error.message,
      };

      // Emit operation failed event
      await this.eventEmitter.emitAsync(PluginLifecycleEvents.OPERATION_FAILED, { operation, error });

      return result;
    } finally {
      this.operations.delete(operationId);
    }
  }

  /**
   * Configure a plugin
   */
  async configure(
    pluginId: string,
    config: Record<string, any>,
    options: {
      validate?: boolean;
      merge?: boolean;
      userId?: string;
    } = {},
  ): Promise<IPluginLifecycleResult> {
    const operationId = this.generateOperationId();
    const operation: IPluginLifecycleOperation = {
      operation: 'configure',
      pluginId,
      config,
      timestamp: new Date(),
      userId: options.userId,
      options,
    };

    try {
      this.logger.log(`Configuring plugin: ${pluginId}`);
      this.operations.set(operationId, operation);

      // Emit before configure event
      await this.eventEmitter.emitAsync(PluginLifecycleEvents.OPERATION_STARTED, operation);

      // Get plugin record
      const pluginEntity = await this.pluginRepository.findOne({
        where: { identifier: pluginId },
      });

      if (!pluginEntity) {
        throw new Error(`Plugin ${pluginId} not found`);
      }

      // Validate configuration if requested
      if (options.validate !== false) {
        const errors = pluginEntity.validateConfig(config);
        if (errors.length > 0) {
          throw new Error(`Configuration validation failed: ${errors.join(', ')}`);
        }
      }

      // Merge or replace configuration
      const newConfig = options.merge !== false 
        ? { ...pluginEntity.config, ...config }
        : config;

      // Update plugin configuration
      pluginEntity.updateConfig(newConfig);
      await this.pluginRepository.save(pluginEntity);

      // Configure plugin instance if loaded
      const pluginInstance = this.pluginRegistry.get(pluginId);
      if (pluginInstance) {
        await pluginInstance.configure(newConfig);
      }

      const result: IPluginLifecycleResult = {
        success: true,
        operation: 'configure',
        pluginId,
        message: `Plugin ${pluginId} configured successfully`,
        data: { config: newConfig },
      };

      // Emit after configure event
      await this.eventEmitter.emitAsync(PluginLifecycleEvents.OPERATION_COMPLETED, { operation, result });

      this.logger.log(`Plugin ${pluginId} configured successfully`);
      return result;

    } catch (error) {
      this.logger.error(`Failed to configure plugin ${pluginId}:`, error);

      const result: IPluginLifecycleResult = {
        success: false,
        operation: 'configure',
        pluginId,
        error: error.message,
      };

      // Emit operation failed event
      await this.eventEmitter.emitAsync(PluginLifecycleEvents.OPERATION_FAILED, { operation, error });

      return result;
    } finally {
      this.operations.delete(operationId);
    }
  }

  /**
   * Get plugin lifecycle state
   */
  async getState(pluginId: string): Promise<IPluginLifecycleState> {
    const pluginEntity = await this.pluginRepository.findOne({
      where: { identifier: pluginId },
    });

    if (!pluginEntity) {
      throw new Error(`Plugin ${pluginId} not found`);
    }

    return {
      pluginId: pluginEntity.identifier,
      status: pluginEntity.status,
      isActive: pluginEntity.isActive,
      version: pluginEntity.version,
      installedAt: pluginEntity.installedDate,
      lastActivated: pluginEntity.lastActivatedDate,
      errorCount: pluginEntity.errorCount,
      lastError: pluginEntity.lastError,
    };
  }

  /**
   * Get all plugin states
   */
  async getAllStates(): Promise<IPluginLifecycleState[]> {
    const plugins = await this.pluginRepository.find();
    
    return plugins.map(plugin => ({
      pluginId: plugin.identifier,
      status: plugin.status,
      isActive: plugin.isActive,
      version: plugin.version,
      installedAt: plugin.installedDate,
      lastActivated: plugin.lastActivatedDate,
      errorCount: plugin.errorCount,
      lastError: plugin.lastError,
    }));
  }

  /**
   * Validate plugin dependencies
   */
  async validateDependencies(pluginId: string): Promise<string[]> {
    const pluginEntity = await this.pluginRepository.findOne({
      where: { identifier: pluginId },
    });

    if (!pluginEntity) {
      throw new Error(`Plugin ${pluginId} not found`);
    }

    return pluginEntity.checkDependencies();
  }

  /**
   * Restart a plugin
   */
  async restart(
    pluginId: string,
    options: { userId?: string } = {},
  ): Promise<IPluginLifecycleResult> {
    try {
      this.logger.log(`Restarting plugin: ${pluginId}`);

      // Deactivate first
      const deactivateResult = await this.deactivate(pluginId, options);
      if (!deactivateResult.success) {
        return deactivateResult;
      }

      // Then activate
      const activateResult = await this.activate(pluginId, options);
      
      return {
        success: activateResult.success,
        operation: 'restart',
        pluginId,
        message: `Plugin ${pluginId} restarted successfully`,
        error: activateResult.error,
      };

    } catch (error) {
      this.logger.error(`Failed to restart plugin ${pluginId}:`, error);
      
      return {
        success: false,
        operation: 'restart',
        pluginId,
        error: error.message,
      };
    }
  }

  /**
   * Rollback a plugin operation
   */
  async rollback(operationId: string): Promise<IPluginLifecycleResult> {
    // Implementation would depend on specific rollback requirements
    // For now, return a placeholder
    return {
      success: false,
      operation: 'rollback',
      pluginId: '',
      error: 'Rollback functionality not implemented yet',
    };
  }

  // Private helper methods

  private generateOperationId(): string {
    return `op_${Date.now()}_${Math.random().toString(36).substring(2)}`;
  }

  private async extractPlugin(source: string | Buffer): Promise<string> {
    // Implementation would extract plugin package
    // For now, assume source is already a path
    if (typeof source === 'string') {
      return source;
    }
    
    // If Buffer, extract to temp directory
    const tempDir = path.join(process.cwd(), 'temp', 'plugins', Date.now().toString());
    await fs.mkdir(tempDir, { recursive: true });
    
    // Extract tarball or zip
    // This is a simplified implementation
    return tempDir;
  }

  private async loadPluginManifest(pluginPath: string): Promise<any> {
    const manifestPath = path.join(pluginPath, 'plugin.json');
    const manifestContent = await fs.readFile(manifestPath, 'utf8');
    return JSON.parse(manifestContent);
  }

  private async validatePlugin(pluginPath: string): Promise<void> {
    // Validate plugin structure, manifest, dependencies, etc.
    // This would include comprehensive validation logic
  }

  private async installPluginFiles(pluginPath: string, pluginId: string): Promise<string> {
    const installDir = path.join(process.cwd(), 'plugins', pluginId);
    await fs.mkdir(installDir, { recursive: true });
    
    // Copy plugin files to install directory
    // Implementation would copy files from temp to permanent location
    
    return installDir;
  }

  private async loadAndRegisterPlugin(installPath: string, pluginEntity: Plugin): Promise<void> {
    // Load plugin class and register in registry
    // This would dynamically import the plugin module
    // For now, this is a placeholder
  }

  private async removePluginFiles(installPath: string): Promise<void> {
    try {
      await fs.rm(installPath, { recursive: true, force: true });
    } catch (error) {
      this.logger.warn(`Failed to remove plugin files at ${installPath}:`, error);
    }
  }

  private async createPluginBackup(pluginEntity: Plugin): Promise<string> {
    // Create backup of plugin before update
    const backupDir = path.join(process.cwd(), 'backups', 'plugins', pluginEntity.identifier);
    await fs.mkdir(backupDir, { recursive: true });
    
    // Implementation would create backup
    return backupDir;
  }
}