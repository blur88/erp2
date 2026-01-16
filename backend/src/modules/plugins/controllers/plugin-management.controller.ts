// @ts-nocheck
// TypeScript checking disabled for this file - PluginsModule is currently disabled
import {
  Controller,
  Get,
  Post,
  Put,
  Delete,
  Patch,
  Body,
  Param,
  Query,
  UploadedFile,
  UseInterceptors,
  HttpStatus,
  HttpException,
  Request,
  Logger,
} from '@nestjs/common';
import { FileInterceptor } from '@nestjs/platform-express';
import {
  ApiTags,
  ApiOperation,
  ApiResponse,
  ApiParam,
  ApiQuery,
  ApiBody,
  ApiConsumes,
} from '@nestjs/swagger';
import { PluginLifecycleService } from '../services/plugin-lifecycle.service';
import { PluginRegistryService } from '../services/plugin-registry.service';
import { PluginConfigurationService } from '../services/plugin-configuration.service';
import { PluginSecurityService } from '../security/plugin-security.service';
import { PluginDatabaseService } from '../database/plugin-database.service';
import { PluginHooksService } from '../hooks/plugin-hooks.service';
import {
  InstallPluginDto,
  UpdatePluginDto,
  ConfigurePluginDto,
  PluginQueryDto,
  PluginHealthCheckDto,
  PluginPermissionDto,
  PluginSecurityPolicyDto,
} from '../dto';
import { IPlugin, PluginStatus } from '../interfaces';

/**
 * Plugin Management Controller
 * 
 * Provides comprehensive REST API endpoints for plugin management including:
 * - Plugin lifecycle operations (install, uninstall, activate, deactivate)
 * - Plugin configuration and settings management
 * - Plugin security and permission control
 * - Plugin monitoring and health checks
 * - Plugin marketplace integration
 * - Plugin development tools and debugging
 */
@ApiTags('Plugin Management')
@Controller('api/plugins')
export class PluginManagementController {
  private readonly logger = new Logger(PluginManagementController.name);

  constructor(
    private readonly pluginLifecycle: PluginLifecycleService,
    private readonly pluginRegistry: PluginRegistryService,
    private readonly pluginConfig: PluginConfigurationService,
    private readonly pluginSecurity: PluginSecurityService,
    private readonly pluginDatabase: PluginDatabaseService,
    private readonly pluginHooks: PluginHooksService,
  ) {}

  // Plugin Lifecycle Operations

  @Get()
  @ApiOperation({ summary: 'Get all plugins' })
  @ApiResponse({ status: 200, description: 'List of all plugins' })
  @ApiQuery({ name: 'status', required: false, enum: PluginStatus })
  @ApiQuery({ name: 'type', required: false, type: String })
  @ApiQuery({ name: 'search', required: false, type: String })
  @ApiQuery({ name: 'limit', required: false, type: Number })
  @ApiQuery({ name: 'offset', required: false, type: Number })
  async getAllPlugins(@Query() query: PluginQueryDto) {
    try {
      const plugins = await this.pluginRegistry.findAll({
        status: query.status,
        type: query.type,
        search: query.search,
        limit: query.limit,
        offset: query.offset,
      });

      // Enhance with runtime status
      const enhancedPlugins = await Promise.all(
        plugins.map(async (plugin) => {
          const runtimePlugin = this.pluginRegistry.get(plugin.identifier);
          const health = runtimePlugin ? await runtimePlugin.getHealth() : null;
          
          return {
            ...plugin,
            runtime: {
              loaded: !!runtimePlugin,
              status: runtimePlugin?.getStatus(),
              health,
            },
          };
        })
      );

      return {
        success: true,
        data: enhancedPlugins,
        pagination: {
          total: enhancedPlugins.length,
          limit: query.limit,
          offset: query.offset,
        },
      };

    } catch (error) {
      this.logger.error('Failed to get plugins:', error);
      throw new HttpException(
        { success: false, error: error.message },
        HttpStatus.INTERNAL_SERVER_ERROR,
      );
    }
  }

  @Get(':pluginId')
  @ApiOperation({ summary: 'Get plugin details' })
  @ApiParam({ name: 'pluginId', description: 'Plugin identifier' })
  @ApiResponse({ status: 200, description: 'Plugin details' })
  @ApiResponse({ status: 404, description: 'Plugin not found' })
  async getPlugin(@Param('pluginId') pluginId: string) {
    try {
      const plugin = await this.pluginRegistry.findById(pluginId);
      if (!plugin) {
        throw new HttpException(
          { success: false, error: 'Plugin not found' },
          HttpStatus.NOT_FOUND,
        );
      }

      // Get runtime information
      const runtimePlugin = this.pluginRegistry.get(pluginId);
      const health = runtimePlugin ? await runtimePlugin.getHealth() : null;
      const hooks = this.pluginHooks.getPluginHooks(pluginId);
      const entities = this.pluginDatabase.getPluginEntities(pluginId);

      return {
        success: true,
        data: {
          ...plugin,
          runtime: {
            loaded: !!runtimePlugin,
            status: runtimePlugin?.getStatus(),
            health,
            hooks: hooks.length,
            entities: entities.length,
          },
        },
      };

    } catch (error) {
      if (error instanceof HttpException) throw error;
      
      this.logger.error(`Failed to get plugin ${pluginId}:`, error);
      throw new HttpException(
        { success: false, error: error.message },
        HttpStatus.INTERNAL_SERVER_ERROR,
      );
    }
  }

  @Post('install')
  @ApiOperation({ summary: 'Install a plugin' })
  @ApiConsumes('multipart/form-data')
  @ApiBody({ type: InstallPluginDto })
  @ApiResponse({ status: 201, description: 'Plugin installed successfully' })
  @ApiResponse({ status: 400, description: 'Invalid plugin package' })
  @UseInterceptors(FileInterceptor('file'))
  async installPlugin(
    @UploadedFile() file: Express.Multer.File,
    @Body() installDto: InstallPluginDto,
  ) {
    try {
      const result = await this.pluginLifecycle.install(
        file?.buffer || installDto.source,
        {
          force: installDto.force,
          skipValidation: installDto.skipValidation,
        }
      );

      const statusCode = result.success ? HttpStatus.CREATED : HttpStatus.BAD_REQUEST;
      return { ...result, timestamp: new Date() };

    } catch (error) {
      this.logger.error('Plugin installation failed:', error);
      throw new HttpException(
        { 
          success: false, 
          error: error.message,
          timestamp: new Date(),
        },
        HttpStatus.BAD_REQUEST,
      );
    }
  }

  @Delete(':pluginId')
  @ApiOperation({ summary: 'Uninstall a plugin' })
  @ApiParam({ name: 'pluginId', description: 'Plugin identifier' })
  @ApiQuery({ name: 'keepData', required: false, type: Boolean })
  @ApiQuery({ name: 'force', required: false, type: Boolean })
  @ApiResponse({ status: 200, description: 'Plugin uninstalled successfully' })
  @ApiResponse({ status: 404, description: 'Plugin not found' })
  async uninstallPlugin(
    @Param('pluginId') pluginId: string,
    @Query('keepData') keepData: boolean = false,
    @Query('force') force: boolean = false,
  ) {
    try {
      const result = await this.pluginLifecycle.uninstall(pluginId, {
        keepData,
        force,
      });

      return { ...result, timestamp: new Date() };

    } catch (error) {
      this.logger.error(`Plugin uninstallation failed for ${pluginId}:`, error);
      throw new HttpException(
        { 
          success: false, 
          error: error.message,
          timestamp: new Date(),
        },
        HttpStatus.INTERNAL_SERVER_ERROR,
      );
    }
  }

  @Post(':pluginId/activate')
  @ApiOperation({ summary: 'Activate a plugin' })
  @ApiParam({ name: 'pluginId', description: 'Plugin identifier' })
  @ApiResponse({ status: 200, description: 'Plugin activated successfully' })
  async activatePlugin(
    @Param('pluginId') pluginId: string,
  ) {
    try {
      const result = await this.pluginLifecycle.activate(pluginId, {});

      return { ...result, timestamp: new Date() };

    } catch (error) {
      this.logger.error(`Plugin activation failed for ${pluginId}:`, error);
      throw new HttpException(
        { 
          success: false, 
          error: error.message,
          timestamp: new Date(),
        },
        HttpStatus.INTERNAL_SERVER_ERROR,
      );
    }
  }

  @Post(':pluginId/deactivate')
  @ApiOperation({ summary: 'Deactivate a plugin' })
  @ApiParam({ name: 'pluginId', description: 'Plugin identifier' })
  @ApiResponse({ status: 200, description: 'Plugin deactivated successfully' })
  async deactivatePlugin(
    @Param('pluginId') pluginId: string,
  ) {
    try {
      const result = await this.pluginLifecycle.deactivate(pluginId, {});

      return { ...result, timestamp: new Date() };

    } catch (error) {
      this.logger.error(`Plugin deactivation failed for ${pluginId}:`, error);
      throw new HttpException(
        { 
          success: false, 
          error: error.message,
          timestamp: new Date(),
        },
        HttpStatus.INTERNAL_SERVER_ERROR,
      );
    }
  }

  @Put(':pluginId/update')
  @ApiOperation({ summary: 'Update a plugin' })
  @ApiParam({ name: 'pluginId', description: 'Plugin identifier' })
  @ApiBody({ type: UpdatePluginDto })
  @ApiResponse({ status: 200, description: 'Plugin updated successfully' })
  async updatePlugin(
    @Param('pluginId') pluginId: string,
    @Body() updateDto: UpdatePluginDto,
  ) {
    try {
      const result = await this.pluginLifecycle.update(
        pluginId,
        updateDto.version,
        {
          force: updateDto.force,
          backup: updateDto.backup,
        }
      );

      return { ...result, timestamp: new Date() };

    } catch (error) {
      this.logger.error(`Plugin update failed for ${pluginId}:`, error);
      throw new HttpException(
        { 
          success: false, 
          error: error.message,
          timestamp: new Date(),
        },
        HttpStatus.INTERNAL_SERVER_ERROR,
      );
    }
  }

  @Post(':pluginId/restart')
  @ApiOperation({ summary: 'Restart a plugin' })
  @ApiParam({ name: 'pluginId', description: 'Plugin identifier' })
  @ApiResponse({ status: 200, description: 'Plugin restarted successfully' })
  async restartPlugin(
    @Param('pluginId') pluginId: string,
  ) {
    try {
      const result = await this.pluginLifecycle.restart(pluginId, {});

      return { ...result, timestamp: new Date() };

    } catch (error) {
      this.logger.error(`Plugin restart failed for ${pluginId}:`, error);
      throw new HttpException(
        { 
          success: false, 
          error: error.message,
          timestamp: new Date(),
        },
        HttpStatus.INTERNAL_SERVER_ERROR,
      );
    }
  }

  // Configuration Management

  @Get(':pluginId/config')
  @ApiOperation({ summary: 'Get plugin configuration' })
  @ApiParam({ name: 'pluginId', description: 'Plugin identifier' })
  @ApiResponse({ status: 200, description: 'Plugin configuration' })
  async getPluginConfig(@Param('pluginId') pluginId: string) {
    try {
      const [config, schema, defaultConfig] = await Promise.all([
        this.pluginConfig.getConfig(pluginId),
        this.pluginConfig.getConfigSchema(pluginId),
        this.pluginConfig.getDefaultConfig(pluginId),
      ]);

      return {
        success: true,
        data: {
          config,
          schema,
          defaultConfig,
        },
      };

    } catch (error) {
      this.logger.error(`Failed to get config for plugin ${pluginId}:`, error);
      throw new HttpException(
        { success: false, error: error.message },
        HttpStatus.INTERNAL_SERVER_ERROR,
      );
    }
  }

  @Put(':pluginId/config')
  @ApiOperation({ summary: 'Update plugin configuration' })
  @ApiParam({ name: 'pluginId', description: 'Plugin identifier' })
  @ApiBody({ type: ConfigurePluginDto })
  @ApiResponse({ status: 200, description: 'Configuration updated successfully' })
  async updatePluginConfig(
    @Param('pluginId') pluginId: string,
    @Body() configDto: ConfigurePluginDto,
  ) {
    try {
      const result = await this.pluginLifecycle.configure(
        pluginId,
        configDto.config,
        {
          validate: configDto.validate,
          merge: configDto.merge,
        }
      );

      return { ...result, timestamp: new Date() };

    } catch (error) {
      this.logger.error(`Failed to update config for plugin ${pluginId}:`, error);
      throw new HttpException(
        { 
          success: false, 
          error: error.message,
          timestamp: new Date(),
        },
        HttpStatus.BAD_REQUEST,
      );
    }
  }

  @Post(':pluginId/config/reset')
  @ApiOperation({ summary: 'Reset plugin configuration to defaults' })
  @ApiParam({ name: 'pluginId', description: 'Plugin identifier' })
  @ApiQuery({ name: 'keys', required: false, type: [String] })
  @ApiResponse({ status: 200, description: 'Configuration reset successfully' })
  async resetPluginConfig(
    @Param('pluginId') pluginId: string,
    @Query('keys') keys?: string[],
  ) {
    try {
      await this.pluginConfig.resetConfig(pluginId, keys);

      return {
        success: true,
        message: 'Configuration reset successfully',
        timestamp: new Date(),
      };

    } catch (error) {
      this.logger.error(`Failed to reset config for plugin ${pluginId}:`, error);
      throw new HttpException(
        { success: false, error: error.message },
        HttpStatus.INTERNAL_SERVER_ERROR,
      );
    }
  }

  @Get(':pluginId/config/history')
  @ApiOperation({ summary: 'Get plugin configuration history' })
  @ApiParam({ name: 'pluginId', description: 'Plugin identifier' })
  @ApiQuery({ name: 'limit', required: false, type: Number })
  @ApiResponse({ status: 200, description: 'Configuration history' })
  async getPluginConfigHistory(
    @Param('pluginId') pluginId: string,
    @Query('limit') limit: number = 10,
  ) {
    try {
      const history = await this.pluginConfig.getConfigHistory(pluginId, limit);

      return {
        success: true,
        data: history,
      };

    } catch (error) {
      this.logger.error(`Failed to get config history for plugin ${pluginId}:`, error);
      throw new HttpException(
        { success: false, error: error.message },
        HttpStatus.INTERNAL_SERVER_ERROR,
      );
    }
  }

  // Security and Permissions

  @Get(':pluginId/security/scan')
  @ApiOperation({ summary: 'Run security scan on plugin' })
  @ApiParam({ name: 'pluginId', description: 'Plugin identifier' })
  @ApiResponse({ status: 200, description: 'Security scan results' })
  async scanPluginSecurity(@Param('pluginId') pluginId: string) {
    try {
      const plugin = await this.pluginRegistry.findById(pluginId);
      if (!plugin || !plugin.installPath) {
        throw new HttpException(
          { success: false, error: 'Plugin not found or not installed' },
          HttpStatus.NOT_FOUND,
        );
      }

      const scanResult = await this.pluginSecurity.scanPlugin(plugin.installPath);

      return {
        success: true,
        data: scanResult,
      };

    } catch (error) {
      if (error instanceof HttpException) throw error;
      
      this.logger.error(`Security scan failed for plugin ${pluginId}:`, error);
      throw new HttpException(
        { success: false, error: error.message },
        HttpStatus.INTERNAL_SERVER_ERROR,
      );
    }
  }

  @Get(':pluginId/permissions')
  @ApiOperation({ summary: 'Get plugin permissions' })
  @ApiParam({ name: 'pluginId', description: 'Plugin identifier' })
  @ApiResponse({ status: 200, description: 'Plugin permissions' })
  async getPluginPermissions(@Param('pluginId') pluginId: string) {
    try {
      const plugin = await this.pluginRegistry.findById(pluginId);
      if (!plugin) {
        throw new HttpException(
          { success: false, error: 'Plugin not found' },
          HttpStatus.NOT_FOUND,
        );
      }

      return {
        success: true,
        data: {
          requested: plugin.permissions,
          granted: plugin.grantedPermissions,
        },
      };

    } catch (error) {
      if (error instanceof HttpException) throw error;
      
      this.logger.error(`Failed to get permissions for plugin ${pluginId}:`, error);
      throw new HttpException(
        { success: false, error: error.message },
        HttpStatus.INTERNAL_SERVER_ERROR,
      );
    }
  }

  @Put(':pluginId/permissions')
  @ApiOperation({ summary: 'Update plugin permissions' })
  @ApiParam({ name: 'pluginId', description: 'Plugin identifier' })
  @ApiBody({ type: PluginPermissionDto })
  @ApiResponse({ status: 200, description: 'Permissions updated successfully' })
  async updatePluginPermissions(
    @Param('pluginId') pluginId: string,
    @Body() permissionDto: PluginPermissionDto,
  ) {
    try {
      const validationResult = await this.pluginSecurity.validatePermissions(
        pluginId,
        permissionDto.permissions,
      );

      if (!validationResult.valid) {
        return {
          success: false,
          violations: validationResult.violations,
          allowedPermissions: validationResult.allowedPermissions,
        };
      }

      // Update plugin permissions in database
      await this.pluginRegistry.updatePermissions(pluginId, permissionDto.permissions);

      return {
        success: true,
        message: 'Permissions updated successfully',
        grantedPermissions: validationResult.allowedPermissions,
        timestamp: new Date(),
      };

    } catch (error) {
      this.logger.error(`Failed to update permissions for plugin ${pluginId}:`, error);
      throw new HttpException(
        { success: false, error: error.message },
        HttpStatus.INTERNAL_SERVER_ERROR,
      );
    }
  }

  @Get(':pluginId/security/policy')
  @ApiOperation({ summary: 'Get plugin security policy' })
  @ApiParam({ name: 'pluginId', description: 'Plugin identifier' })
  @ApiResponse({ status: 200, description: 'Security policy' })
  async getPluginSecurityPolicy(@Param('pluginId') pluginId: string) {
    try {
      const policy = await this.pluginSecurity.getSecurityPolicy(pluginId);

      return {
        success: true,
        data: policy,
      };

    } catch (error) {
      this.logger.error(`Failed to get security policy for plugin ${pluginId}:`, error);
      throw new HttpException(
        { success: false, error: error.message },
        HttpStatus.INTERNAL_SERVER_ERROR,
      );
    }
  }

  @Put(':pluginId/security/policy')
  @ApiOperation({ summary: 'Update plugin security policy' })
  @ApiParam({ name: 'pluginId', description: 'Plugin identifier' })
  @ApiBody({ type: PluginSecurityPolicyDto })
  @ApiResponse({ status: 200, description: 'Security policy updated successfully' })
  async updatePluginSecurityPolicy(
    @Param('pluginId') pluginId: string,
    @Body() policyDto: PluginSecurityPolicyDto,
  ) {
    try {
      await this.pluginSecurity.setSecurityPolicy(pluginId, policyDto.policy);

      return {
        success: true,
        message: 'Security policy updated successfully',
        timestamp: new Date(),
      };

    } catch (error) {
      this.logger.error(`Failed to update security policy for plugin ${pluginId}:`, error);
      throw new HttpException(
        { success: false, error: error.message },
        HttpStatus.INTERNAL_SERVER_ERROR,
      );
    }
  }

  // Monitoring and Health

  @Get(':pluginId/health')
  @ApiOperation({ summary: 'Get plugin health status' })
  @ApiParam({ name: 'pluginId', description: 'Plugin identifier' })
  @ApiResponse({ status: 200, description: 'Plugin health status' })
  async getPluginHealth(@Param('pluginId') pluginId: string) {
    try {
      const plugin = this.pluginRegistry.get(pluginId);
      if (!plugin) {
        return {
          success: false,
          status: 'not_loaded',
          message: 'Plugin is not loaded',
          timestamp: new Date(),
        };
      }

      const health = await plugin.getHealth();
      const resourceUsage = await this.pluginSecurity.monitorResources(pluginId);

      return {
        success: true,
        data: {
          ...health,
          resources: resourceUsage,
        },
      };

    } catch (error) {
      this.logger.error(`Health check failed for plugin ${pluginId}:`, error);
      return {
        success: false,
        status: 'unhealthy',
        message: error.message,
        timestamp: new Date(),
      };
    }
  }

  @Get(':pluginId/metrics')
  @ApiOperation({ summary: 'Get plugin performance metrics' })
  @ApiParam({ name: 'pluginId', description: 'Plugin identifier' })
  @ApiResponse({ status: 200, description: 'Plugin performance metrics' })
  async getPluginMetrics(@Param('pluginId') pluginId: string) {
    try {
      const [registryStats, hookStats, securityAudit] = await Promise.all([
        this.pluginRegistry.getPluginStats(pluginId),
        this.pluginHooks.getStats(pluginId),
        this.pluginSecurity.getSecurityAudit(pluginId, 10),
      ]);

      return {
        success: true,
        data: {
          registry: registryStats,
          hooks: hookStats,
          security: {
            auditEntries: securityAudit.length,
            lastAudit: securityAudit[0]?.timestamp,
          },
          timestamp: new Date(),
        },
      };

    } catch (error) {
      this.logger.error(`Failed to get metrics for plugin ${pluginId}:`, error);
      throw new HttpException(
        { success: false, error: error.message },
        HttpStatus.INTERNAL_SERVER_ERROR,
      );
    }
  }

  // Plugin Development and Debugging

  @Post(':pluginId/execute')
  @ApiOperation({ summary: 'Execute plugin method for debugging' })
  @ApiParam({ name: 'pluginId', description: 'Plugin identifier' })
  @ApiBody({ schema: { properties: { method: { type: 'string' }, params: { type: 'object' } } } })
  @ApiResponse({ status: 200, description: 'Method execution result' })
  async executePluginMethod(
    @Param('pluginId') pluginId: string,
    @Body() body: { method: string; params?: any },
  ) {
    try {
      const plugin = this.pluginRegistry.get(pluginId);
      if (!plugin) {
        throw new HttpException(
          { success: false, error: 'Plugin not found or not loaded' },
          HttpStatus.NOT_FOUND,
        );
      }

      const result = await plugin.execute(body.method, body.params);

      return {
        success: true,
        data: result,
        timestamp: new Date(),
      };

    } catch (error) {
      this.logger.error(`Method execution failed for plugin ${pluginId}:`, error);
      throw new HttpException(
        { success: false, error: error.message },
        HttpStatus.INTERNAL_SERVER_ERROR,
      );
    }
  }

  @Get(':pluginId/hooks')
  @ApiOperation({ summary: 'Get plugin hooks' })
  @ApiParam({ name: 'pluginId', description: 'Plugin identifier' })
  @ApiResponse({ status: 200, description: 'Plugin hooks' })
  async getPluginHooks(@Param('pluginId') pluginId: string) {
    try {
      const hooks = this.pluginHooks.getPluginHooks(pluginId);

      return {
        success: true,
        data: hooks,
      };

    } catch (error) {
      this.logger.error(`Failed to get hooks for plugin ${pluginId}:`, error);
      throw new HttpException(
        { success: false, error: error.message },
        HttpStatus.INTERNAL_SERVER_ERROR,
      );
    }
  }

  @Get(':pluginId/entities')
  @ApiOperation({ summary: 'Get plugin database entities' })
  @ApiParam({ name: 'pluginId', description: 'Plugin identifier' })
  @ApiResponse({ status: 200, description: 'Plugin database entities' })
  async getPluginEntities(@Param('pluginId') pluginId: string) {
    try {
      const entities = this.pluginDatabase.getPluginEntities(pluginId);

      return {
        success: true,
        data: entities,
      };

    } catch (error) {
      this.logger.error(`Failed to get entities for plugin ${pluginId}:`, error);
      throw new HttpException(
        { success: false, error: error.message },
        HttpStatus.INTERNAL_SERVER_ERROR,
      );
    }
  }

  // System-level Operations

  @Get('system/stats')
  @ApiOperation({ summary: 'Get plugin system statistics' })
  @ApiResponse({ status: 200, description: 'System statistics' })
  async getSystemStats() {
    try {
      const stats = this.pluginRegistry.getStats();
      const allHealthChecks = await this.pluginRegistry.checkAllPluginsHealth();

      return {
        success: true,
        data: {
          ...stats,
          health: {
            total: allHealthChecks.length,
            healthy: allHealthChecks.filter(h => h.health.status === 'healthy').length,
            unhealthy: allHealthChecks.filter(h => h.health.status === 'unhealthy').length,
          },
        },
      };

    } catch (error) {
      this.logger.error('Failed to get system stats:', error);
      throw new HttpException(
        { success: false, error: error.message },
        HttpStatus.INTERNAL_SERVER_ERROR,
      );
    }
  }

  @Post('system/reload')
  @ApiOperation({ summary: 'Reload all plugins' })
  @ApiResponse({ status: 200, description: 'Plugins reloaded successfully' })
  async reloadAllPlugins() {
    try {
      await this.pluginRegistry.discoverPlugins();

      return {
        success: true,
        message: 'All plugins reloaded successfully',
        timestamp: new Date(),
      };

    } catch (error) {
      this.logger.error('Failed to reload plugins:', error);
      throw new HttpException(
        { success: false, error: error.message },
        HttpStatus.INTERNAL_SERVER_ERROR,
      );
    }
  }
}