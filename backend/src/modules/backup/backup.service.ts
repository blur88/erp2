import { Injectable, Logger, NotFoundException } from '@nestjs/common';
import { InjectRepository } from '@nestjs/typeorm';
import { Repository, LessThan } from 'typeorm';
import { ConfigService } from '@nestjs/config';
import Redis from 'ioredis';
import { exec } from 'child_process';
import { promisify } from 'util';
import * as fs from 'fs/promises';
import * as path from 'path';
import * as os from 'os';
const archiver = require('archiver');
import * as crypto from 'crypto';
import { BackupLog } from '@database/entities/backup-log.entity';
import { CreateBackupDto, BackupDatabase } from './dto/create-backup.dto';
import { BackupMetadata } from './interfaces/backup-metadata.interface';

const execAsync = promisify(exec);

@Injectable()
export class BackupService {
  private readonly logger = new Logger(BackupService.name);
  private readonly backupDir: string;
  private readonly redis: Redis;

  constructor(
    @InjectRepository(BackupLog)
    private readonly backupLogRepository: Repository<BackupLog>,
    private readonly configService: ConfigService,
  ) {
    this.backupDir = this.configService.get<string>(
      'BACKUP_DIRECTORY',
      '/app/backups',
    );

    // Initialize Redis client
    this.redis = new Redis({
      host: this.configService.get<string>('REDIS_HOST', 'redis'),
      port: parseInt(this.configService.get<string>('REDIS_PORT', '6379')),
      password: this.configService.get<string>('REDIS_PASSWORD'),
      maxRetriesPerRequest: 3,
    });
  }

  async createBackup(createBackupDto: CreateBackupDto): Promise<BackupLog> {
    const timestamp = new Date().toISOString().replace(/[:.]/g, '-');
    const filename = `full_backup_${timestamp}.tar.gz`;
    const filepath = path.join(this.backupDir, 'archives', filename);

    // Create backup log entry
    const backupLog = this.backupLogRepository.create({
      filename,
      filepath,
      backupType: createBackupDto.backupType,
      status: 'in_progress',
      databases: createBackupDto.databases,
      createdBy: createBackupDto.createdBy,
      startedAt: new Date(),
      metadata: {
        description: createBackupDto.description,
        settingsIncluded: createBackupDto.includeSettings,
        systemInfo: {
          nodeVersion: process.version,
          platform: process.platform,
          hostname: os.hostname(),
        },
      },
    });

    await this.backupLogRepository.save(backupLog);

    try {
      // Create backup directories
      await this.ensureBackupDirectories();

      const tempDir = path.join(this.backupDir, 'temp', timestamp);
      await fs.mkdir(tempDir, { recursive: true });

      const metadata: BackupMetadata = {
        ...backupLog.metadata,
      };

      // Backup PostgreSQL
      if (createBackupDto.databases.includes(BackupDatabase.POSTGRESQL)) {
        this.logger.log('Starting PostgreSQL backup...');
        const pgFile = await this.backupPostgreSQL(tempDir, timestamp);
        metadata.pgVersion = await this.getPostgreSQLVersion();
        metadata.tables = await this.getPostgreSQLTables();
        this.logger.log(`PostgreSQL backup completed: ${pgFile}`);
      }

      // Backup MongoDB
      if (createBackupDto.databases.includes(BackupDatabase.MONGODB)) {
        this.logger.log('Starting MongoDB backup...');
        const mongoDir = await this.backupMongoDB(tempDir, timestamp);
        metadata.mongoVersion = await this.getMongoDBVersion();
        metadata.collections = await this.getMongoDBCollections();
        this.logger.log(`MongoDB backup completed: ${mongoDir}`);
      }

      // Backup Redis
      if (createBackupDto.databases.includes(BackupDatabase.REDIS)) {
        this.logger.log('Starting Redis backup...');
        await this.backupRedis(tempDir, timestamp);
        metadata.redisVersion = await this.getRedisVersion();
        this.logger.log('Redis backup completed');
      }

      // Backup settings
      if (createBackupDto.includeSettings) {
        this.logger.log('Starting settings backup...');
        await this.backupSettings(tempDir, timestamp);
        this.logger.log('Settings backup completed');
      }

      // Create metadata file
      await fs.writeFile(
        path.join(tempDir, 'metadata.json'),
        JSON.stringify(metadata, null, 2),
        'utf-8',
      );

      // Create archive
      this.logger.log('Creating compressed archive...');
      const archivePath = await this.createArchive(tempDir, filepath);
      const stats = await fs.stat(archivePath);
      const checksum = await this.calculateChecksum(archivePath);

      // Update backup log
      backupLog.status = 'completed';
      backupLog.completedAt = new Date();
      backupLog.size = stats.size;
      backupLog.metadata = {
        ...metadata,
        checksum,
      };

      await this.backupLogRepository.save(backupLog);

      // Cleanup temp directory
      await fs.rm(tempDir, { recursive: true, force: true });

      this.logger.log(
        `Backup completed successfully: ${filename} (${this.formatBytes(stats.size)})`,
      );

      return backupLog;
    } catch (error) {
      this.logger.error(`Backup failed: ${error.message}`, error.stack);

      backupLog.status = 'failed';
      backupLog.completedAt = new Date();
      backupLog.error = error.message;

      await this.backupLogRepository.save(backupLog);

      throw error;
    }
  }

  private async ensureBackupDirectories(): Promise<void> {
    const dirs = [
      path.join(this.backupDir, 'postgresql'),
      path.join(this.backupDir, 'mongodb'),
      path.join(this.backupDir, 'redis'),
      path.join(this.backupDir, 'settings'),
      path.join(this.backupDir, 'archives'),
      path.join(this.backupDir, 'temp'),
    ];

    for (const dir of dirs) {
      await fs.mkdir(dir, { recursive: true });
    }
  }

  private async backupPostgreSQL(
    tempDir: string,
    timestamp: string,
  ): Promise<string> {
    const filename = `erp_db_${timestamp}.sql`;
    const filepath = path.join(tempDir, filename);

    const host = this.configService.get<string>('DATABASE_HOST', 'postgres');
    const port = this.configService.get<string>('DATABASE_PORT', '5432');
    const database = this.configService.get<string>('DATABASE_NAME', 'erp_db');
    const username = this.configService.get<string>('DATABASE_USER', 'erp_user');
    const password = this.configService.get<string>('DATABASE_PASSWORD', '');

    const env = {
      PGPASSWORD: password,
    };

    const command = `pg_dump -h ${host} -p ${port} -U ${username} -d ${database} -F p --clean --if-exists -f ${filepath}`;

    await execAsync(command, { env });

    // Compress the SQL file
    await execAsync(`gzip ${filepath}`);

    return `${filename}.gz`;
  }

  private async backupMongoDB(
    tempDir: string,
    timestamp: string,
  ): Promise<string> {
    const dirname = `erp_analytics_${timestamp}`;
    const dirpath = path.join(tempDir, dirname);

    const mongoUri = this.configService.get<string>('MONGODB_URI');

    if (!mongoUri) {
      this.logger.warn('MongoDB URI not configured, skipping MongoDB backup');
      return dirname;
    }

    const command = `mongodump --uri="${mongoUri}" --out="${dirpath}"`;

    try {
      await execAsync(command);
    } catch (error) {
      this.logger.warn(
        `MongoDB backup failed: ${error.message}, continuing with other backups`,
      );
    }

    return dirname;
  }

  private async backupRedis(
    tempDir: string,
    timestamp: string,
  ): Promise<string> {
    // Export all Redis keys as JSON
    // Note: We skip RDB file copy as it requires volume mounting between containers
    // JSON export is sufficient for backup/restore and is more portable
    const filename = `redis_backup_${timestamp}.json`;
    const filepath = path.join(tempDir, filename);

    this.logger.log('Starting Redis backup via JSON export...');

    const keys = await this.redis.keys('*');
    const backup: Record<string, any> = {};

    this.logger.log(`Found ${keys.length} Redis keys to backup`);

    for (const key of keys) {
      const type = await this.redis.type(key);
      const ttl = await this.redis.ttl(key);

      backup[key] = {
        type,
        ttl: ttl > 0 ? ttl : null,
        value: null,
      };

      switch (type) {
        case 'string':
          backup[key].value = await this.redis.get(key);
          break;
        case 'hash':
          backup[key].value = await this.redis.hgetall(key);
          break;
        case 'list':
          backup[key].value = await this.redis.lrange(key, 0, -1);
          break;
        case 'set':
          backup[key].value = await this.redis.smembers(key);
          break;
        case 'zset':
          const zsetData = await this.redis.zrange(key, 0, -1, 'WITHSCORES');
          // Convert from [member, score, member, score] to [score, member, score, member] for ZADD
          const zaddFormat = [];
          for (let i = 0; i < zsetData.length; i += 2) {
            zaddFormat.push(zsetData[i + 1]); // score
            zaddFormat.push(zsetData[i]);     // member
          }
          backup[key].value = zaddFormat;
          break;
      }
    }

    await fs.writeFile(filepath, JSON.stringify(backup, null, 2));

    this.logger.log(`Redis backup completed: ${keys.length} keys exported to ${filename}`);

    return filename;
  }

  private async backupSettings(
    tempDir: string,
    timestamp: string,
  ): Promise<string> {
    const filename = `settings_${timestamp}.json`;
    const filepath = path.join(tempDir, filename);

    // Export system settings from database
    const settings = {
      companySettings: await this.getCompanySettings(),
      printSettings: await this.getPrintSettings(),
      timestamp: new Date().toISOString(),
    };

    await fs.writeFile(filepath, JSON.stringify(settings, null, 2));

    return filename;
  }

  private async createArchive(
    sourceDir: string,
    outputPath: string,
  ): Promise<string> {
    return new Promise((resolve, reject) => {
      const output = require('fs').createWriteStream(outputPath);
      const archive = archiver('tar', {
        gzip: true,
        gzipOptions: { level: 9 },
      });

      output.on('close', () => {
        resolve(outputPath);
      });

      archive.on('error', (err) => {
        reject(err);
      });

      archive.pipe(output);
      archive.directory(sourceDir, false);
      archive.finalize();
    });
  }

  private async calculateChecksum(filepath: string): Promise<string> {
    const fileBuffer = await fs.readFile(filepath);
    const hashSum = crypto.createHash('sha256');
    hashSum.update(fileBuffer);
    return hashSum.digest('hex');
  }

  private async getPostgreSQLVersion(): Promise<string> {
    try {
      const { stdout } = await execAsync('psql --version');
      return stdout.trim();
    } catch (error) {
      return 'unknown';
    }
  }

  private async getPostgreSQLTables(): Promise<string[]> {
    try {
      const host = this.configService.get<string>('DATABASE_HOST', 'postgres');
      const port = this.configService.get<string>('DATABASE_PORT', '5432');
      const database = this.configService.get<string>('DATABASE_NAME', 'erp_db');
      const username = this.configService.get<string>('DATABASE_USER', 'erp_user');
      const password = this.configService.get<string>('DATABASE_PASSWORD', '');

      const env = { PGPASSWORD: password };
      const command = `psql -h ${host} -p ${port} -U ${username} -d ${database} -t -c "SELECT tablename FROM pg_tables WHERE schemaname='public'"`;

      const { stdout } = await execAsync(command, { env });
      return stdout
        .split('\n')
        .map((line) => line.trim())
        .filter((line) => line.length > 0);
    } catch (error) {
      return [];
    }
  }

  private async getMongoDBVersion(): Promise<string> {
    try {
      const { stdout } = await execAsync('mongod --version');
      const match = stdout.match(/db version v([\d.]+)/);
      return match ? match[1] : 'unknown';
    } catch (error) {
      return 'unknown';
    }
  }

  private async getMongoDBCollections(): Promise<string[]> {
    try {
      const mongoUri = this.configService.get<string>(
        'MONGODB_URI',
        'mongodb://mongodb:27017/erp_analytics',
      );
      const command = `mongo ${mongoUri} --quiet --eval "db.getCollectionNames().join('\\n')"`;
      const { stdout } = await execAsync(command);
      return stdout
        .split('\n')
        .map((line) => line.trim())
        .filter((line) => line.length > 0);
    } catch (error) {
      return [];
    }
  }

  private async getRedisVersion(): Promise<string> {
    try {
      const info = await this.redis.info('server');
      const match = info.match(/redis_version:([\d.]+)/);
      return match ? match[1] : 'unknown';
    } catch (error) {
      return 'unknown';
    }
  }

  private async getCompanySettings(): Promise<any> {
    // Query company settings from database
    // This will be implemented based on your settings module
    return {};
  }

  private async getPrintSettings(): Promise<any> {
    // Query print settings from database
    // This will be implemented based on your print-settings module
    return {};
  }

  private formatBytes(bytes: number): string {
    if (bytes === 0) return '0 Bytes';
    const k = 1024;
    const sizes = ['Bytes', 'KB', 'MB', 'GB', 'TB'];
    const i = Math.floor(Math.log(bytes) / Math.log(k));
    return Math.round((bytes / Math.pow(k, i)) * 100) / 100 + ' ' + sizes[i];
  }

  async findAll(): Promise<BackupLog[]> {
    return this.backupLogRepository.find({
      order: { createdAt: 'DESC' },
    });
  }

  async findOne(id: string): Promise<BackupLog> {
    const backup = await this.backupLogRepository.findOne({ where: { id } });
    if (!backup) {
      throw new NotFoundException(`Backup with ID ${id} not found`);
    }
    return backup;
  }

  async remove(id: string): Promise<void> {
    const backup = await this.findOne(id);

    // Delete the backup file
    try {
      await fs.unlink(backup.filepath);
    } catch (error) {
      this.logger.warn(`Failed to delete backup file: ${error.message}`);
    }

    // Delete the database record
    await this.backupLogRepository.remove(backup);
  }

  async getBackupFilePath(id: string): Promise<string> {
    const backup = await this.findOne(id);
    return backup.filepath;
  }

  async restoreBackup(id: string, restoredBy: string = 'system'): Promise<BackupLog> {
    const backup = await this.findOne(id);

    if (backup.status !== 'completed') {
      throw new Error('Cannot restore from incomplete backup');
    }

    this.logger.log(`Starting restore from backup: ${backup.filename}`);

    const restoreDir = path.join(this.backupDir, 'temp', `restore_${Date.now()}`);

    try {
      // Verify backup integrity
      this.logger.log('Verifying backup integrity...');
      await this.verifyBackupIntegrity(backup);

      // Extract archive
      this.logger.log('Extracting backup archive...');
      await this.extractArchive(backup.filepath, restoreDir);

      // Read metadata
      const metadataPath = path.join(restoreDir, 'metadata.json');
      const metadataContent = await fs.readFile(metadataPath, 'utf-8');
      const metadata: BackupMetadata = JSON.parse(metadataContent);

      // Restore databases in order
      if (backup.databases.includes('postgresql')) {
        this.logger.log('Restoring PostgreSQL database...');
        await this.restorePostgreSQL(restoreDir);
      }

      if (backup.databases.includes('mongodb')) {
        this.logger.log('Restoring MongoDB database...');
        await this.restoreMongoDB(restoreDir);
      }

      if (backup.databases.includes('redis')) {
        this.logger.log('Restoring Redis database...');
        await this.restoreRedis(restoreDir);
      }

      // Restore settings
      if (metadata.settingsIncluded) {
        this.logger.log('Restoring system settings...');
        await this.restoreSettings(restoreDir);
      }

      // Cleanup temp directory
      await fs.rm(restoreDir, { recursive: true, force: true });

      this.logger.log(`Restore completed successfully from: ${backup.filename}`);

      // Fix backup status - restore overwrites backup_logs table, so we need to update the status
      // The backup was validated as 'completed' before restore started, so restore it to that state
      await this.backupLogRepository.update(backup.id, {
        status: 'completed',
        completedAt: backup.completedAt
      });

      return backup;
    } catch (error) {
      this.logger.error(`Restore failed: ${error.message}`, error.stack);

      // Cleanup on error
      try {
        await fs.rm(restoreDir, { recursive: true, force: true });
      } catch (cleanupError) {
        this.logger.warn(`Cleanup failed: ${cleanupError.message}`);
      }

      throw error;
    }
  }

  private async verifyBackupIntegrity(backup: BackupLog): Promise<void> {
    // Check if file exists
    try {
      await fs.access(backup.filepath);
    } catch (error) {
      throw new Error(`Backup file not found: ${backup.filepath}`);
    }

    // Verify checksum if available
    if (backup.metadata?.checksum) {
      const currentChecksum = await this.calculateChecksum(backup.filepath);
      if (currentChecksum !== backup.metadata.checksum) {
        throw new Error('Backup file integrity check failed - checksum mismatch');
      }
      this.logger.log('Backup integrity verified successfully');
    }
  }

  private async extractArchive(archivePath: string, destDir: string): Promise<void> {
    await fs.mkdir(destDir, { recursive: true });

    const command = `tar -xzf "${archivePath}" -C "${destDir}"`;
    await execAsync(command);

    this.logger.log(`Archive extracted to: ${destDir}`);
  }

  private async restorePostgreSQL(restoreDir: string): Promise<void> {
    // Find the PostgreSQL dump file
    const files = await fs.readdir(restoreDir);
    const sqlFile = files.find((f) => f.endsWith('.sql.gz'));

    if (!sqlFile) {
      this.logger.warn('No PostgreSQL dump file found, skipping PostgreSQL restore');
      return;
    }

    const sqlPath = path.join(restoreDir, sqlFile);

    // Decompress the SQL file
    await execAsync(`gunzip "${sqlPath}"`);
    const decompressedPath = sqlPath.replace('.gz', '');

    const host = this.configService.get<string>('DATABASE_HOST', 'postgres');
    const port = this.configService.get<string>('DATABASE_PORT', '5432');
    const database = this.configService.get<string>('DATABASE_NAME', 'erp_db');
    const username = this.configService.get<string>('DATABASE_USER', 'erp_user');
    const password = this.configService.get<string>('DATABASE_PASSWORD', '');

    // Use full path to psql to avoid Alpine Linux wrapper script issues
    const psqlPath = '/usr/bin/psql';
    const env = {
      PGPASSWORD: password,
      PATH: process.env.PATH || '/usr/local/sbin:/usr/local/bin:/usr/sbin:/usr/bin:/sbin:/bin'
    };

    // Drop existing connections to the database
    const dropConnectionsCmd = `${psqlPath} -h ${host} -p ${port} -U ${username} -d postgres -c "SELECT pg_terminate_backend(pid) FROM pg_stat_activity WHERE datname = '${database}' AND pid <> pg_backend_pid();"`;

    try {
      await execAsync(dropConnectionsCmd, { env });
    } catch (error) {
      this.logger.warn('Failed to drop existing connections, continuing...');
    }

    // Restore the database
    const restoreCommand = `${psqlPath} -h ${host} -p ${port} -U ${username} -d ${database} -f "${decompressedPath}"`;
    await execAsync(restoreCommand, { env });

    this.logger.log('PostgreSQL restore completed');
  }

  private async restoreMongoDB(restoreDir: string): Promise<void> {
    const mongoUri = this.configService.get<string>('MONGODB_URI');

    if (!mongoUri) {
      this.logger.warn('MongoDB URI not configured, skipping MongoDB restore');
      return;
    }

    // Find the MongoDB backup directory
    const files = await fs.readdir(restoreDir);
    const mongoDir = files.find((f) => f.startsWith('erp_analytics_'));

    if (!mongoDir) {
      this.logger.warn('No MongoDB backup directory found, skipping MongoDB restore');
      return;
    }

    const mongoDirPath = path.join(restoreDir, mongoDir);

    const command = `mongorestore --uri="${mongoUri}" --drop "${mongoDirPath}"`;

    try {
      await execAsync(command);
      this.logger.log('MongoDB restore completed');
    } catch (error) {
      this.logger.warn(`MongoDB restore failed: ${error.message}`);
    }
  }

  private async restoreRedis(restoreDir: string): Promise<void> {
    // Find the Redis JSON backup file (supports both old and new formats)
    const files = await fs.readdir(restoreDir);
    const redisJsonFile = files.find(
      (f) => (f.startsWith('redis_backup_') || f.startsWith('redis_settings_')) && f.endsWith('.json')
    );

    if (!redisJsonFile) {
      this.logger.warn('No Redis backup file found, skipping Redis restore');
      return;
    }

    const redisJsonPath = path.join(restoreDir, redisJsonFile);
    const backupContent = await fs.readFile(redisJsonPath, 'utf-8');
    const backup = JSON.parse(backupContent);

    this.logger.log('Starting Redis restore...');

    // Clear existing Redis data
    await this.redis.flushall();

    let restoredCount = 0;

    // Restore all keys
    for (const [key, data] of Object.entries(backup)) {
      // Handle new format with type/ttl/value structure
      const keyData = typeof data === 'object' && data !== null && 'type' in data
        ? data as any
        : { type: null, ttl: null, value: data };

      const { type, ttl, value } = keyData;

      try {
        switch (type) {
          case 'string':
            await this.redis.set(key, value);
            break;
          case 'hash':
            if (value && typeof value === 'object') {
              await this.redis.hmset(key, value);
            }
            break;
          case 'list':
            if (Array.isArray(value) && value.length > 0) {
              await this.redis.rpush(key, ...value);
            }
            break;
          case 'set':
            if (Array.isArray(value) && value.length > 0) {
              await this.redis.sadd(key, ...value);
            }
            break;
          case 'zset':
            if (Array.isArray(value) && value.length > 0) {
              // value is array like [member1, score1, member2, score2, ...]
              await this.redis.zadd(key, ...value);
            }
            break;
          default:
            // Fallback for old format or unknown types
            if (typeof value === 'string') {
              await this.redis.set(key, value);
            } else if (Array.isArray(value)) {
              await this.redis.rpush(key, ...value);
            } else if (typeof value === 'object') {
              await this.redis.hmset(key, value);
            }
        }

        // Restore TTL if it was set
        if (ttl && ttl > 0) {
          await this.redis.expire(key, ttl);
        }

        restoredCount++;
      } catch (error) {
        this.logger.error(`Failed to restore Redis key '${key}': ${error.message}`);
      }
    }

    this.logger.log(`Redis restore completed: ${restoredCount} keys restored`);
  }

  private async restoreSettings(restoreDir: string): Promise<void> {
    const files = await fs.readdir(restoreDir);
    const settingsFile = files.find((f) => f.startsWith('settings_') && f.endsWith('.json'));

    if (!settingsFile) {
      this.logger.warn('No settings file found, skipping settings restore');
      return;
    }

    const settingsPath = path.join(restoreDir, settingsFile);
    const settingsContent = await fs.readFile(settingsPath, 'utf-8');
    const settings = JSON.parse(settingsContent);

    // TODO: Implement actual settings restoration based on your settings module
    // For now, just log that settings were found
    this.logger.log(`Settings file found with company settings and print settings`);
    this.logger.log('Settings restore completed (placeholder)');
  }

  async cleanupOldBackups(retentionDays: number): Promise<number> {
    const cutoffDate = new Date();
    cutoffDate.setDate(cutoffDate.getDate() - retentionDays);

    this.logger.log(
      `Cleaning up backups older than ${retentionDays} days (before ${cutoffDate.toISOString()})`,
    );

    // Find old completed backups
    const oldBackups = await this.backupLogRepository.find({
      where: {
        status: 'completed',
        createdAt: LessThan(cutoffDate) as any,
      },
    });

    let deletedCount = 0;

    for (const backup of oldBackups) {
      try {
        await this.remove(backup.id);
        deletedCount++;
      } catch (error) {
        this.logger.warn(
          `Failed to delete backup ${backup.id}: ${error.message}`,
        );
      }
    }

    this.logger.log(`Cleanup completed: ${deletedCount} backups deleted`);
    return deletedCount;
  }
}
