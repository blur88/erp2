# Price List System Deployment Guide

**Version**: 1.0
**Target**: Production Deployment
**Last Updated**: January 2026

---

## Table of Contents

1. [Overview](#overview)
2. [Pre-Deployment Checklist](#pre-deployment-checklist)
3. [Backup Procedures](#backup-procedures)
4. [Migration Steps](#migration-steps)
5. [Deployment Steps](#deployment-steps)
6. [Post-Deployment Validation](#post-deployment-validation)
7. [Rollback Procedures](#rollback-procedures)
8. [Troubleshooting](#troubleshooting)
9. [Monitoring](#monitoring)

---

## Overview

### What's Being Deployed

This deployment introduces a comprehensive price list management system that migrates from JSONB-based pricing to a normalized relational database model.

**Components**:
- New database tables: `price_lists`, `price_list_items`
- New backend module: `PriceListsModule` with 13 API endpoints
- Updated entities: `Product`, `Customer` with new relationships
- Frontend pages: Price list management UI under Settings
- Data migration: Automated migration from legacy JSONB to new tables

**Migration Type**: Zero-downtime with backward compatibility

**Estimated Deployment Time**: 30-45 minutes (excluding backup)

---

## Pre-Deployment Checklist

### System Requirements

- [ ] PostgreSQL database version 12 or higher
- [ ] Backend: NestJS 11, Node.js 24, TypeORM configured
- [ ] Frontend: React 18.3.1, Material-UI v7
- [ ] Docker and Docker Compose (if using containerized deployment)
- [ ] Sufficient disk space for database backup (at least 2x current DB size)

### Access Requirements

- [ ] Database administrator access (for backup and migration)
- [ ] SSH access to production server
- [ ] Access to deployment scripts and configuration
- [ ] Access to monitoring tools (logs, metrics)

### Code Verification

- [ ] All tests passing in CI/CD pipeline (95+ tests)
- [ ] Code review completed and approved
- [ ] No merge conflicts in main/production branch
- [ ] Version tag created (e.g., `v1.0.0-price-lists`)

### Communication

- [ ] Deployment window scheduled and communicated to stakeholders
- [ ] Users notified of upcoming changes (if maintenance window needed)
- [ ] Support team briefed on new features
- [ ] Rollback plan reviewed and understood by team

### Environment Preparation

- [ ] Environment variables configured (if any new ones)
- [ ] Docker images built and tested locally
- [ ] Deployment scripts tested in staging environment
- [ ] Monitoring alerts configured for new endpoints

---

## Backup Procedures

### Critical: Always Backup Before Migration

**⚠️ MANDATORY STEP - DO NOT SKIP**

### Database Backup

#### Option 1: Using Built-in Backup Module

```bash
# Via API (if backup module is active)
curl -X POST http://localhost:3000/api/backup/create \
  -H "Authorization: Bearer YOUR_ADMIN_TOKEN"
```

#### Option 2: PostgreSQL Direct Backup

```bash
# Create backup directory
mkdir -p /backup/erp/$(date +%Y%m%d_%H%M%S)

# Full database backup
docker compose exec -T postgres pg_dump -U erp_user erp_db \
  > /backup/erp/$(date +%Y%m%d_%H%M%S)/erp_db_backup.sql

# Verify backup file
ls -lh /backup/erp/$(date +%Y%m%d_%H%M%S)/erp_db_backup.sql
```

#### Option 3: Docker Volume Backup

```bash
# Stop the database
docker compose stop postgres

# Backup the volume
docker run --rm \
  -v erp2_postgres_data:/source \
  -v /backup/erp:/backup \
  alpine tar czf /backup/postgres_volume_$(date +%Y%m%d_%H%M%S).tar.gz -C /source .

# Restart the database
docker compose start postgres
```

### Verify Backup Integrity

```bash
# Test restore to a temporary database (optional but recommended)
docker compose exec -T postgres psql -U erp_user -c "CREATE DATABASE erp_test;"
docker compose exec -T postgres psql -U erp_user -d erp_test \
  < /backup/erp/TIMESTAMP/erp_db_backup.sql
docker compose exec -T postgres psql -U erp_user -c "DROP DATABASE erp_test;"
```

### Store Backup Safely

- [ ] Backup copied to off-server location
- [ ] Backup integrity verified (file size, checksum)
- [ ] Backup location documented
- [ ] Backup retention policy applied

---

## Migration Steps

### Understanding the Migration

The migration consists of two TypeORM migrations:

1. **Schema Migration** (`1768231502083-CreatePriceListTables.ts`):
   - Creates `price_lists` table
   - Creates `price_list_items` table
   - Adds `priceListId` foreign key to `customers` table
   - Creates necessary indexes

2. **Data Migration** (`1768232000000-MigratePriceListData.ts`):
   - Migrates pricing schemes from `price_costing_settings` to `price_lists`
   - Migrates product pricing tiers from JSONB to `price_list_items`
   - Links customers to appropriate price lists
   - Validates data integrity

### Pre-Migration Checks

```bash
# Check current database state
docker compose exec postgres psql -U erp_user -d erp_db -c "
  SELECT COUNT(*) as product_count FROM products WHERE \"pricingTiers\" IS NOT NULL;
"

docker compose exec postgres psql -U erp_user -d erp_db -c "
  SELECT COUNT(*) as customer_count FROM customers WHERE \"pricingScheme\" IS NOT NULL;
"

docker compose exec postgres psql -U erp_user -d erp_db -c "
  SELECT * FROM price_costing_settings LIMIT 1;
"
```

### Running Migrations

#### Option 1: Using TypeORM CLI (Recommended)

```bash
# Navigate to backend directory
cd backend

# Show pending migrations
npm run migration:show

# Run all pending migrations
npm run migration:run

# Expected output:
# Migration CreatePriceListTables1768231502083 has been executed successfully.
# Migration MigratePriceListData1768232000000 has been executed successfully.
# Migration completed. Created 2 price lists, 42 price list items, linked 21 customers.
```

#### Option 2: Direct SQL Execution

```bash
# Execute schema migration
docker compose exec -T postgres psql -U erp_user -d erp_db \
  < backend/src/database/migrations/1768231502083-CreatePriceListTables.ts

# Execute data migration
docker compose exec -T postgres psql -U erp_user -d erp_db \
  < backend/src/database/migrations/1768232000000-MigratePriceListData.ts
```

### Migration Validation

```bash
# Verify tables created
docker compose exec postgres psql -U erp_user -d erp_db -c "
  SELECT table_name FROM information_schema.tables
  WHERE table_schema = 'public'
  AND table_name IN ('price_lists', 'price_list_items');
"

# Verify data migrated
docker compose exec postgres psql -U erp_user -d erp_db -c "
  SELECT COUNT(*) as price_list_count FROM price_lists;
"

docker compose exec postgres psql -U erp_user -d erp_db -c "
  SELECT COUNT(*) as price_list_item_count FROM price_list_items;
"

docker compose exec postgres psql -U erp_user -d erp_db -c "
  SELECT COUNT(*) as linked_customer_count FROM customers WHERE \"priceListId\" IS NOT NULL;
"

# Verify data integrity (compare prices)
docker compose exec postgres psql -U erp_user -d erp_db -c "
  SELECT
    p.name,
    p.\"pricingTiers\"->>'Retail' as legacy_retail_price,
    pli.price as new_retail_price
  FROM products p
  LEFT JOIN price_list_items pli ON pli.\"productId\" = p.id
  LEFT JOIN price_lists pl ON pl.id = pli.\"priceListId\" AND pl.code = 'RETAIL'
  WHERE p.\"pricingTiers\" IS NOT NULL
  LIMIT 10;
"
```

**Expected Results**:
- 2 tables created: `price_lists`, `price_list_items`
- 2+ price lists created (Retail, Wholesale, etc.)
- 40+ price list items (depends on product count × price lists)
- 20+ customers linked (depends on customer count)
- Legacy prices match new prices (100% integrity)

---

## Deployment Steps

### Step 1: Stop Services (Optional)

**Note**: If you prefer zero-downtime deployment, skip this step. The system supports both legacy and new pricing simultaneously.

```bash
# Optional: Stop services for safer deployment
docker compose stop backend frontend
```

### Step 2: Pull Latest Code

```bash
# Pull latest code from repository
git fetch origin
git checkout main  # or your production branch
git pull origin main

# Verify you're on correct commit
git log -1 --oneline
```

### Step 3: Build Docker Images

```bash
# Build backend and frontend images
docker compose build backend frontend

# Verify images built successfully
docker images | grep erp2
```

### Step 4: Run Database Migrations

```bash
# Start only the database if stopped
docker compose up -d postgres

# Wait for database to be ready
sleep 5

# Run migrations
docker compose run --rm backend npm run migration:run

# Or if backend is already running:
docker compose exec backend npm run migration:run
```

### Step 5: Start Services

```bash
# Start all services
docker compose up -d

# Verify all containers are running
docker compose ps

# Check logs for errors
docker compose logs backend --tail=50
docker compose logs frontend --tail=50
```

### Step 6: Verify Backend Started

```bash
# Check backend health
curl http://localhost:3001/api/health

# Check price list endpoints are registered
curl http://localhost:3001/api/price-lists \
  -H "Authorization: Bearer YOUR_TOKEN"

# Expected: List of price lists or empty array (not 404)
```

### Step 7: Verify Frontend Deployed

```bash
# Check frontend is accessible
curl -I http://localhost:3000

# Expected: 200 OK

# Check price list page is accessible
curl -I http://localhost:3000/settings/price-lists

# Expected: 200 OK
```

---

## Post-Deployment Validation

### Automated Validation Script

```bash
#!/bin/bash
# save as validate_deployment.sh

echo "=== Price List Deployment Validation ==="

# 1. Check backend health
echo "1. Checking backend health..."
curl -s http://localhost:3001/api/health | jq '.'

# 2. Check price list API
echo "2. Checking price list API..."
TOKEN="YOUR_ADMIN_TOKEN"
curl -s http://localhost:3000/api/price-lists \
  -H "Authorization: Bearer $TOKEN" | jq '.data | length'

# 3. Check database tables
echo "3. Checking database tables..."
docker compose exec -T postgres psql -U erp_user -d erp_db -t -c "
  SELECT
    (SELECT COUNT(*) FROM price_lists) as price_lists,
    (SELECT COUNT(*) FROM price_list_items) as items,
    (SELECT COUNT(*) FROM customers WHERE \"priceListId\" IS NOT NULL) as linked_customers;
"

# 4. Check default price list
echo "4. Checking default price list..."
curl -s http://localhost:3000/api/price-lists/default \
  -H "Authorization: Bearer $TOKEN" | jq '.data.code'

# 5. Test price calculation
echo "5. Testing price calculation (create test sales order)..."
# This depends on your specific customer and product IDs

echo "=== Validation Complete ==="
```

### Manual Validation Steps

#### 1. Test Price List Management UI

- [ ] Navigate to http://localhost:3000/settings/price-lists
- [ ] Verify price lists are displayed
- [ ] Click on a price list to view details
- [ ] Verify product prices are shown
- [ ] Try editing a price (inline editing)
- [ ] Verify changes save successfully

#### 2. Test Customer Price Assignment

- [ ] Navigate to Sales > Customers
- [ ] Edit an existing customer
- [ ] Verify "Price List" dropdown shows available price lists
- [ ] Select a price list and save
- [ ] Verify customer shows assigned price list

#### 3. Test Sales Order Pricing

- [ ] Create a new sales order for a customer with assigned price list
- [ ] Add products to the order
- [ ] Verify prices match the customer's price list
- [ ] Complete the sales order
- [ ] Verify order total is correct

#### 4. Test Backward Compatibility

- [ ] Find a product with legacy JSONB pricing but no price list item
- [ ] Create a sales order with this product
- [ ] Verify the legacy price is used (fallback)
- [ ] Check backend logs for "Using legacy pricing" message

#### 5. Test Advanced Features

- [ ] Copy a price list
- [ ] Verify all items copied
- [ ] Apply percentage adjustment
- [ ] Verify prices changed correctly
- [ ] Set a price list as default
- [ ] Verify default changed

### Validation Checklist

- [ ] All existing functionality still works (no regressions)
- [ ] Price list management UI is accessible
- [ ] API endpoints return expected data
- [ ] Database tables contain migrated data
- [ ] Data integrity is 100% (legacy prices match new prices)
- [ ] No errors in backend logs
- [ ] No errors in frontend console
- [ ] Sales orders use correct pricing
- [ ] Customers can be assigned to price lists
- [ ] Default price list is working

---

## Rollback Procedures

### When to Rollback

Rollback if:
- Critical bugs preventing normal operation
- Data integrity issues discovered
- System performance severely degraded
- Migration failed partially

**Do NOT rollback if**:
- Minor UI issues (can be fixed with hotfix)
- Non-critical bugs
- After significant usage (data created in new tables)

### Immediate Rollback (Within 1 hour)

**If no transactions have been created using the new system:**

#### Step 1: Stop Services

```bash
docker compose stop backend frontend
```

#### Step 2: Revert Database Migration

```bash
# Revert the data migration first
cd backend
npm run migration:revert

# Revert the schema migration
npm run migration:revert

# Or revert multiple migrations at once
npm run migration:revert -- -t 2
```

#### Step 3: Restore from Backup (if migration revert fails)

```bash
# Drop current database
docker compose exec postgres psql -U erp_user -c "DROP DATABASE erp_db;"

# Recreate database
docker compose exec postgres psql -U erp_user -c "CREATE DATABASE erp_db;"

# Restore from backup
docker compose exec -T postgres psql -U erp_user -d erp_db \
  < /backup/erp/TIMESTAMP/erp_db_backup.sql
```

#### Step 4: Revert Code

```bash
# Revert to previous commit
git log --oneline -5  # Find the commit before deployment
git revert HEAD       # Or git reset --hard COMMIT_HASH

# Rebuild images
docker compose build backend frontend
```

#### Step 5: Restart Services

```bash
docker compose up -d

# Verify services are running
docker compose ps
```

#### Step 6: Verify Rollback

```bash
# Check that new tables don't exist
docker compose exec postgres psql -U erp_user -d erp_db -c "
  SELECT table_name FROM information_schema.tables
  WHERE table_name IN ('price_lists', 'price_list_items');
"

# Expected: No rows returned

# Verify legacy pricing still works
# Test creating a sales order
```

### Delayed Rollback (After 1 hour)

**If transactions have been created using the new system:**

**⚠️ WARNING**: Do NOT rollback database after significant usage. Data created in new tables will be lost.

#### Option 1: Forward Fix (Recommended)

- Deploy a hotfix to address the specific issue
- Keep both systems running (backward compatibility ensures continuity)
- Fix data issues with SQL scripts if needed

#### Option 2: Data Preservation Rollback

If rollback is absolutely necessary:

1. **Export new data**:
   ```bash
   # Export price lists created after deployment
   docker compose exec -T postgres psql -U erp_user -d erp_db -c "
     COPY (SELECT * FROM price_lists WHERE \"createdAt\" > 'DEPLOYMENT_TIMESTAMP')
     TO STDOUT CSV HEADER
   " > new_price_lists.csv

   # Export price list items created after deployment
   docker compose exec -T postgres psql -U erp_user -d erp_db -c "
     COPY (SELECT * FROM price_list_items WHERE \"createdAt\" > 'DEPLOYMENT_TIMESTAMP')
     TO STDOUT CSV HEADER
   " > new_price_list_items.csv
   ```

2. **Perform rollback** (as in immediate rollback steps)

3. **Manually re-enter new data** after rollback

---

## Troubleshooting

### Issue: Migration Fails with Foreign Key Error

**Error**: `foreign key violation` or `relation does not exist`

**Cause**: Tables created out of order or migration ran partially

**Solution**:
```bash
# Check which migrations have run
npm run migration:show

# If schema migration didn't run, run it manually
npm run migration:run

# If partial, revert and re-run
npm run migration:revert
npm run migration:run
```

### Issue: Data Migration Shows Zero Records Migrated

**Error**: `Migration completed. Created 0 price lists, 0 price list items`

**Cause**: Source data doesn't exist or is in unexpected format

**Solution**:
```bash
# Check source data
docker compose exec postgres psql -U erp_user -d erp_db -c "
  SELECT * FROM price_costing_settings;
"

# Check products have pricingTiers
docker compose exec postgres psql -U erp_user -d erp_db -c "
  SELECT COUNT(*),
         COUNT(\"pricingTiers\") as with_pricing
  FROM products;
"

# If data exists but migration didn't work, check migration logs
docker compose logs backend | grep -i migration
```

### Issue: Backend Won't Start After Deployment

**Error**: Application crash or module load error

**Solution**:
```bash
# Check backend logs
docker compose logs backend --tail=100

# Common issues:
# 1. TypeScript compilation error - check for syntax errors
# 2. Missing dependencies - run npm install
# 3. Module import error - verify all files exist

# Restart backend with verbose logging
docker compose restart backend
docker compose logs backend -f
```

### Issue: Price List UI Returns 404

**Cause**: Frontend routing not configured or build failed

**Solution**:
```bash
# Check frontend logs
docker compose logs frontend

# Rebuild frontend
docker compose build frontend
docker compose up -d frontend

# Check browser console for errors
# Navigate to http://localhost:3000/settings/price-lists
```

### Issue: Prices Don't Match After Migration

**Cause**: Data transformation issue or JSONB format unexpected

**Solution**:
```bash
# Run data integrity check
docker compose exec postgres psql -U erp_user -d erp_db -c "
  SELECT
    p.name,
    p.\"pricingTiers\"->>'Retail' as legacy_price,
    pli.price as new_price,
    (p.\"pricingTiers\"->>'Retail')::numeric - pli.price as difference
  FROM products p
  LEFT JOIN price_list_items pli ON pli.\"productId\" = p.id
  LEFT JOIN price_lists pl ON pl.id = pli.\"priceListId\" AND pl.code = 'RETAIL'
  WHERE p.\"pricingTiers\" IS NOT NULL
  AND (p.\"pricingTiers\"->>'Retail')::numeric != pli.price;
"

# If differences found, may need to re-run data migration
# First, clear migrated data
docker compose exec postgres psql -U erp_user -d erp_db -c "
  DELETE FROM price_list_items;
  DELETE FROM price_lists;
"

# Then re-run migration
cd backend && npm run migration:run
```

---

## Monitoring

### What to Monitor

#### First 24 Hours

- [ ] Error rates in backend logs
- [ ] API response times for `/api/price-lists` endpoints
- [ ] Database query performance
- [ ] User complaints or support tickets
- [ ] Sales order creation success rate

#### First Week

- [ ] Legacy pricing fallback usage (should decrease over time)
- [ ] Price list API usage patterns
- [ ] Data integrity (periodic checks)
- [ ] Performance metrics vs baseline

### Monitoring Commands

```bash
# Check for errors in logs
docker compose logs backend | grep -i error | tail -20

# Check API endpoint access
docker compose logs backend | grep "GET /api/price-lists" | wc -l

# Check database performance
docker compose exec postgres psql -U erp_user -d erp_db -c "
  SELECT schemaname, tablename, seq_scan, seq_tup_read, idx_scan, idx_tup_fetch
  FROM pg_stat_user_tables
  WHERE tablename IN ('price_lists', 'price_list_items')
  ORDER BY seq_scan DESC;
"

# Check for legacy fallback usage
docker compose logs backend | grep "Using legacy pricing" | wc -l
```

### Metrics to Track

- **API Performance**: Response times <200ms for price queries
- **Error Rate**: <1% for price-related operations
- **Legacy Fallback**: Should trend toward 0 over transition period
- **User Adoption**: Number of price lists created, customers assigned
- **Data Integrity**: Weekly validation queries to ensure prices match

---

## Success Criteria

Deployment is successful if:

- [ ] All migrations completed without errors
- [ ] Zero data loss (100% data integrity)
- [ ] All tests passing (95+ tests)
- [ ] Price list UI accessible and functional
- [ ] API endpoints returning expected data
- [ ] Sales orders using correct pricing
- [ ] No critical bugs in first 24 hours
- [ ] System performance within 10% of baseline
- [ ] Legacy fallback working for incomplete data
- [ ] Users can create and manage price lists

---

## Post-Deployment Tasks

### Immediate (First Day)

- [ ] Monitor error logs continuously
- [ ] Respond to user questions and issues
- [ ] Document any issues encountered
- [ ] Update knowledge base with solutions

### Short-term (First Week)

- [ ] Train users on new price list features
- [ ] Migrate remaining products to price lists
- [ ] Verify all customers have appropriate price list assignments
- [ ] Review and optimize slow queries if any

### Long-term (First Month)

- [ ] Gather user feedback on new features
- [ ] Plan additional enhancements if needed
- [ ] Monitor legacy fallback usage (should be near zero)
- [ ] Prepare for Phase 8 cleanup (remove deprecated fields)

---

## Support and Escalation

### Tier 1: User Issues

- Documentation: [PRICE_LIST_USER_GUIDE.md](./PRICE_LIST_USER_GUIDE.md)
- FAQ section for common questions
- Support team handles basic inquiries

### Tier 2: Technical Issues

- Check this deployment guide troubleshooting section
- Review backend logs for errors
- Escalate to development team if needed

### Tier 3: Critical Issues

- Critical bugs requiring immediate attention
- Data integrity issues
- System performance degradation
- Contact: Development Team Lead
- Emergency: Consider rollback if within 1 hour

---

## Appendix

### Useful SQL Queries

```sql
-- Check migration status
SELECT * FROM migrations ORDER BY timestamp DESC LIMIT 5;

-- Count price lists and items
SELECT
  (SELECT COUNT(*) FROM price_lists) as price_lists,
  (SELECT COUNT(*) FROM price_list_items) as items,
  (SELECT COUNT(*) FROM customers WHERE "priceListId" IS NOT NULL) as linked_customers;

-- Find products without prices in default price list
SELECT p.id, p.name
FROM products p
LEFT JOIN price_list_items pli ON pli."productId" = p.id
LEFT JOIN price_lists pl ON pl.id = pli."priceListId" AND pl."isDefault" = true
WHERE pli.id IS NULL AND p."deletedAt" IS NULL;

-- Check data integrity
SELECT
  p.name,
  p."pricingTiers"->>'Retail' as legacy_retail,
  pli.price as new_retail,
  CASE
    WHEN (p."pricingTiers"->>'Retail')::numeric = pli.price THEN 'MATCH'
    ELSE 'MISMATCH'
  END as integrity_check
FROM products p
LEFT JOIN price_list_items pli ON pli."productId" = p.id
LEFT JOIN price_lists pl ON pl.id = pli."priceListId" AND pl.code = 'RETAIL'
WHERE p."pricingTiers" IS NOT NULL;
```

### Quick Reference

**Deployment Command Summary**:
```bash
# Full deployment
git pull origin main
docker compose build backend frontend
docker compose run --rm backend npm run migration:run
docker compose up -d
./validate_deployment.sh

# Quick rollback
docker compose stop backend frontend
cd backend && npm run migration:revert -- -t 2
git revert HEAD
docker compose build backend frontend
docker compose up -d
```

---

**Document Version**: 1.0
**Last Updated**: January 13, 2026
**Maintained By**: ERP Development Team
**Review Schedule**: After each deployment, update with lessons learned
