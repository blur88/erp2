import { SetMetadata, Type } from '@nestjs/common';
import { IPluginMetadata, IPluginConfigSchema, IPluginHook, IPluginEndpoint, IPluginUIComponent, IPluginMigration } from '../interfaces';
import { PluginType } from '../../../database/entities/plugin.entity';

/**
 * Plugin Development Decorators
 * 
 * Provides decorators for plugin development including metadata definition,
 * hook registration, API endpoint definition, and configuration schema.
 */

export const PLUGIN_METADATA_KEY = 'plugin:metadata';
export const PLUGIN_CONFIG_SCHEMA_KEY = 'plugin:config_schema';
export const PLUGIN_DEFAULT_CONFIG_KEY = 'plugin:default_config';
export const PLUGIN_HOOKS_KEY = 'plugin:hooks';
export const PLUGIN_ENDPOINTS_KEY = 'plugin:endpoints';
export const PLUGIN_UI_COMPONENTS_KEY = 'plugin:ui_components';
export const PLUGIN_MIGRATIONS_KEY = 'plugin:migrations';
export const PLUGIN_PERMISSIONS_KEY = 'plugin:permissions';
export const PLUGIN_DEPENDENCIES_KEY = 'plugin:dependencies';

/**
 * Main plugin decorator - defines plugin metadata
 */
export function Plugin(metadata: IPluginMetadata): ClassDecorator {
  return (target: any) => {
    // Validate required metadata fields
    if (!metadata.identifier) {
      throw new Error('Plugin identifier is required');
    }
    if (!metadata.name) {
      throw new Error('Plugin name is required');
    }
    if (!metadata.version) {
      throw new Error('Plugin version is required');
    }
    if (!metadata.type) {
      throw new Error('Plugin type is required');
    }

    // Set metadata
    Reflect.defineMetadata(PLUGIN_METADATA_KEY, metadata, target);
    return target;
  };
}

/**
 * Configuration schema decorator
 */
export function ConfigSchema(schema: IPluginConfigSchema): ClassDecorator {
  return (target: any) => {
    Reflect.defineMetadata(PLUGIN_CONFIG_SCHEMA_KEY, schema, target);
    return target;
  };
}

/**
 * Default configuration decorator
 */
export function DefaultConfig(config: Record<string, any>): ClassDecorator {
  return (target: any) => {
    Reflect.defineMetadata(PLUGIN_DEFAULT_CONFIG_KEY, config, target);
    return target;
  };
}

/**
 * Plugin hook decorator
 */
export function Hook(event: string, priority: number = 0, options?: {
  async?: boolean;
  conditions?: any[];
}): MethodDecorator {
  return (target: any, propertyKey: string | symbol, descriptor: PropertyDescriptor) => {
    const hooks: IPluginHook[] = Reflect.getMetadata(PLUGIN_HOOKS_KEY, target.constructor) || [];
    
    const hook: IPluginHook = {
      event,
      handler: propertyKey as string,
      priority,
      async: options?.async,
    };

    hooks.push(hook);
    Reflect.defineMetadata(PLUGIN_HOOKS_KEY, hooks, target.constructor);
    
    return descriptor;
  };
}

/**
 * API endpoint decorator
 */
export function ApiEndpoint(
  path: string,
  method: 'GET' | 'POST' | 'PUT' | 'DELETE' | 'PATCH',
  options?: {
    middleware?: string[];
    permissions?: string[];
    rateLimit?: {
      windowMs: number;
      max: number;
    };
  }
): MethodDecorator {
  return (target: any, propertyKey: string | symbol, descriptor: PropertyDescriptor) => {
    const endpoints: IPluginEndpoint[] = Reflect.getMetadata(PLUGIN_ENDPOINTS_KEY, target.constructor) || [];
    
    const endpoint: IPluginEndpoint = {
      path,
      method,
      handler: propertyKey as string,
      middleware: options?.middleware,
      permissions: options?.permissions,
      rateLimit: options?.rateLimit,
    };

    endpoints.push(endpoint);
    Reflect.defineMetadata(PLUGIN_ENDPOINTS_KEY, endpoints, target.constructor);
    
    return descriptor;
  };
}

/**
 * UI component decorator
 */
export function UIComponent(
  name: string,
  type: 'component' | 'route' | 'menu_item' | 'widget' | 'page',
  options?: {
    path?: string;
    permissions?: string[];
    props?: Record<string, any>;
  }
): ClassDecorator & MethodDecorator {
  return (target: any, propertyKey?: string | symbol, descriptor?: PropertyDescriptor) => {
    const components: IPluginUIComponent[] = Reflect.getMetadata(PLUGIN_UI_COMPONENTS_KEY, target.constructor || target) || [];
    
    const component: IPluginUIComponent = {
      name,
      type,
      path: options?.path,
      component: propertyKey as string,
      permissions: options?.permissions,
      props: options?.props,
    };

    components.push(component);
    Reflect.defineMetadata(PLUGIN_UI_COMPONENTS_KEY, components, target.constructor || target);
    
    return descriptor || target;
  };
}

/**
 * Migration decorator
 */
export function Migration(version: string, description?: string): MethodDecorator {
  return (target: any, propertyKey: string | symbol, descriptor: PropertyDescriptor) => {
    const migrations: IPluginMigration[] = Reflect.getMetadata(PLUGIN_MIGRATIONS_KEY, target.constructor) || [];
    
    const migration: IPluginMigration = {
      version,
      description,
      up: descriptor.value,
      down: () => Promise.resolve(), // Should be implemented by the plugin
    };

    migrations.push(migration);
    Reflect.defineMetadata(PLUGIN_MIGRATIONS_KEY, migrations, target.constructor);
    
    return descriptor;
  };
}

/**
 * Permission requirement decorator
 */
export function RequirePermission(permission: string): MethodDecorator {
  return (target: any, propertyKey: string | symbol, descriptor: PropertyDescriptor) => {
    const permissions: string[] = Reflect.getMetadata(PLUGIN_PERMISSIONS_KEY, descriptor.value) || [];
    permissions.push(permission);
    Reflect.defineMetadata(PLUGIN_PERMISSIONS_KEY, permissions, descriptor.value);
    return descriptor;
  };
}

/**
 * Plugin dependency decorator
 */
export function Dependency(
  name: string,
  version: string,
  options?: {
    required?: boolean;
    type?: 'plugin' | 'npm' | 'system';
  }
): ClassDecorator {
  return (target: any) => {
    const dependencies: any[] = Reflect.getMetadata(PLUGIN_DEPENDENCIES_KEY, target) || [];
    
    dependencies.push({
      name,
      version,
      required: options?.required ?? true,
      type: options?.type ?? 'plugin',
    });

    Reflect.defineMetadata(PLUGIN_DEPENDENCIES_KEY, dependencies, target);
    return target;
  };
}

/**
 * Event listener decorator
 */
export function OnEvent(event: string, priority: number = 0): MethodDecorator {
  return Hook(event, priority, { async: true });
}

/**
 * Scheduled task decorator
 */
export function Scheduled(cron: string): MethodDecorator {
  return (target: any, propertyKey: string | symbol, descriptor: PropertyDescriptor) => {
    // Mark method as scheduled task
    Reflect.defineMetadata('scheduled:cron', cron, descriptor.value);
    return descriptor;
  };
}

/**
 * Database entity decorator
 */
export function Entity(tableName?: string): ClassDecorator {
  return (target: any) => {
    const entityName = tableName || target.name.toLowerCase();
    Reflect.defineMetadata('entity:tableName', entityName, target);
    return target;
  };
}

/**
 * API documentation decorator
 */
export function ApiDoc(documentation: {
  summary?: string;
  description?: string;
  tags?: string[];
  deprecated?: boolean;
}): MethodDecorator {
  return (target: any, propertyKey: string | symbol, descriptor: PropertyDescriptor) => {
    Reflect.defineMetadata('api:documentation', documentation, descriptor.value);
    return descriptor;
  };
}

/**
 * Plugin capability decorator - defines what the plugin can do
 */
export function Capability(capability: string, options?: {
  version?: string;
  description?: string;
  dependencies?: string[];
}): ClassDecorator {
  return (target: any) => {
    const capabilities: any[] = Reflect.getMetadata('plugin:capabilities', target) || [];
    
    capabilities.push({
      name: capability,
      version: options?.version || '1.0.0',
      description: options?.description,
      dependencies: options?.dependencies || [],
    });

    Reflect.defineMetadata('plugin:capabilities', capabilities, target);
    return target;
  };
}

/**
 * Plugin feature flag decorator
 */
export function FeatureFlag(flag: string, defaultValue: boolean = false): MethodDecorator {
  return (target: any, propertyKey: string | symbol, descriptor: PropertyDescriptor) => {
    const flags: Record<string, boolean> = Reflect.getMetadata('plugin:feature_flags', target.constructor) || {};
    flags[flag] = defaultValue;
    Reflect.defineMetadata('plugin:feature_flags', flags, target.constructor);
    
    // Store flag reference on method
    Reflect.defineMetadata('feature_flag', flag, descriptor.value);
    return descriptor;
  };
}

/**
 * Plugin validation decorator
 */
export function Validate(schema: any): MethodDecorator {
  return (target: any, propertyKey: string | symbol, descriptor: PropertyDescriptor) => {
    Reflect.defineMetadata('validation:schema', schema, descriptor.value);
    return descriptor;
  };
}

/**
 * Plugin cache decorator
 */
export function Cache(ttl: number = 300, key?: string): MethodDecorator {
  return (target: any, propertyKey: string | symbol, descriptor: PropertyDescriptor) => {
    const cacheConfig = {
      ttl,
      key: key || `${target.constructor.name}:${propertyKey as string}`,
    };
    
    Reflect.defineMetadata('cache:config', cacheConfig, descriptor.value);
    return descriptor;
  };
}

/**
 * Plugin rate limiting decorator
 */
export function RateLimit(windowMs: number, max: number): MethodDecorator {
  return (target: any, propertyKey: string | symbol, descriptor: PropertyDescriptor) => {
    const rateLimitConfig = {
      windowMs,
      max,
    };
    
    Reflect.defineMetadata('rate_limit:config', rateLimitConfig, descriptor.value);
    return descriptor;
  };
}

/**
 * Utility function to get plugin metadata from a class
 */
export function getPluginMetadata(target: Type<any>): IPluginMetadata | undefined {
  return Reflect.getMetadata(PLUGIN_METADATA_KEY, target);
}

/**
 * Utility function to get plugin configuration schema
 */
export function getPluginConfigSchema(target: Type<any>): IPluginConfigSchema | undefined {
  return Reflect.getMetadata(PLUGIN_CONFIG_SCHEMA_KEY, target);
}

/**
 * Utility function to get plugin default configuration
 */
export function getPluginDefaultConfig(target: Type<any>): Record<string, any> | undefined {
  return Reflect.getMetadata(PLUGIN_DEFAULT_CONFIG_KEY, target);
}

/**
 * Utility function to get plugin hooks
 */
export function getPluginHooks(target: Type<any>): IPluginHook[] {
  return Reflect.getMetadata(PLUGIN_HOOKS_KEY, target) || [];
}

/**
 * Utility function to get plugin endpoints
 */
export function getPluginEndpoints(target: Type<any>): IPluginEndpoint[] {
  return Reflect.getMetadata(PLUGIN_ENDPOINTS_KEY, target) || [];
}

/**
 * Utility function to get plugin UI components
 */
export function getPluginUIComponents(target: Type<any>): IPluginUIComponent[] {
  return Reflect.getMetadata(PLUGIN_UI_COMPONENTS_KEY, target) || [];
}

/**
 * Utility function to get plugin migrations
 */
export function getPluginMigrations(target: Type<any>): IPluginMigration[] {
  return Reflect.getMetadata(PLUGIN_MIGRATIONS_KEY, target) || [];
}

/**
 * Utility function to get plugin dependencies
 */
export function getPluginDependencies(target: Type<any>): any[] {
  return Reflect.getMetadata(PLUGIN_DEPENDENCIES_KEY, target) || [];
}

/**
 * Utility function to check if a method has a specific permission requirement
 */
export function getMethodPermissions(method: Function): string[] {
  return Reflect.getMetadata(PLUGIN_PERMISSIONS_KEY, method) || [];
}

/**
 * Utility function to get all plugin metadata at once
 */
export function getAllPluginMetadata(target: Type<any>): {
  metadata?: IPluginMetadata;
  configSchema?: IPluginConfigSchema;
  defaultConfig?: Record<string, any>;
  hooks?: IPluginHook[];
  endpoints?: IPluginEndpoint[];
  uiComponents?: IPluginUIComponent[];
  migrations?: IPluginMigration[];
  dependencies?: any[];
} {
  return {
    metadata: getPluginMetadata(target),
    configSchema: getPluginConfigSchema(target),
    defaultConfig: getPluginDefaultConfig(target),
    hooks: getPluginHooks(target),
    endpoints: getPluginEndpoints(target),
    uiComponents: getPluginUIComponents(target),
    migrations: getPluginMigrations(target),
    dependencies: getPluginDependencies(target),
  };
}