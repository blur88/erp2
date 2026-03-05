# Docker Hardening Implementation Plan

> **For Claude:** REQUIRED SUB-SKILL: Use superpowers:executing-plans to implement this plan task-by-task.

**Goal:** Harden the Docker setup for security, production readiness, and reliability without breaking local development workflow.

**Architecture:** Multi-stage backend Dockerfile eliminates dev deps and source from production image; pinned base images ensure reproducible builds; a `docker-compose.override.yml` separates local dev config (exposed DB ports, debug flags) from the production base compose file.

**Tech Stack:** Docker, Docker Compose v2, Node 24 Alpine, NGINX Alpine, NestJS (nest build → `dist/main`), Vite (React SPA)

---

## Task 1: Pin base images — backend Dockerfile

**Files:**
- Modify: `backend/Dockerfile`

No tests for Dockerfile changes — verify by building the image.

**Step 1: Replace unpinned base image**

Open `backend/Dockerfile`. Change line 2:

```dockerfile
# Before
FROM node:24-alpine

# After
FROM node:24.2.0-alpine3.21
```

**Step 2: Build to verify it resolves**

```bash
cd backend
docker build -t erp-backend-test . 2>&1 | tail -5
```

Expected: build succeeds (or fails at a later step — just confirms image pulls correctly).

**Step 3: Clean up test image**

```bash
docker rmi erp-backend-test 2>/dev/null || true
```

**Step 4: Commit**

```bash
cd /home/blur/erp2
git add backend/Dockerfile
git commit -m "chore: pin backend base image to node:24.2.0-alpine3.21"
```

---

## Task 2: Convert backend to multi-stage Dockerfile

**Files:**
- Modify: `backend/Dockerfile`

**Step 1: Replace entire Dockerfile content**

Replace the full contents of `backend/Dockerfile` with:

```dockerfile
# Stage 1: Install all dependencies (dev + prod) for building
FROM node:24.2.0-alpine3.21 AS deps
WORKDIR /app
COPY package*.json ./
RUN npm ci && npm cache clean --force

# Stage 2: Build the application
FROM node:24.2.0-alpine3.21 AS builder
WORKDIR /app
COPY --from=deps /app/node_modules ./node_modules
COPY . .
RUN npm run build && npm prune --omit=dev && npm cache clean --force

# Stage 3: Production image — only compiled output + prod deps
FROM node:24.2.0-alpine3.21 AS production

# Install security updates and runtime dependencies
RUN apk update && apk upgrade && \
    apk add --no-cache curl 'postgresql18-client>=18.2-r0' dumb-init && \
    rm -rf /var/cache/apk/*

# Create non-root user
RUN addgroup -g 1001 -S nodejs && \
    adduser -S nestjs -u 1001 -G nodejs

WORKDIR /app

# Copy only built output and production node_modules
COPY --from=builder --chown=nestjs:nodejs /app/dist ./dist
COPY --from=builder --chown=nestjs:nodejs /app/node_modules ./node_modules
COPY --from=builder --chown=nestjs:nodejs /app/package.json ./package.json

# Create necessary directories with proper permissions
RUN mkdir -p uploads logs backups/{postgresql,mongodb,redis,settings,archives,temp,uploads} && \
    chown -R nestjs:nodejs uploads logs backups

# Switch to non-root user
USER nestjs

# Expose port
EXPOSE 3001

# Health check
HEALTHCHECK --interval=30s --timeout=3s --start-period=40s --retries=3 \
  CMD curl -f http://localhost:3001/api/health || exit 1

# Use dumb-init to handle signals properly
ENTRYPOINT ["/usr/bin/dumb-init", "--"]

# Start compiled application
CMD ["node", "dist/main"]
```

**Step 2: Build and verify**

```bash
cd /home/blur/erp2/backend
docker build -t erp-backend-test .
```

Expected: build succeeds with 3 stages logged. Final image should be smaller than before.

**Step 3: Confirm source files are NOT in the image**

```bash
docker run --rm erp-backend-test ls /app
```

Expected output contains only: `dist  node_modules  package.json  uploads  logs  backups`
Must NOT contain: `src  tsconfig.json  nest-cli.json  test`

**Step 4: Confirm no npm in the image**

```bash
docker run --rm erp-backend-test which npm 2>&1 || echo "npm not found - correct"
```

Expected: `npm not found - correct`

**Step 5: Clean up test image**

```bash
docker rmi erp-backend-test
```

**Step 6: Commit**

```bash
cd /home/blur/erp2
git add backend/Dockerfile
git commit -m "chore: convert backend to multi-stage Dockerfile

Production image now contains only dist/ + prod node_modules.
Source files and dev dependencies are excluded from the final image."
```

---

## Task 3: Fix frontend Dockerfile — npm ci + pinned images

**Files:**
- Modify: `frontend/Dockerfile`

**Step 1: Update frontend Dockerfile**

Replace the full contents of `frontend/Dockerfile` with:

```dockerfile
# Build stage
FROM node:24.2.0-alpine3.21 AS builder

# Set working directory
WORKDIR /app

# Copy package files
COPY package*.json ./

# Install all dependencies (including dev for build) — deterministic install
RUN npm ci

# Fix Rollup native dependency issue in Alpine Linux
RUN npm install @rollup/rollup-linux-x64-musl --save-optional

# Copy source code
COPY . .

# Build arguments
ARG VITE_API_BASE_URL
ARG VITE_SOCKET_URL
ARG VITE_APP_VERSION

ENV VITE_API_BASE_URL=$VITE_API_BASE_URL
ENV VITE_SOCKET_URL=$VITE_SOCKET_URL
ENV VITE_APP_VERSION=$VITE_APP_VERSION

# Build the application
RUN npm run build

# Production stage
FROM nginx:1.29.0-alpine3.21 AS production

# Update Alpine packages and install curl for health checks
RUN apk update && \
    apk upgrade && \
    apk add --no-cache curl

# Copy custom nginx configuration
COPY nginx.conf /etc/nginx/conf.d/default.conf

# Copy built application from builder stage
COPY --from=builder /app/dist /usr/share/nginx/html

# Copy environment configuration script
COPY docker-entrypoint.sh /docker-entrypoint.sh
RUN chmod +x /docker-entrypoint.sh

# Expose port
EXPOSE 80

# Health check
HEALTHCHECK --interval=30s --timeout=3s --start-period=5s --retries=3 \
  CMD curl -f http://localhost/health || exit 1

# Start nginx with custom entrypoint
ENTRYPOINT ["/docker-entrypoint.sh"]
CMD ["nginx", "-g", "daemon off;"]
```

Key changes from original:
- Builder: `node:24.2.0-alpine3.21` (pinned)
- `npm install` → `npm ci`
- Production: `nginx:1.29.0-alpine3.21` (pinned, dropped `-slim` suffix)
- Healthcheck: `http://localhost/health` (uses the `/health` endpoint in nginx.conf)

**Step 2: Build and verify**

```bash
cd /home/blur/erp2/frontend
docker build -t erp-frontend-test .
```

Expected: build succeeds.

**Step 3: Confirm dist is served**

```bash
docker run --rm -d --name fe-test erp-frontend-test
docker exec fe-test ls /usr/share/nginx/html
docker stop fe-test
```

Expected: `index.html`, `assets/`, and other Vite build output present.

**Step 4: Clean up**

```bash
docker rmi erp-frontend-test
```

**Step 5: Commit**

```bash
cd /home/blur/erp2
git add frontend/Dockerfile
git commit -m "chore: pin frontend images and switch to npm ci

- node:24.2.0-alpine3.21 in builder stage
- nginx:1.29.0-alpine3.21 in production stage (was nginx:1-alpine-slim)
- npm install → npm ci for deterministic builds
- healthcheck uses /health endpoint"
```

---

## Task 4: Fix frontend docker-entrypoint.sh — injection safety

**Files:**
- Modify: `frontend/docker-entrypoint.sh`

**Step 1: Update entrypoint to use double-quote expansion**

Replace the full contents of `frontend/docker-entrypoint.sh` with:

```sh
#!/bin/sh

# Replace environment variables in built files
# This allows runtime configuration of the React app

# Create environment configuration that gets injected into HTML
cat > /usr/share/nginx/html/env-config.js << ENVEOF
window.__ENV__ = {
  VITE_API_BASE_URL: "${VITE_API_BASE_URL}",
  VITE_SOCKET_URL: "${VITE_SOCKET_URL}"
};
ENVEOF

# Execute the main command
exec "$@"
```

Key change: heredoc delimiter changed from `EOF` to `ENVEOF` and inner values use double-quotes. This makes shell expansion work correctly for URL values (which never contain double quotes) and avoids breakage if a value contained a single quote.

**Step 2: Verify the output format**

```bash
cd /home/blur/erp2/frontend
VITE_API_BASE_URL=/api VITE_SOCKET_URL=/ sh docker-entrypoint.sh echo "done"
```

Expected: exits cleanly with "done". The script writes to `/usr/share/nginx/html/env-config.js` which won't exist locally — that's fine, the `cat >` will fail silently or error on missing dir. Just confirm no syntax errors in the script.

Actually, verify with:
```bash
sh -n frontend/docker-entrypoint.sh && echo "syntax OK"
```

Expected: `syntax OK`

**Step 3: Commit**

```bash
cd /home/blur/erp2
git add frontend/docker-entrypoint.sh
git commit -m "fix: safe env var injection in frontend entrypoint

Use double-quote expansion in heredoc to avoid breakage
if env var values contain single quotes."
```

---

## Task 5: Fix docker-compose.yml — DB_SYNCHRONIZE, NGINX healthcheck, remove DB ports

**Files:**
- Modify: `docker-compose.yml`

Make three targeted edits:

**Step 1: Change DB_SYNCHRONIZE default to false**

Find line:
```yaml
      - DB_SYNCHRONIZE=${DATABASE_SYNCHRONIZE:-true}
```

Replace with:
```yaml
      - DB_SYNCHRONIZE=${DATABASE_SYNCHRONIZE:-false}
```

**Step 2: Remove postgres ports from base compose**

Find and remove the entire `ports` block under the `postgres` service:
```yaml
    ports:
      - "5432:5432"
```

**Step 3: Remove redis ports from base compose**

Find and remove the entire `ports` block under the `redis` service:
```yaml
    ports:
      - "6379:6379"
```

**Step 4: Fix NGINX healthcheck port**

Find:
```yaml
      test: ["CMD-SHELL", "wget --no-verbose --tries=1 --spider http://localhost:8080/health || exit 1"]
```

Replace with:
```yaml
      test: ["CMD-SHELL", "wget --no-verbose --tries=1 --spider http://localhost:80/ || exit 1"]
```

Note: The outer NGINX reverse proxy container doesn't have a custom nginx.conf with a `/health` endpoint (that's only the frontend container's nginx.conf). Use `http://localhost:80/` which will return 200 for the default nginx welcome page or pass through to the upstream.

**Step 5: Verify the file is valid**

```bash
cd /home/blur/erp2
docker compose config --quiet && echo "compose file valid"
```

Expected: `compose file valid` (no errors)

**Step 6: Commit**

```bash
git add docker-compose.yml
git commit -m "fix: harden docker-compose.yml for production

- DB_SYNCHRONIZE defaults to false (prevent auto-sync in prod)
- Remove postgres/redis port exposure from base compose
- Fix NGINX healthcheck port 8080 -> 80"
```

---

## Task 6: Add docker-compose.override.yml for local development

**Files:**
- Create: `docker-compose.override.yml`

**Step 1: Create the override file**

Create `/home/blur/erp2/docker-compose.override.yml` with:

```yaml
# Local development overrides — auto-applied by "docker compose up"
# NOT used in production. For production: docker compose -f docker-compose.yml up -d

services:
  postgres:
    ports:
      - "5432:5432"

  redis:
    ports:
      - "6379:6379"

  backend:
    environment:
      - DB_SYNCHRONIZE=true
      - LOG_LEVEL=debug
      - DEBUG_MODE=true
      - ENABLE_SWAGGER=true
```

**Step 2: Verify Docker Compose merges it correctly**

```bash
cd /home/blur/erp2
docker compose config | grep -A5 "5432"
```

Expected: postgres service shows `5432:5432` port mapping (from override being merged in).

```bash
docker compose config | grep DB_SYNCHRONIZE
```

Expected: `DB_SYNCHRONIZE: "true"` (override wins over base file default of false).

**Step 3: Verify production-only config excludes override**

```bash
docker compose -f docker-compose.yml config | grep -c "5432"
```

Expected: `0` (no port 5432 in production config)

**Step 4: Commit**

```bash
cd /home/blur/erp2
git add docker-compose.override.yml
git commit -m "chore: add docker-compose.override.yml for local dev

Exposes postgres/redis ports and enables debug settings locally.
Production deploys use: docker compose -f docker-compose.yml up -d"
```

---

## Task 7: Full stack smoke test

**Step 1: Build all images from scratch**

```bash
cd /home/blur/erp2
docker compose build --no-cache
```

Expected: all three custom images (backend, frontend) build without errors. Check for any warnings.

**Step 2: Start the stack**

```bash
docker compose up -d
```

Expected: all services start. Postgres and redis ports should be accessible from host (override applied).

**Step 3: Wait for health checks and verify**

```bash
sleep 15
docker compose ps
```

Expected: all services show `healthy` or `running`. No services in `Exit` or `Restarting` state.

**Step 4: Test backend health endpoint**

```bash
curl -f http://localhost:3001/api/health
```

Expected: JSON response with status ok/healthy.

**Step 5: Test frontend**

```bash
curl -f http://localhost:3000/health
```

Expected: `healthy` (from nginx.conf `/health` endpoint).

**Step 6: Verify env-config.js is injected**

```bash
curl -s http://localhost:3000/env-config.js
```

Expected:
```js
window.__ENV__ = {
  VITE_API_BASE_URL: "/api",
  VITE_SOCKET_URL: "/"
};
```

**Step 7: Verify DB ports accessible from host (local dev override working)**

```bash
pg_isready -h localhost -p 5432 -U erp_user 2>&1 || echo "pg_isready not installed — check with docker exec instead"
```

Or alternatively:
```bash
docker exec erp_postgres pg_isready -U erp_user
```

Expected: `localhost:5432 - accepting connections`

**Step 8: Check image sizes (optional — confirm multi-stage reduced backend size)**

```bash
docker images | grep erp
```

Note the backend image size. It should be noticeably smaller than before the multi-stage change.

**Step 9: Shut down**

```bash
docker compose down
```

---

## Summary of Changes

| File | Change |
|------|--------|
| `backend/Dockerfile` | Multi-stage build; pinned to `node:24.2.0-alpine3.21`; source excluded from prod image |
| `frontend/Dockerfile` | Pinned to `node:24.2.0-alpine3.21` (builder) and `nginx:1.29.0-alpine3.21` (prod); `npm ci`; healthcheck uses `/health` |
| `frontend/docker-entrypoint.sh` | Double-quote env var injection (safe for URLs with special chars) |
| `docker-compose.yml` | `DB_SYNCHRONIZE` defaults to `false`; postgres/redis ports removed; NGINX healthcheck port fixed to 80 |
| `docker-compose.override.yml` | New file — exposes DB ports + debug settings for local dev only |

## Future CI/CD Note

When adding a pipeline, the production deploy command is:
```bash
docker compose -f docker-compose.yml build
docker compose -f docker-compose.yml up -d
```
No changes to these files required at that point.
