import { Injectable, Logger } from '@nestjs/common';
import { EventEmitter2 } from '@nestjs/event-emitter';
import {
  IPluginHookManager,
  IPluginHookRegistration,
  IPluginHookContext,
  IPluginHookResult,
  IPluginHookExecutionOptions,
  IPluginHookExecutionResult,
  IPluginHookCondition,
  IPluginHookStats,
} from '../interfaces';

@Injectable()
export class PluginHooksService implements IPluginHookManager {
  private readonly logger = new Logger(PluginHooksService.name);
  private readonly hooks = new Map<string, IPluginHookRegistration[]>();
  private readonly stats = new Map<string, IPluginHookStats>();

  constructor(private readonly eventEmitter: EventEmitter2) {
    this.initializeStats();
  }

  /**
   * Register a hook handler
   */
  async register(registration: IPluginHookRegistration): Promise<void> {
    const { pluginId, eventName } = registration;

    this.logger.debug(`Registering hook: ${pluginId} -> ${eventName}`);

    // Get existing hooks for this event
    const eventHooks = this.hooks.get(eventName) || [];

    // Check if hook already exists for this plugin
    const existingIndex = eventHooks.findIndex(
      hook => hook.pluginId === pluginId
    );

    if (existingIndex >= 0) {
      // Update existing hook
      eventHooks[existingIndex] = registration;
      this.logger.debug(`Updated existing hook: ${pluginId} -> ${eventName}`);
    } else {
      // Add new hook
      eventHooks.push(registration);
      this.logger.debug(`Added new hook: ${pluginId} -> ${eventName}`);
    }

    // Sort hooks by priority (higher priority first)
    eventHooks.sort((a, b) => b.priority - a.priority);

    // Update hooks map
    this.hooks.set(eventName, eventHooks);

    // Initialize stats if needed
    if (!this.stats.has(eventName)) {
      this.initializeStatsForEvent(eventName);
    }

    // Emit registration event
    await this.eventEmitter.emitAsync('plugin.hook.registered', {
      pluginId,
      eventName,
      priority: registration.priority,
    });
  }

  /**
   * Unregister a hook handler
   */
  async unregister(pluginId: string, eventName: string): Promise<void> {
    this.logger.debug(`Unregistering hook: ${pluginId} -> ${eventName}`);

    const eventHooks = this.hooks.get(eventName);
    if (!eventHooks) {
      return;
    }

    // Remove hook for this plugin
    const updatedHooks = eventHooks.filter(hook => hook.pluginId !== pluginId);
    
    if (updatedHooks.length === 0) {
      // No more hooks for this event
      this.hooks.delete(eventName);
    } else {
      this.hooks.set(eventName, updatedHooks);
    }

    // Emit unregistration event
    await this.eventEmitter.emitAsync('plugin.hook.unregistered', {
      pluginId,
      eventName,
    });
  }

  /**
   * Unregister all hooks for a plugin
   */
  async unregisterAll(pluginId: string): Promise<void> {
    this.logger.debug(`Unregistering all hooks for plugin: ${pluginId}`);

    const eventsToRemove: string[] = [];

    // Remove hooks for this plugin from all events
    for (const [eventName, eventHooks] of this.hooks) {
      const updatedHooks = eventHooks.filter(hook => hook.pluginId !== pluginId);
      
      if (updatedHooks.length === 0) {
        eventsToRemove.push(eventName);
      } else if (updatedHooks.length !== eventHooks.length) {
        this.hooks.set(eventName, updatedHooks);
      }
    }

    // Remove events with no hooks
    for (const eventName of eventsToRemove) {
      this.hooks.delete(eventName);
    }

    // Emit unregistration event
    await this.eventEmitter.emitAsync('plugin.hook.all_unregistered', {
      pluginId,
    });
  }

  /**
   * Execute hooks for an event
   */
  async executeHooks(
    eventName: string,
    data: any,
    options: IPluginHookExecutionOptions = {},
  ): Promise<IPluginHookExecutionResult> {
    const startTime = Date.now();
    const correlationId = options.correlationId || this.generateCorrelationId();

    this.logger.debug(`Executing hooks for event: ${eventName} (${correlationId})`);

    const eventHooks = this.hooks.get(eventName) || [];
    const enabledHooks = eventHooks.filter(hook => hook.enabled);

    if (enabledHooks.length === 0) {
      this.logger.debug(`No hooks registered for event: ${eventName}`);
      return {
        success: true,
        results: [],
        totalExecutionTime: 0,
        errors: [],
      };
    }

    const results = [];
    const errors = [];
    let transformedData = data;

    try {
      if (options.parallel) {
        // Execute hooks in parallel
        const promises = enabledHooks.map(async (hook) => {
          const hookStartTime = Date.now();
          try {
            const result = await this.executeHook(
              hook.pluginId,
              eventName,
              transformedData,
              { ...options, correlationId }
            );
            const executionTime = Date.now() - hookStartTime;
            
            this.updateStats(eventName, hook.pluginId, true, executionTime);
            
            return {
              pluginId: hook.pluginId,
              result,
              executionTime,
            };
          } catch (error) {
            const executionTime = Date.now() - hookStartTime;
            this.updateStats(eventName, hook.pluginId, false, executionTime);
            
            if (options.continueOnError) {
              this.logger.error(`Hook execution failed for ${hook.pluginId}:`, error);
              errors.push(`${hook.pluginId}: ${error.message}`);
              
              return {
                pluginId: hook.pluginId,
                result: { success: false, error: error.message },
                executionTime,
              };
            } else {
              throw error;
            }
          }
        });

        const hookResults = await Promise.all(promises);
        results.push(...hookResults);

      } else {
        // Execute hooks sequentially
        for (const hook of enabledHooks) {
          const hookStartTime = Date.now();
          
          try {
            const result = await this.executeHook(
              hook.pluginId,
              eventName,
              transformedData,
              { ...options, correlationId }
            );
            
            const executionTime = Date.now() - hookStartTime;
            this.updateStats(eventName, hook.pluginId, true, executionTime);

            results.push({
              pluginId: hook.pluginId,
              result,
              executionTime,
            });

            // If hook transformed the data, use it for next hooks
            if (result.transformedData !== undefined) {
              transformedData = result.transformedData;
            }

            // Stop execution if hook says so
            if (result.shouldContinue === false) {
              this.logger.debug(`Hook ${hook.pluginId} requested to stop execution`);
              break;
            }

          } catch (error) {
            const executionTime = Date.now() - hookStartTime;
            this.updateStats(eventName, hook.pluginId, false, executionTime);

            if (options.continueOnError) {
              this.logger.error(`Hook execution failed for ${hook.pluginId}:`, error);
              errors.push(`${hook.pluginId}: ${error.message}`);
              
              results.push({
                pluginId: hook.pluginId,
                result: { success: false, error: error.message },
                executionTime,
              });
            } else {
              throw error;
            }
          }
        }
      }

      const totalExecutionTime = Date.now() - startTime;

      this.logger.debug(
        `Executed ${results.length} hooks for event ${eventName} in ${totalExecutionTime}ms`
      );

      return {
        success: errors.length === 0,
        results,
        totalExecutionTime,
        errors,
        transformedData: transformedData !== data ? transformedData : undefined,
      };

    } catch (error) {
      const totalExecutionTime = Date.now() - startTime;
      
      this.logger.error(`Hook execution failed for event ${eventName}:`, error);

      return {
        success: false,
        results,
        totalExecutionTime,
        errors: [error.message],
      };
    }
  }

  /**
   * Execute a single hook
   */
  async executeHook(
    pluginId: string,
    eventName: string,
    data: any,
    options: IPluginHookExecutionOptions = {},
  ): Promise<IPluginHookResult> {
    const hook = this.findHook(pluginId, eventName);
    if (!hook) {
      throw new Error(`Hook not found: ${pluginId} -> ${eventName}`);
    }

    if (!hook.enabled) {
      return {
        success: false,
        error: 'Hook is disabled',
      };
    }

    // Check conditions
    if (hook.conditions && !this.checkConditions(hook.conditions, data)) {
      this.logger.debug(`Hook conditions not met: ${pluginId} -> ${eventName}`);
      return {
        success: true,
        data: null,
        metadata: { skipped: true, reason: 'conditions_not_met' },
      };
    }

    // Create hook context
    const context: IPluginHookContext = {
      pluginId,
      eventName,
      data,
      metadata: options.metadata,
      timestamp: new Date(),
      userId: options.userId,
      correlationId: options.correlationId,
    };

    try {
      // Execute hook handler with timeout
      const timeout = options.timeout || hook.handler.getMetadata().timeout || 30000;
      const result = await Promise.race([
        hook.handler.execute(context),
        new Promise<IPluginHookResult>((_, reject) =>
          setTimeout(() => reject(new Error('Hook execution timeout')), timeout)
        ),
      ]);

      return result;

    } catch (error) {
      this.logger.error(`Hook execution failed: ${pluginId} -> ${eventName}:`, error);
      throw error;
    }
  }

  /**
   * Get registered hooks for an event
   */
  getHooks(eventName: string): IPluginHookRegistration[] {
    return this.hooks.get(eventName) || [];
  }

  /**
   * Get all hooks for a plugin
   */
  getPluginHooks(pluginId: string): IPluginHookRegistration[] {
    const pluginHooks = [];

    for (const eventHooks of this.hooks.values()) {
      for (const hook of eventHooks) {
        if (hook.pluginId === pluginId) {
          pluginHooks.push(hook);
        }
      }
    }

    return pluginHooks;
  }

  /**
   * Enable/disable a hook
   */
  async setHookEnabled(pluginId: string, eventName: string, enabled: boolean): Promise<void> {
    const hook = this.findHook(pluginId, eventName);
    if (!hook) {
      throw new Error(`Hook not found: ${pluginId} -> ${eventName}`);
    }

    hook.enabled = enabled;

    this.logger.debug(`Hook ${enabled ? 'enabled' : 'disabled'}: ${pluginId} -> ${eventName}`);

    // Emit status change event
    await this.eventEmitter.emitAsync('plugin.hook.status_changed', {
      pluginId,
      eventName,
      enabled,
    });
  }

  /**
   * Check if conditions are met
   */
  checkConditions(conditions: IPluginHookCondition[], data: any): boolean {
    return conditions.every(condition => this.checkCondition(condition, data));
  }

  /**
   * Get hook statistics
   */
  getStats(eventName?: string): IPluginHookStats[] {
    if (eventName) {
      const stats = this.stats.get(eventName);
      return stats ? [stats] : [];
    }

    return Array.from(this.stats.values());
  }

  /**
   * Clear statistics
   */
  clearStats(eventName?: string): void {
    if (eventName) {
      this.stats.delete(eventName);
    } else {
      this.stats.clear();
      this.initializeStats();
    }
  }

  /**
   * Get all registered events
   */
  getRegisteredEvents(): string[] {
    return Array.from(this.hooks.keys());
  }

  // Private helper methods

  private findHook(pluginId: string, eventName: string): IPluginHookRegistration | undefined {
    const eventHooks = this.hooks.get(eventName);
    if (!eventHooks) {
      return undefined;
    }

    return eventHooks.find(hook => hook.pluginId === pluginId);
  }

  private checkCondition(condition: IPluginHookCondition, data: any): boolean {
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

  private getValueByPath(obj: any, path: string): any {
    return path.split('.').reduce((current, key) => {
      return current && current[key];
    }, obj);
  }

  private generateCorrelationId(): string {
    return `hook_${Date.now()}_${Math.random().toString(36).substring(2)}`;
  }

  private initializeStats(): void {
    // Initialize stats for common events
    const commonEvents = [
      'app.starting', 'app.started', 'app.stopping', 'app.stopped',
      'user.created', 'user.updated', 'user.deleted',
      'order.created', 'order.updated', 'payment.received',
    ];

    for (const eventName of commonEvents) {
      this.initializeStatsForEvent(eventName);
    }
  }

  private initializeStatsForEvent(eventName: string): void {
    if (!this.stats.has(eventName)) {
      this.stats.set(eventName, {
        eventName,
        totalExecutions: 0,
        successfulExecutions: 0,
        failedExecutions: 0,
        averageExecutionTime: 0,
        pluginStats: {},
      });
    }
  }

  private updateStats(eventName: string, pluginId: string, success: boolean, executionTime: number): void {
    // Update event stats
    let eventStats = this.stats.get(eventName);
    if (!eventStats) {
      this.initializeStatsForEvent(eventName);
      eventStats = this.stats.get(eventName)!;
    }

    eventStats.totalExecutions++;
    eventStats.lastExecution = new Date();

    if (success) {
      eventStats.successfulExecutions++;
    } else {
      eventStats.failedExecutions++;
    }

    // Update average execution time
    const totalTime = eventStats.averageExecutionTime * (eventStats.totalExecutions - 1) + executionTime;
    eventStats.averageExecutionTime = totalTime / eventStats.totalExecutions;

    // Update plugin-specific stats
    if (!eventStats.pluginStats[pluginId]) {
      eventStats.pluginStats[pluginId] = {
        executions: 0,
        successes: 0,
        failures: 0,
        averageTime: 0,
      };
    }

    const pluginStats = eventStats.pluginStats[pluginId];
    pluginStats.executions++;

    if (success) {
      pluginStats.successes++;
    } else {
      pluginStats.failures++;
    }

    // Update plugin average time
    const pluginTotalTime = pluginStats.averageTime * (pluginStats.executions - 1) + executionTime;
    pluginStats.averageTime = pluginTotalTime / pluginStats.executions;
  }
}