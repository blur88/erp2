# Backend Knip Cleanup Implementation Plan

> **For Claude:** REQUIRED SUB-SKILL: Use superpowers:executing-plans to implement this plan task-by-task.

**Goal:** Clean up the backend knip report by removing unused npm packages, deleting dead files, adding a `knip.json` config to suppress false positives, and stripping unused exports.

**Architecture:** Pure deletion/cleanup pass — no new functionality. Approach is: (1) add knip.json to suppress confirmed false positives (migrations glob, CLI datasource default exports, webpack/test scripts), (2) remove truly unused npm deps, (3) delete dead files, (4) strip export keywords from unused exports in barrel files and entity index. Migrations are NEVER touched. The `ts-loader` devDep is kept because `nest-cli.json` has `"webpack": true`. `supertest`/`@types/supertest` are kept because the e2e tests use them.

**Tech Stack:** NestJS 11, TypeORM, TypeScript, npm, knip

---

## False Positives — DO NOT TOUCH

These are flagged by knip but are real/needed:

- **All migration files** — loaded via glob `../database/migrations/*{.ts,.js}`, not static imports
- **`src/config/cli-datasource.ts` default export** — used by TypeORM CLI via `-d ./src/config/database.config.ts`
- **`src/config/database.config.ts` default export** — re-exports cli-datasource for CLI
- **`ts-loader`** — used internally by NestJS webpack build (`"webpack": true` in nest-cli.json)
- **`supertest` + `@types/supertest`** — used in `test/e2e/*.e2e-spec.ts`
- **`AuditAction` enum members** — the whole enum IS used in `audit-logs.controller.ts` for `@ApiQuery({ enum: AuditAction })`, knip just can't see enum-as-value usage
- **`src/common/security/index.ts`** — IS imported by `src/main.ts`; individual re-exports are what's unused
- **`SecurityApplicationService` and `SecurityMonitoringMiddleware` classes** — used in main.ts via the security barrel

---

## Task 1: Create knip.json to suppress false positives

**Files:**
- Create: `backend/knip.json`

**Step 1: Create the knip config**

```json
{
  "$schema": "https://unpkg.com/knip@5/schema.json",
  "entry": [
    "src/main.ts",
    "src/config/database.config.ts",
    "src/config/cli-datasource.ts"
  ],
  "project": ["src/**/*.ts"],
  "ignore": [
    "src/database/migrations/**"
  ],
  "ignoreDependencies": [
    "ts-loader",
    "supertest",
    "@types/supertest"
  ],
  "ignoreExportsUsedInFile": true
}
```

Write this to `backend/knip.json`.

**Step 2: Run knip to see the new report**

```bash
cd /home/blur/erp2/backend && npx knip
```

Expected: Migration files no longer appear. False-positive entries for ts-loader/supertest gone. Report should be significantly smaller.

**Step 3: Commit**

```bash
cd /home/blur/erp2
git add backend/knip.json
git commit -m "chore: add backend knip.json to suppress false positives"
```

---

## Task 2: Remove unused npm dependencies

**Files:**
- Modify: `backend/package.json`
- Modify: `backend/package-lock.json`

**Step 1: Verify each dep is truly unused before removing**

```bash
cd /home/blur/erp2/backend

# @grpc/grpc-js, @grpc/proto-loader
grep -rn "grpc\|@grpc" src --include="*.ts" | grep "import"

# @nestjs/axios / HttpModule
grep -rn "HttpModule\|HttpService\|@nestjs/axios" src --include="*.ts" | grep "import"

# @nestjs/cache-manager / cache-manager / cache-manager-redis-yet
grep -rn "CacheModule\|CACHE_MANAGER\|@nestjs/cache-manager\|cache-manager" src --include="*.ts" | grep "import"

# @nestjs/event-emitter
grep -rn "EventEmitterModule\|@OnEvent\|EventEmitter2\|@nestjs/event-emitter" src --include="*.ts" | grep "import"

# @nestjs/mongoose / mongoose
grep -rn "MongooseModule\|@Schema\|@nestjs/mongoose\|from 'mongoose'" src --include="*.ts" | grep "import"

# nodemailer
grep -rn "nodemailer\|createTransport" src --include="*.ts" | grep "import"

# pdfkit
grep -rn "pdfkit\|PDFDocument" src --include="*.ts" | grep "import"

# uuid
grep -rn "from 'uuid'" src --include="*.ts"
```

Expected: All return empty (no imports found).

**Step 2: Remove unused production dependencies**

```bash
cd /home/blur/erp2/backend
npm uninstall @grpc/grpc-js @grpc/proto-loader @nestjs/axios @nestjs/cache-manager @nestjs/event-emitter @nestjs/mongoose cache-manager cache-manager-redis-yet mongoose nodemailer pdfkit uuid
```

**Step 3: Run TypeScript build check**

```bash
cd /home/blur/erp2/backend && npx tsc --noEmit
```

Expected: No new errors from removed packages.

**Step 4: Run tests**

```bash
cd /home/blur/erp2/backend && npm run test
```

Expected: All tests pass.

**Step 5: Commit**

```bash
cd /home/blur/erp2
git add backend/package.json backend/package-lock.json
git commit -m "chore: remove 12 unused backend npm dependencies"
```

---

## Task 3: Add ioredis as explicit dependency

**Files:**
- Modify: `backend/package.json`
- Modify: `backend/package-lock.json`

`ioredis` is imported directly in `src/app.service.ts` and `src/modules/backup/backup.service.ts` but is only a transitive dependency (pulled in by `bull`). It must be listed explicitly.

**Step 1: Install ioredis as a direct dependency**

```bash
cd /home/blur/erp2/backend && npm install ioredis
```

Expected: ioredis added to `dependencies` in package.json. Currently available at v5.9.3 — npm will pick the appropriate version.

**Step 2: Run TypeScript build check**

```bash
cd /home/blur/erp2/backend && npx tsc --noEmit
```

Expected: No errors.

**Step 3: Commit**

```bash
cd /home/blur/erp2
git add backend/package.json backend/package-lock.json
git commit -m "chore: add ioredis as explicit dependency (was transitive only)"
```

---

## Task 4: Delete dead source files

**Files to delete:**
- `backend/src/app.module.minimal.ts` — scratch dev file, not imported anywhere
- `backend/test-auth.js` — one-off debug script, not part of any test suite
- `backend/webpack.config.js` — nest-cli.json has `"webpack": true` but no `webpackConfigPath`, so NestJS uses its built-in webpack; this custom file is not referenced anywhere

**Step 1: Verify none are imported**

```bash
cd /home/blur/erp2/backend
grep -rn "app.module.minimal" src --include="*.ts"
grep -rn "test-auth" . --include="*.json" --include="*.ts" --include="*.js" | grep -v "node_modules"
grep -rn "webpackConfigPath" nest-cli.json
```

Expected: All return empty.

**Step 2: Delete the files**

```bash
cd /home/blur/erp2/backend
rm src/app.module.minimal.ts
rm test-auth.js
rm webpack.config.js
```

**Step 3: Commit**

```bash
cd /home/blur/erp2
git add -A backend/src/app.module.minimal.ts backend/test-auth.js backend/webpack.config.js
git commit -m "chore: delete dead backend files (minimal module, debug script, unused webpack config)"
```

---

## Task 5: Delete unused barrel index files

These barrel files exist but nothing imports them — they're noise and cause knip to report all their re-exports as "unused".

**Barrel files to delete:**
- `backend/src/common/interceptors/index.ts`
- `backend/src/common/interceptors/core/index.ts`
- `backend/src/common/interceptors/monitoring/index.ts`
- `backend/src/common/interceptors/security/index.ts`
- `backend/src/common/interceptors/utils/index.ts`
- `backend/src/modules/accounting/dto/index.ts`
- `backend/src/modules/accounting/services/index.ts`
- `backend/src/modules/auth/decorators/index.ts`
- `backend/src/modules/auth/guards/index.ts`
- `backend/src/modules/inventory/dto/index.ts`
- `backend/src/modules/inventory/index.ts`
- `backend/src/modules/inventory/interfaces/index.ts`
- `backend/src/modules/purchasing/index.ts`
- `backend/src/modules/purchasing/services/index.ts`
- `backend/src/modules/sales/controllers/index.ts`
- `backend/src/modules/sales/dto/index.ts`
- `backend/src/modules/sales/index.ts`
- `backend/src/modules/sales/services/index.ts`

**Step 1: Verify none are imported**

```bash
cd /home/blur/erp2/backend
# Check each barrel pattern
grep -rn "from.*common/interceptors'" src --include="*.ts"
grep -rn "from.*accounting/dto'" src --include="*.ts"
grep -rn "from.*accounting/services'" src --include="*.ts"
grep -rn "from.*auth/decorators'" src --include="*.ts"
grep -rn "from.*auth/guards'" src --include="*.ts"
grep -rn "from.*inventory/dto'" src --include="*.ts"
grep -rn "from.*modules/inventory'" src --include="*.ts"
grep -rn "from.*inventory/interfaces'" src --include="*.ts"
grep -rn "from.*modules/purchasing'" src --include="*.ts"
grep -rn "from.*purchasing/services'" src --include="*.ts"
grep -rn "from.*sales/controllers'" src --include="*.ts"
grep -rn "from.*modules/sales/dto'" src --include="*.ts"
grep -rn "from.*modules/sales'" src --include="*.ts"
grep -rn "from.*sales/services'" src --include="*.ts"
```

Expected: All return empty.

**Step 2: Delete the barrel files**

```bash
cd /home/blur/erp2/backend
rm src/common/interceptors/index.ts
rm src/common/interceptors/core/index.ts
rm src/common/interceptors/monitoring/index.ts
rm src/common/interceptors/security/index.ts
rm src/common/interceptors/utils/index.ts
rm src/modules/accounting/dto/index.ts
rm src/modules/accounting/services/index.ts
rm src/modules/auth/decorators/index.ts
rm src/modules/auth/guards/index.ts
rm src/modules/inventory/dto/index.ts
rm src/modules/inventory/index.ts
rm src/modules/inventory/interfaces/index.ts
rm src/modules/purchasing/index.ts
rm src/modules/purchasing/services/index.ts
rm src/modules/sales/controllers/index.ts
rm src/modules/sales/dto/index.ts
rm src/modules/sales/index.ts
rm src/modules/sales/services/index.ts
```

**Step 3: TypeScript check**

```bash
cd /home/blur/erp2/backend && npx tsc --noEmit
```

Expected: No errors — if anything breaks, it means a file was imported somewhere the grep missed. Check the error message and revert that specific barrel file.

**Step 4: Run tests**

```bash
cd /home/blur/erp2/backend && npm run test
```

Expected: All tests pass.

**Step 5: Commit**

```bash
cd /home/blur/erp2
git add -A backend/src/common/interceptors/index.ts \
  backend/src/common/interceptors/core/index.ts \
  backend/src/common/interceptors/monitoring/index.ts \
  backend/src/common/interceptors/security/index.ts \
  backend/src/common/interceptors/utils/index.ts \
  backend/src/modules/accounting/dto/index.ts \
  backend/src/modules/accounting/services/index.ts \
  backend/src/modules/auth/decorators/index.ts \
  backend/src/modules/auth/guards/index.ts \
  backend/src/modules/inventory/dto/index.ts \
  backend/src/modules/inventory/index.ts \
  backend/src/modules/inventory/interfaces/index.ts \
  backend/src/modules/purchasing/index.ts \
  backend/src/modules/purchasing/services/index.ts \
  backend/src/modules/sales/controllers/index.ts \
  backend/src/modules/sales/dto/index.ts \
  backend/src/modules/sales/index.ts \
  backend/src/modules/sales/services/index.ts
git commit -m "chore: delete unused backend barrel index files"
```

---

## Task 6: Strip unused exports from entities/index.ts

The entities barrel `src/database/entities/index.ts` re-exports many things that are never imported through the barrel (most files import directly from the entity file). Strip the unused re-exports that knip confirmed are dead — but do NOT remove the barrel file itself since 12 files do import from it.

**Files:**
- Modify: `backend/src/database/entities/index.ts`

**Exports to remove** (confirmed unused — nothing imports these from the barrel):
- `BaseEntity` (line ~11) — imported directly by entity files, not via barrel
- `AuditLog` (line ~14)
- `UserRole`, `UserStatus` (line ~17)
- `RefreshToken` (line ~18)
- `ProductType` (line ~22)
- `Customer`, `CustomerType` (line ~25)
- `StockMovementType` (line ~40)
- `SupplierType` (line ~43)
- `ChartOfAccount`, `AccountType` (line ~51)
- `FiscalPeriod`, `FiscalPeriodStatus` (line ~52)
- `JournalEntry`, `JournalEntryStatus` (line ~53)
- `JournalEntryLine` (line ~54)
- `AccountMapping`, `MappingType` (line ~55)
- `BankReconciliation`, `BankReconciliationStatus` (line ~56)
- `ReconciledTransaction` (line ~57)
- `Settlement`, `SettlementStatus` (line ~59)
- `CompanySettings` (line ~62)
- `PriceCostingSettings` (line ~63)
- `PrintSettings` (line ~64)
- `DocumentNumberSettings` (line ~65)
- `BackupRetentionSettings` (line ~66)
- `SecuritySettings` (line ~67)
- The `ACTIVE_ENTITIES`, `ACTIVE_ENTITY_GROUPS`, `ACTIVE_ENTITY_METADATA`, `ACTIVE_PERFORMANCE_INDEXES`, `VALIDATION_PATTERNS` constants and `default` export (lines ~90-242) — none are imported anywhere

**Step 1: Verify none of these are imported via the barrel**

```bash
cd /home/blur/erp2/backend
grep -rn "BaseEntity\|AuditLog\|UserRole\|UserStatus\|RefreshToken\|ProductType\|CustomerType\|StockMovementType\|SupplierType\|AccountType\|FiscalPeriodStatus\|JournalEntryStatus\|MappingType\|BankReconciliationStatus\|ReconciledTransaction\|SettlementStatus\|CompanySettings\|PriceCostingSettings\|PrintSettings\|DocumentNumberSettings\|BackupRetentionSettings\|SecuritySettings\|ACTIVE_ENTITIES\|ACTIVE_ENTITY_GROUPS\|ACTIVE_ENTITY_METADATA\|ACTIVE_PERFORMANCE_INDEXES\|VALIDATION_PATTERNS" \
  src --include="*.ts" | grep "from.*database/entities'" | head -20
```

Expected: Empty — none are imported via the barrel.

**Step 2: Read the current entities/index.ts**

Read `backend/src/database/entities/index.ts` in full before editing.

**Step 3: Remove the unused export lines**

Edit `backend/src/database/entities/index.ts` to remove all the lines identified above. Keep only the exports that ARE used via the barrel (from the grep in Task 4 we know these are: `Product`, `Category`, `StockMovement`, `PriceList`, `PriceListItem`, `Supplier`, `PurchaseOrder`, `PurchaseOrderItem`, `GoodsReceivedNote`, `GoodsReceivedNoteItem`, `VendorPayment`, and accounting entities imported by purchasing module).

After editing, the file should be significantly shorter and only re-export what's actually needed.

**Step 4: TypeScript check**

```bash
cd /home/blur/erp2/backend && npx tsc --noEmit
```

Expected: No errors. If something breaks, check the error and restore only that specific export.

**Step 5: Run tests**

```bash
cd /home/blur/erp2/backend && npm run test
```

Expected: All pass.

**Step 6: Commit**

```bash
cd /home/blur/erp2
git add backend/src/database/entities/index.ts
git commit -m "chore: remove unused re-exports from entities barrel index"
```

---

## Task 7: Strip unused exports from security/index.ts

**Files:**
- Modify: `backend/src/common/security/index.ts`

The security barrel IS imported by `main.ts` (it uses `SecurityApplicationService` and `SecurityMonitoringMiddleware`). But it re-exports several things that nobody else imports.

**Step 1: Verify which exports from security barrel are actually used**

```bash
cd /home/blur/erp2/backend
grep -rn "ThreatPatterns\|ThreatDetector\|RequestValidators\|SecurityLogger\|ThreatDetectionLog\|HeaderInjectionLog\|ExcessiveHeaderLengthLog\|SuspiciousContentTypeLog\|SecurityConfig\|SecurityConfigBuilder\|InputSanitizationMiddleware\|SecurityConfigService" \
  src --include="*.ts" | grep -v "common/security/"
```

Expected: None — only `SecurityApplicationService` and `SecurityMonitoringMiddleware` are used from this barrel (by main.ts).

**Step 2: Trim security/index.ts to only what's needed**

Edit `backend/src/common/security/index.ts` to remove unused re-exports. Keep only:

```ts
export { SecurityMonitoringMiddleware } from './middleware/security-monitoring.middleware';
export { SecurityApplicationService } from './middleware/security-application.service';
```

Remove all other exports (ThreatPatterns, ThreatDetector, RequestValidators, SecurityLogger, SecurityConfig, SecurityConfigBuilder, the legacy alias exports, etc.).

**Step 3: TypeScript check**

```bash
cd /home/blur/erp2/backend && npx tsc --noEmit
```

Expected: No errors.

**Step 4: Commit**

```bash
cd /home/blur/erp2
git add backend/src/common/security/index.ts
git commit -m "chore: trim security barrel to only its two used exports"
```

---

## Task 8: Strip unused exports from filter utilities and config files

**Files:**
- Modify: `backend/src/common/filters/utils/error-classification.util.ts`
- Modify: `backend/src/common/filters/utils/request-id.util.ts`

**Step 1: Verify SECURITY_STATUSES, SECURITY_KEYWORDS are unused**

```bash
cd /home/blur/erp2/backend
grep -rn "SECURITY_STATUSES\|SECURITY_KEYWORDS" src --include="*.ts" | grep -v "error-classification.util.ts"
grep -rn "generateRequestId\|generateFallbackRequestId" src --include="*.ts" | grep -v "request-id.util.ts"
```

Expected: Empty for all.

**Step 2: Remove export keywords**

In `backend/src/common/filters/utils/error-classification.util.ts`:
- Change `export const SECURITY_STATUSES` → `const SECURITY_STATUSES`
- Change `export const SECURITY_KEYWORDS` → `const SECURITY_KEYWORDS`

In `backend/src/common/filters/utils/request-id.util.ts`:
- Change `export function generateRequestId` → `function generateRequestId`
- Change `export function generateFallbackRequestId` → `function generateFallbackRequestId`

**Step 3: TypeScript check**

```bash
cd /home/blur/erp2/backend && npx tsc --noEmit
```

Expected: No errors.

**Step 4: Commit**

```bash
cd /home/blur/erp2
git add backend/src/common/filters/utils/error-classification.util.ts \
  backend/src/common/filters/utils/request-id.util.ts
git commit -m "chore: remove unused exports from filter utility files"
```

---

## Task 9: Final knip verification

**Step 1: Run knip**

```bash
cd /home/blur/erp2/backend && npx knip
```

Expected: Significantly fewer items. Remaining items should be reviewed — if they are true false positives, add them to `knip.json`'s `ignore` or `ignoreDependencies`. If they are real dead code, assess whether to clean up.

**Step 2: Run full test suite**

```bash
cd /home/blur/erp2/backend && npm run test
```

Expected: All tests pass.

**Step 3: TypeScript check**

```bash
cd /home/blur/erp2/backend && npx tsc --noEmit
```

Expected: Zero errors.

**Step 4: Run lint**

```bash
cd /home/blur/erp2/backend && npm run lint
```

Expected: Zero new errors.

**Step 5: Run the root knip.sh to verify both frontend and backend**

```bash
cd /home/blur/erp2 && ./knip.sh
```

Expected: Both pass (or only genuine remaining issues).
