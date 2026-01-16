// @ts-nocheck
// TypeScript checking disabled for this file - PluginsModule is currently disabled
import { Injectable, Logger, OnModuleInit } from '@nestjs/common';
import { InjectDataSource, InjectConnection } from '@nestjs/typeorm';
import { DataSource, Connection, EntitySchema, Repository, EntityMetadata } from 'typeorm';
import { EventEmitter2 } from '@nestjs/event-emitter';
import { Plugin } from '../../../database/entities/plugin.entity';
import {
  IPluginDatabaseManager,
  IPluginEntity,
  IPluginEntitySchema,
  IPluginMigration,
  IPluginDatabaseConnection,
} from '../interfaces/plugin-database.interface';
import * as fs from 'fs/promises';
import * as path from 'path';

/**
 * Plugin Database Service
 * 
 * Manages database integration for plugins including:
 * - Dynamic entity registration and management
 * - Plugin-specific database connections
 * - Migration system for plugin databases
 * - Schema validation and conflict resolution
 * - Data cleanup on plugin uninstall
 */
@Injectable()
export class PluginDatabaseService implements IPluginDatabaseManager, OnModuleInit {
  private readonly logger = new Logger(PluginDatabaseService.name);
  private readonly pluginEntities = new Map<string, IPluginEntity[]>();
  private readonly pluginConnections = new Map<string, IPluginDatabaseConnection>();
  private readonly pluginRepositories = new Map<string, Map<string, Repository<any>>>();
  private readonly registeredSchemas = new Map<string, EntitySchema[]>();

  constructor(
    @InjectDataSource()
    private readonly dataSource: DataSource,
    private readonly eventEmitter: EventEmitter2,
  ) {}

  async onModuleInit() {
    this.logger.log('Initializing Plugin Database Service...');
    await this.initializePluginDatabases();
  }

  /**
   * Register plugin entities dynamically
   */
  async registerPluginEntities(
    pluginId: string,
    entities: IPluginEntity[],
    options: {
      createTables?: boolean;
      validateSchema?: boolean;
      conflictResolution?: 'error' | 'skip' | 'override';
    } = {},
  ): Promise<{
    success: boolean;
    registeredEntities: string[];
    errors: string[];
    warnings: string[];
  }> {
    this.logger.log(`Registering entities for plugin: ${pluginId}`);

    const result = {
      success: true,
      registeredEntities: [],
      errors: [],
      warnings: [],
    };

    try {
      // Validate entities first if requested
      if (options.validateSchema !== false) {
        const validationResult = await this.validatePluginEntities(pluginId, entities);
        if (validationResult.errors.length > 0) {
          result.errors.push(...validationResult.errors);
          if (options.conflictResolution === 'error') {
            result.success = false;
            return result;
          }
        }
        result.warnings.push(...validationResult.warnings);
      }

      // Convert plugin entities to TypeORM EntitySchemas
      const entitySchemas = await this.convertToEntitySchemas(pluginId, entities);
      const validSchemas = [];

      for (const schema of entitySchemas) {
        try {
          // Check for naming conflicts
          const existingEntity = this.dataSource.entityMetadatas.find(
            meta => meta.tableName === schema.options.tableName
          );

          if (existingEntity) {
            const conflictMessage = `Table '${schema.options.tableName}' already exists`;
            
            switch (options.conflictResolution) {
              case 'error':
                result.errors.push(conflictMessage);
                continue;
              case 'skip':
                result.warnings.push(`${conflictMessage}, skipping`);
                continue;
              case 'override':
                result.warnings.push(`${conflictMessage}, overriding`);
                // Remove existing entity metadata
                await this.removeEntityFromConnection(existingEntity.name);
                break;
              default:
                result.errors.push(conflictMessage);
                continue;
            }
          }

          validSchemas.push(schema);
          result.registeredEntities.push(schema.options.name);

        } catch (error) {
          result.errors.push(`Failed to process entity ${schema.options.name}: ${error.message}`);
        }
      }

      if (validSchemas.length > 0) {
        // Add entities to the connection
        await this.addEntitiesToConnection(pluginId, validSchemas);

        // Create tables if requested
        if (options.createTables) {
          await this.createPluginTables(pluginId, validSchemas);
        }

        // Store plugin entities
        this.pluginEntities.set(pluginId, entities);
        this.registeredSchemas.set(pluginId, validSchemas);

        // Create repositories for plugin entities
        await this.createPluginRepositories(pluginId, validSchemas);
      }

      // Emit registration event
      await this.eventEmitter.emitAsync('plugin.database.entities.registered', {
        pluginId,
        entities: result.registeredEntities,
        success: result.success,
      });

      this.logger.log(`Successfully registered ${result.registeredEntities.length} entities for plugin: ${pluginId}`);

    } catch (error) {
      this.logger.error(`Failed to register entities for plugin ${pluginId}:`, error);
      result.success = false;
      result.errors.push(error.message);
    }

    return result;
  }

  /**
   * Unregister plugin entities
   */
  async unregisterPluginEntities(
    pluginId: string,
    options: {
      dropTables?: boolean;
      cleanupData?: boolean;
      backup?: boolean;
    } = {},
  ): Promise<{
    success: boolean;
    unregisteredEntities: string[];
    errors: string[];
  }> {
    this.logger.log(`Unregistering entities for plugin: ${pluginId}`);

    const result = {
      success: true,
      unregisteredEntities: [],
      errors: [],
    };

    try {
      const entitySchemas = this.registeredSchemas.get(pluginId) || [];

      if (entitySchemas.length === 0) {
        this.logger.warn(`No entities registered for plugin: ${pluginId}`);
        return result;
      }

      // Create backup if requested
      if (options.backup) {
        await this.backupPluginData(pluginId);
      }

      // Drop tables if requested
      if (options.dropTables) {
        await this.dropPluginTables(pluginId, entitySchemas);
      } else if (options.cleanupData) {
        // Just clean data but keep tables
        await this.cleanupPluginData(pluginId, entitySchemas);
      }

      // Remove repositories
      this.pluginRepositories.delete(pluginId);

      // Remove entities from connection
      for (const schema of entitySchemas) {
        try {
          await this.removeEntityFromConnection(schema.options.name);
          result.unregisteredEntities.push(schema.options.name);
        } catch (error) {
          result.errors.push(`Failed to unregister entity ${schema.options.name}: ${error.message}`);
        }
      }

      // Clear stored data
      this.pluginEntities.delete(pluginId);
      this.registeredSchemas.delete(pluginId);

      // Emit unregistration event
      await this.eventEmitter.emitAsync('plugin.database.entities.unregistered', {
        pluginId,
        entities: result.unregisteredEntities,
        success: result.success,
      });

      this.logger.log(`Successfully unregistered ${result.unregisteredEntities.length} entities for plugin: ${pluginId}`);

    } catch (error) {
      this.logger.error(`Failed to unregister entities for plugin ${pluginId}:`, error);
      result.success = false;
      result.errors.push(error.message);
    }

    return result;
  }

  /**
   * Get repository for plugin entity
   */
  async getPluginRepository<T = any>(
    pluginId: string,
    entityName: string,
  ): Promise<Repository<T> | null> {
    const pluginRepos = this.pluginRepositories.get(pluginId);
    if (!pluginRepos) {
      return null;
    }

    return pluginRepos.get(entityName) as Repository<T> || null;
  }

  /**
   * Execute plugin migration
   */
  async executeMigration(
    pluginId: string,
    migration: IPluginMigration,
    direction: 'up' | 'down' = 'up',
  ): Promise<{
    success: boolean;
    executedAt: Date;
    error?: string;
  }> {
    this.logger.log(`Executing ${direction} migration for plugin ${pluginId}: ${migration.name}`);

    try {
      const connection = this.getPluginConnection(pluginId);
      const queryRunner = connection.createQueryRunner();

      try {
        await queryRunner.connect();
        await queryRunner.startTransaction();

        // Execute migration
        if (direction === 'up') {
          await migration.up(queryRunner);
        } else {
          await migration.down(queryRunner);
        }

        // Record migration in plugin migrations table
        await this.recordMigration(pluginId, migration, direction, queryRunner);

        await queryRunner.commitTransaction();

        const result = {
          success: true,
          executedAt: new Date(),
        };

        // Emit migration event
        await this.eventEmitter.emitAsync('plugin.database.migration.executed', {
          pluginId,
          migration: migration.name,
          direction,
          success: true,
        });

        this.logger.log(`Successfully executed ${direction} migration: ${migration.name}`);
        return result;

      } catch (error) {
        await queryRunner.rollbackTransaction();
        throw error;
      } finally {
        await queryRunner.release();
      }

    } catch (error) {
      this.logger.error(`Migration ${direction} failed for ${migration.name}:`, error);

      // Emit migration failed event
      await this.eventEmitter.emitAsync('plugin.database.migration.failed', {
        pluginId,
        migration: migration.name,
        direction,
        error: error.message,
      });

      return {
        success: false,
        executedAt: new Date(),
        error: error.message,
      };
    }
  }

  /**
   * Get plugin migration history
   */
  async getMigrationHistory(pluginId: string): Promise<Array<{
    name: string;
    executedAt: Date;
    direction: 'up' | 'down';
    checksum?: string;
  }>> {
    try {
      const connection = this.getPluginConnection(pluginId);
      const queryRunner = connection.createQueryRunner();

      const result = await queryRunner.query(`
        SELECT name, executed_at as executedAt, direction, checksum
        FROM plugin_migrations 
        WHERE plugin_id = ? 
        ORDER BY executed_at DESC
      `, [pluginId]);

      await queryRunner.release();

      return result;

    } catch (error) {
      this.logger.error(`Failed to get migration history for plugin ${pluginId}:`, error);
      return [];
    }
  }

  /**
   * Create database connection for plugin
   */
  async createPluginConnection(
    pluginId: string,
    config: {
      type?: 'sqlite' | 'postgres' | 'mysql' | 'mariadb';
      database?: string;
      host?: string;
      port?: number;
      username?: string;
      password?: string;
      useMainConnection?: boolean;
    } = {},
  ): Promise<IPluginDatabaseConnection> {
    this.logger.log(`Creating database connection for plugin: ${pluginId}`);

    try {
      let connection: DataSource;

      if (config.useMainConnection !== false) {
        // Use main application connection
        connection = this.dataSource;
      } else {
        // Create dedicated connection for plugin
        const connectionOptions = {
          type: config.type || 'sqlite',
          database: config.database || `plugins/${pluginId}.db`,
          host: config.host,
          port: config.port,
          username: config.username,
          password: config.password,
          entities: [],
          synchronize: false, // Migrations should handle schema changes
          logging: false,
        };

        connection = new DataSource(connectionOptions as any);
        await connection.initialize();
      }

      const pluginConnection: IPluginDatabaseConnection = {
        pluginId,
        connection,
        config,
        createdAt: new Date(),
        isActive: true,
      };

      this.pluginConnections.set(pluginId, pluginConnection);

      // Create plugin migrations table if it doesn't exist
      await this.createPluginMigrationsTable(connection);

      return pluginConnection;

    } catch (error) {
      this.logger.error(`Failed to create database connection for plugin ${pluginId}:`, error);
      throw error;
    }
  }

  /**
   * Get plugin database connection
   */
  getPluginConnection(pluginId: string): DataSource {
    const pluginConnection = this.pluginConnections.get(pluginId);
    if (!pluginConnection) {
      // Fallback to main connection
      return this.dataSource;
    }
    return pluginConnection.connection;
  }

  /**
   * Close plugin database connection
   */
  async closePluginConnection(pluginId: string): Promise<void> {
    const pluginConnection = this.pluginConnections.get(pluginId);
    if (!pluginConnection) {
      return;
    }

    try {
      if (pluginConnection.connection !== this.dataSource) {
        await pluginConnection.connection.destroy();
      }
      
      pluginConnection.isActive = false;
      this.pluginConnections.delete(pluginId);

      this.logger.log(`Closed database connection for plugin: ${pluginId}`);
    } catch (error) {
      this.logger.error(`Failed to close database connection for plugin ${pluginId}:`, error);
      throw error;
    }
  }

  /**
   * Validate plugin entities against existing schema
   */
  async validatePluginEntities(
    pluginId: string,
    entities: IPluginEntity[],
  ): Promise<{
    valid: boolean;
    errors: string[];
    warnings: string[];
  }> {
    const result = {
      valid: true,
      errors: [],
      warnings: [],
    };

    try {
      for (const entity of entities) {
        // Validate entity structure
        if (!entity.name || !entity.tableName) {
          result.errors.push(`Invalid entity: name and tableName are required`);
          continue;
        }

        // Check for naming conflicts
        const existingEntity = this.dataSource.entityMetadatas.find(
          meta => meta.tableName === entity.tableName || meta.name === entity.name
        );

        if (existingEntity) {
          result.warnings.push(`Entity '${entity.name}' conflicts with existing entity`);
        }

        // Validate columns
        if (!entity.columns || Object.keys(entity.columns).length === 0) {
          result.errors.push(`Entity '${entity.name}' has no columns defined`);
          continue;
        }

        // Validate column definitions
        for (const [columnName, column] of Object.entries(entity.columns)) {
          if (!column.type) {
            result.errors.push(`Column '${columnName}' in entity '${entity.name}' missing type`);
          }

          // Check for reserved column names
          const reservedNames = ['id', 'created_at', 'updated_at', 'deleted_at'];
          if (reservedNames.includes(columnName.toLowerCase()) && !column.allowReserved) {
            result.warnings.push(`Column '${columnName}' uses reserved name in entity '${entity.name}'`);
          }
        }

        // Validate relationships
        if (entity.relations) {
          for (const [relationName, relation] of Object.entries(entity.relations)) {
            if (!relation.target || !relation.type) {
              result.errors.push(`Relation '${relationName}' in entity '${entity.name}' missing target or type`);
            }
          }
        }
      }

      result.valid = result.errors.length === 0;

    } catch (error) {
      result.errors.push(`Validation failed: ${error.message}`);
      result.valid = false;
    }

    return result;
  }

  /**
   * Get all entities registered by a plugin
   */
  getPluginEntities(pluginId: string): IPluginEntity[] {
    return this.pluginEntities.get(pluginId) || [];
  }

  /**
   * Check if plugin has database access
   */
  hasPluginDatabaseAccess(pluginId: string): boolean {
    return this.pluginConnections.has(pluginId) || this.pluginEntities.has(pluginId);
  }

  // Private helper methods

  private async initializePluginDatabases(): Promise<void> {
    try {
      // Ensure plugins directory exists
      const pluginsDir = path.join(process.cwd(), 'plugins');
      await fs.mkdir(pluginsDir, { recursive: true });

      // Create plugin migrations table in main connection
      await this.createPluginMigrationsTable(this.dataSource);

      this.logger.log('Plugin database system initialized');
    } catch (error) {
      this.logger.error('Failed to initialize plugin database system:', error);
    }
  }

  private async convertToEntitySchemas(
    pluginId: string,
    entities: IPluginEntity[],
  ): Promise<EntitySchema[]> {
    const schemas = [];

    for (const entity of entities) {
      const schema = new EntitySchema({
        name: entity.name,
        tableName: `plugin_${pluginId}_${entity.tableName}`,
        columns: this.convertColumns(entity.columns),
        relations: this.convertRelations(entity.relations || {}),
        indices: entity.indices,
        uniques: entity.uniques,
      });

      schemas.push(schema);
    }

    return schemas;
  }

  private convertColumns(columns: Record<string, any>): Record<string, any> {
    const converted = {};

    for (const [name, column] of Object.entries(columns)) {
      converted[name] = {
        type: column.type,
        primary: column.primary,
        nullable: column.nullable,
        unique: column.unique,
        default: column.default,
        length: column.length,
        precision: column.precision,
        scale: column.scale,
        enum: column.enum,
        comment: column.comment,
        generated: column.generated,
        transformer: column.transformer,
      };
    }

    return converted;
  }

  private convertRelations(relations: Record<string, any>): Record<string, any> {
    const converted = {};

    for (const [name, relation] of Object.entries(relations)) {
      converted[name] = {
        type: relation.type,
        target: relation.target,
        joinColumn: relation.joinColumn,
        joinTable: relation.joinTable,
        inverseSide: relation.inverseSide,
        cascade: relation.cascade,
        onDelete: relation.onDelete,
        onUpdate: relation.onUpdate,
        nullable: relation.nullable,
        lazy: relation.lazy,
      };
    }

    return converted;
  }

  private async addEntitiesToConnection(
    pluginId: string,
    entitySchemas: EntitySchema[],
  ): Promise<void> {
    const connection = this.getPluginConnection(pluginId);

    // Add entities to connection metadata
    for (const schema of entitySchemas) {
      connection.entityMetadatas.push(
        connection.buildMetadatas([schema])[0]
      );
    }

    // Update connection options
    const currentEntities = connection.options.entities || [];
    connection.options.entities = [...currentEntities, ...entitySchemas];
  }

  private async removeEntityFromConnection(entityName: string): Promise<void> {
    // Remove entity metadata from connection
    const metadataIndex = this.dataSource.entityMetadatas.findIndex(
      meta => meta.name === entityName
    );
    
    if (metadataIndex >= 0) {
      this.dataSource.entityMetadatas.splice(metadataIndex, 1);
    }
  }

  private async createPluginTables(
    pluginId: string,
    entitySchemas: EntitySchema[],
  ): Promise<void> {
    const connection = this.getPluginConnection(pluginId);
    const queryRunner = connection.createQueryRunner();

    try {
      await queryRunner.connect();

      for (const schema of entitySchemas) {
        const tableName = schema.options.tableName;
        const hasTable = await queryRunner.hasTable(tableName);

        if (!hasTable) {
          await queryRunner.createTable(
            new (require('typeorm').Table)({
              name: tableName,
              columns: Object.entries(schema.options.columns).map(([name, column]: [string, any]) => ({
                name,
                type: column.type,
                isPrimary: column.primary || false,
                isNullable: column.nullable !== false,
                isUnique: column.unique || false,
                default: column.default,
                length: column.length,
                precision: column.precision,
                scale: column.scale,
                enum: column.enum,
                comment: column.comment,
                isGenerated: column.generated || false,
              })),
            }),
            true, // createForeignKeys
          );
        }
      }

    } finally {
      await queryRunner.release();
    }
  }

  private async dropPluginTables(
    pluginId: string,
    entitySchemas: EntitySchema[],
  ): Promise<void> {
    const connection = this.getPluginConnection(pluginId);
    const queryRunner = connection.createQueryRunner();

    try {
      await queryRunner.connect();

      for (const schema of entitySchemas) {
        const tableName = schema.options.tableName;
        const hasTable = await queryRunner.hasTable(tableName);

        if (hasTable) {
          await queryRunner.dropTable(tableName);
        }
      }

    } finally {
      await queryRunner.release();
    }
  }

  private async cleanupPluginData(
    pluginId: string,
    entitySchemas: EntitySchema[],
  ): Promise<void> {
    const connection = this.getPluginConnection(pluginId);
    const queryRunner = connection.createQueryRunner();

    try {
      await queryRunner.connect();

      for (const schema of entitySchemas) {
        const tableName = schema.options.tableName;
        const hasTable = await queryRunner.hasTable(tableName);

        if (hasTable) {
          await queryRunner.query(`DELETE FROM ${tableName}`);
        }
      }

    } finally {
      await queryRunner.release();
    }
  }

  private async createPluginRepositories(
    pluginId: string,
    entitySchemas: EntitySchema[],
  ): Promise<void> {
    const connection = this.getPluginConnection(pluginId);
    const repositories = new Map<string, Repository<any>>();

    for (const schema of entitySchemas) {
      const repository = connection.getRepository(schema);
      repositories.set(schema.options.name, repository);
    }

    this.pluginRepositories.set(pluginId, repositories);
  }

  private async backupPluginData(pluginId: string): Promise<void> {
    // Implementation would create backup of plugin data
    this.logger.log(`Creating backup for plugin: ${pluginId}`);
  }

  private async createPluginMigrationsTable(connection: DataSource): Promise<void> {
    const queryRunner = connection.createQueryRunner();

    try {
      await queryRunner.connect();

      const hasTable = await queryRunner.hasTable('plugin_migrations');
      if (!hasTable) {
        await queryRunner.query(`
          CREATE TABLE plugin_migrations (
            id INTEGER PRIMARY KEY AUTOINCREMENT,
            plugin_id VARCHAR(255) NOT NULL,
            name VARCHAR(255) NOT NULL,
            executed_at DATETIME NOT NULL,
            direction VARCHAR(10) NOT NULL,
            checksum VARCHAR(64),
            UNIQUE(plugin_id, name, direction)
          )
        `);
      }

    } finally {
      await queryRunner.release();
    }
  }

  private async recordMigration(
    pluginId: string,
    migration: IPluginMigration,
    direction: 'up' | 'down',
    queryRunner: any,
  ): Promise<void> {
    const checksum = this.calculateMigrationChecksum(migration);

    await queryRunner.query(`
      INSERT INTO plugin_migrations (plugin_id, name, executed_at, direction, checksum)
      VALUES (?, ?, ?, ?, ?)
    `, [pluginId, migration.name, new Date(), direction, checksum]);
  }

  private calculateMigrationChecksum(migration: IPluginMigration): string {
    // Simple checksum calculation - in production, use proper hashing
    return Buffer.from(migration.name + migration.description).toString('base64');
  }
}