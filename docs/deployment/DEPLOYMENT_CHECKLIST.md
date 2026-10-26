# Price List System - Deployment Checklist

**Version**: 1.0

Use the [current deployment guide](../modules/price-lists/PRICE_LIST_DEPLOYMENT_GUIDE.md)
for migration and recovery procedures. Only the local Compose stack currently runs;
production-host checks remain unverified until that host exists.

**Deployment Date**: _____________
**Deployed By**: _____________
**Start Time**: _____________
**End Time**: _____________

---

## Pre-Deployment (1-2 hours before)

### System Preparation
- [ ] All team members notified of deployment
- [ ] Deployment window scheduled and communicated
- [ ] Support team briefed and standing by
- [ ] Monitoring dashboards open and ready

### Code Verification
- [ ] All CI/CD tests passing (95+ tests)
- [ ] Code review completed and approved
- [ ] Version tag created: `v______`
- [ ] Latest code pulled from repository
- [ ] No merge conflicts present
- [ ] Docker images built and tested locally

### Access & Tools
- [ ] Database admin credentials ready
- [ ] SSH access to production server verified
- [ ] Deployment scripts tested in staging
- [ ] Backup storage location prepared and verified
- [ ] Rollback plan reviewed by team

---

## Backup (MANDATORY - 30 minutes)

### Database Backup
- [ ] Backup directory created: `/backup/erp/[TIMESTAMP]`
- [ ] Full PostgreSQL backup completed
- [ ] Backup file size verified (non-zero)
- [ ] Backup integrity tested by restoring into an isolated temporary database (see the [guide](../modules/price-lists/PRICE_LIST_DEPLOYMENT_GUIDE.md#verify-backup-integrity))
- [ ] Backup copied to off-server location
- [ ] Backup location documented: `_________________________`

Follow the [guide's backup and restore steps](../modules/price-lists/PRICE_LIST_DEPLOYMENT_GUIDE.md#backup-procedures).

**Backup Verification**:
- [ ] File size: `_______ MB` (should be >10MB)
- [ ] Backup location: `_________________________`

---

## Database Migration

- [ ] Verified backup and restoration procedure
- [ ] Reviewed migration history and pending migrations
- [ ] For a fresh database, confirmed the chain starts at `InitialSchema1785238045705`
- [ ] For an existing schema without migration history, resolved the baseline diagnostic before startup
- [ ] Applied all pending migrations through TypeORM (see the [guide](../modules/price-lists/PRICE_LIST_DEPLOYMENT_GUIDE.md#migration-steps))
- [ ] Confirmed no pending migrations or migration errors
- [ ] Confirmed tables exist: `price_lists`, `price_list_items`
- [ ] Compared price list, item and assigned-customer counts with the pre-deployment state

The baseline includes the price list schema. There is no separate legacy JSONB
conversion step or fixed number of migrated rows. In Docker, the backend entrypoint
checks the baseline and applies compiled migrations before application startup.

---

### Customer order metrics backfill (#1475)

**Required when a production host is created.**

This procedure implements [issue #1475](https://github.com/blur88/erp2/issues/1475).

Migration `RecalculateCustomerMetricsFromFulfilledOrders1793020800000` **rewrites
customer data** using the [customer order metric rule](../backend/customer-metrics.md#metric-rule).
`down()` does nothing: **the pre-deploy backup is the only way back to the
previous values**, as required by [issue #1475](https://github.com/blur88/erp2/issues/1475).

No production host exists yet. Measure the affected rows before deployment:

- [ ] Before deploy, run the read-only preflight and record both numbers in the
      deployment record:

```bash
docker compose exec -T postgres sh -c 'psql -U "$POSTGRES_USER" -d "$POSTGRES_DB"' <<'SQL'
SELECT count(*) AS customers,
       count(*) FILTER (
         WHERE (c."totalOrders", c."totalSales", c."firstPurchaseDate", c."lastPurchaseDate")
               IS DISTINCT FROM
               (COALESCE(s.n, 0), COALESCE(s.total, 0), s.first_date, s.last_date)
       ) AS will_be_rewritten
  FROM customers c
  LEFT JOIN (
    SELECT "customerId", count(*)::int AS n, sum("totalAmount") AS total,
           min("orderDate")::timestamptz AS first_date,
           max("orderDate")::timestamptz AS last_date
      FROM sales_orders
     WHERE "deletedAt" IS NULL AND status = 'FULFILLED'
     GROUP BY "customerId"
  ) s ON s."customerId" = c.id;
SQL
```

- [ ] After deploy, run the same query: `will_be_rewritten` must be `0`. From
      then on fulfil and unfulfil recalculate the affected customer in their transaction.

**Concurrent order writes.** Follow the
[backfill locking requirements](../backend/customer-metrics.md#backfill-locking).
Complete both operational checks:

- [ ] An open transaction that has written an order and never finishes blocks
      the migration, and every order write queues behind it. If
      `Running database migrations...` does not complete, look in
      `pg_stat_activity` for an `idle in transaction` session.
- [ ] Only **one** backend may run against the database, and it must be the new
      image. The lock protects the migration itself; it cannot protect against
      an older backend that keeps fulfilling orders afterwards without
      recalculating. This is a **deployment inventory check**, not something a
      command on one host can show: list every place a backend for this
      database could be running (this host, any other host, a container
      outside compose, a process outside Docker such as `npm run start:dev`
      pointed at this database) and confirm each is stopped or on the new
      image. What the repository itself guarantees is narrower: both compose
      files define a single `backend` service with the fixed name
      `erp_backend`, so within one compose project `docker compose up -d
      backend` stops the old container before the new one runs its migrations,
      and the only queue worker (backups) lives in that same process.

**Rolling back to the previous image** leaves the recalculated values in place
and stops maintaining them again. After rolling forward, re-run the preflight;
if it reports drift, the migration will not run a second time, so the same
`UPDATE` has to be applied by hand.

## Application Deployment (15 minutes)

### Code Deployment
- [ ] Latest code pulled: `git pull --ff-only origin main`
- [ ] Current commit verified: `_______________________`
- [ ] Backend image built: `docker compose build backend`
- [ ] Frontend image built: `docker compose build frontend`
- [ ] No build errors

### Service Startup
- [ ] Services started: `docker compose up -d`
- [ ] All containers running: `docker compose ps`
- [ ] Backend started successfully
- [ ] Frontend started successfully
- [ ] No startup errors in logs

**Startup Verification**:
```bash
docker compose ps
# Expected: All services in "Up" state
```

### Backend Verification
- [ ] Health check passed: `curl http://localhost:3001/api/health`
- [ ] API endpoints registered (check logs)
- [ ] 13 price list endpoints visible
- [ ] No TypeScript compilation errors
- [ ] No module load errors

**Backend Health Check**:
```bash
curl http://localhost:3001/api/health
# Expected: {"status":"ok"}
```

### Frontend Verification
- [ ] Frontend accessible: `curl -I http://localhost:3000`
- [ ] Price list page exists: `curl -I http://localhost:3000/settings/price-lists`
- [ ] No JavaScript errors in browser console
- [ ] Assets loaded correctly

---

## Post-Deployment Validation (30 minutes)

### Database Verification
- [ ] Both price list tables exist
- [ ] Active default price list available after application startup
- [ ] Existing prices and customer assignments preserved on upgrade
- [ ] Fresh installation: entered required product prices and customer assignments (not seeded by migrations)
- [ ] Recorded counts using the [guide's validation queries](../modules/price-lists/PRICE_LIST_DEPLOYMENT_GUIDE.md#schema-and-data)

### API Testing
- [ ] List price lists: `GET /api/price-lists` ✓
- [ ] Get default price list: `GET /api/price-lists/default` ✓
- [ ] Get price list by ID: `GET /api/price-lists/:id` ✓
- [ ] Get price list items: `GET /api/price-lists/:id/items` ✓
- [ ] All endpoints return expected data
- [ ] Response times <200ms

**API Test Commands**:
```bash
TOKEN="YOUR_ADMIN_TOKEN"
curl -s http://localhost:3000/api/price-lists \
  -H "Authorization: Bearer $TOKEN" | jq '.data | length'
curl -s http://localhost:3000/api/price-lists/default \
  -H "Authorization: Bearer $TOKEN" | jq '.data.code'
```

### UI Testing
- [ ] Navigate to Price Lists page: http://localhost:3000/settings/price-lists
- [ ] Price lists displayed correctly
- [ ] Click on a price list - details page loads
- [ ] Product prices displayed correctly
- [ ] Inline editing works
- [ ] Create new price list works
- [ ] Copy price list works
- [ ] No UI errors or console errors

### Integration Testing
- [ ] Edit a customer and assign price list
- [ ] Create a sales order for this customer
- [ ] Verify correct price is used
- [ ] Complete sales order successfully
- [ ] Check invoice shows correct pricing

## Performance Verification (15 minutes)

### Response Time Checks
- [ ] Price list listing: `_______ ms` (target: <200ms)
- [ ] Price list details: `_______ ms` (target: <200ms)
- [ ] Sales order creation: `_______ ms` (target: <500ms)
- [ ] Price calculation: `_______ ms` (target: <50ms)

### Database Performance
- [ ] Query performance acceptable
- [ ] Indexes being used (check pg_stat_user_tables)
- [ ] No table scans on large tables
- [ ] Connection pool healthy

Use the [database performance query in the guide](../modules/price-lists/PRICE_LIST_DEPLOYMENT_GUIDE.md#database-performance).

---

## Monitoring Setup (10 minutes)

### Log Monitoring
- [ ] Backend logs monitored: `docker compose logs backend -f`
- [ ] No errors in last 50 lines
- [ ] No warnings about data integrity
- [ ] Price list endpoints being accessed

### Error Tracking
- [ ] Error rate: `_______` (target: <1%)
- [ ] No critical errors
- [ ] No database connection issues
- [ ] No authentication failures

### Metrics Baseline
- [ ] CPU usage: `_______%` (baseline)
- [ ] Memory usage: `_______ MB` (baseline)
- [ ] Database connections: `_______` (baseline)
- [ ] Request rate: `_______ req/min` (baseline)

---

## User Communication (5 minutes)

### Announcement
- [ ] Users notified of successful deployment
- [ ] New features announced
- [ ] User guide shared: [Price List User Guide](../modules/price-lists/PRICE_LIST_USER_GUIDE.md)
- [ ] Support team notified deployment complete
- [ ] Known issues communicated (if any)

### Documentation
- [ ] API documentation published
- [ ] User guide accessible
- [ ] Training materials available (if any)
- [ ] FAQ updated

---

## Post-Deployment Tasks

### Immediate (First Hour)
- [ ] Monitor error logs continuously
- [ ] Respond to user questions immediately
- [ ] Fix any critical issues found
- [ ] Document any problems encountered

### First 24 Hours
- [ ] Check error rates every 2 hours
- [ ] Monitor API usage patterns
- [ ] Verify sales orders processing correctly
- [ ] Gather initial user feedback

### First Week
- [ ] Review products missing prices in the intended price lists and enter required prices
- [ ] Verify all customers have price list assignments
- [ ] Optimize slow queries if found

---

## Rollback Decision

### Rollback Triggers
- [ ] Critical bug preventing normal operation
- [ ] Data integrity issues discovered
- [ ] System performance degraded >25%
- [ ] Multiple user-reported critical issues

### If Rollback Needed
- [ ] Notify team immediately
- [ ] Follow rollback procedure in deployment guide
- [ ] Document reason for rollback
- [ ] Plan corrective actions

**Rollback Decision**:
- [ ] NO ROLLBACK NEEDED - Deployment Successful
- [ ] ROLLBACK REQUIRED - Reason: `_______________________`

---

## Sign-Off

### Deployment Team Sign-Off
- [ ] **Technical Lead**: _________________ Date: _______
- [ ] **Database Admin**: _________________ Date: _______
- [ ] **QA Lead**: _________________ Date: _______
- [ ] **DevOps**: _________________ Date: _______

### Deployment Status
- [ ] **SUCCESSFUL** - All checks passed
- [ ] **SUCCESSFUL WITH ISSUES** - Non-critical issues noted
- [ ] **FAILED** - Rollback performed

### Notes
```
_____________________________________________________________
_____________________________________________________________
_____________________________________________________________
_____________________________________________________________
```

### Known Issues
```
_____________________________________________________________
_____________________________________________________________
_____________________________________________________________
```

### Follow-Up Actions
```
_____________________________________________________________
_____________________________________________________________
_____________________________________________________________
```

---

## Metrics Summary

### Before Deployment
- Price list items: `_______`
- Customers assigned to price lists: `_______`
- Price lists: `_______`

### After Deployment
- Price lists: `_______`
- Price list items: `_______`
- Linked customers: `_______`
- Data integrity: `_______%`

### Performance
- API response time: `_______ ms`
- Database query time: `_______ ms`
- Error rate: `_______%`
- Uptime: `_______%`

---

## Completion

**Deployment Completed**: [ ] YES [ ] NO
**Deployment Duration**: `_______ minutes`
**Successful**: [ ] YES [ ] NO (with rollback)
**Next Review**: `____________` (24 hours after deployment)

---

**Document Version**: 1.0
**Last Updated**: January 13, 2026
**Maintained By**: ERP Development Team
