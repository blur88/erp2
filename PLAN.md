# Backup and Restore System - Implementation Plan

## Overview
Implement a comprehensive backup and restore system for the entire database (PostgreSQL, MongoDB) and system settings (Redis). This feature will enable administrators to create full system backups and restore from previous backup points.

## Goals
1. **Complete Data Backup**: Backup PostgreSQL (all entities), MongoDB (analytics/reports), and Redis (settings/cache)
2. **System Settings Backup**: Include application configuration, print settings, and company settings
3. **Scheduled Backups**: Automated daily/weekly backup scheduling
4. **Manual Backups**: On-demand backup creation via UI
5. **Restore Functionality**: Ability to restore from any backup point with confirmation
6. **Backup Management**: List, download, delete backup files
7. **Storage Options**: Local filesystem storage with optional cloud storage extension

## Architecture Design

### Backend Components

#### 1. Backup Module (`backend/src/modules/backup/`)
```
backup/
├── backup.module.ts
├── backup.controller.ts
├── backup.service.ts
├── dto/
│   ├── create-backup.dto.ts
│   ├── restore-backup.dto.ts
│   └── backup-schedule.dto.ts
├── entities/
│   └── backup-log.entity.ts
└── interfaces/
    └── backup-metadata.interface.ts
```

#### 2. Backup Service Responsibilities
- **PostgreSQL Backup**: Use `pg_dump` to create SQL dump files
- **MongoDB Backup**: Use `mongodump` for BSON exports
- **Redis Backup**: Use `SAVE`/`BGSAVE` for RDB snapshots
- **Settings Export**: JSON export of system/print/company settings
- **Compression**: Create `.tar.gz` archives for backup files
- **Metadata**: Store backup metadata (timestamp, size, type, status)

#### 3. Backup Entity Schema
```typescript
BackupLog {
  id: UUID
  filename: string
  filepath: string
  backupType: 'manual' | 'scheduled'
  status: 'in_progress' | 'completed' | 'failed'
  size: number (bytes)
  databases: string[] // ['postgresql', 'mongodb', 'redis']
  startedAt: Date
  completedAt: Date
  createdBy: string
  metadata: JSON // { pgVersion, mongoVersion, redisVersion, tables, collections }
  error?: string
}
```

#### 4. API Endpoints
```
POST   /api/backup/create              - Create manual backup
POST   /api/backup/restore/:id         - Restore from backup
GET    /api/backup/list                - List all backups
GET    /api/backup/download/:id        - Download backup file
DELETE /api/backup/delete/:id          - Delete backup file
GET    /api/backup/schedule            - Get backup schedule
PUT    /api/backup/schedule            - Update backup schedule
GET    /api/backup/status/:id          - Get backup operation status
```

#### 5. Backup Queue System (Bull Queue)
- **Queue Name**: `backup-queue`
- **Jobs**:
  - `create-backup`: Async backup creation
  - `scheduled-backup`: Cron-triggered backups
  - `cleanup-old-backups`: Remove backups older than retention period
- **Progress Tracking**: Emit progress events via WebSocket

#### 6. Backup Storage Structure
```
/app/backups/
├── postgresql/
│   └── erp_db_2025-12-25_14-30-00.sql
├── mongodb/
│   └── erp_analytics_2025-12-25_14-30-00/
├── redis/
│   └── dump_2025-12-25_14-30-00.rdb
├── settings/
│   └── settings_2025-12-25_14-30-00.json
└── archives/
    └── full_backup_2025-12-25_14-30-00.tar.gz
```

### Frontend Components

#### 1. Backup Management Page (`frontend/src/pages/settings/BackupManagement.tsx`)
**Features**:
- List of all backups with metadata (date, size, type, status)
- "Create Backup" button for manual backups
- Actions: Download, Restore, Delete
- Backup schedule configuration
- Real-time backup progress indicator
- Confirmation dialogs for restore operations

#### 2. Backup Schedule Dialog (`frontend/src/components/backup/BackupScheduleDialog.tsx`)
**Configuration Options**:
- Enable/disable automated backups
- Frequency: Daily, Weekly, Monthly
- Time of day for execution
- Retention policy (keep last N backups)
- Email notifications on completion/failure

#### 3. Restore Confirmation Dialog (`frontend/src/components/backup/RestoreConfirmationDialog.tsx`)
**Warning Features**:
- Display backup metadata (date, size, databases included)
- Warning about overwriting current data
- Checkbox: "I understand this will replace all current data"
- Two-step confirmation (type "RESTORE" to confirm)
- Estimated restore time

#### 4. Backup Progress Indicator (`frontend/src/components/backup/BackupProgress.tsx`)
**Real-time Updates**:
- WebSocket connection for live progress
- Progress bar with percentage
- Current operation status (e.g., "Backing up PostgreSQL...")
- Estimated time remaining
- Cancel operation button

### Database Schema

#### PostgreSQL Migration
```sql
CREATE TABLE backup_logs (
  id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
  filename VARCHAR(255) NOT NULL,
  filepath VARCHAR(500) NOT NULL,
  backup_type VARCHAR(20) NOT NULL CHECK (backup_type IN ('manual', 'scheduled')),
  status VARCHAR(20) NOT NULL CHECK (status IN ('in_progress', 'completed', 'failed')),
  size BIGINT,
  databases TEXT[] DEFAULT '{}',
  started_at TIMESTAMP NOT NULL DEFAULT NOW(),
  completed_at TIMESTAMP,
  created_by VARCHAR(100) DEFAULT 'system',
  metadata JSONB,
  error TEXT,
  created_at TIMESTAMP DEFAULT NOW(),
  updated_at TIMESTAMP DEFAULT NOW()
);

CREATE INDEX idx_backup_logs_status ON backup_logs(status);
CREATE INDEX idx_backup_logs_created_at ON backup_logs(created_at DESC);
```

## Implementation Steps

### Phase 1: Core Backup Functionality (Day 1-2)
1. **Setup Module Structure**
   - Create BackupModule with controller, service, entities
   - Add BackupLog entity with TypeORM
   - Create database migration for backup_logs table

2. **Implement PostgreSQL Backup**
   - Use `pg_dump` via child_process
   - Handle connection credentials from environment
   - Save SQL dump to backup directory
   - Compress with gzip

3. **Implement MongoDB Backup**
   - Use `mongodump` for BSON export
   - Handle authentication if configured
   - Save to backup directory

4. **Implement Redis Backup**
   - Trigger `BGSAVE` command
   - Copy RDB file to backup directory
   - Export settings as JSON for human readability

5. **Create Archive**
   - Combine all backup files into `.tar.gz`
   - Generate metadata file
   - Create BackupLog database record
   - Clean up temporary files

### Phase 2: Restore Functionality (Day 3)
1. **Implement PostgreSQL Restore**
   - Extract archive to temp directory
   - Drop existing database schema (with confirmation)
   - Use `psql` to restore from SQL dump
   - Verify restoration success

2. **Implement MongoDB Restore**
   - Extract BSON dump
   - Use `mongorestore` to import collections
   - Verify data integrity

3. **Implement Redis Restore**
   - Stop Redis temporarily
   - Replace RDB file
   - Restart Redis
   - Restore settings from JSON

4. **Post-Restore Actions**
   - Run database migrations if needed
   - Clear application cache
   - Restart backend services
   - Log restore operation

### Phase 3: Scheduling & Queue System (Day 4)
1. **Setup Bull Queue**
   - Create `backup-queue` processor
   - Add job handlers for create-backup
   - Implement progress tracking

2. **Implement Scheduled Backups**
   - Create BackupSchedule entity/settings
   - Add cron job configuration
   - Bull Queue repeatable jobs
   - Email notification on completion

3. **Cleanup Jobs**
   - Implement retention policy
   - Delete old backups automatically
   - Free up disk space

### Phase 4: Frontend Implementation (Day 5-6)
1. **Backup Management Page**
   - Create BackupManagement.tsx
   - Add Redux slice for backup state
   - Implement backup list with MUI DataGrid
   - Add action buttons (Create, Download, Restore, Delete)

2. **Backup Creation**
   - Create backup button with loading state
   - WebSocket integration for progress
   - Success/error notifications
   - Auto-refresh list on completion

3. **Restore Functionality**
   - RestoreConfirmationDialog component
   - Two-step confirmation process
   - Progress tracking during restore
   - Success confirmation with page reload

4. **Schedule Configuration**
   - BackupScheduleDialog component
   - Form with schedule options
   - Save/update schedule settings

### Phase 5: Testing & Documentation (Day 7)
1. **Backend Tests**
   - Unit tests for BackupService methods
   - Integration tests for backup/restore flow
   - Test error handling and edge cases

2. **Frontend Tests**
   - Component tests with Vitest
   - Integration tests for backup flow
   - Test WebSocket progress updates

3. **Documentation**
   - Update CLAUDE.md with backup module info
   - Add API endpoint documentation
   - Create user guide for backup/restore
   - Document backup file structure

## Technical Considerations

### Docker Integration
- Mount backup volume: `./backups:/app/backups`
- Ensure PostgreSQL, MongoDB clients installed in backend container
- Handle file permissions for backup directory
- Consider backup volume size limits

### Security
- Encrypt backup archives with AES-256
- Store encryption keys separately
- Validate backup integrity with checksums (SHA-256)
- Restrict restore operations to admin users only
- Sanitize file paths to prevent directory traversal

### Performance
- Use streaming for large database dumps
- Compress backups to save storage space
- Run backups during off-peak hours
- Set timeout limits for long operations
- Monitor disk space before backup creation

### Error Handling
- Graceful failure with detailed error logs
- Rollback on partial restore failures
- Retry logic for transient failures
- User-friendly error messages
- Backup verification before deletion

### Monitoring
- Track backup success/failure rates
- Alert on consecutive failures
- Monitor backup storage usage
- Log all backup/restore operations
- Dashboard widget for backup status

## Configuration

### Environment Variables
```env
# Backup Configuration
BACKUP_ENABLED=true
BACKUP_DIRECTORY=/app/backups
BACKUP_RETENTION_DAYS=30
BACKUP_ENCRYPTION_ENABLED=true
BACKUP_ENCRYPTION_KEY=<secret-key>
BACKUP_MAX_SIZE_GB=10

# Scheduled Backups
BACKUP_SCHEDULE_ENABLED=true
BACKUP_SCHEDULE_CRON=0 2 * * * # Daily at 2 AM
BACKUP_NOTIFICATION_EMAIL=admin@example.com

# Database Credentials (for backup tools)
POSTGRES_BACKUP_HOST=postgres
POSTGRES_BACKUP_PORT=5432
MONGO_BACKUP_URI=mongodb://mongodb:27017
```

### Default Schedule Settings
```typescript
{
  enabled: false,
  frequency: 'daily',
  time: '02:00',
  retentionDays: 30,
  includeDatabases: ['postgresql', 'mongodb', 'redis'],
  includeSettings: true,
  compression: 'gzip',
  encryption: true,
  notifications: {
    enabled: false,
    email: '',
    onSuccess: false,
    onFailure: true
  }
}
```

## Navigation Integration

### Settings Module
Add backup management to settings navigation:
- Settings > Backup & Restore
- Settings > Backup Schedule
- Route: `/settings/backup`

### Dashboard Widget (Optional)
- Last backup status
- Next scheduled backup
- Quick "Create Backup" action
- Storage usage indicator

## Success Metrics
1. ✅ Successfully create full system backup (PostgreSQL + MongoDB + Redis)
2. ✅ Successfully restore from backup and verify data integrity
3. ✅ Scheduled backups run automatically according to cron schedule
4. ✅ Backup retention policy automatically removes old backups
5. ✅ Frontend UI allows easy backup management
6. ✅ WebSocket provides real-time backup/restore progress
7. ✅ Comprehensive error handling and logging
8. ✅ All backup operations logged in database

## Future Enhancements
1. **Cloud Storage Integration**: Upload backups to AWS S3, Google Cloud Storage
2. **Incremental Backups**: Only backup changes since last full backup
3. **Selective Restore**: Restore individual tables/collections
4. **Backup Comparison**: Diff tool to compare backup states
5. **Multi-Environment**: Restore production backup to staging
6. **Disaster Recovery**: Automated backup testing and validation
7. **Backup Replication**: Mirror backups to multiple locations
8. **Point-in-Time Recovery**: Restore to specific transaction timestamp

## Risk Assessment

### High Risk Areas
- **Data Loss**: Restore operation overwrites current data (mitigated by strong confirmation)
- **Disk Space**: Backups consume significant storage (mitigated by retention policy)
- **Downtime**: Restore requires application downtime (mitigated by progress tracking)
- **Corruption**: Backup files could be corrupted (mitigated by checksums)

### Mitigation Strategies
- Pre-restore validation of backup integrity
- Test restore process in staging environment first
- Keep multiple backup versions
- Monitor backup file health
- Implement backup verification jobs

## Dependencies

### Backend
- `@nestjs/bull` - Queue management
- `bull` - Job processing
- `tar` - Archive creation
- `pg_dump`, `pg_restore` - PostgreSQL backup tools (installed in Docker)
- `mongodump`, `mongorestore` - MongoDB backup tools (installed in Docker)
- `node-cron` - Cron scheduling (if not using Bull repeatable jobs)
- `archiver` - Node.js archiving library
- `fast-csv` - CSV export for settings

### Frontend
- No new dependencies (use existing MUI, Redux, Socket.IO)

### Docker
- Ensure `postgresql-client` installed in backend container
- Ensure `mongodb-database-tools` installed in backend container
- Mount backup volume in docker-compose.yml

## Estimated Timeline
- **Phase 1**: 2 days (Core backup functionality)
- **Phase 2**: 1 day (Restore functionality)
- **Phase 3**: 1 day (Scheduling & queue system)
- **Phase 4**: 2 days (Frontend implementation)
- **Phase 5**: 1 day (Testing & documentation)
- **Total**: 7 days

## Conclusion
This backup and restore system will provide comprehensive data protection for the ERP system, enabling disaster recovery, system migration, and data archival. The implementation follows the existing codebase patterns with TypeORM entities, NestJS modules, Bull queues, and Material-UI frontend components.
