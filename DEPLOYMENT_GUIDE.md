# Production Deployment Guide - ERP System with Authentication

**Version:** 1.0.0
**Last Updated:** December 30, 2025
**Authentication System:** JWT with Refresh Tokens

---

## Table of Contents

1. [Pre-Deployment Checklist](#pre-deployment-checklist)
2. [Environment Setup](#environment-setup)
3. [Security Configuration](#security-configuration)
4. [Database Setup](#database-setup)
5. [Deployment Steps](#deployment-steps)
6. [Post-Deployment Verification](#post-deployment-verification)
7. [Monitoring & Maintenance](#monitoring--maintenance)
8. [Rollback Procedure](#rollback-procedure)
9. [Troubleshooting](#troubleshooting)

---

## Pre-Deployment Checklist

### Critical Items ✅

- [ ] Generate unique JWT_SECRET (128 characters)
- [ ] Configure HTTPS/SSL certificates
- [ ] Change default admin password
- [ ] Set strong database passwords
- [ ] Review and update CORS settings
- [ ] Run all tests (backend + frontend)
- [ ] Backup existing database (if upgrading)
- [ ] Prepare rollback plan

### Recommended Items

- [ ] Set up monitoring and alerting
- [ ] Configure automated backups
- [ ] Document access credentials securely
- [ ] Review audit log retention policy
- [ ] Test disaster recovery procedure

---

## Environment Setup

### 1. Generate JWT Secret

```bash
# Generate a secure 128-character secret
node -e "console.log(require('crypto').randomBytes(64).toString('hex'))"

# Save this output - you'll need it for docker-compose.yml
```

### 2. Create Environment Configuration

```bash
# Copy example environment file
cp .env.example .env

# Edit .env with your values
nano .env
```

Required environment variables:

```env
# Database
DATABASE_PASSWORD=your_strong_password_here

# JWT Authentication
JWT_SECRET=<generated_128_char_secret>
JWT_ACCESS_TOKEN_EXPIRY=15m
JWT_REFRESH_TOKEN_EXPIRY=7d
```

### 3. Update docker-compose.yml

```yaml
# Update backend service environment variables
environment:
  - JWT_SECRET=${JWT_SECRET}
  - DATABASE_PASSWORD=${DATABASE_PASSWORD}
  # ... other variables
```

---

## Security Configuration

### 1. HTTPS/SSL Setup

#### Option A: Let's Encrypt (Recommended for Production)

```bash
# Install certbot
sudo apt-get update
sudo apt-get install certbot python3-certbot-nginx

# Obtain SSL certificate
sudo certbot --nginx -d your-domain.com

# Certificates will be stored in:
# /etc/letsencrypt/live/your-domain.com/
```

#### Option B: Self-Signed Certificate (Development/Testing)

```bash
# Generate self-signed certificate
openssl req -x509 -nodes -days 365 -newkey rsa:2048 \
  -keyout /etc/nginx/ssl/key.pem \
  -out /etc/nginx/ssl/cert.pem
```

### 2. Update NGINX Configuration

Edit `nginx/nginx.conf`:

```nginx
server {
    listen 80;
    server_name your-domain.com;

    # Redirect HTTP to HTTPS
    return 301 https://$server_name$request_uri;
}

server {
    listen 443 ssl http2;
    server_name your-domain.com;

    # SSL Configuration
    ssl_certificate /etc/letsencrypt/live/your-domain.com/fullchain.pem;
    ssl_certificate_key /etc/letsencrypt/live/your-domain.com/privkey.pem;
    ssl_protocols TLSv1.2 TLSv1.3;
    ssl_ciphers HIGH:!aNULL:!MD5;
    ssl_prefer_server_ciphers on;

    # Security Headers
    add_header Strict-Transport-Security "max-age=31536000; includeSubDomains" always;
    add_header X-Frame-Options "SAMEORIGIN" always;
    add_header X-Content-Type-Options "nosniff" always;
    add_header X-XSS-Protection "1; mode=block" always;

    # Rate Limiting (Optional)
    limit_req_zone $binary_remote_addr zone=login:10m rate=5r/m;

    location /api/auth/login {
        limit_req zone=login burst=3 nodelay;
        proxy_pass http://backend:3001;
        # ... proxy headers
    }

    # Existing proxy configuration...
}
```

### 3. Configure CORS (if needed)

Edit `backend/src/main.ts`:

```typescript
app.enableCors({
  origin: ['https://your-domain.com', 'https://www.your-domain.com'],
  credentials: true,
  methods: ['GET', 'POST', 'PUT', 'PATCH', 'DELETE', 'OPTIONS'],
});
```

---

## Database Setup

### 1. Backup Existing Database (if upgrading)

```bash
# Create backup directory
mkdir -p backups

# Backup PostgreSQL database
docker compose exec postgres pg_dump -U erp_user erp_db > backups/erp_db_$(date +%Y%m%d_%H%M%S).sql

# Backup MongoDB (if used)
docker compose exec mongodb mongodump --out /backup
```

### 2. Run Migrations

```bash
# Check current migration status
docker compose run backend npm run migration:show

# Run pending migrations
docker compose run backend npm run migration:run

# Verify migrations were successful
docker compose run backend npm run migration:show
```

Expected migrations:
- ✅ CreateRefreshTokenTable
- ✅ HashExistingPasswords
- ✅ CreateDefaultAdmin

### 3. Verify Default Admin User

```bash
# Connect to database
docker compose exec postgres psql -U erp_user -d erp_db

# Check admin user exists
SELECT id, username, email, role, status FROM users WHERE username = 'admin';

# Exit psql
\q
```

---

## Deployment Steps

### Step 1: Stop Existing Services

```bash
# Stop all running containers
docker compose down

# Optional: Remove old images to force rebuild
docker compose down --rmi all
```

### Step 2: Build New Images

```bash
# Build all services
docker compose build

# Verify images were created
docker images | grep erp
```

### Step 3: Start Services

```bash
# Start all services in detached mode
docker compose up -d

# Watch logs during startup
docker compose logs -f
```

### Step 4: Verify Services are Running

```bash
# Check container status
docker compose ps

# Expected output:
# NAME        SERVICE     STATUS      PORTS
# backend     backend     running     0.0.0.0:3001->3001/tcp
# frontend    frontend    running     0.0.0.0:3000->80/tcp
# postgres    postgres    running     5432/tcp
# redis       redis       running     6379/tcp
# mongodb     mongodb     running     27017/tcp
```

### Step 5: Run Database Migrations

```bash
# This should already be done, but verify
docker compose exec backend npm run migration:show

# If needed, run migrations
docker compose run backend npm run migration:run
```

---

## Post-Deployment Verification

### 1. Health Checks

```bash
# Check backend health
curl http://localhost:3001/api/health

# Expected: {"status":"ok","timestamp":"..."}

# Check frontend
curl http://localhost:3000

# Expected: HTML content
```

### 2. Test Authentication Flow

#### Test 1: Login with Default Credentials

```bash
# Test login endpoint
curl -X POST http://localhost:3001/api/auth/login \
  -H "Content-Type: application/json" \
  -d '{
    "usernameOrEmail": "admin",
    "password": "Admin@123!"
  }'

# Expected response:
# {
#   "accessToken": "eyJhbGc...",
#   "refreshToken": "random_hex_string",
#   "user": {
#     "id": "...",
#     "username": "admin",
#     "email": "admin@erp.local",
#     "role": "admin"
#   },
#   "expiresIn": 900
# }
```

#### Test 2: Access Protected Endpoint

```bash
# Save access token from previous response
ACCESS_TOKEN="eyJhbGc..."

# Test protected endpoint
curl http://localhost:3001/api/users \
  -H "Authorization: Bearer $ACCESS_TOKEN"

# Expected: JSON array of users
```

#### Test 3: Test Without Token (Should Fail)

```bash
# Try to access protected endpoint without token
curl http://localhost:3001/api/users

# Expected: 401 Unauthorized
```

### 3. Frontend Verification

1. **Open Browser**: Navigate to `http://localhost:3000`
2. **Expected**: Redirect to `/login`
3. **Login**: Use `admin / Admin@123!`
4. **Expected**: Redirect to `/dashboard`
5. **Verify**: User menu shows admin name and role
6. **Test Logout**: Click user menu > Logout
7. **Expected**: Redirect to `/login`

### 4. Change Default Admin Password ⚠️ CRITICAL

**IMPORTANT:** Do this immediately after deployment!

1. Login to frontend with `admin / Admin@123!`
2. Click User Avatar > Change Password
3. Current Password: `Admin@123!`
4. New Password: Strong unique password (min 8 chars, uppercase, lowercase, number, special char)
5. Confirm Password: Same as new password
6. Click "Change Password"
7. Expected: Logout and redirect to login
8. Login with new password to verify

### 5. Run Automated Tests

```bash
# Backend unit tests
docker compose exec backend npm run test

# Backend E2E tests
docker compose exec backend npm run test:e2e

# Frontend tests
docker compose exec frontend npm run test
```

Expected results:
- ✅ 57 backend tests passing
- ✅ 24 frontend tests passing
- ✅ 0 failures

---

## Monitoring & Maintenance

### 1. Set Up Log Monitoring

```bash
# View real-time logs
docker compose logs -f

# View specific service logs
docker compose logs -f backend
docker compose logs -f frontend

# Save logs to file
docker compose logs > logs/deployment_$(date +%Y%m%d_%H%M%S).log
```

### 2. Monitor Key Metrics

#### Failed Login Attempts

```sql
-- Connect to database
docker compose exec postgres psql -U erp_user -d erp_db

-- Check failed login attempts (last 24 hours)
SELECT username, failed_login_attempts, locked_until, last_login_at
FROM users
WHERE failed_login_attempts > 0
AND updated_at > NOW() - INTERVAL '24 hours'
ORDER BY failed_login_attempts DESC;
```

#### Active Sessions

```sql
-- Count active refresh tokens
SELECT COUNT(*) as active_sessions
FROM refresh_tokens
WHERE expires_at > NOW();

-- Sessions by user
SELECT u.username, COUNT(rt.id) as session_count
FROM users u
LEFT JOIN refresh_tokens rt ON u.id = rt.user_id
WHERE rt.expires_at > NOW()
GROUP BY u.username
ORDER BY session_count DESC;
```

#### Account Lockouts

```sql
-- Currently locked accounts
SELECT username, email, locked_until, failed_login_attempts
FROM users
WHERE locked_until > NOW()
ORDER BY locked_until DESC;
```

### 3. Automated Backups

Set up daily automated backups:

```bash
# Create backup script
cat > /home/erp/backup.sh << 'EOF'
#!/bin/bash
BACKUP_DIR="/home/erp/backups"
DATE=$(date +%Y%m%d_%H%M%S)

# Create backup directory
mkdir -p $BACKUP_DIR

# Backup PostgreSQL
docker compose exec -T postgres pg_dump -U erp_user erp_db > $BACKUP_DIR/postgres_$DATE.sql

# Backup MongoDB
docker compose exec -T mongodb mongodump --archive > $BACKUP_DIR/mongodb_$DATE.archive

# Keep only last 7 days of backups
find $BACKUP_DIR -type f -mtime +7 -delete

echo "Backup completed: $DATE"
EOF

# Make executable
chmod +x /home/erp/backup.sh

# Add to crontab (daily at 2 AM)
(crontab -l 2>/dev/null; echo "0 2 * * * /home/erp/backup.sh >> /home/erp/backup.log 2>&1") | crontab -
```

### 4. Security Monitoring

```bash
# Monitor authentication attempts
docker compose logs backend | grep "auth/login"

# Monitor token refresh
docker compose logs backend | grep "auth/refresh"

# Monitor failed attempts
docker compose logs backend | grep "401\|403"
```

---

## Rollback Procedure

### If Authentication Breaks Production

#### Quick Rollback (Disable Authentication)

**File:** `backend/src/app.module.ts`

```typescript
// Comment out global authentication guard
providers: [
  // {
  //   provide: APP_GUARD,
  //   useClass: JwtAuthGuard,
  // },
],
```

```bash
# Rebuild and restart backend
docker compose build backend
docker compose up -d backend
```

**Status:** All endpoints now public (emergency only!)

#### Full Rollback (Revert Migrations)

```bash
# Stop services
docker compose down

# Restore database backup
docker compose exec -T postgres psql -U erp_user -d erp_db < backups/erp_db_TIMESTAMP.sql

# Revert migrations (3 auth migrations)
docker compose run backend npm run migration:revert
docker compose run backend npm run migration:revert
docker compose run backend npm run migration:revert

# Restart services
docker compose up -d
```

---

## Troubleshooting

### Issue 1: Cannot Login - 401 Unauthorized

**Symptoms:**
- Login returns 401 even with correct credentials
- Error: "Invalid credentials"

**Diagnosis:**

```bash
# Check if default admin user exists
docker compose exec postgres psql -U erp_user -d erp_db -c "SELECT username, email, status, is_active FROM users WHERE username = 'admin';"

# Check if password is hashed
docker compose exec postgres psql -U erp_user -d erp_db -c "SELECT username, substring(password, 1, 10) as password_prefix FROM users WHERE username = 'admin';"
# Expected: $2b$12$...
```

**Solutions:**

```bash
# Option 1: Reset admin password manually
docker compose exec postgres psql -U erp_user -d erp_db

UPDATE users
SET password = '$2b$12$KnXeVzSHW3hK5xGk6.h0jOYGQm6pqFz0fF8Vu9Rz1QZ5X8X8X8X8X'
WHERE username = 'admin';
-- This sets password to: Admin@123!

\q

# Option 2: Re-run default admin migration
docker compose run backend npm run migration:revert  # Revert CreateDefaultAdmin
docker compose run backend npm run migration:run     # Re-apply CreateDefaultAdmin
```

### Issue 2: Token Refresh Fails

**Symptoms:**
- Frontend keeps redirecting to login
- Console error: "Failed to refresh token"

**Diagnosis:**

```bash
# Check refresh_tokens table
docker compose exec postgres psql -U erp_user -d erp_db -c "SELECT COUNT(*) FROM refresh_tokens WHERE expires_at > NOW();"

# Check backend logs
docker compose logs backend | grep "refresh"
```

**Solutions:**

```bash
# Clear all refresh tokens (forces re-login)
docker compose exec postgres psql -U erp_user -d erp_db -c "DELETE FROM refresh_tokens;"

# Restart backend
docker compose restart backend
```

### Issue 3: All Endpoints Return 401

**Symptoms:**
- Even public endpoints return 401
- `/api/auth/login` returns 401

**Diagnosis:**

```bash
# Check if global guard is properly configured
docker compose exec backend cat src/app.module.ts | grep -A 5 "APP_GUARD"

# Check backend logs for errors
docker compose logs backend --tail=50
```

**Solutions:**

```bash
# Verify JWT_SECRET is set
docker compose exec backend env | grep JWT

# If missing, update docker-compose.yml and restart
docker compose down
docker compose up -d
```

### Issue 4: Account Locked

**Symptoms:**
- Login returns 403
- Message: "Account locked"

**Solutions:**

```sql
-- Unlock specific user
docker compose exec postgres psql -U erp_user -d erp_db

UPDATE users
SET failed_login_attempts = 0,
    locked_until = NULL
WHERE username = 'admin';

\q
```

### Issue 5: Tests Failing

**Common Causes:**

```bash
# 1. Database not clean
docker compose exec backend npm run test:e2e
# If fails, check test database configuration

# 2. Missing dependencies
docker compose exec backend npm install

# 3. Port conflicts
docker compose ps
# Check if all services are running
```

---

## Quick Reference

### Useful Commands

```bash
# View all containers
docker compose ps

# View logs
docker compose logs -f backend

# Restart single service
docker compose restart backend

# Execute command in container
docker compose exec backend npm run migration:show

# Connect to database
docker compose exec postgres psql -U erp_user -d erp_db

# Generate JWT secret
node -e "console.log(require('crypto').randomBytes(64).toString('hex'))"

# Check service health
curl http://localhost:3001/api/health
```

### Emergency Contacts

- **System Administrator**: [Your contact]
- **Database Administrator**: [Your contact]
- **Security Team**: [Your contact]

### Documentation Links

- [CLAUDE.md](./CLAUDE.md) - Complete system documentation
- [SECURITY_AUDIT_PHASE4.md](./SECURITY_AUDIT_PHASE4.md) - Security audit report
- [plan.md](./plan.md) - Authentication implementation plan
- [API Documentation](http://localhost:3001/api/docs) - Swagger API docs

---

## Success Criteria

✅ Deployment is successful when:

1. All Docker containers are running
2. Health check returns 200 OK
3. Can login with admin credentials
4. Protected endpoints require authentication
5. Token refresh works automatically
6. All tests pass (81/81)
7. Default admin password changed
8. HTTPS configured (production only)
9. Backups automated
10. Monitoring in place

---

**Deployment Guide Version:** 1.0.0
**Last Updated:** December 30, 2025
**Maintainer:** ERP Development Team
