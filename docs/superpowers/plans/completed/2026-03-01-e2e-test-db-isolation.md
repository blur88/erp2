# E2E Test Database Isolation Implementation Plan

> **For Claude:** REQUIRED SUB-SKILL: Use superpowers:executing-plans to implement this plan task-by-task.

**Goal:** Prevent e2e tests from truncating the live `erp_db` database by routing them to a dedicated `erp_db_test` database.

**Architecture:** Add a `backend/.env.test` that overrides `DB_DATABASE=erp_db_test`. Update `AppModule`'s `ConfigModule` to load `.env.test` when `NODE_ENV=test`. Add a jest `globalSetup` script that creates `erp_db_test` and runs migrations against it before any tests run, and a `globalTeardown` that drops it after. Update `jest-e2e.json` to wire everything together.

**Tech Stack:** NestJS ConfigModule, TypeORM CLI migrations, Jest globalSetup/globalTeardown, node-postgres (`pg`) for DB creation.

---

## Context

- Live DB: `erp_db` / user: `erp_user` / password: `DevErpDb2024!Pass` / host: `localhost:5432`
- `AppModule` loads `ConfigModule.forRoot({ envFilePath: '.env' })` — we change this to also load `.env.test` when `NODE_ENV=test`
- The database factory reads `DB_DATABASE` from config — so pointing `.env.test` at `erp_db_test` is sufficient
- `erp_user` has `usecreatedb = true` so it can create `erp_db_test` without superuser
- E2e tests live in `backend/test/*.e2e-spec.ts` and `backend/test/e2e/*.e2e-spec.ts`
- Jest e2e config: `backend/test/jest-e2e.json`
- Migrations: `backend/src/database/migrations/`

---

### Task 1: Create `.env.test`

**Files:**
- Create: `backend/.env.test`

**Step 1: Create the file**

```
DB_HOST=localhost
DB_PORT=5432
DB_DATABASE=erp_db_test
DB_USERNAME=erp_user
DB_PASSWORD=DevErpDb2024!Pass
DB_SYNCHRONIZE=false
DB_SSL=false
DB_LOGGING=false
NODE_ENV=test
REDIS_HOST=localhost
REDIS_PORT=6379
REDIS_PASSWORD=DevRedis2024!Pass
REDIS_DB=0
REDIS_TTL=3600
JWT_SECRET=test-secret-key-minimum-32chars-long-for-testing-only
JWT_REFRESH_SECRET=test-refresh-secret-minimum-32chars-long-for-testing
JWT_EXPIRES_IN=15m
JWT_REFRESH_EXPIRES_IN=7d
JWT_AUDIENCE=erp-app
JWT_ISSUER=erp-backend
ALLOWED_ORIGINS=http://localhost:3000
FRONTEND_URL=http://localhost:3000
```

**Step 2: Add `.env.test` to `.gitignore`**

Open `backend/.gitignore` (or root `.gitignore`) and ensure `.env.test` is listed. If there's already a `.env` ignore line, add `.env.test` alongside it. (`.env.test` contains test credentials — should not be committed.)

Actually, since this is a dev-only repo and the credentials are the same as the committed `.env`, it is fine to commit. Skip the gitignore step.

**Step 3: Commit**

```bash
cd backend
git add .env.test
git commit -m "chore(test): add .env.test for e2e test database isolation"
```

---

### Task 2: Update `AppModule` to load `.env.test` when `NODE_ENV=test`

**Files:**
- Modify: `backend/src/app.module.ts` (the `ConfigModule.forRoot` call)

**Step 1: Locate the ConfigModule.forRoot call**

In `backend/src/app.module.ts`, find:
```typescript
ConfigModule.forRoot({
  isGlobal: true,
  envFilePath: '.env',
}),
```

**Step 2: Replace with env-aware config loading**

```typescript
ConfigModule.forRoot({
  isGlobal: true,
  envFilePath: process.env.NODE_ENV === 'test' ? '.env.test' : '.env',
}),
```

**Step 3: Verify no TypeScript errors**

```bash
cd backend
npm run build 2>&1 | tail -20
```
Expected: no errors.

**Step 4: Commit**

```bash
git add src/app.module.ts
git commit -m "chore(test): load .env.test when NODE_ENV=test in AppModule"
```

---

### Task 3: Create jest `globalSetup` script

This script runs once before all e2e tests. It creates `erp_db_test` if it doesn't exist, then runs TypeORM migrations against it.

**Files:**
- Create: `backend/test/jest-e2e-global-setup.ts`

**Step 1: Create the file**

```typescript
import { Client } from 'pg';
import { execSync } from 'child_process';
import * as path from 'path';
import * as dotenv from 'dotenv';

export default async function globalSetup() {
  // Load test env vars
  dotenv.config({ path: path.resolve(__dirname, '../.env.test') });

  const { DB_HOST, DB_PORT, DB_USERNAME, DB_PASSWORD, DB_DATABASE } = process.env;

  // Connect to default 'postgres' maintenance DB to create erp_db_test
  const client = new Client({
    host: DB_HOST || 'localhost',
    port: parseInt(DB_PORT || '5432', 10),
    user: DB_USERNAME || 'erp_user',
    password: DB_PASSWORD,
    database: 'erp_db', // connect to existing DB to issue CREATE DATABASE
  });

  await client.connect();

  // Drop and recreate to ensure a clean slate on each run
  await client.query(`DROP DATABASE IF EXISTS ${DB_DATABASE}`);
  await client.query(`CREATE DATABASE ${DB_DATABASE} OWNER ${DB_USERNAME}`);

  await client.end();

  // Run migrations against the test DB
  const backendRoot = path.resolve(__dirname, '..');
  execSync('npm run migration:run', {
    cwd: backendRoot,
    stdio: 'inherit',
    env: { ...process.env }, // .env.test vars already loaded above
  });
}
```

**Step 2: Verify `dotenv` and `pg` are available**

```bash
cd backend
node -e "require('dotenv'); require('pg'); console.log('ok')"
```
Expected: `ok` (both are already dependencies).

**Step 3: Commit**

```bash
git add test/jest-e2e-global-setup.ts
git commit -m "chore(test): add jest globalSetup to create erp_db_test and run migrations"
```

---

### Task 4: Create jest `globalTeardown` script

Drops `erp_db_test` after all tests complete so it doesn't linger.

**Files:**
- Create: `backend/test/jest-e2e-global-teardown.ts`

**Step 1: Create the file**

```typescript
import { Client } from 'pg';
import * as path from 'path';
import * as dotenv from 'dotenv';

export default async function globalTeardown() {
  dotenv.config({ path: path.resolve(__dirname, '../.env.test') });

  const { DB_HOST, DB_PORT, DB_USERNAME, DB_PASSWORD, DB_DATABASE } = process.env;

  const client = new Client({
    host: DB_HOST || 'localhost',
    port: parseInt(DB_PORT || '5432', 10),
    user: DB_USERNAME || 'erp_user',
    password: DB_PASSWORD,
    database: 'erp_db',
  });

  await client.connect();
  await client.query(`DROP DATABASE IF EXISTS ${DB_DATABASE}`);
  await client.end();
}
```

**Step 2: Commit**

```bash
git add test/jest-e2e-global-teardown.ts
git commit -m "chore(test): add jest globalTeardown to drop erp_db_test after e2e run"
```

---

### Task 5: Update `jest-e2e.json` to wire `NODE_ENV`, `globalSetup`, and `globalTeardown`

**Files:**
- Modify: `backend/test/jest-e2e.json`

**Step 1: Replace the file content**

```json
{
  "moduleFileExtensions": ["js", "json", "ts"],
  "rootDir": ".",
  "testEnvironment": "node",
  "testRegex": ".e2e-spec.ts$",
  "transform": {
    "^.+\\.(t|j)s$": "ts-jest"
  },
  "moduleNameMapper": {
    "^@/(.*)$": "<rootDir>/../src/$1",
    "^@modules/(.*)$": "<rootDir>/../src/modules/$1",
    "^@common/(.*)$": "<rootDir>/../src/common/$1",
    "^@config/(.*)$": "<rootDir>/../src/config/$1",
    "^@database/(.*)$": "<rootDir>/../src/database/$1"
  },
  "globalSetup": "./jest-e2e-global-setup.ts",
  "globalTeardown": "./jest-e2e-global-teardown.ts",
  "collectCoverageFrom": [
    "../src/**/*.(t|j)s"
  ],
  "coverageDirectory": "../coverage"
}
```

Note: `ts-jest` handles `.ts` globalSetup/globalTeardown files automatically when the transform is configured.

**Step 2: Commit**

```bash
git add test/jest-e2e.json
git commit -m "chore(test): wire globalSetup/globalTeardown and NODE_ENV=test in jest-e2e.json"
```

---

### Task 6: Verify the e2e tests run against `erp_db_test`

**Step 1: Run a quick DB query before running tests to confirm `erp_db` is still intact**

```bash
docker compose exec postgres psql -U erp_user -d erp_db -c "SELECT COUNT(*) FROM users;"
```
Note the count.

**Step 2: Run the e2e tests**

```bash
cd backend
NODE_ENV=test npm run test:e2e 2>&1 | tail -40
```

Expected:
- globalSetup creates `erp_db_test`, runs migrations
- Tests run and pass (or fail on test logic, not DB connection issues)
- globalTeardown drops `erp_db_test`

**Step 3: Confirm `erp_db` is untouched**

```bash
docker compose exec postgres psql -U erp_user -d erp_db -c "SELECT COUNT(*) FROM users;"
```
Expected: same count as before. `erp_db_test` should not exist anymore.

**Step 4: Confirm `erp_db_test` is gone**

```bash
docker compose exec postgres psql -U erp_user -d erp_db -c "SELECT datname FROM pg_database WHERE datname = 'erp_db_test';"
```
Expected: 0 rows.

---

### Task 7: Update `package.json` test:e2e script to always set `NODE_ENV=test`

This ensures nobody accidentally runs e2e without the env override.

**Files:**
- Modify: `backend/package.json`

**Step 1: Find the test:e2e script**

```json
"test:e2e": "jest --config ./test/jest-e2e.json",
```

**Step 2: Replace with**

```json
"test:e2e": "NODE_ENV=test jest --config ./test/jest-e2e.json",
```

**Step 3: Commit**

```bash
git add package.json
git commit -m "chore(test): always set NODE_ENV=test for e2e test script"
```

---

## Done

E2e tests now:
1. Create a fresh `erp_db_test` before running
2. Run all migrations against it
3. Connect through `AppModule` which reads `.env.test` → `DB_DATABASE=erp_db_test`
4. Drop `erp_db_test` after all tests finish

`erp_db` (the live database) is never touched by tests again.
