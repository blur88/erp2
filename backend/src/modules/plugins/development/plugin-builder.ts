import { Type, Logger } from '@nestjs/common';
import { BasePlugin } from '../core/base-plugin';
import { IPlugin, IPluginMetadata, IPluginConfigSchema } from '../interfaces';
import {
  getAllPluginMetadata,
  getPluginMetadata,
  getPluginConfigSchema,
  getPluginDefaultConfig,
  getPluginHooks,
  getPluginEndpoints,
  getPluginUIComponents,
  getPluginMigrations,
  getPluginDependencies,
} from '../decorators/plugin.decorator';
import * as fs from 'fs/promises';
import * as path from 'path';

/**
 * Plugin Builder
 * 
 * Utilities for building and validating plugins during development.
 * Provides tools for:
 * - Plugin class validation
 * - Metadata extraction and validation
 * - Plugin packaging
 * - Development-time testing
 * - Plugin manifest generation
 */
export class PluginBuilder {
  private readonly logger = new Logger(PluginBuilder.name);

  /**
   * Build plugin from class
   */
  static buildFromClass(PluginClass: Type<any>): IPlugin {
    const logger = new Logger('PluginBuilder');

    try {
      // Validate that class extends BasePlugin
      const instance = new PluginClass();
      if (!(instance instanceof BasePlugin)) {
        throw new Error('Plugin class must extend BasePlugin');
      }

      // Extract metadata
      const allMetadata = getAllPluginMetadata(PluginClass);
      
      if (!allMetadata.metadata) {
        throw new Error('Plugin class must have @Plugin decorator with metadata');
      }

      // Enhance instance with decorator metadata
      instance.metadata = allMetadata.metadata;
      
      if (allMetadata.configSchema) {
        (instance as any).configSchema = allMetadata.configSchema;
      }
      
      if (allMetadata.defaultConfig) {
        (instance as any).defaultConfig = allMetadata.defaultConfig;
      }
      
      if (allMetadata.hooks && allMetadata.hooks.length > 0) {
        (instance as any).hooks = allMetadata.hooks;
      }
      
      if (allMetadata.endpoints && allMetadata.endpoints.length > 0) {
        (instance as any).endpoints = allMetadata.endpoints;
      }
      
      if (allMetadata.uiComponents && allMetadata.uiComponents.length > 0) {
        (instance as any).uiComponents = allMetadata.uiComponents;
      }
      
      if (allMetadata.migrations && allMetadata.migrations.length > 0) {
        (instance as any).migrations = allMetadata.migrations;
      }

      // Add dependencies to metadata
      if (allMetadata.dependencies && allMetadata.dependencies.length > 0) {
        instance.metadata.dependencies = allMetadata.dependencies;
      }

      logger.log(`Built plugin: ${instance.metadata.identifier} v${instance.metadata.version}`);
      
      return instance;

    } catch (error) {
      logger.error(`Failed to build plugin from class:`, error);
      throw error;
    }
  }

  /**
   * Validate plugin class
   */
  static validatePluginClass(PluginClass: Type<any>): {
    valid: boolean;
    errors: string[];
    warnings: string[];
    metadata?: IPluginMetadata;
  } {
    const result = {
      valid: true,
      errors: [],
      warnings: [],
      metadata: undefined as IPluginMetadata | undefined,
    };

    try {
      // Check if class exists and is a constructor
      if (!PluginClass || typeof PluginClass !== 'function') {
        result.errors.push('Plugin class must be a valid constructor function');
        result.valid = false;
        return result;
      }

      // Check if extends BasePlugin
      let instance: any;
      try {
        instance = new PluginClass();
      } catch (error) {
        result.errors.push(`Failed to instantiate plugin class: ${error.message}`);
        result.valid = false;
        return result;
      }

      if (!(instance instanceof BasePlugin)) {
        result.errors.push('Plugin class must extend BasePlugin');
        result.valid = false;
      }

      // Validate metadata
      const metadata = getPluginMetadata(PluginClass);
      if (!metadata) {
        result.errors.push('Plugin class must have @Plugin decorator with metadata');
        result.valid = false;
        return result;
      }

      result.metadata = metadata;

      // Validate required metadata fields
      if (!metadata.identifier) {
        result.errors.push('Plugin metadata must include identifier');
      }
      
      if (!metadata.name) {
        result.errors.push('Plugin metadata must include name');
      }
      
      if (!metadata.version) {
        result.errors.push('Plugin metadata must include version');
      } else if (!this.isValidVersion(metadata.version)) {
        result.errors.push('Plugin version must follow semantic versioning (e.g., 1.0.0)');
      }
      
      if (!metadata.type) {
        result.errors.push('Plugin metadata must include type');
      }
      
      if (!metadata.author) {
        result.warnings.push('Plugin metadata should include author');
      }
      
      if (!metadata.description) {
        result.warnings.push('Plugin metadata should include description');
      }

      // Validate identifier format
      if (metadata.identifier && !this.isValidIdentifier(metadata.identifier)) {
        result.errors.push('Plugin identifier must be in format "namespace/name" or "name"');
      }

      // Validate configuration schema
      const configSchema = getPluginConfigSchema(PluginClass);
      if (configSchema) {
        const schemaValidation = this.validateConfigSchema(configSchema);
        result.errors.push(...schemaValidation.errors);
        result.warnings.push(...schemaValidation.warnings);
      }

      // Validate hooks
      const hooks = getPluginHooks(PluginClass);
      for (const hook of hooks) {
        if (!hook.event) {
          result.errors.push('Plugin hook must specify event name');
        }
        if (!hook.handler) {
          result.errors.push('Plugin hook must specify handler method');
        }
        if (hook.handler && !instance[hook.handler]) {
          result.errors.push(`Plugin hook handler method '${hook.handler}' does not exist`);
        }
      }

      // Validate endpoints
      const endpoints = getPluginEndpoints(PluginClass);
      for (const endpoint of endpoints) {
        if (!endpoint.path) {
          result.errors.push('Plugin endpoint must specify path');
        }
        if (!endpoint.method) {
          result.errors.push('Plugin endpoint must specify HTTP method');
        }
        if (!endpoint.handler) {
          result.errors.push('Plugin endpoint must specify handler method');
        }
        if (endpoint.handler && !instance[endpoint.handler]) {
          result.errors.push(`Plugin endpoint handler method '${endpoint.handler}' does not exist`);
        }
      }

      // Validate migrations
      const migrations = getPluginMigrations(PluginClass);
      for (const migration of migrations) {
        if (!migration.version) {
          result.errors.push('Plugin migration must specify version');
        }
        if (!migration.up) {
          result.errors.push('Plugin migration must specify up method');
        }
      }

      // Validate dependencies
      const dependencies = getPluginDependencies(PluginClass);
      for (const dependency of dependencies) {
        if (!dependency.name) {
          result.errors.push('Plugin dependency must specify name');
        }
        if (!dependency.version) {
          result.errors.push('Plugin dependency must specify version');
        }
      }

      result.valid = result.errors.length === 0;

    } catch (error) {
      result.errors.push(`Plugin validation failed: ${error.message}`);
      result.valid = false;
    }

    return result;
  }

  /**
   * Generate plugin manifest file
   */
  static async generateManifest(
    PluginClass: Type<any>,
    outputPath: string,
    options: {
      includeDevInfo?: boolean;
      includeSchema?: boolean;
      validate?: boolean;
    } = {}
  ): Promise<void> {
    const logger = new Logger('PluginBuilder');

    try {
      // Validate plugin first if requested
      if (options.validate !== false) {
        const validation = this.validatePluginClass(PluginClass);
        if (!validation.valid) {
          throw new Error(`Plugin validation failed: ${validation.errors.join(', ')}`);
        }
      }

      // Extract all metadata
      const allMetadata = getAllPluginMetadata(PluginClass);
      
      if (!allMetadata.metadata) {
        throw new Error('Plugin metadata not found');
      }

      // Build manifest
      const manifest: any = {
        identifier: allMetadata.metadata.identifier,
        name: allMetadata.metadata.name,
        version: allMetadata.metadata.version,
        description: allMetadata.metadata.description,
        author: allMetadata.metadata.author,
        license: allMetadata.metadata.license,
        homepage: allMetadata.metadata.homepage,
        repository: allMetadata.metadata.repository,
        iconUrl: allMetadata.metadata.iconUrl,
        type: allMetadata.metadata.type,
        tags: allMetadata.metadata.tags,
        dependencies: allMetadata.dependencies,
        requirements: allMetadata.metadata.requirements,
        main: 'index.js', // Default entry point
        className: PluginClass.name,
      };

      // Include configuration schema if requested
      if (options.includeSchema && allMetadata.configSchema) {
        manifest.configSchema = allMetadata.configSchema;
      }

      // Include default configuration
      if (allMetadata.defaultConfig) {
        manifest.defaultConfig = allMetadata.defaultConfig;
      }

      // Include hooks
      if (allMetadata.hooks && allMetadata.hooks.length > 0) {
        manifest.hooks = allMetadata.hooks;
      }

      // Include endpoints
      if (allMetadata.endpoints && allMetadata.endpoints.length > 0) {
        manifest.endpoints = allMetadata.endpoints;
      }

      // Include UI components
      if (allMetadata.uiComponents && allMetadata.uiComponents.length > 0) {
        manifest.uiComponents = allMetadata.uiComponents;
      }

      // Include migrations
      if (allMetadata.migrations && allMetadata.migrations.length > 0) {
        manifest.migrations = allMetadata.migrations.map(m => ({
          version: m.version,
          description: m.description,
        }));
      }

      // Include development info if requested
      if (options.includeDevInfo) {
        manifest.dev = {
          generatedAt: new Date().toISOString(),
          generatedBy: 'PluginBuilder',
          nodeVersion: process.version,
        };
      }

      // Write manifest file
      await fs.writeFile(outputPath, JSON.stringify(manifest, null, 2), 'utf8');
      
      logger.log(`Generated plugin manifest: ${outputPath}`);

    } catch (error) {
      logger.error(`Failed to generate plugin manifest:`, error);
      throw error;
    }
  }

  /**
   * Create plugin package structure
   */
  static async createPackageStructure(
    pluginDir: string,
    options: {
      includeExamples?: boolean;
      includeTests?: boolean;
      includeDocs?: boolean;
      template?: 'basic' | 'full' | 'minimal';
    } = {}
  ): Promise<void> {
    const logger = new Logger('PluginBuilder');
    const template = options.template || 'basic';

    try {
      // Create main directories
      await fs.mkdir(pluginDir, { recursive: true });
      await fs.mkdir(path.join(pluginDir, 'src'), { recursive: true });

      // Create package.json
      const packageJson = {
        name: path.basename(pluginDir),
        version: '1.0.0',
        description: 'ERP Plugin',
        main: 'dist/index.js',
        types: 'dist/index.d.ts',
        scripts: {
          build: 'tsc',
          'build:watch': 'tsc --watch',
          test: 'jest',
          'test:watch': 'jest --watch',
          lint: 'eslint src/**/*.ts',
          'lint:fix': 'eslint src/**/*.ts --fix',
        },
        dependencies: {},
        devDependencies: {
          '@types/node': '^18.0.0',
          typescript: '^5.0.0',
        },
        peerDependencies: {
          '@nestjs/common': '^10.0.0',
          '@nestjs/core': '^10.0.0',
        },
      };

      await fs.writeFile(
        path.join(pluginDir, 'package.json'),
        JSON.stringify(packageJson, null, 2)
      );

      // Create TypeScript config
      const tsConfig = {
        compilerOptions: {
          target: 'ES2020',
          module: 'commonjs',
          lib: ['ES2020'],
          outDir: './dist',
          rootDir: './src',
          strict: true,
          esModuleInterop: true,
          skipLibCheck: true,
          forceConsistentCasingInFileNames: true,
          declaration: true,
          declarationMap: true,
          sourceMap: true,
          experimentalDecorators: true,
          emitDecoratorMetadata: true,
        },
        include: ['src/**/*'],
        exclude: ['node_modules', 'dist', 'test'],
      };

      await fs.writeFile(
        path.join(pluginDir, 'tsconfig.json'),
        JSON.stringify(tsConfig, null, 2)
      );

      // Create basic plugin template
      const pluginTemplate = this.generatePluginTemplate(template);
      await fs.writeFile(
        path.join(pluginDir, 'src', 'index.ts'),
        pluginTemplate
      );

      // Create README.md
      const readme = this.generateReadmeTemplate();
      await fs.writeFile(
        path.join(pluginDir, 'README.md'),
        readme
      );

      // Create additional directories based on template
      if (template === 'full' || options.includeTests) {
        await fs.mkdir(path.join(pluginDir, 'test'), { recursive: true });
        
        // Create Jest config
        const jestConfig = {
          preset: 'ts-jest',
          testEnvironment: 'node',
          roots: ['<rootDir>/test'],
          testMatch: ['**/*.test.ts', '**/*.spec.ts'],
          collectCoverageFrom: [
            'src/**/*.ts',
            '!src/**/*.d.ts',
          ],
        };

        await fs.writeFile(
          path.join(pluginDir, 'jest.config.js'),
          `module.exports = ${JSON.stringify(jestConfig, null, 2)};`
        );
      }

      if (template === 'full' || options.includeDocs) {
        await fs.mkdir(path.join(pluginDir, 'docs'), { recursive: true });
        
        const apiDocs = '# API Documentation\n\nPlugin API documentation goes here.\n';
        await fs.writeFile(
          path.join(pluginDir, 'docs', 'api.md'),
          apiDocs
        );
      }

      if (template === 'full' || options.includeExamples) {
        await fs.mkdir(path.join(pluginDir, 'examples'), { recursive: true });
        
        const example = '// Example usage of the plugin\nconsole.log("Plugin example");';
        await fs.writeFile(
          path.join(pluginDir, 'examples', 'basic.ts'),
          example
        );
      }

      logger.log(`Created plugin package structure at: ${pluginDir}`);

    } catch (error) {
      logger.error(`Failed to create plugin package structure:`, error);
      throw error;
    }
  }

  // Private helper methods

  private static isValidVersion(version: string): boolean {
    return /^\d+\.\d+\.\d+/.test(version);
  }

  private static isValidIdentifier(identifier: string): boolean {
    return /^[a-z0-9-]+([\/][a-z0-9-]+)?$/.test(identifier);
  }

  private static validateConfigSchema(schema: IPluginConfigSchema): {
    errors: string[];
    warnings: string[];
  } {
    const result = { errors: [], warnings: [] };

    for (const [key, field] of Object.entries(schema)) {
      if (!field.type) {
        result.errors.push(`Configuration field '${key}' must specify type`);
      }

      if (field.validation) {
        if (field.type === 'number' && field.validation.min !== undefined && field.validation.max !== undefined) {
          if (field.validation.min >= field.validation.max) {
            result.errors.push(`Configuration field '${key}' min value must be less than max value`);
          }
        }

        if (field.validation.enum && !Array.isArray(field.validation.enum)) {
          result.errors.push(`Configuration field '${key}' enum must be an array`);
        }
      }
    }

    return result;
  }

  private static generatePluginTemplate(template: 'basic' | 'full' | 'minimal'): string {
    if (template === 'minimal') {
      return `import { BasePlugin, Plugin } from '@erp/plugin-system';
import { PluginType } from '@erp/plugin-system';

@Plugin({
  identifier: 'my-plugin',
  name: 'My Plugin',
  version: '1.0.0',
  description: 'A simple ERP plugin',
  author: 'Your Name',
  type: PluginType.BUSINESS,
})
export class MyPlugin extends BasePlugin {
  protected async onStart(): Promise<void> {
    this.logger.log('Plugin started');
  }

  protected async onStop(): Promise<void> {
    this.logger.log('Plugin stopped');
  }
}

export default MyPlugin;
`;
    }

    if (template === 'full') {
      return `import { BasePlugin, Plugin, Hook, ApiEndpoint, ConfigSchema, DefaultConfig } from '@erp/plugin-system';
import { PluginType } from '@erp/plugin-system';

@Plugin({
  identifier: 'my-advanced-plugin',
  name: 'My Advanced Plugin',
  version: '1.0.0',
  description: 'An advanced ERP plugin with hooks and API endpoints',
  author: 'Your Name',
  type: PluginType.BUSINESS,
  tags: ['advanced', 'api', 'hooks'],
})
@ConfigSchema({
  apiKey: {
    type: 'string',
    required: true,
    description: 'API key for external service',
  },
  enableLogging: {
    type: 'boolean',
    default: true,
    description: 'Enable debug logging',
  },
})
@DefaultConfig({
  enableLogging: true,
})
export class MyAdvancedPlugin extends BasePlugin {
  protected async onStart(): Promise<void> {
    const apiKey = this.getConfig('apiKey');
    const enableLogging = this.getConfig('enableLogging', true);
    
    if (enableLogging) {
      this.logger.log(\`Plugin started with API key: \${apiKey ? '***' : 'not set'}\`);
    }
  }

  protected async onStop(): Promise<void> {
    this.logger.log('Plugin stopped');
  }

  @Hook('user.created', 10)
  async onUserCreated(data: any): Promise<void> {
    this.logger.log(\`New user created: \${data.user.email}\`);
  }

  @ApiEndpoint('/my-plugin/status', 'GET')
  async getStatus(): Promise<any> {
    return {
      status: 'ok',
      version: this.metadata.version,
      uptime: process.uptime(),
    };
  }

  @ApiEndpoint('/my-plugin/data', 'POST', {
    permissions: ['plugin:data:write'],
  })
  async processData(data: any): Promise<any> {
    // Process the data
    return { processed: true, data };
  }
}

export default MyAdvancedPlugin;
`;
    }

    // Basic template
    return `import { BasePlugin, Plugin, Hook, ConfigSchema } from '@erp/plugin-system';
import { PluginType } from '@erp/plugin-system';

@Plugin({
  identifier: 'my-plugin',
  name: 'My Plugin',
  version: '1.0.0',
  description: 'A basic ERP plugin',
  author: 'Your Name',
  type: PluginType.BUSINESS,
})
@ConfigSchema({
  enabled: {
    type: 'boolean',
    default: true,
    description: 'Enable plugin functionality',
  },
})
export class MyPlugin extends BasePlugin {
  protected async onStart(): Promise<void> {
    const enabled = this.getConfig('enabled', true);
    if (enabled) {
      this.logger.log('Plugin started and enabled');
    }
  }

  protected async onStop(): Promise<void> {
    this.logger.log('Plugin stopped');
  }

  @Hook('app.ready', 0)
  async onAppReady(): Promise<void> {
    this.logger.log('Application is ready, plugin initialized');
  }
}

export default MyPlugin;
`;
  }

  private static generateReadmeTemplate(): string {
    return `# My Plugin

A plugin for the ERP system.

## Description

This plugin provides...

## Installation

\`\`\`bash
npm install
npm run build
\`\`\`

## Configuration

The plugin supports the following configuration options:

- \`enabled\`: Enable/disable the plugin (default: true)

## Usage

After installation and activation, the plugin will...

## Development

\`\`\`bash
# Install dependencies
npm install

# Build the plugin
npm run build

# Run tests
npm test

# Watch mode for development
npm run build:watch
\`\`\`

## License

MIT
`;
  }
}