# Docker Base Image Bump — Design Spec

**Issue:** #454
**Date:** 2026-04-26

## Overview

Update three Docker base images to their latest patched versions, all on Alpine 3.23. Covers NGINX, Node.js, and Redis across five file locations.

## Target Versions

| Image | Current | Target |
|-------|---------|--------|
| `nginx` | `1.29.7-alpine-slim` | `1.30.0-alpine3.23-slim` |
| `node` | `24.14.1-alpine3.23` | `24.15.0-alpine3.23` |
| `redis` | `8.6.1-alpine3.23` | `8.6.2-alpine3.23` |

## Step 1 — Verify Image Tags Exist

Run `docker manifest inspect` for all three targets before editing any file:

```bash
docker manifest inspect nginx:1.30.0-alpine3.23-slim
docker manifest inspect node:24.15.0-alpine3.23
docker manifest inspect redis:8.6.2-alpine3.23
```

If any tag returns an error, stop and report. Proceed only when all three resolve successfully.

## Step 2 — NGINX 1.30.0 Changelog Review

NGINX 1.29 → 1.30 is a minor version bump (new stable branch). Fetch the NGINX 1.30.0 changelog and scan for breaking changes to directives used in `nginx/nginx.conf`:

- `gzip`, `gzip_vary`, `gzip_proxied`, `gzip_comp_level`, `gzip_types`
- `limit_req_zone`, `limit_req`, `limit_conn_zone`, `limit_conn`
- `proxy_pass`, `proxy_http_version`, `proxy_set_header`, `keepalive`
- `add_header`, `server_tokens`, `sendfile`, `tcp_nopush`, `tcp_nodelay`
- `access_log`, `error_log`

If any breaking change affects our config, adjust `nginx/nginx.conf` and `frontend/nginx.conf` before proceeding with the image bump.

Node.js (24.14 → 24.15) and Redis (8.6.1 → 8.6.2) are patch-level bumps — no changelog review required.

## Step 3 — File Updates

Update five locations in a single commit:

| File | Change |
|------|--------|
| `frontend/Dockerfile` | `node:24.14.1-alpine3.23` → `node:24.15.0-alpine3.23` (all stages) |
| `frontend/Dockerfile` | `nginx:1.29.7-alpine-slim` → `nginx:1.30.0-alpine3.23-slim` |
| `backend/Dockerfile` | `node:24.14.1-alpine3.23` → `node:24.15.0-alpine3.23` (all stages) |
| `nginx/Dockerfile` | `nginx:1.29.7-alpine-slim` → `nginx:1.30.0-alpine3.23-slim` |
| `docker-compose.yml` | `redis:8.6.1-alpine3.23` → `redis:8.6.2-alpine3.23` |

## Step 4 — Build Smoke-Test

After editing, run:

```bash
docker compose build
```

Confirm all images build cleanly with the new base images. No runtime test required — build success is the acceptance criterion.

## Step 5 — PR

Open a PR with title `chore(deps): bump NGINX to 1.30.0, Node to 24.15.0, Redis to 8.6.2` and body `Closes #454`. Merge with `--merge --delete-branch`.
