import { Injectable, Logger } from '@nestjs/common';
import { InjectRepository } from '@nestjs/typeorm';
import { Repository } from 'typeorm';
import { EventEmitter2 } from '@nestjs/event-emitter';
import { Plugin, PluginStatus, PluginType } from '../../../database/entities/plugin.entity';
import { IPlugin, IPluginRegistry, IPluginContext } from '../interfaces';
import * as fs from 'fs/promises';
import * as path from 'path';

@Injectable()
export class PluginRegistryService implements IPluginRegistry {
  private readonly logger = new Logger(PluginRegistryService.name);
  private readonly plugins = new Map<string, IPlugin>();
  private readonly pluginContexts = new Map<string, IPluginContext>();

  constructor(
    @InjectRepository(Plugin)
    private readonly pluginRepository: Repository<Plugin>,
    private readonly eventEmitter: EventEmitter2,
  ) {
    this.initializeRegistry();
  }

  /**
   * Register a plugin in the runtime registry
   */
  async register(plugin: IPlugin): Promise<void> {
    const pluginId = plugin.metadata.identifier;
    
    if (this.plugins.has(pluginId)) {
      this.logger.warn(`Plugin ${pluginId} is already registered. Overriding existing registration.`);
    }

    try {
      // Create plugin context
      const context = await this.createPluginContext(plugin);
      this.pluginContexts.set(pluginId, context);

      // Initialize plugin
      await plugin.initialize(context);

      // Register plugin
      this.plugins.set(pluginId, plugin);

      this.logger.log(`Plugin ${pluginId} registered successfully`);

      // Emit registration event
      await this.eventEmitter.emitAsync('plugin.registered', {
        pluginId,
        metadata: plugin.metadata,
      });

    } catch (error) {
      this.logger.error(`Failed to register plugin ${pluginId}:`, error);
      throw error;
    }
  }

  /**
   * Unregister a plugin from the runtime registry
   */
  async unregister(pluginId: string): Promise<void> {
    const plugin = this.plugins.get(pluginId);
    
    if (!plugin) {
      this.logger.warn(`Plugin ${pluginId} is not registered`);
      return;
    }

    try {
      // Destroy plugin
      await plugin.destroy();

      // Remove from registry
      this.plugins.delete(pluginId);
      this.pluginContexts.delete(pluginId);

      this.logger.log(`Plugin ${pluginId} unregistered successfully`);

      // Emit unregistration event
      await this.eventEmitter.emitAsync('plugin.unregistered', {
        pluginId,
      });

    } catch (error) {
      this.logger.error(`Failed to unregister plugin ${pluginId}:`, error);
      throw error;
    }
  }

  /**
   * Get a specific plugin from the registry
   */
  get(pluginId: string): IPlugin | undefined {
    return this.plugins.get(pluginId);
  }

  /**
   * Get all registered plugins
   */
  getAll(): IPlugin[] {
    return Array.from(this.plugins.values());
  }

  /**
   * Get plugins by type
   */
  getByType(type: PluginType): IPlugin[] {
    return this.getAll().filter(plugin => plugin.metadata.type === type);
  }

  /**
   * Get plugins by status
   */
  getByStatus(status: PluginStatus): IPlugin[] {
    // This requires checking the database status
    // For now, we'll return all registered plugins as they're considered active
    if (status === PluginStatus.ACTIVE) {
      return this.getAll();
    }
    return [];
  }

  /**
   * Check if a plugin is registered
   */
  has(pluginId: string): boolean {
    return this.plugins.has(pluginId);
  }

  /**
   * Clear all plugins from registry
   */
  clear(): void {
    this.plugins.clear();
    this.pluginContexts.clear();
  }

  /**
   * Discover and load plugins from the plugins directory
   */
  async discoverPlugins(): Promise<void> {
    try {
      this.logger.log('Starting plugin discovery...');
      
      const pluginsDir = path.join(process.cwd(), 'plugins');
      
      // Check if plugins directory exists
      try {
        await fs.access(pluginsDir);
      } catch {
        this.logger.warn('Plugins directory does not exist. Creating it...');
        await fs.mkdir(pluginsDir, { recursive: true });
        return;
      }

      // Read all plugin directories
      const entries = await fs.readdir(pluginsDir, { withFileTypes: true });
      const pluginDirs = entries
        .filter(entry => entry.isDirectory())
        .map(entry => entry.name);

      this.logger.log(`Found ${pluginDirs.length} potential plugin directories`);

      // Load each plugin
      for (const pluginDir of pluginDirs) {
        try {
          await this.loadPluginFromDirectory(path.join(pluginsDir, pluginDir));
        } catch (error) {
          this.logger.error(`Failed to load plugin from directory ${pluginDir}:`, error);
        }
      }

      this.logger.log(`Plugin discovery completed. ${this.plugins.size} plugins loaded.`);

    } catch (error) {
      this.logger.error('Plugin discovery failed:', error);
    }
  }

  /**
   * Load a specific plugin from directory
   */
  async loadPluginFromDirectory(pluginPath: string): Promise<void> {
    try {
      // Check for plugin manifest
      const manifestPath = path.join(pluginPath, 'plugin.json');
      
      try {
        await fs.access(manifestPath);
      } catch {
        this.logger.warn(`No plugin.json found in ${pluginPath}`);
        return;
      }

      // Load manifest
      const manifestContent = await fs.readFile(manifestPath, 'utf8');
      const manifest = JSON.parse(manifestContent);

      // Check if plugin exists in database
      const pluginEntity = await this.pluginRepository.findOne({
        where: { identifier: manifest.identifier },
      });

      if (!pluginEntity) {
        this.logger.warn(`Plugin ${manifest.identifier} not found in database. Skipping load.`);
        return;
      }

      if (!pluginEntity.isActive) {
        this.logger.debug(`Plugin ${manifest.identifier} is not active. Skipping load.`);
        return;
      }

      // Load plugin class
      const pluginInstance = await this.loadPluginClass(pluginPath, manifest);
      
      if (pluginInstance) {
        await this.register(pluginInstance);
        this.logger.log(`Loaded plugin: ${manifest.identifier} v${manifest.version}`);
      }

    } catch (error) {
      this.logger.error(`Failed to load plugin from ${pluginPath}:`, error);
      throw error;
    }
  }

  /**
   * Reload a specific plugin
   */
  async reloadPlugin(pluginId: string): Promise<void> {
    try {
      this.logger.log(`Reloading plugin: ${pluginId}`);

      // Get plugin entity from database
      const pluginEntity = await this.pluginRepository.findOne({
        where: { identifier: pluginId },
      });

      if (!pluginEntity || !pluginEntity.installPath) {
        throw new Error(`Plugin ${pluginId} not found or not installed`);
      }

      // Unregister if already loaded
      if (this.has(pluginId)) {
        await this.unregister(pluginId);
      }

      // Reload from directory
      await this.loadPluginFromDirectory(pluginEntity.installPath);

      this.logger.log(`Plugin ${pluginId} reloaded successfully`);

    } catch (error) {
      this.logger.error(`Failed to reload plugin ${pluginId}:`, error);
      throw error;
    }
  }

  /**
   * Get plugin context for a specific plugin
   */
  getPluginContext(pluginId: string): IPluginContext | undefined {
    return this.pluginContexts.get(pluginId);
  }

  /**
   * Get registry statistics
   */
  getStats(): {
    totalPlugins: number;
    pluginsByType: Record<string, number>;
    memoryUsage: NodeJS.MemoryUsage;
  } {
    const plugins = this.getAll();
    const pluginsByType: Record<string, number> = {};

    for (const plugin of plugins) {
      const type = plugin.metadata.type;
      pluginsByType[type] = (pluginsByType[type] || 0) + 1;
    }

    return {
      totalPlugins: plugins.length,
      pluginsByType,
      memoryUsage: process.memoryUsage(),
    };
  }

  /**
   * Validate plugin health across all registered plugins
   */
  async checkAllPluginsHealth(): Promise<Array<{
    pluginId: string;
    health: any;
    error?: string;
  }>> {
    const results = [];

    for (const [pluginId, plugin] of this.plugins) {
      try {
        const health = await plugin.getHealth();
        results.push({ pluginId, health });
      } catch (error) {
        results.push({ 
          pluginId, 
          health: { status: 'unhealthy', message: 'Health check failed' },
          error: error.message 
        });
      }
    }

    return results;
  }

  /**
   * Execute a method on all plugins that support it
   */
  async executeOnAll(method: string, params?: any): Promise<Array<{
    pluginId: string;
    result: any;
    error?: string;
  }>> {
    const results = [];

    for (const [pluginId, plugin] of this.plugins) {
      try {
        const result = await plugin.execute(method, params);
        results.push({ pluginId, result });
      } catch (error) {
        results.push({ 
          pluginId, 
          result: null,
          error: error.message 
        });
      }
    }

    return results;
  }

  // Private methods

  private async initializeRegistry(): Promise<void> {
    this.logger.log('Initializing plugin registry...');
    
    // Discovery will be called separately after full app initialization
    // to avoid circular dependencies
  }

  private async createPluginContext(plugin: IPlugin): Promise<IPluginContext> {
    // Get plugin configuration from database
    const pluginEntity = await this.pluginRepository.findOne({
      where: { identifier: plugin.metadata.identifier },
    });

    const config = pluginEntity?.config || plugin.defaultConfig || {};

    return {
      pluginId: plugin.metadata.identifier,
      config,
      logger: new Logger(`Plugin:${plugin.metadata.identifier}`),
      database: null, // Will be injected by the plugin system
      httpService: null, // Will be injected by the plugin system
      eventEmitter: this.eventEmitter,
      cacheManager: null, // Will be injected by the plugin system
      configService: null, // Will be injected by the plugin system
      authService: null, // Will be injected by the plugin system
      permissionService: null, // Will be injected by the plugin system
    };
  }

  private async loadPluginClass(pluginPath: string, manifest: any): Promise<IPlugin | null> {
    try {
      // Look for plugin entry point
      const entryPoint = manifest.main || 'index.js';
      const pluginFile = path.join(pluginPath, entryPoint);

      // Check if entry point exists
      try {
        await fs.access(pluginFile);
      } catch {
        this.logger.error(`Plugin entry point not found: ${pluginFile}`);
        return null;
      }

      // Dynamic import of the plugin
      // Note: In production, you'd want better error handling and security
      const pluginModule = await import(pluginFile);
      
      // Look for default export or named export
      const PluginClass = pluginModule.default || pluginModule[manifest.className] || pluginModule.Plugin;
      
      if (!PluginClass) {
        this.logger.error(`Plugin class not found in ${pluginFile}`);
        return null;
      }

      // Create plugin instance
      return new PluginClass();

    } catch (error) {
      this.logger.error(`Failed to load plugin class from ${pluginPath}:`, error);
      return null;
    }
  }
}

/**
 * Plugin discovery service for finding and cataloging plugins
 */
@Injectable()
export class PluginDiscoveryService {
  private readonly logger = new Logger(PluginDiscoveryService.name);

  constructor(
    @InjectRepository(Plugin)
    private readonly pluginRepository: Repository<Plugin>,
    private readonly pluginRegistry: PluginRegistryService,
  ) {}

  /**
   * Discover plugins from various sources
   */
  async discoverFromSources(sources: {
    directories?: string[];
    repositories?: string[];
    marketplace?: boolean;
  }): Promise<void> {
    this.logger.log('Starting comprehensive plugin discovery...');

    // Discover from directories
    if (sources.directories) {
      for (const directory of sources.directories) {
        await this.discoverFromDirectory(directory);
      }
    }

    // Discover from repositories
    if (sources.repositories) {
      for (const repository of sources.repositories) {
        await this.discoverFromRepository(repository);
      }
    }

    // Discover from marketplace
    if (sources.marketplace) {
      await this.discoverFromMarketplace();
    }

    this.logger.log('Plugin discovery completed');
  }

  /**
   * Discover plugins from a directory
   */
  private async discoverFromDirectory(directory: string): Promise<void> {
    try {
      this.logger.log(`Discovering plugins from directory: ${directory}`);
      
      const entries = await fs.readdir(directory, { withFileTypes: true });
      
      for (const entry of entries) {
        if (entry.isDirectory()) {
          const pluginPath = path.join(directory, entry.name);
          await this.analyzePlugin(pluginPath);
        }
      }

    } catch (error) {
      this.logger.error(`Failed to discover plugins from directory ${directory}:`, error);
    }
  }

  /**
   * Discover plugins from a git repository
   */
  private async discoverFromRepository(repository: string): Promise<void> {
    this.logger.log(`Discovering plugins from repository: ${repository}`);
    // Implementation would clone/fetch from git repository
    // For now, this is a placeholder
  }

  /**
   * Discover plugins from marketplace
   */
  private async discoverFromMarketplace(): Promise<void> {
    this.logger.log('Discovering plugins from marketplace...');
    // Implementation would fetch from plugin marketplace/registry
    // For now, this is a placeholder
  }

  /**
   * Analyze a plugin directory and extract metadata
   */
  private async analyzePlugin(pluginPath: string): Promise<void> {
    try {
      const manifestPath = path.join(pluginPath, 'plugin.json');
      
      // Check if manifest exists
      try {
        await fs.access(manifestPath);
      } catch {
        return; // Not a plugin directory
      }

      // Load and validate manifest
      const manifestContent = await fs.readFile(manifestPath, 'utf8');
      const manifest = JSON.parse(manifestContent);

      // Validate required fields
      if (!manifest.identifier || !manifest.name || !manifest.version) {
        this.logger.warn(`Invalid plugin manifest in ${pluginPath}`);
        return;
      }

      this.logger.debug(`Found plugin: ${manifest.identifier} v${manifest.version}`);

      // Check if plugin already exists in database
      const existingPlugin = await this.pluginRepository.findOne({
        where: { identifier: manifest.identifier },
      });

      if (existingPlugin) {
        this.logger.debug(`Plugin ${manifest.identifier} already exists in database`);
        return;
      }

      // This is discovery only - we don't automatically install
      // Just log the discovered plugin
      this.logger.info(`Discovered new plugin: ${manifest.identifier} at ${pluginPath}`);

    } catch (error) {
      this.logger.error(`Failed to analyze plugin at ${pluginPath}:`, error);
    }
  }
}