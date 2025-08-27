import { DataSource, QueryRunner } from 'typeorm';

/**
 * Plugin Database Interfaces
 * 
 * Defines interfaces for plugin database integration including
 * entity management, migrations, connections, and data access.
 */

/**
 * Plugin entity definition
 */
export interface IPluginEntity {
  name: string;
  tableName: string;
  columns: Record<string, IPluginEntityColumn>;
  relations?: Record<string, IPluginEntityRelation>;
  indices?: IPluginEntityIndex[];
  uniques?: IPluginEntityUnique[];
  checks?: IPluginEntityCheck[];
  comments?: string;
}

/**
 * Plugin entity column definition
 */
export interface IPluginEntityColumn {
  type: 'int' | 'varchar' | 'text' | 'datetime' | 'boolean' | 'decimal' | 'json' | 'uuid' | 'timestamp';
  primary?: boolean;
  nullable?: boolean;
  unique?: boolean;
  default?: any;
  length?: number;
  precision?: number;
  scale?: number;
  enum?: string[];
  comment?: string;
  generated?: boolean | 'increment' | 'uuid' | 'rowid';
  transformer?: {
    to: (value: any) => any;
    from: (value: any) => any;
  };
  allowReserved?: boolean; // Allow reserved column names like 'id'
}

/**
 * Plugin entity relation definition
 */
export interface IPluginEntityRelation {
  type: 'one-to-one' | 'one-to-many' | 'many-to-one' | 'many-to-many';
  target: string | (() => any);
  joinColumn?: {
    name?: string;
    referencedColumnName?: string;
  };
  joinTable?: {
    name: string;
    joinColumn?: {
      name: string;
      referencedColumnName?: string;
    };
    inverseJoinColumn?: {
      name: string;
      referencedColumnName?: string;
    };
  };
  inverseSide?: string;
  cascade?: boolean | ('insert' | 'update' | 'remove' | 'soft-remove' | 'recover')[];
  onDelete?: 'RESTRICT' | 'CASCADE' | 'SET NULL' | 'DEFAULT' | 'NO ACTION';
  onUpdate?: 'RESTRICT' | 'CASCADE' | 'SET NULL' | 'DEFAULT' | 'NO ACTION';
  nullable?: boolean;
  lazy?: boolean;
}

/**
 * Plugin entity index definition
 */
export interface IPluginEntityIndex {
  name?: string;
  columns: string[];
  unique?: boolean;
  sparse?: boolean;
  where?: string;
}

/**
 * Plugin entity unique constraint
 */
export interface IPluginEntityUnique {
  name?: string;
  columns: string[];
}

/**
 * Plugin entity check constraint
 */
export interface IPluginEntityCheck {
  name?: string;
  expression: string;
}

/**
 * Plugin database schema definition
 */
export interface IPluginEntitySchema {
  version: string;
  entities: IPluginEntity[];
  migrations?: IPluginMigration[];
  seeds?: IPluginSeed[];
  views?: IPluginView[];
  procedures?: IPluginStoredProcedure[];
}

/**
 * Plugin migration definition
 */
export interface IPluginMigration {
  name: string;
  description?: string;
  version: string;
  timestamp: number;
  up: (queryRunner: QueryRunner) => Promise<void>;
  down: (queryRunner: QueryRunner) => Promise<void>;
  checksum?: string;
}

/**
 * Plugin seed definition
 */
export interface IPluginSeed {
  name: string;
  description?: string;
  entity: string;
  data: Record<string, any>[];
  condition?: string; // SQL condition to check if seeding is needed
}

/**
 * Plugin database view definition
 */
export interface IPluginView {
  name: string;
  expression: string;
  materialized?: boolean;
  columns?: string[];
}

/**
 * Plugin stored procedure definition
 */
export interface IPluginStoredProcedure {
  name: string;
  parameters: {
    name: string;
    type: string;
    direction: 'IN' | 'OUT' | 'INOUT';
  }[];
  body: string;
  language?: 'SQL' | 'PLPGSQL';
}

/**
 * Plugin database connection
 */
export interface IPluginDatabaseConnection {
  pluginId: string;
  connection: DataSource;
  config: {
    type?: 'sqlite' | 'postgres' | 'mysql' | 'mariadb';
    database?: string;
    host?: string;
    port?: number;
    username?: string;
    password?: string;
    useMainConnection?: boolean;
  };
  createdAt: Date;
  isActive: boolean;
}

/**
 * Plugin database query options
 */
export interface IPluginQueryOptions {
  limit?: number;
  offset?: number;
  orderBy?: Record<string, 'ASC' | 'DESC'>;
  where?: Record<string, any>;
  relations?: string[];
  select?: string[];
  cache?: boolean | number;
  lock?: {
    mode: 'pessimistic_read' | 'pessimistic_write' | 'dirty_read';
    tables?: string[];
  };
}

/**
 * Plugin database transaction context
 */
export interface IPluginTransactionContext {
  pluginId: string;
  queryRunner: QueryRunner;
  startedAt: Date;
  isolationLevel?: 'READ UNCOMMITTED' | 'READ COMMITTED' | 'REPEATABLE READ' | 'SERIALIZABLE';
}

/**
 * Plugin database manager interface
 */
export interface IPluginDatabaseManager {
  /**
   * Register plugin entities dynamically
   */
  registerPluginEntities(
    pluginId: string,
    entities: IPluginEntity[],
    options?: {
      createTables?: boolean;
      validateSchema?: boolean;
      conflictResolution?: 'error' | 'skip' | 'override';
    },
  ): Promise<{
    success: boolean;
    registeredEntities: string[];
    errors: string[];
    warnings: string[];
  }>;

  /**
   * Unregister plugin entities
   */
  unregisterPluginEntities(
    pluginId: string,
    options?: {
      dropTables?: boolean;
      cleanupData?: boolean;
      backup?: boolean;
    },
  ): Promise<{
    success: boolean;
    unregisteredEntities: string[];
    errors: string[];
  }>;

  /**
   * Get repository for plugin entity
   */
  getPluginRepository<T = any>(
    pluginId: string,
    entityName: string,
  ): Promise<any | null>;

  /**
   * Execute plugin migration
   */
  executeMigration(
    pluginId: string,
    migration: IPluginMigration,
    direction?: 'up' | 'down',
  ): Promise<{
    success: boolean;
    executedAt: Date;
    error?: string;
  }>;

  /**
   * Get plugin migration history
   */
  getMigrationHistory(pluginId: string): Promise<Array<{
    name: string;
    executedAt: Date;
    direction: 'up' | 'down';
    checksum?: string;
  }>>;

  /**
   * Create database connection for plugin
   */
  createPluginConnection(
    pluginId: string,
    config?: {
      type?: 'sqlite' | 'postgres' | 'mysql' | 'mariadb';
      database?: string;
      host?: string;
      port?: number;
      username?: string;
      password?: string;
      useMainConnection?: boolean;
    },
  ): Promise<IPluginDatabaseConnection>;

  /**
   * Get plugin database connection
   */
  getPluginConnection(pluginId: string): DataSource;

  /**
   * Close plugin database connection
   */
  closePluginConnection(pluginId: string): Promise<void>;

  /**
   * Validate plugin entities against existing schema
   */
  validatePluginEntities(
    pluginId: string,
    entities: IPluginEntity[],
  ): Promise<{
    valid: boolean;
    errors: string[];
    warnings: string[];
  }>;

  /**
   * Get all entities registered by a plugin
   */
  getPluginEntities(pluginId: string): IPluginEntity[];

  /**
   * Check if plugin has database access
   */
  hasPluginDatabaseAccess(pluginId: string): boolean;
}

/**
 * Plugin repository interface
 */
export interface IPluginRepository<T = any> {
  /**
   * Find entities with options
   */
  find(options?: IPluginQueryOptions): Promise<T[]>;

  /**
   * Find one entity
   */
  findOne(id: any): Promise<T | null>;

  /**
   * Find one entity with options
   */
  findOneBy(options: IPluginQueryOptions): Promise<T | null>;

  /**
   * Save entity
   */
  save(entity: Partial<T> | Partial<T>[]): Promise<T | T[]>;

  /**
   * Update entity
   */
  update(criteria: any, partialEntity: Partial<T>): Promise<any>;

  /**
   * Delete entity
   */
  delete(criteria: any): Promise<any>;

  /**
   * Count entities
   */
  count(options?: IPluginQueryOptions): Promise<number>;

  /**
   * Execute raw query
   */
  query(sql: string, parameters?: any[]): Promise<any>;

  /**
   * Create query builder
   */
  createQueryBuilder(alias?: string): any;
}

/**
 * Plugin database event data
 */
export interface IPluginDatabaseEvent {
  pluginId: string;
  action: 'entity_registered' | 'entity_unregistered' | 'migration_executed' | 'query_executed';
  entityName?: string;
  tableName?: string;
  migrationName?: string;
  query?: string;
  timestamp: Date;
  success: boolean;
  error?: string;
}

/**
 * Plugin database access control
 */
export interface IPluginDatabaseAccess {
  pluginId: string;
  permissions: {
    read: string[]; // Table names plugin can read from
    write: string[]; // Table names plugin can write to
    create: string[]; // Table names plugin can create
    delete: string[]; // Table names plugin can delete from
    execute: string[]; // Stored procedures plugin can execute
    schema: boolean; // Can modify database schema
  };
  restrictions: {
    maxConnections?: number;
    maxQueryTime?: number;
    maxResultSize?: number;
    allowedOperations?: string[];
    blockedOperations?: string[];
  };
}

/**
 * Plugin database performance metrics
 */
export interface IPluginDatabaseMetrics {
  pluginId: string;
  queries: {
    total: number;
    successful: number;
    failed: number;
    averageTime: number;
    slowest: number;
  };
  connections: {
    active: number;
    total: number;
    maxConcurrent: number;
  };
  data: {
    tablesCreated: number;
    recordsInserted: number;
    recordsUpdated: number;
    recordsDeleted: number;
  };
  migrations: {
    executed: number;
    failed: number;
    lastMigration?: Date;
  };
}

/**
 * Plugin database backup configuration
 */
export interface IPluginDatabaseBackup {
  pluginId: string;
  type: 'full' | 'incremental' | 'schema_only' | 'data_only';
  location: string;
  schedule?: string; // Cron expression
  retention: {
    count?: number;
    days?: number;
  };
  compression?: boolean;
  encryption?: {
    enabled: boolean;
    key?: string;
    algorithm?: string;
  };
}

/**
 * Plugin database events
 */
export enum PluginDatabaseEvents {
  ENTITY_REGISTERED = 'plugin.database.entity.registered',
  ENTITY_UNREGISTERED = 'plugin.database.entity.unregistered',
  MIGRATION_EXECUTED = 'plugin.database.migration.executed',
  MIGRATION_FAILED = 'plugin.database.migration.failed',
  CONNECTION_CREATED = 'plugin.database.connection.created',
  CONNECTION_CLOSED = 'plugin.database.connection.closed',
  QUERY_EXECUTED = 'plugin.database.query.executed',
  QUERY_FAILED = 'plugin.database.query.failed',
  BACKUP_CREATED = 'plugin.database.backup.created',
  BACKUP_FAILED = 'plugin.database.backup.failed',
}