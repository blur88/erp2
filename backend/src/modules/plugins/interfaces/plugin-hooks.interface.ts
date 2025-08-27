/**
 * Plugin hook context
 */
export interface IPluginHookContext {
  pluginId: string;
  eventName: string;
  data: any;
  metadata?: Record<string, any>;
  timestamp: Date;
  userId?: string;
  correlationId?: string;
}

/**
 * Plugin hook handler
 */
export interface IPluginHookHandler {
  /**
   * Execute the hook handler
   */
  execute(context: IPluginHookContext): Promise<IPluginHookResult>;

  /**
   * Get handler metadata
   */
  getMetadata(): IPluginHookHandlerMetadata;
}

/**
 * Plugin hook handler metadata
 */
export interface IPluginHookHandlerMetadata {
  name: string;
  description?: string;
  priority: number;
  async: boolean;
  timeout?: number;
  retries?: number;
  conditions?: IPluginHookCondition[];
}

/**
 * Plugin hook condition
 */
export interface IPluginHookCondition {
  field: string;
  operator: 'eq' | 'ne' | 'gt' | 'gte' | 'lt' | 'lte' | 'in' | 'nin' | 'regex' | 'exists';
  value: any;
}

/**
 * Plugin hook result
 */
export interface IPluginHookResult {
  success: boolean;
  data?: any;
  error?: string;
  metadata?: Record<string, any>;
  shouldContinue?: boolean;
  transformedData?: any;
}

/**
 * Plugin hook registration
 */
export interface IPluginHookRegistration {
  pluginId: string;
  eventName: string;
  handler: IPluginHookHandler;
  priority: number;
  conditions?: IPluginHookCondition[];
  enabled: boolean;
}

/**
 * Plugin hook manager interface
 */
export interface IPluginHookManager {
  /**
   * Register a hook handler
   */
  register(registration: IPluginHookRegistration): Promise<void>;

  /**
   * Unregister a hook handler
   */
  unregister(pluginId: string, eventName: string): Promise<void>;

  /**
   * Unregister all hooks for a plugin
   */
  unregisterAll(pluginId: string): Promise<void>;

  /**
   * Execute hooks for an event
   */
  executeHooks(
    eventName: string,
    data: any,
    options?: IPluginHookExecutionOptions
  ): Promise<IPluginHookExecutionResult>;

  /**
   * Execute a single hook
   */
  executeHook(
    pluginId: string,
    eventName: string,
    data: any,
    options?: IPluginHookExecutionOptions
  ): Promise<IPluginHookResult>;

  /**
   * Get registered hooks for an event
   */
  getHooks(eventName: string): IPluginHookRegistration[];

  /**
   * Get all hooks for a plugin
   */
  getPluginHooks(pluginId: string): IPluginHookRegistration[];

  /**
   * Enable/disable a hook
   */
  setHookEnabled(pluginId: string, eventName: string, enabled: boolean): Promise<void>;

  /**
   * Check if conditions are met
   */
  checkConditions(conditions: IPluginHookCondition[], data: any): boolean;
}

/**
 * Plugin hook execution options
 */
export interface IPluginHookExecutionOptions {
  parallel?: boolean;
  timeout?: number;
  continueOnError?: boolean;
  userId?: string;
  correlationId?: string;
  metadata?: Record<string, any>;
}

/**
 * Plugin hook execution result
 */
export interface IPluginHookExecutionResult {
  success: boolean;
  results: Array<{
    pluginId: string;
    result: IPluginHookResult;
    executionTime: number;
  }>;
  totalExecutionTime: number;
  errors: string[];
  transformedData?: any;
}

/**
 * Pre-defined system hooks
 */
export enum SystemHooks {
  // Application lifecycle
  APP_STARTING = 'app.starting',
  APP_STARTED = 'app.started',
  APP_STOPPING = 'app.stopping',
  APP_STOPPED = 'app.stopped',

  // User management
  USER_CREATED = 'user.created',
  USER_UPDATED = 'user.updated',
  USER_DELETED = 'user.deleted',
  USER_LOGIN = 'user.login',
  USER_LOGOUT = 'user.logout',

  // Authentication
  AUTH_SUCCESS = 'auth.success',
  AUTH_FAILED = 'auth.failed',
  AUTH_TOKEN_CREATED = 'auth.token.created',
  AUTH_TOKEN_REFRESHED = 'auth.token.refreshed',
  AUTH_TOKEN_REVOKED = 'auth.token.revoked',

  // Database operations
  BEFORE_CREATE = 'db.before.create',
  AFTER_CREATE = 'db.after.create',
  BEFORE_UPDATE = 'db.before.update',
  AFTER_UPDATE = 'db.after.update',
  BEFORE_DELETE = 'db.before.delete',
  AFTER_DELETE = 'db.after.delete',

  // API requests
  BEFORE_REQUEST = 'api.before.request',
  AFTER_REQUEST = 'api.after.request',
  REQUEST_ERROR = 'api.request.error',

  // Business operations
  ORDER_CREATED = 'order.created',
  ORDER_UPDATED = 'order.updated',
  ORDER_CANCELLED = 'order.cancelled',
  PAYMENT_RECEIVED = 'payment.received',
  INVOICE_GENERATED = 'invoice.generated',
  PRODUCT_CREATED = 'product.created',
  INVENTORY_UPDATED = 'inventory.updated',

  // Reports
  REPORT_GENERATED = 'report.generated',
  REPORT_SCHEDULED = 'report.scheduled',

  // Notifications
  NOTIFICATION_SENT = 'notification.sent',
  EMAIL_SENT = 'email.sent',
  SMS_SENT = 'sms.sent',

  // System events
  CONFIG_CHANGED = 'config.changed',
  CACHE_CLEARED = 'cache.cleared',
  BACKUP_CREATED = 'backup.created',
  ERROR_OCCURRED = 'error.occurred',

  // Custom hooks (plugins can define their own)
  CUSTOM = 'custom',
}

/**
 * Plugin hook decorator metadata
 */
export interface IPluginHookDecoratorOptions {
  event: string | string[];
  priority?: number;
  async?: boolean;
  timeout?: number;
  retries?: number;
  conditions?: IPluginHookCondition[];
  description?: string;
}

/**
 * Hook execution stats
 */
export interface IPluginHookStats {
  eventName: string;
  totalExecutions: number;
  successfulExecutions: number;
  failedExecutions: number;
  averageExecutionTime: number;
  lastExecution?: Date;
  pluginStats: Record<string, {
    executions: number;
    successes: number;
    failures: number;
    averageTime: number;
  }>;
}