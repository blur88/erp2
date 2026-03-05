# Docker Hardening Design

**Date:** 2026-03-01
**Scope:** docker-compose.yml, backend/Dockerfile, frontend/Dockerfile, new docker-compose.override.yml

## Context

Single VPS deployment, still in active development, manual deploys via `deploy.sh`. CI/CD planned for the future. No MongoDB in use (listed in CLAUDE.md architecture but not actually used by any module).

## Goals

Comprehensive audit across security, production readiness, and reliability:

- Reduce attack surface in production images
- Ensure reproducible builds
- Fix broken healthcheck
- Eliminate dangerous production defaults
- Establish clean prod/dev config split

---

## Issues Identified

### Critical / High

| # | Location | Issue |
|---|----------|-------|
| 1 | `backend/Dockerfile` | Single-stage build — source files, dev deps, and build tooling all present in production image |
| 2 | `backend/Dockerfile` | Unpinned base image `node:24-alpine` — floats on every build |
| 3 | `frontend/Dockerfile` | Unpinned base images (`node:24-alpine`, `nginx:1-alpine-slim`) |
| 4 | `frontend/Dockerfile` | `npm install` instead of `npm ci` — non-deterministic builds |
| 5 | `docker-compose.yml` | `DB_SYNCHRONIZE` defaults to `true` — auto-sync is destructive in production |
| 6 | `docker-compose.yml` | NGINX healthcheck targets port 8080 but nginx listens on 80/443 — healthcheck always fails |
| 7 | `frontend/docker-entrypoint.sh` | Unquoted env var injection into JS — single quotes in values break the file |
| 8 | `docker-compose.yml` | Postgres (5432) and Redis (6379) ports exposed to host in base compose — should be dev-only |

### Medium / Low (no changes required)

- `apk update && apk upgrade` in Dockerfiles is non-reproducible; mitigated by pinning base image versions
- `read_only: true` + `tmpfs` on frontend/nginx is correct and well-configured
- `.dockerignore` files are comprehensive and well-structured
- Resource limits, logging config, `security_opt: no-new-privileges`, healthcheck intervals all solid

---

## Design

### 1. Backend Dockerfile — Multi-Stage Build

Replace single-stage with three stages:

```
Stage 1 (deps)     node:24.2.0-alpine3.21 (pinned)
                   Copy package*.json
                   npm ci (install all deps)

Stage 2 (builder)  Copy node_modules from deps stage
                   Copy source
                   npm run build
                   npm prune --omit=dev

Stage 3 (prod)     node:24.2.0-alpine3.21 (pinned)
                   apk: curl, postgresql18-client, dumb-init
                   Create non-root user (nestjs:nodejs 1001:1001)
                   Copy dist/ and node_modules/ from builder
                   Create uploads/ logs/ backups/ with correct ownership
                   USER nestjs
                   EXPOSE 3001
                   HEALTHCHECK curl localhost:3001/api/health
                   ENTRYPOINT dumb-init
                   CMD node dist/main
```

**Result:** Source files and dev dependencies never exist in the production image.

### 2. Frontend Dockerfile — Fixes

- Pin builder: `node:24.2.0-alpine3.21`
- Pin production: `nginx:1.29.0-alpine3.21` (drop `-slim` — slim variant lacks apk)
- Change `npm install` → `npm ci` in builder stage

### 3. frontend/docker-entrypoint.sh — Injection Fix

Change single-quote heredoc to double-quote variable expansion:

```sh
# Before (unsafe for values containing single quotes)
VITE_API_BASE_URL: '$VITE_API_BASE_URL'

# After (safe for URL values)
VITE_API_BASE_URL: "${VITE_API_BASE_URL}"
```

### 4. docker-compose.yml — Production Base

- Remove `ports` from postgres and redis services (moved to override)
- Change `DB_SYNCHRONIZE` default: `${DATABASE_SYNCHRONIZE:-false}`
- Fix NGINX healthcheck: `http://localhost:80/` (was `http://localhost:8080/health`)
- Add version comment block at top for easy future updates

### 5. docker-compose.override.yml — New File (Local Dev)

Auto-applied by Docker Compose when running `docker compose up` locally:

```yaml
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

---

## Future CI/CD Note

When a pipeline is added, use:
```bash
docker compose -f docker-compose.yml up -d
```
This explicitly skips the override file. No other changes to compose files required at that point.

---

## Out of Scope

- Docker secrets / Swarm mode (overkill for single VPS)
- MongoDB service (not used by any module)
- Kubernetes / ECS migration
- Centralized log aggregation
