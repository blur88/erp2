# Price List System - Deployment Checklist

**Version**: 1.0
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
- [ ] Backup integrity tested (optional restore to test DB)
- [ ] Backup copied to off-server location
- [ ] Backup location documented: `_________________________`

**Backup Commands**:
```bash
mkdir -p /backup/erp/$(date +%Y%m%d_%H%M%S)
docker compose exec -T postgres pg_dump -U erp_user erp_db \
  > /backup/erp/$(date +%Y%m%d_%H%M%S)/erp_db_backup.sql
ls -lh /backup/erp/$(date +%Y%m%d_%H%M%S)/erp_db_backup.sql
```

**Backup Verification**:
- [ ] File size: `_______ MB` (should be >10MB)
- [ ] Backup location: `_________________________`

---

## Pre-Migration Validation (10 minutes)

### Current State Verification
- [ ] Product count with pricing: `_______`
- [ ] Customer count with pricing scheme: `_______`
- [ ] Current pricing schemes: `_______`
- [ ] System currently operational

**Validation Commands**:
```bash
docker compose exec postgres psql -U erp_user -d erp_db -c "
  SELECT COUNT(*) FROM products WHERE \"pricingTiers\" IS NOT NULL;
"
docker compose exec postgres psql -U erp_user -d erp_db -c "
  SELECT COUNT(*) FROM customers WHERE \"pricingScheme\" IS NOT NULL;
"
```

---

## Database Migration (15 minutes)

### Schema Migration
- [ ] Migration files located in `backend/src/database/migrations/`
- [ ] Migrations pending verified: `npm run migration:show`
- [ ] Schema migration executed: `CreatePriceListTables`
- [ ] Tables created: `price_lists`, `price_list_items`
- [ ] Foreign key added to `customers.priceListId`
- [ ] Indexes created successfully

**Migration Command**:
```bash
cd backend && npm run migration:run
```

**Expected Output**:
```
Migration CreatePriceListTables1768231502083 has been executed successfully.
```

### Data Migration
- [ ] Data migration executed: `MigratePriceListData`
- [ ] Price lists created: `_______ lists`
- [ ] Price list items created: `_______ items`
- [ ] Customers linked: `_______ customers`
- [ ] Data integrity validation: 100% PASS

**Expected Output**:
```
Migration MigratePriceListData1768232000000 has been executed successfully.
Migration completed. Created X price lists, Y price list items, linked Z customers.
```

### Post-Migration Verification
- [ ] Tables exist: `price_lists`, `price_list_items`
- [ ] Data migrated correctly (counts match expectations)
- [ ] Legacy data preserved (JSONB fields still present)
- [ ] No migration errors in logs

**Verification Commands**:
```bash
docker compose exec postgres psql -U erp_user -d erp_db -c "
  SELECT COUNT(*) FROM price_lists;
"
docker compose exec postgres psql -U erp_user -d erp_db -c "
  SELECT COUNT(*) FROM price_list_items;
"
docker compose exec postgres psql -U erp_user -d erp_db -c "
  SELECT COUNT(*) FROM customers WHERE \"priceListId\" IS NOT NULL;
"
```

---

## Application Deployment (15 minutes)

### Code Deployment
- [ ] Latest code pulled: `git pull origin main`
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

### Cross-tab sessions (#1345)

Both #1345 PRs (server sessions and cross-tab sessions) ship together in the
first production deployment.

- [ ] `VITE_BUILD_SHA` exported before the frontend build (a plain
      `docker compose build frontend` yields `unknown`): the served page's
      `erp-build` meta tag must equal `git rev-parse HEAD`
- [ ] The NGINX image is redeployed with them: #1345 changes `nginx.conf`, and an
      old ingress in front of the new frontend throttles session upkeep
      (`refresh`, `logout`, `/auth/me` now share `session_limit`, not
      `login_limit`)
- [ ] Users with an open tab must **reload**: the server now requires the
      `X-ERP-Session-Protocol: 2` marker, and a tab running an older bundle gets
      426 `CLIENT_RELOAD_REQUIRED` on sign-in, registration and refresh
- [ ] After deploy, run `nginx/verify-rate-limits.sh` on the deployment host

### Customer order metrics are recalculated at deploy (#1355)

Migration `RecalculateCustomerMetricsFromFulfilledOrders1791611629594` **rewrites
production data**: `customers.totalOrders`, `totalSales`, `firstPurchaseDate` and
`lastPurchaseDate`, for every customer whose stored values differ from their
fulfilled (`status = 'FULFILLED'`, `"deletedAt" IS NULL`) sales orders. A
customer with no such order is reset to `0`, `0`, `NULL`, `NULL`. Rows that are
already correct are not written, and `updatedAt` is not changed. `down()` does
nothing: the replaced values are not recorded anywhere, so **the pre-deploy
backup is the only way back to them**.

How many production rows this changes is **not known**. Nothing has maintained
these columns since 2026-05-26 (`596857366`), so drift is expected, but it has
only been observed on a development database. Measure it first:

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
      then on fulfil and unfulfil keep it at `0`.

**Cost.** One statement. Measured 2026-10-10 on PostgreSQL 18.3 on the
development host, on synthetic data in a scratch database: 20,000 customers and
192,000 sales orders (80,000 fulfilled), every customer row rewritten, 1.84 s.
That is not a production measurement; production row counts are not known here.

**Concurrent order writes.** The migration takes `LOCK TABLE sales_orders IN
SHARE MODE` before it reads. It waits for every open transaction that has
written an order, and order writes (create, edit, payment, fulfil, cancel) wait
until it commits; reads continue. That is what keeps a fulfilment from
committing between the migration's read and its write and then being
overwritten from the older read. No maintenance window is needed for the result
to be correct. Two things follow from the lock:

- [ ] An open transaction that has written an order and never finishes blocks
      the migration, and every order write queues behind it. If
      `Running database migrations...` does not complete, look in
      `pg_stat_activity` for an `idle in transaction` session.
- [ ] Only **one** backend may run against the database, and it must be the new
      image. The lock protects the migration itself; it cannot protect against
      an older backend that keeps fulfilling orders afterwards without
      recalculating. Both compose files define a single `backend` service with
      the fixed name `erp_backend`, so `docker compose up -d backend` stops the
      old container before the new one runs its migrations, and the only queue
      worker (backups) lives in that same process. Confirm with
      `docker ps --filter name=backend` that no other backend container, on
      this host or another, points at this database.

**Rolling back to the previous image** leaves the recalculated values in place
and stops maintaining them again. After rolling forward, re-run the preflight;
if it reports drift, the migration will not run a second time, so the same
`UPDATE` has to be applied by hand.

### Ingress `/api` limit: excess requests are delayed, not refused (#1353)

`nginx/nginx.conf` only; no backend, frontend or database change.

- [ ] The NGINX image is **rebuilt and the container recreated**
      (`docker compose build nginx && docker compose up -d nginx`): the
      configuration is baked into the image, so a restart alone keeps the old one
- [ ] `nginx -t` passes on the built image
- [ ] `api_limit` reads `rate=20r/s` and `burst=40 delay=20` in the running
      container (`docker compose exec nginx nginx -T | grep -E 'api_limit|limit_conn'`),
      and `limit_conn_status 429` is present. The three limiter values are still
      marked provisional in the file: the completion deadlines they were sized
      against are tracked in #1359, not met on the host they were measured on
- [ ] **The access log format changed** from `combined` to `limits`: the same
      fields, followed by `msec=`, `rt=`, `urt=`, `lreq=`, `lconn=` and `qa=`.
      Anything that parses the ingress access log by position still works for the
      leading fields; anything that expects the line to end after the user agent
      does not. The log is flushed every second (`flush=1s`)
- [ ] After deploy, run `nginx/verify-rate-limits.sh` on the deployment host. Its
      `api_limit` phases run on an isolated rig (`nginx/limiter-rig/rig.sh`, its
      own network, no host ports) and never against the running stack; it needs
      Docker and about a minute. Exit 0 and `api_limit verification complete`
      is the pass; exit 3 means the recorded probe result does not match the
      configuration and nothing was verified
- [ ] A 429 no longer says which limiter refused a request: read `lreq=` and
      `lconn=` on its access-log line (`REJECTED` names the limiter)
- [ ] **Not covered by this change, and not verified:** several users behind one
      address (they share one bucket, and more than ten simultaneous connections
      from one address are refused by `limit_conn addr 10` with 429);
      browsers other than Chromium; HTTP/2 (enabling it requires re-running the
      restored-window workload and reassessing `limit_conn addr 10`)
- [ ] Rollback is the previous NGINX image; nothing else depends on the change

---

## Post-Deployment Validation (30 minutes)

### Database Verification
- [ ] Price lists table populated
- [ ] Price list items table populated
- [ ] Customers linked to price lists
- [ ] Data integrity check: 100% PASS
- [ ] Indexes present and used

**Data Integrity Check**:
```bash
docker compose exec postgres psql -U erp_user -d erp_db -c "
  SELECT
    p.name,
    p.\"pricingTiers\"->>'Retail' as legacy_price,
    pli.price as new_price,
    CASE
      WHEN (p.\"pricingTiers\"->>'Retail')::numeric = pli.price THEN 'MATCH'
      ELSE 'MISMATCH'
    END as status
  FROM products p
  LEFT JOIN price_list_items pli ON pli.\"productId\" = p.id
  LEFT JOIN price_lists pl ON pl.id = pli.\"priceListId\" AND pl.code = 'RETAIL'
  WHERE p.\"pricingTiers\" IS NOT NULL
  LIMIT 10;
"
```

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

### Backward Compatibility Testing
- [ ] Find product with legacy pricing only (no price list item)
- [ ] Create sales order with this product
- [ ] Verify legacy price is used (fallback)
- [ ] Check logs for "Using legacy pricing" message
- [ ] System operates normally with mixed pricing

---

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

**Performance Check**:
```bash
docker compose exec postgres psql -U erp_user -d erp_db -c "
  SELECT schemaname, tablename, seq_scan, idx_scan
  FROM pg_stat_user_tables
  WHERE tablename IN ('price_lists', 'price_list_items');
"
```

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
- [ ] User guide shared: `docs/PRICE_LIST_USER_GUIDE.md`
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
- [ ] Review legacy fallback usage (should decrease)
- [ ] Migrate remaining products to price lists
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
- Products with pricing: `_______`
- Customers with pricing: `_______`
- Pricing schemes: `_______`

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

---

## Server Sessions & Refresh Token Signing Keys (#1345)

### Environment Variables
Configure the following three variables in `.env` / deployment configuration:

- `JWT_REFRESH_KEYS`: Comma-separated `kid=secret` pairs (e.g. `k1=base64-or-hex-secret-min-32-chars,k2=...`). Each `kid` must match `^[A-Za-z0-9_-]{1,32}$`. Secrets must be at least 32 characters and must **never** equal `JWT_SECRET`.
- `JWT_REFRESH_ACTIVE_KID`: The key ID used to sign newly minted refresh tokens. Must match one of the keys in `JWT_REFRESH_KEYS`. **The backend fails startup if this is missing or does not match a key in `JWT_REFRESH_KEYS`.**
- `REFRESH_GRACE_SECONDS`: Optional positive integer, default `60` when unset. Grace window, fixed for each token at the moment it is superseded, during which that token still returns the session's current token. **The backend fails startup on a malformed, zero, negative or fractional value.**
- `JWT_REFRESH_TOKEN_EXPIRY`: Optional override of the refresh lifetime (for example `12h`). Unset or empty means 7 days with "remember me" and 2 days without. **The backend fails startup on an invalid value.**

Generate each refresh secret randomly (`openssl rand -base64 48`); the 32-character minimum is a floor, not a measure of strength.

### Deployment & User Migration
- **One-time Re-authentication**: Existing users will need to sign in once after deployment to establish a server session with the new token structure.
- **Boot Warning**: The backend logs a warning on startup if any `refresh_tokens` row, expired or not, references a `keyId` that is not configured in `JWT_REFRESH_KEYS`. It does not refuse to start and revokes nothing.

### Key Retirement Procedure
Retire a key only when **no `refresh_tokens` row references it**. Rows are purged by the daily cleanup once they pass their own `expiresAt`, so a key whose tokens have all expired can still have rows until the next cleanup; those retained rows are what lets a late logout still be honoured. Check with:
```sql
SELECT "keyId", count(*), max("expiresAt") FROM refresh_tokens GROUP BY "keyId";
```
The key can be removed from `JWT_REFRESH_KEYS` when it no longer appears in this result. `max("expiresAt")` shows the latest date by which that will be true after the following cleanup run. Lowering the configured lifetime does not bring that date forward for tokens already issued.

Removing a key early does not by itself revoke sessions or invalidate access tokens: tokens signed with it are rejected without being treated as replay, and the affected sessions keep working until their access tokens expire. If a key must be removed early (e.g. key compromise), revoke the sessions relying on it explicitly before removing it from `JWT_REFRESH_KEYS`:
```sql
UPDATE auth_sessions s
SET "revokedAt" = '<now>', "revokeReason" = 'key_retired'
FROM refresh_tokens t
WHERE t."sessionId" = s.id
  AND t."supersededAt" IS NULL
  AND t."keyId" = '<kid>'
  AND s."revokedAt" IS NULL;
```

---

## Completion

**Deployment Completed**: [ ] YES [ ] NO
**Deployment Duration**: `_______ minutes`
**Successful**: [ ] YES [ ] NO (with rollback)
**Next Review**: `____________` (24 hours after deployment)

---

**Document Version**: 1.1
**Last Updated**: October 5, 2026
**Maintained By**: ERP Development Team
