import { BadRequestException, Injectable, InternalServerErrorException, Logger, NotFoundException, OnModuleDestroy } from '@nestjs/common';
import { InjectRepository } from '@nestjs/typeorm';
import { Repository, LessThan } from 'typeorm';
import { ConfigService } from '@nestjs/config';
import * as IORedis from 'ioredis';
import type Redis from 'ioredis';
import * as childProcess from 'child_process';
import type { SpawnOptions } from 'child_process';
import * as fs from 'fs/promises';
import * as fsSync from 'fs';
import * as path from 'path';
import * as os from 'os';
import * as crypto from 'crypto';
import { BackupLog } from '@database/entities/backup-log.entity';
import { BackupRetentionSettings } from '@database/entities/backup-settings.entity';
import { CompanySettings } from '@database/entities/company-settings.entity';
import { RegionalSettings } from '@database/entities/regional-settings.entity';
import { DocumentNumberSetting } from '@database/entities/document-number-settings.entity';
import { PrintSettings } from '@database/entities/print-settings.entity';
import { CreateBackupDto, BackupDatabase } from './dto/create-backup.dto';
import type { BackupMetadata } from './interfaces/backup-metadata.interface';
import { UpdateBackupSettingsDto, BackupSettingsResponseDto } from './dto/backup-settings.dto';
import { plainToInstance } from 'class-transformer';

type ArchiverInstance = import('archiver').Archiver;
type TarArchiveConstructor = new (
  options?: import('archiver').ArchiverOptions,
) => ArchiverInstance;
type ArchiverModule = { TarArchive: TarArchiveConstructor };

const importArchiver = new Function(
  'specifier',
  'return import(specifier)',
) as (specifier: string) => Promise<ArchiverModule>;

async function loadArchiver(): Promise<ArchiverModule> {
  return await importArchiver('archiver');
}

@Injectable()
export class BackupService implements OnModuleDestroy {
  private readonly logger = new Logger(BackupService.name);
  private readonly backupDir: string;
  private readonly redis: Redis;
  private fsPromises = fs;
  private fsSync = fsSync;
  private spawn = childProcess.spawn;
  private RedisCtor = (IORedis as any).default;
  private crypto = crypto;

  constructor(
    @InjectRepository(BackupLog)
    private readonly backupLogRepository: Repository<BackupLog>,
    @InjectRepository(BackupRetentionSettings)
    private readonly backupSettingsRepository: Repository<BackupRetentionSettings>,
    @InjectRepository(CompanySettings)
    private readonly companySettingsRepository: Repository<CompanySettings>,
    @InjectRepository(RegionalSettings)
    private readonly regionalSettingsRepository: Repository<RegionalSettings>,
    @InjectRepository(DocumentNumberSetting)
    private readonly documentNumberSettingRepository: Repository<DocumentNumberSetting>,
    @InjectRepository(PrintSettings)
    private readonly printSettingsRepository: Repository<PrintSettings>,
    private readonly configService: ConfigService,
  ) {
    this.backupDir = this.configService.get<string>(
      'BACKUP_DIRECTORY',
      '/app/backups',
    );

    // Initialize Redis client
    this.redis = new this.RedisCtor({
      host: this.configService.get<string>('REDIS_HOST', 'redis'),
      port: parseInt(this.configService.get<string>('REDIS_PORT', '6379')),
      password: this.configService.get<string>('REDIS_PASSWORD'),
      maxRetriesPerRequest: 3,
      // ioredis 6 defaults to RESP3 (`protocol: 3`); v5 used RESP2. Pinned to 2
      // so the ioredis 6 upgrade changed only the dependency, not the wire
      // protocol. Matters here because this client reads raw BullMQ queue state.
      protocol: 2,
    });
  }

  onModuleDestroy(): void {
    try {
      this.redis.disconnect();
    } catch (_error) {
      // Ignore redis shutdown errors during module teardown.
    }
  }

  private async spawnAsync(
    command: string,
    args: string[],
    options: SpawnOptions = {},
  ): Promise<{ stdout: string; stderr: string }> {
    return new Promise((resolve, reject) => {
      const child = this.spawn(command, args, options);
      let stdout = '';
      let stderr = '';

      child.stdout?.on('data', (data) => (stdout += data));
      child.stderr?.on('data', (data) => (stderr += data));

      child.on('close', (code, signal) => {
        if (code === 0) {
          resolve({ stdout, stderr });
        } else if (signal) {
          reject(new Error(`Command killed by signal ${signal}: ${stderr}`));
        } else {
          reject(new Error(`Command failed with code ${code}: ${stderr}`));
        }
      });

      child.on('error', (err) => {
        reject(err);
      });
    });
  }

  async createBackup(createBackupDto: CreateBackupDto): Promise<BackupLog> {
    // Use shorter timestamp format: YYYYMMDD_HHMMSS
    const now = new Date();
    const timestamp = now.toISOString()
      .replace(/[-:]/g, '')
      .replace(/T/, '_')
      .substring(0, 15); // YYYYMMDD_HHMMSS
    const filename = `backup_${timestamp}.tar.gz`;
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
      await this.fsPromises.mkdir(tempDir, { recursive: true });

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
      await this.fsPromises.writeFile(
        path.join(tempDir, 'metadata.json'),
        JSON.stringify(metadata, null, 2),
        'utf-8',
      );

      // Create archive
      this.logger.log('Creating compressed archive...');
      const archivePath = await this.createArchive(tempDir, filepath);
      const stats = await this.fsPromises.stat(archivePath);
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
      await this.fsPromises.rm(tempDir, { recursive: true, force: true });

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
      path.join(this.backupDir, 'redis'),
      path.join(this.backupDir, 'settings'),
      path.join(this.backupDir, 'archives'),
      path.join(this.backupDir, 'temp'),
      path.join(this.backupDir, 'uploads'),
    ];

    for (const dir of dirs) {
      await this.fsPromises.mkdir(dir, { recursive: true });
    }
  }

  private async backupPostgreSQL(
    tempDir: string,
    timestamp: string,
  ): Promise<string> {
    const filename = `erp_db_${timestamp}.sql`;
    const filepath = path.join(tempDir, filename);

    const host = this.configService.get<string>('DB_HOST', 'postgres');
    const port = this.configService.get<string>('DB_PORT', '5432');
    const database = this.configService.get<string>('DB_DATABASE', 'erp_db');
    const username = this.configService.get<string>('DB_USERNAME', 'erp_user');
    const password = this.configService.get<string>('DB_PASSWORD', '');

    const env = {
      ...process.env,
      PGPASSWORD: password,
    };

    await this.spawnAsync('pg_dump', [
      '-h', host,
      '-p', port,
      '-U', username,
      '-d', database,
      '-F', 'p',
      '--clean',
      '--if-exists',
      '-f', filepath,
    ], { env });

    // Compress the SQL file
    await this.spawnAsync('gzip', [filepath]);

    return `${filename}.gz`;
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
          // ioredis 6 types `stop` as string | Buffer (only `start` takes a
          // number), so -1 must be passed as a string. Same command on the wire.
          const zsetData = await this.redis.zrange(key, 0, '-1', 'WITHSCORES');
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

    await this.fsPromises.writeFile(filepath, JSON.stringify(backup, null, 2));

    this.logger.log(`Redis backup completed: ${keys.length} keys exported to ${filename}`);

    return filename;
  }

  private async backupSettings(
    tempDir: string,
    timestamp: string,
  ): Promise<string> {
    const filename = `settings_${timestamp}.json`;
    const filepath = path.join(tempDir, filename);

    const [companySettings, regionalSettings, documentNumberSettings, printSettings] =
      await Promise.all([
        this.getCompanySettings(),
        this.getRegionalSettings(),
        this.getDocumentNumberSettings(),
        this.getPrintSettings(),
      ]);

    const settings = {
      companySettings,
      regionalSettings,
      documentNumberSettings,
      printSettings,
      timestamp: new Date().toISOString(),
    };

    await this.fsPromises.writeFile(filepath, JSON.stringify(settings, null, 2));

    return filename;
  }

  private async createArchive(
    sourceDir: string,
    outputPath: string,
  ): Promise<string> {
    const { TarArchive } = await loadArchiver();

    return new Promise((resolve, reject) => {
      const output = this.fsSync.createWriteStream(outputPath);
      const archive = new TarArchive({
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
      // finalize() returns a Promise in archiver v8; error is handled by archive.on('error')
      archive.finalize().catch(() => {});
    });
  }

  private async calculateChecksum(filepath: string): Promise<string> {
    const fileBuffer = await this.fsPromises.readFile(filepath);
    const hashSum = crypto.createHash('sha256');
    hashSum.update(fileBuffer);
    return hashSum.digest('hex');
  }

  private async getPostgreSQLVersion(): Promise<string> {
    try {
      const { stdout } = await this.spawnAsync('psql', ['--version']);
      return stdout.trim();
    } catch (error) {
      return 'unknown';
    }
  }

  private async getPostgreSQLTables(): Promise<string[]> {
    try {
      const host = this.configService.get<string>('DB_HOST', 'postgres');
      const port = this.configService.get<string>('DB_PORT', '5432');
      const database = this.configService.get<string>('DB_DATABASE', 'erp_db');
      const username = this.configService.get<string>('DB_USERNAME', 'erp_user');
      const password = this.configService.get<string>('DB_PASSWORD', '');

      const env = { ...process.env, PGPASSWORD: password };

      const { stdout } = await this.spawnAsync('psql', [
        '-h', host,
        '-p', port,
        '-U', username,
        '-d', database,
        '-t',
        '-c', "SELECT tablename FROM pg_tables WHERE schemaname='public'",
      ], { env });
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
    const settings = await this.companySettingsRepository.findOne({
      where: { isActive: true },
    });

    if (!settings) {
      return {};
    }

    return {
      name: settings.name,
      address: settings.address,
      city: settings.city,
      state: settings.state,
      postalCode: settings.postalCode,
      country: settings.country,
      phone: settings.phone,
      email: settings.email,
      website: settings.website,
      miscInfo: settings.miscInfo,
      // logoUrl intentionally excluded - file not backed up
    };
  }

  private async getPrintSettings(): Promise<any> {
    const settings = await this.printSettingsRepository.findOne({
      where: {},
      order: { createdAt: 'ASC' },
    });

    if (!settings) {
      return {};
    }

    return {
      companyName: settings.companyName,
      address: settings.address,
      city: settings.city,
      state: settings.state,
      postalCode: settings.postalCode,
      country: settings.country,
      phone: settings.phone,
      email: settings.email,
      website: settings.website,
      miscInfo: settings.miscInfo,
      salesPerPageFooter: settings.salesPerPageFooter,
      salesEndOfDocFooter: settings.salesEndOfDocFooter,
      purchasingPerPageFooter: settings.purchasingPerPageFooter,
      purchasingEndOfDocFooter: settings.purchasingEndOfDocFooter,
      inventoryPerPageFooter: settings.inventoryPerPageFooter,
      inventoryEndOfDocFooter: settings.inventoryEndOfDocFooter,
      reportPerPageFooter: settings.reportPerPageFooter,
      reportEndOfDocFooter: settings.reportEndOfDocFooter,
      salesOrderTemplate: settings.salesOrderTemplate,
      paymentReceiptTemplate: settings.paymentReceiptTemplate,
      purchaseOrderTemplate: settings.purchaseOrderTemplate,
      grnTemplate: settings.grnTemplate,
      vendorPaymentTemplate: settings.vendorPaymentTemplate,
      // logoUrl intentionally excluded - file not backed up
    };
  }

  private async getRegionalSettings(): Promise<any> {
    const settings = await this.regionalSettingsRepository.findOne({
      where: { isActive: true },
    });

    if (!settings) {
      return {};
    }

    return {
      currency: settings.currency,
      costingMethod: settings.costingMethod,
      dateFormat: settings.dateFormat,
      timeFormat: settings.timeFormat,
      numberFormat: settings.numberFormat,
    };
  }

  private async getDocumentNumberSettings(): Promise<any> {
    const configurations = await this.documentNumberSettingRepository.find({
      order: { documentName: 'ASC' },
    });

    if (!configurations.length) {
      return {};
    }

    return {
      configurations,
    };
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
      await this.fsPromises.unlink(backup.filepath);
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
      const metadataContent = await this.fsPromises.readFile(metadataPath, 'utf-8');
      const metadata: BackupMetadata = JSON.parse(metadataContent);

      // IMPORTANT: Save all current backup logs BEFORE restoring PostgreSQL
      // because restore will overwrite the backup_logs table
      let allCurrentBackups: BackupLog[] = [];
      if (backup.databases.includes('postgresql')) {
        this.logger.log('Saving current backup records before PostgreSQL restore...');
        allCurrentBackups = await this.backupLogRepository.find();
        this.logger.log(`Saved ${allCurrentBackups.length} backup records`);
      }

      // Restore databases in order
      if (backup.databases.includes('postgresql')) {
        this.logger.log('Restoring PostgreSQL database...');
        await this.restorePostgreSQL(restoreDir);
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
      await this.fsPromises.rm(restoreDir, { recursive: true, force: true });

      this.logger.log(`Restore completed successfully from: ${backup.filename}`);

      // Restore all backup records that existed before the restore
      if (allCurrentBackups.length > 0) {
        this.logger.log('Restoring backup records after PostgreSQL restore...');

        for (const backupRecord of allCurrentBackups) {
          try {
            // Check if record already exists in restored database
            const existing = await this.backupLogRepository.findOne({
              where: { id: backupRecord.id },
            });

            if (existing) {
              // Update existing record to preserve current data
              await this.backupLogRepository.update(backupRecord.id, {
                filename: backupRecord.filename,
                filepath: backupRecord.filepath,
                backupType: backupRecord.backupType,
                status: backupRecord.status,
                databases: backupRecord.databases,
                createdBy: backupRecord.createdBy,
                startedAt: backupRecord.startedAt,
                completedAt: backupRecord.completedAt,
                size: backupRecord.size,
                metadata: backupRecord.metadata,
                error: backupRecord.error,
                createdAt: backupRecord.createdAt,
                updatedAt: backupRecord.updatedAt,
              });
            } else {
              // Insert new record (backup created after the backup being restored)
              await this.backupLogRepository.save(backupRecord);
            }
          } catch (error) {
            this.logger.warn(
              `Failed to restore backup record ${backupRecord.id}: ${error.message}`,
            );
          }
        }

        this.logger.log(`Restored ${allCurrentBackups.length} backup records`);
      }

      return backup;
    } catch (error) {
      this.logger.error(`Restore failed: ${error.message}`, error.stack);

      // Cleanup on error
      try {
        await this.fsPromises.rm(restoreDir, { recursive: true, force: true });
      } catch (cleanupError) {
        this.logger.warn(`Cleanup failed: ${cleanupError.message}`);
      }

      throw error;
    }
  }

  private async verifyBackupIntegrity(backup: BackupLog): Promise<void> {
    // Check if file exists
    try {
      await this.fsPromises.access(backup.filepath);
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
    await this.fsPromises.mkdir(destDir, { recursive: true });

    await this.spawnAsync('tar', ['-xzf', archivePath, '-C', destDir]);

    this.logger.log(`Archive extracted to: ${destDir}`);
  }

  private async restorePostgreSQL(restoreDir: string): Promise<void> {
    // Find the PostgreSQL dump file
    const files = await this.fsPromises.readdir(restoreDir);
    const sqlFile = files.find((f) => f.endsWith('.sql.gz'));

    if (!sqlFile) {
      this.logger.warn('No PostgreSQL dump file found, skipping PostgreSQL restore');
      return;
    }

    const sqlPath = path.join(restoreDir, sqlFile);

    // Decompress the SQL file
    await this.spawnAsync('gunzip', [sqlPath]);
    const decompressedPath = sqlPath.replace('.gz', '');

    const host = this.configService.get<string>('DB_HOST', 'postgres');
    const port = this.configService.get<string>('DB_PORT', '5432');
    const database = this.configService.get<string>('DB_DATABASE', 'erp_db');
    const username = this.configService.get<string>('DB_USERNAME', 'erp_user');
    const password = this.configService.get<string>('DB_PASSWORD', '');

    // Use full path to psql to avoid Alpine Linux wrapper script issues
    const psqlPath = '/usr/bin/psql';
    const env = {
      ...process.env,
      PGPASSWORD: password,
    };

    // Drop existing connections to the database
    try {
      await this.spawnAsync(psqlPath, [
        '-h', host,
        '-p', port,
        '-U', username,
        '-d', 'postgres',
        '-c', `SELECT pg_terminate_backend(pid) FROM pg_stat_activity WHERE datname = '${database}' AND pid <> pg_backend_pid();`,
      ], { env });
    } catch (error) {
      this.logger.warn('Failed to drop existing connections, continuing...');
    }

    // Restore the database
    await this.spawnAsync(psqlPath, [
      '-h', host,
      '-p', port,
      '-U', username,
      '-d', database,
      '-f', decompressedPath,
    ], { env });

    this.logger.log('PostgreSQL restore completed');
  }

  private async restoreRedis(restoreDir: string): Promise<void> {
    // Find the Redis JSON backup file (supports both old and new formats)
    const files = await this.fsPromises.readdir(restoreDir);
    const redisJsonFile = files.find(
      (f) => (f.startsWith('redis_backup_') || f.startsWith('redis_settings_')) && f.endsWith('.json')
    );

    if (!redisJsonFile) {
      this.logger.warn('No Redis backup file found, skipping Redis restore');
      return;
    }

    const redisJsonPath = path.join(restoreDir, redisJsonFile);
    const backupContent = await this.fsPromises.readFile(redisJsonPath, 'utf-8');
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
    const files = await this.fsPromises.readdir(restoreDir);
    const settingsFile = files.find((f) => f.startsWith('settings_') && f.endsWith('.json'));

    if (!settingsFile) {
      this.logger.warn('No settings file found, skipping settings restore');
      return;
    }

    const settingsPath = path.join(restoreDir, settingsFile);
    const settingsContent = await this.fsPromises.readFile(settingsPath, 'utf-8');
    const settings = JSON.parse(settingsContent);

    // Restore each settings type independently - failures are non-fatal
    await this.restoreCompanySettings(settings.companySettings);
    await this.restoreRegionalSettings(settings.regionalSettings ?? settings.priceCostingSettings);
    await this.restoreDocumentNumberSettings(settings.documentNumberSettings);
    await this.restorePrintSettingsData(settings.printSettings);

    this.logger.log('Settings restore completed');
  }

  private async restoreCompanySettings(data: any): Promise<void> {
    if (!data || Object.keys(data).length === 0) return;

    try {
      const { logoUrl: _logo, ...safeData } = data;
      const existing = await this.companySettingsRepository.findOne({ where: { isActive: true } });

      if (existing) {
        Object.assign(existing, safeData);
        await this.companySettingsRepository.save(existing);
      } else {
        const created = this.companySettingsRepository.create({ ...safeData, isActive: true });
        await this.companySettingsRepository.save(created);
      }

      this.logger.log('Company settings restored');
    } catch (error) {
      this.logger.warn(`Failed to restore company settings: ${error.message}`);
    }
  }

  private async restoreRegionalSettings(data: any): Promise<void> {
    if (!data || Object.keys(data).length === 0) return;

    try {
      const existing = await this.regionalSettingsRepository.findOne({ where: { isActive: true } });

      if (existing) {
        Object.assign(existing, data);
        await this.regionalSettingsRepository.save(existing);
      } else {
        const created = this.regionalSettingsRepository.create({ ...data, isActive: true });
        await this.regionalSettingsRepository.save(created);
      }

      this.logger.log('Regional settings restored');
    } catch (error) {
      this.logger.warn(`Failed to restore regional settings: ${error.message}`);
    }
  }

  private async restoreDocumentNumberSettings(data: any): Promise<void> {
    if (!data || Object.keys(data).length === 0) return;

    try {
      const configurations = Array.isArray(data.configurations) ? data.configurations : [];
      const currentYY = new Date().getFullYear() % 100;

      for (const config of configurations) {
        const existing = await this.documentNumberSettingRepository.findOne({
          where: { documentName: config.documentName },
        });

        const payload = {
          documentName: config.documentName,
          prefix: config.prefix,
          paddingDigits: config.paddingDigits || 3,
          nextNumber: config.nextNumber || 1,
          lastResetYear: config.lastResetYear ?? currentYY,
        };

        if (existing) {
          Object.assign(existing, payload);
          await this.documentNumberSettingRepository.save(existing);
        } else {
          const created = this.documentNumberSettingRepository.create(payload);
          await this.documentNumberSettingRepository.save(created);
        }
      }

      this.logger.log('Document number settings restored');
    } catch (error) {
      this.logger.warn(`Failed to restore document number settings: ${error.message}`);
    }
  }

  private async restorePrintSettingsData(data: any): Promise<void> {
    if (!data || Object.keys(data).length === 0) return;

    try {
      const { logoUrl: _logo, ...safeData } = data;
      const existing = await this.printSettingsRepository.findOne({
        where: {},
        order: { createdAt: 'ASC' },
      });

      if (existing) {
        Object.assign(existing, safeData);
        await this.printSettingsRepository.save(existing);
      } else {
        const created = this.printSettingsRepository.create(safeData);
        await this.printSettingsRepository.save(created);
      }

      this.logger.log('Print settings restored');
    } catch (error) {
      this.logger.warn(`Failed to restore print settings: ${error.message}`);
    }
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

  async processUploadedBackup(file: Express.Multer.File): Promise<BackupLog> {
    this.logger.log(`Processing uploaded backup: ${file.originalname}`);

    const uploadsDir = path.resolve(this.backupDir, 'uploads');
    const uploadPath = path.resolve(file.path);
    if (!uploadPath.startsWith(`${uploadsDir}${path.sep}`)) {
      throw new BadRequestException('Invalid upload path detected');
    }

    const originalFilename = path.basename(file.originalname);
    const archivesDir = path.resolve(this.backupDir, 'archives');
    const ext = originalFilename.endsWith('.tar.gz') ? '.tar.gz' : '.tgz';
    const archiveFilename = `uploaded_backup_${Date.now()}_${this.crypto.randomUUID()}${ext}`;
    const archivePath = path.resolve(archivesDir, archiveFilename);

    if (!archivePath.startsWith(`${archivesDir}${path.sep}`)) {
      throw new BadRequestException('Invalid backup path detected');
    }

    try {
      // Ensure archives directory exists
      await this.fsPromises.mkdir(archivesDir, { recursive: true });

      // Move file from uploads to archives
      await this.fsPromises.rename(uploadPath, archivePath);

      // Extract and verify the backup to read metadata
      const tempDir = path.join(this.backupDir, 'temp', `verify_${Date.now()}`);
      await this.extractArchive(archivePath, tempDir);

      // Read metadata
      const metadataPath = path.join(tempDir, 'metadata.json');
      let metadata: BackupMetadata;

      try {
        const metadataContent = await this.fsPromises.readFile(metadataPath, 'utf-8');
        metadata = JSON.parse(metadataContent);
      } catch (error) {
        this.logger.warn('Could not read metadata from backup file, using defaults');
        metadata = {
          description: 'Uploaded backup',
          settingsIncluded: false,
        } as any;
      }

      // Calculate file size and checksum
      const stats = await this.fsPromises.stat(archivePath);
      const checksum = await this.calculateChecksum(archivePath);

      // Determine databases included
      const files = await this.fsPromises.readdir(tempDir);
      const databases: string[] = [];

      if (files.some((f) => f.endsWith('.sql.gz'))) {
        databases.push('postgresql');
      }
      if (files.some((f) => f.startsWith('redis_'))) {
        databases.push('redis');
      }

      // Cleanup temp directory
      await this.fsPromises.rm(tempDir, { recursive: true, force: true });

      // Create backup log entry
      const backupLog = this.backupLogRepository.create({
        filename: archiveFilename,
        filepath: archivePath,
        backupType: 'manual',
        status: 'completed',
        databases,
        createdBy: 'uploaded',
        startedAt: new Date(),
        completedAt: new Date(),
        size: stats.size,
        metadata: {
          ...metadata,
          originalFilename,
          checksum,
          uploadedAt: new Date().toISOString(),
        },
      });

      await this.backupLogRepository.save(backupLog);

      this.logger.log(
        `Uploaded backup processed successfully: ${archiveFilename} from ${originalFilename} (${this.formatBytes(stats.size)})`,
      );

      return backupLog;
    } catch (error) {
      this.logger.error(`Failed to process uploaded backup: ${error.message}`, error.stack);

      // Cleanup on error
      try {
        await this.fsPromises.unlink(archivePath);
      } catch (cleanupError) {
        this.logger.warn(`Failed to cleanup uploaded file: ${cleanupError.message}`);
      }

      throw error;
    }
  }

  /**
   * Get backup settings (creates default if not exists)
   */
  async getBackupSettings(): Promise<BackupSettingsResponseDto> {
    try {
      let settings = await this.backupSettingsRepository.findOne({
        where: { isActive: true },
      });

      // Create default settings if none exist
      if (!settings) {
        settings = await this.createDefaultBackupSettings();
      }

      return this.mapToBackupSettingsResponseDto(settings);
    } catch (error) {
      this.logger.error(
        `Failed to get backup settings: ${error.message}`,
        error.stack,
      );
      throw new InternalServerErrorException('Failed to retrieve backup settings');
    }
  }

  /**
   * Update backup settings
   */
  async updateBackupSettings(
    updateDto: UpdateBackupSettingsDto,
    updatedBy = 'system',
  ): Promise<BackupSettingsResponseDto> {
    try {
      let settings = await this.backupSettingsRepository.findOne({
        where: { isActive: true },
      });

      if (!settings) {
        // Create new settings if none exist
        settings = this.backupSettingsRepository.create({
          ...updateDto,
          isActive: true,
        });
      } else {
        // Update existing settings
        Object.assign(settings, updateDto);
      }

      const savedSettings = await this.backupSettingsRepository.save(settings);

      this.logger.log(`Backup settings updated by ${updatedBy}`);

      return this.mapToBackupSettingsResponseDto(savedSettings);
    } catch (error) {
      this.logger.error(
        `Failed to update backup settings: ${error.message}`,
        error.stack,
      );
      throw new InternalServerErrorException('Failed to update backup settings');
    }
  }

  /**
   * Create default backup settings
   */
  private async createDefaultBackupSettings(): Promise<BackupRetentionSettings> {
    const defaultSettings = this.backupSettingsRepository.create({
      retentionDays: 30,
      autoCleanupEnabled: true,
      cleanupTime: '02:00',
      maximumBackupsToKeep: null,
      maximumTotalSize: null,
      isActive: true,
    });

    const savedSettings = await this.backupSettingsRepository.save(defaultSettings);
    this.logger.log('Default backup settings created');

    return savedSettings;
  }

  /**
   * Map entity to backup settings response DTO
   */
  private mapToBackupSettingsResponseDto(
    settings: BackupRetentionSettings,
  ): BackupSettingsResponseDto {
    return plainToInstance(BackupSettingsResponseDto, settings, {
      excludeExtraneousValues: true,
    });
  }

  /**
   * Cleanup old backups based on retention settings
   */
  async cleanupBackupsWithSettings(): Promise<number> {
    try {
      const settings = await this.getBackupSettings();

      if (!settings.autoCleanupEnabled) {
        this.logger.log('Auto cleanup is disabled, skipping cleanup');
        return 0;
      }

      // Get all backups (completed, failed, or stuck in_progress) ordered by creation date (oldest first)
      // We include all statuses because stuck/failed backups should also be cleaned up
      const allBackups = await this.backupLogRepository.find({
        order: { createdAt: 'ASC' },
      });

      let deletedCount = 0;
      const now = new Date();
      const retentionCutoff = new Date();
      retentionCutoff.setDate(retentionCutoff.getDate() - settings.retentionDays);

      this.logger.log(
        `Running cleanup with settings: retentionDays=${settings.retentionDays}, ` +
        `maximumBackupsToKeep=${settings.maximumBackupsToKeep}, ` +
        `maximumTotalSize=${settings.maximumTotalSize}`,
      );

      // Calculate total size
      let totalSize = allBackups.reduce((sum, b) => sum + (b.size || 0), 0);

      // First, delete backups older than retention period
      const backupsToKeep = [];
      const backupsToDelete = [];

      for (const backup of allBackups) {
        const isOld = backup.createdAt < retentionCutoff;

        if (isOld) {
          backupsToDelete.push(backup);
        } else {
          backupsToKeep.push(backup);
        }
      }

      // Delete backups exceeding maximum count
      if (settings.maximumBackupsToKeep && backupsToKeep.length > settings.maximumBackupsToKeep) {
        const excess = backupsToKeep.length - settings.maximumBackupsToKeep;
        // Add oldest backups to delete list
        backupsToDelete.push(...backupsToKeep.slice(0, excess));
        backupsToKeep.splice(0, excess);
      }

      // Delete backups if total size exceeds maximum (delete oldest first)
      if (settings.maximumTotalSize && totalSize > settings.maximumTotalSize) {
        while (
          backupsToKeep.length > 0 &&
          totalSize > settings.maximumTotalSize
        ) {
          const oldestBackup = backupsToKeep.shift();
          if (oldestBackup) {
            backupsToDelete.push(oldestBackup);
            totalSize -= oldestBackup.size || 0;
          }
        }
      }

      // Perform the deletions
      for (const backup of backupsToDelete) {
        try {
          await this.remove(backup.id);
          deletedCount++;
        } catch (error) {
          this.logger.warn(`Failed to delete backup ${backup.id}: ${error.message}`);
        }
      }

      this.logger.log(
        `Cleanup completed: ${deletedCount} backups deleted, ${backupsToKeep.length} backups retained`,
      );

      return deletedCount;
    } catch (error) {
      this.logger.error(`Cleanup with settings failed: ${error.message}`, error.stack);
      throw error;
    }
  }
}
