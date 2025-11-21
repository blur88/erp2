# Timezone Update to Asia/Kuala_Lumpur

This document describes the timezone configuration changes made to the ERP system.

## Summary

All components of the ERP system have been configured to use **Asia/Kuala_Lumpur** timezone:
- PostgreSQL database
- Redis cache
- Backend API (NestJS)
- Frontend application (React)
- NGINX proxy

## Changes Made

### 1. Docker Compose Configuration
**File**: `docker-compose.yml`

Added `TZ: Asia/Kuala_Lumpur` environment variable to all services:
- `postgres`
- `redis`
- `backend`
- `frontend`
- `nginx`

### 2. Database Migration
**File**: `backend/src/database/migrations/1732750000000-SetTimezoneToAsiaKualaLumpur.ts`

Created migration to set PostgreSQL timezone:
- Sets session timezone to Asia/Kuala_Lumpur
- Sets database default timezone to Asia/Kuala_Lumpur
- Adds database comment documenting timezone setting

### 3. TypeORM Configuration
**File**: `backend/src/config/database-config.factory.ts`

Added timezone configuration to database connection:
```typescript
extra: {
  timezone: 'Asia/Kuala_Lumpur',
  // ... other settings
}
```

### 4. Entity Configuration
All entities use `timestamptz` (timestamp with timezone) columns:
- `createdAt`: Timestamp when record was created
- `updatedAt`: Timestamp when record was last updated
- `deletedAt`: Timestamp when record was soft-deleted (if applicable)

Using `timestamptz` ensures timestamps are stored in UTC and automatically converted to the configured timezone.

## How to Apply Changes

### Option 1: Using the Update Script (Recommended)
```bash
./update-timezone.sh
```

This script will:
1. Stop all containers
2. Rebuild backend with new configuration
3. Start all containers
4. Run the timezone migration
5. Verify timezone settings

### Option 2: Manual Steps
```bash
# 1. Stop all containers
docker compose down

# 2. Rebuild backend
docker compose build backend

# 3. Start all containers
docker compose up -d

# 4. Run migration
docker compose exec backend npm run migration:run

# 5. Verify changes
./verify-timezone.sh
```

## Verification

Run the verification script to check timezone settings:
```bash
./verify-timezone.sh
```

This will show:
- Docker environment variables for all services
- PostgreSQL timezone setting
- Current time in PostgreSQL vs system time
- Sample data timestamps

### Manual Verification Commands

Check PostgreSQL timezone:
```bash
docker compose exec postgres psql -U erp_user -d erp_db -c "SHOW timezone;"
```

Check current timestamp:
```bash
docker compose exec postgres psql -U erp_user -d erp_db -c "SELECT NOW();"
```

Check Node.js timezone:
```bash
docker compose exec backend node -e "console.log(process.env.TZ, new Date().toString())"
```

## Important Notes

### Existing Data
- **Timestamps are NOT modified**: Existing data timestamps remain unchanged
- **Display timezone**: All timestamps will be displayed in Asia/Kuala_Lumpur timezone
- **Storage**: PostgreSQL stores `timestamptz` values in UTC internally
- **Conversion**: Automatic conversion happens when reading/writing data

### New Data
- All new timestamps will be recorded using Asia/Kuala_Lumpur timezone
- The timezone context is preserved in the database

### Time-based Operations
All time-based operations will now use Asia/Kuala_Lumpur timezone:
- `NOW()` function in PostgreSQL
- `new Date()` in Node.js
- Date filters and queries
- Scheduled tasks and cron jobs
- Log timestamps
- Report generation timestamps

### API Responses
- Frontend receives timestamps in ISO 8601 format
- Browser automatically converts to user's local timezone
- All server-side operations use Asia/Kuala_Lumpur

## Rollback

To rollback timezone changes:

1. Revert the migration:
```bash
docker compose exec backend npm run migration:revert
```

2. Remove timezone environment variables from `docker-compose.yml`

3. Remove timezone configuration from `backend/src/config/database-config.factory.ts`

4. Rebuild and restart:
```bash
docker compose down
docker compose build backend
docker compose up -d
```

## Testing

After applying changes, test the following:

1. **Create new records**: Verify timestamps are in Asia/Kuala_Lumpur
2. **View existing records**: Verify timestamps display correctly
3. **Date filters**: Test date range filters in reports
4. **Logs**: Check application logs show correct timezone
5. **WebSocket events**: Verify real-time events have correct timestamps

## Timezone Information

**Asia/Kuala_Lumpur Details:**
- UTC Offset: **UTC+8** (no daylight saving time)
- IANA Timezone: `Asia/Kuala_Lumpur`
- Also used by: Malaysia, Singapore (as Asia/Singapore)

## Troubleshooting

### Issue: Timezone not showing correctly
**Solution**: Ensure all containers are rebuilt and restarted

### Issue: Migration fails
**Solution**: Check if database is already using Asia/Kuala_Lumpur timezone:
```bash
docker compose exec postgres psql -U erp_user -d erp_db -c "SHOW timezone;"
```

### Issue: Timestamps showing wrong time
**Solution**:
1. Verify TZ environment variable is set: `docker compose exec backend sh -c 'echo $TZ'`
2. Restart backend service: `docker compose restart backend`

### Issue: Date filters not working
**Solution**: Clear browser cache and verify API responses include timezone information

## References

- PostgreSQL Timezone Documentation: https://www.postgresql.org/docs/current/datatype-datetime.html
- IANA Timezone Database: https://www.iana.org/time-zones
- Node.js Timezone: https://nodejs.org/api/process.html#process_process_env

---

**Last Updated**: November 2025
**Timezone**: Asia/Kuala_Lumpur (UTC+8)
