import { Logger } from '@nestjs/common';
import {
  IPluginHookHandler,
  IPluginHookHandlerMetadata,
  IPluginHookContext,
  IPluginHookResult,
  IPluginHookCondition,
} from '../interfaces';

/**
 * Abstract base class for plugin hook handlers
 */
export abstract class BaseHookHandler implements IPluginHookHandler {
  protected readonly logger: Logger;

  constructor(protected readonly metadata: IPluginHookHandlerMetadata) {
    this.logger = new Logger(`Hook:${metadata.name}`);
  }

  /**
   * Execute the hook handler
   */
  abstract execute(context: IPluginHookContext): Promise<IPluginHookResult>;

  /**
   * Get handler metadata
   */
  getMetadata(): IPluginHookHandlerMetadata {
    return this.metadata;
  }

  /**
   * Check if handler should execute based on conditions
   */
  protected checkConditions(context: IPluginHookContext): boolean {
    if (!this.metadata.conditions) {
      return true;
    }

    return this.metadata.conditions.every(condition => 
      this.checkCondition(condition, context.data)
    );
  }

  /**
   * Check a single condition
   */
  protected checkCondition(condition: IPluginHookCondition, data: any): boolean {
    const value = this.getValueByPath(data, condition.field);

    switch (condition.operator) {
      case 'eq':
        return value === condition.value;
      case 'ne':
        return value !== condition.value;
      case 'gt':
        return value > condition.value;
      case 'gte':
        return value >= condition.value;
      case 'lt':
        return value < condition.value;
      case 'lte':
        return value <= condition.value;
      case 'in':
        return Array.isArray(condition.value) && condition.value.includes(value);
      case 'nin':
        return Array.isArray(condition.value) && !condition.value.includes(value);
      case 'regex':
        return typeof value === 'string' && new RegExp(condition.value).test(value);
      case 'exists':
        return value !== undefined && value !== null;
      default:
        return false;
    }
  }

  /**
   * Get value from object by dot notation path
   */
  protected getValueByPath(obj: any, path: string): any {
    return path.split('.').reduce((current, key) => {
      return current && current[key];
    }, obj);
  }

  /**
   * Create successful result
   */
  protected success(data?: any, metadata?: Record<string, any>): IPluginHookResult {
    return {
      success: true,
      data,
      metadata,
    };
  }

  /**
   * Create successful result with transformed data
   */
  protected successWithTransform(
    transformedData: any,
    metadata?: Record<string, any>
  ): IPluginHookResult {
    return {
      success: true,
      transformedData,
      metadata,
    };
  }

  /**
   * Create successful result that stops further execution
   */
  protected successAndStop(data?: any, metadata?: Record<string, any>): IPluginHookResult {
    return {
      success: true,
      data,
      metadata,
      shouldContinue: false,
    };
  }

  /**
   * Create error result
   */
  protected error(message: string, metadata?: Record<string, any>): IPluginHookResult {
    return {
      success: false,
      error: message,
      metadata,
    };
  }
}

/**
 * Simple function-based hook handler
 */
export class FunctionHookHandler extends BaseHookHandler {
  constructor(
    metadata: IPluginHookHandlerMetadata,
    private readonly handlerFunction: (context: IPluginHookContext) => Promise<IPluginHookResult>,
  ) {
    super(metadata);
  }

  async execute(context: IPluginHookContext): Promise<IPluginHookResult> {
    try {
      // Check conditions first
      if (!this.checkConditions(context)) {
        return this.success(null, { skipped: true, reason: 'conditions_not_met' });
      }

      return await this.handlerFunction(context);
    } catch (error) {
      this.logger.error(`Hook handler execution failed:`, error);
      return this.error(error.message);
    }
  }
}

/**
 * Async hook handler with retry logic
 */
export class RetryableHookHandler extends BaseHookHandler {
  constructor(
    metadata: IPluginHookHandlerMetadata & { retries?: number; retryDelay?: number },
    private readonly handlerFunction: (context: IPluginHookContext) => Promise<IPluginHookResult>,
  ) {
    super(metadata);
  }

  async execute(context: IPluginHookContext): Promise<IPluginHookResult> {
    const maxRetries = this.metadata.retries || 3;
    const retryDelay = (this.metadata as any).retryDelay || 1000;

    for (let attempt = 0; attempt <= maxRetries; attempt++) {
      try {
        // Check conditions first
        if (!this.checkConditions(context)) {
          return this.success(null, { skipped: true, reason: 'conditions_not_met' });
        }

        const result = await this.handlerFunction(context);
        
        if (result.success || attempt === maxRetries) {
          return result;
        }

        // If not successful and we have retries left, log and retry
        if (attempt < maxRetries) {
          this.logger.warn(
            `Hook handler failed (attempt ${attempt + 1}/${maxRetries + 1}): ${result.error}. Retrying in ${retryDelay}ms...`
          );
          await this.delay(retryDelay);
        }

      } catch (error) {
        this.logger.error(`Hook handler execution failed (attempt ${attempt + 1}/${maxRetries + 1}):`, error);
        
        if (attempt === maxRetries) {
          return this.error(error.message);
        }

        // Wait before retry
        await this.delay(retryDelay);
      }
    }

    return this.error('Max retries exceeded');
  }

  private delay(ms: number): Promise<void> {
    return new Promise(resolve => setTimeout(resolve, ms));
  }
}

/**
 * Conditional hook handler that only executes if conditions are met
 */
export class ConditionalHookHandler extends BaseHookHandler {
  constructor(
    metadata: IPluginHookHandlerMetadata,
    private readonly handlerFunction: (context: IPluginHookContext) => Promise<IPluginHookResult>,
    private readonly conditions: IPluginHookCondition[],
  ) {
    super({ ...metadata, conditions });
  }

  async execute(context: IPluginHookContext): Promise<IPluginHookResult> {
    try {
      // Check conditions
      if (!this.checkConditions(context)) {
        return this.success(null, { skipped: true, reason: 'conditions_not_met' });
      }

      return await this.handlerFunction(context);
    } catch (error) {
      this.logger.error(`Conditional hook handler execution failed:`, error);
      return this.error(error.message);
    }
  }
}

/**
 * Data transformation hook handler
 */
export class TransformHookHandler extends BaseHookHandler {
  constructor(
    metadata: IPluginHookHandlerMetadata,
    private readonly transformFunction: (data: any) => any,
  ) {
    super(metadata);
  }

  async execute(context: IPluginHookContext): Promise<IPluginHookResult> {
    try {
      // Check conditions first
      if (!this.checkConditions(context)) {
        return this.success(null, { skipped: true, reason: 'conditions_not_met' });
      }

      const transformedData = await this.transformFunction(context.data);
      return this.successWithTransform(transformedData, { transformed: true });

    } catch (error) {
      this.logger.error(`Transform hook handler execution failed:`, error);
      return this.error(error.message);
    }
  }
}

/**
 * Validation hook handler
 */
export class ValidationHookHandler extends BaseHookHandler {
  constructor(
    metadata: IPluginHookHandlerMetadata,
    private readonly validationFunction: (data: any) => string[] | Promise<string[]>,
  ) {
    super(metadata);
  }

  async execute(context: IPluginHookContext): Promise<IPluginHookResult> {
    try {
      // Check conditions first
      if (!this.checkConditions(context)) {
        return this.success(null, { skipped: true, reason: 'conditions_not_met' });
      }

      const errors = await this.validationFunction(context.data);

      if (errors.length > 0) {
        return {
          success: false,
          error: `Validation failed: ${errors.join(', ')}`,
          metadata: { validationErrors: errors },
          shouldContinue: false, // Stop execution on validation failure
        };
      }

      return this.success(null, { validated: true });

    } catch (error) {
      this.logger.error(`Validation hook handler execution failed:`, error);
      return this.error(error.message);
    }
  }
}

/**
 * Logging hook handler
 */
export class LoggingHookHandler extends BaseHookHandler {
  constructor(
    metadata: IPluginHookHandlerMetadata,
    private readonly logLevel: 'debug' | 'info' | 'warn' | 'error' = 'info',
    private readonly logMessage?: string,
  ) {
    super(metadata);
  }

  async execute(context: IPluginHookContext): Promise<IPluginHookResult> {
    try {
      const message = this.logMessage || `Hook executed: ${context.eventName}`;
      
      switch (this.logLevel) {
        case 'debug':
          this.logger.debug(message, context.data);
          break;
        case 'info':
          this.logger.log(message, context.data);
          break;
        case 'warn':
          this.logger.warn(message, context.data);
          break;
        case 'error':
          this.logger.error(message, context.data);
          break;
      }

      return this.success(null, { logged: true });

    } catch (error) {
      this.logger.error(`Logging hook handler execution failed:`, error);
      return this.error(error.message);
    }
  }
}

/**
 * HTTP request hook handler
 */
export class HttpRequestHookHandler extends BaseHookHandler {
  constructor(
    metadata: IPluginHookHandlerMetadata,
    private readonly url: string,
    private readonly method: 'GET' | 'POST' | 'PUT' | 'DELETE' = 'POST',
    private readonly headers?: Record<string, string>,
  ) {
    super(metadata);
  }

  async execute(context: IPluginHookContext): Promise<IPluginHookResult> {
    try {
      // Check conditions first
      if (!this.checkConditions(context)) {
        return this.success(null, { skipped: true, reason: 'conditions_not_met' });
      }

      // Make HTTP request
      const response = await fetch(this.url, {
        method: this.method,
        headers: {
          'Content-Type': 'application/json',
          ...this.headers,
        },
        body: this.method !== 'GET' ? JSON.stringify(context.data) : undefined,
      });

      if (!response.ok) {
        throw new Error(`HTTP ${response.status}: ${response.statusText}`);
      }

      const responseData = await response.json();

      return this.success(responseData, { 
        httpRequest: true,
        statusCode: response.status,
      });

    } catch (error) {
      this.logger.error(`HTTP request hook handler execution failed:`, error);
      return this.error(error.message);
    }
  }
}

/**
 * Database operation hook handler
 */
export class DatabaseHookHandler extends BaseHookHandler {
  constructor(
    metadata: IPluginHookHandlerMetadata,
    private readonly operation: (data: any) => Promise<any>,
  ) {
    super(metadata);
  }

  async execute(context: IPluginHookContext): Promise<IPluginHookResult> {
    try {
      // Check conditions first
      if (!this.checkConditions(context)) {
        return this.success(null, { skipped: true, reason: 'conditions_not_met' });
      }

      const result = await this.operation(context.data);

      return this.success(result, { databaseOperation: true });

    } catch (error) {
      this.logger.error(`Database hook handler execution failed:`, error);
      return this.error(error.message);
    }
  }
}