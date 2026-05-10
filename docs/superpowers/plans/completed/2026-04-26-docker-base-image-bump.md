# Docker Base Image Bump Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Bump NGINX to 1.30.0-alpine3.23-slim, Node.js to 24.15.0-alpine3.23, and Redis to 8.6.2-alpine3.23 across all Dockerfiles and docker-compose.yml.

**Architecture:** Verify all three target image tags exist on Docker Hub first, review NGINX 1.30.0 changelog for breaking changes, then update five file locations in one commit, and confirm with a full `docker compose build`.

**Tech Stack:** Docker, NGINX 1.30.0, Node.js 24.15.0, Redis 8.6.2, Alpine 3.23

---

## File Map

| File | Change |
|------|--------|
| `frontend/Dockerfile` | `node:24.14.1-alpine3.23` → `node:24.15.0-alpine3.23` (builder stage, line 2); `nginx:1.29.7-alpine-slim` → `nginx:1.30.0-alpine3.23-slim` (production stage) |
| `backend/Dockerfile` | `node:24.14.1-alpine3.23` → `node:24.15.0-alpine3.23` (deps, builder, production stages — lines 2, 9, 16) |
| `nginx/Dockerfile` | `nginx:1.29.7-alpine-slim` → `nginx:1.30.0-alpine3.23-slim` (line 1) |
| `docker-compose.yml` | `redis:8.6.1-alpine3.23` → `redis:8.6.2-alpine3.23` (line 42) |

---

### Task 1: Verify target image tags exist on Docker Hub

**Files:** none (read-only verification)

- [ ] **Step 1: Inspect nginx target tag**

```bash
docker manifest inspect nginx:1.30.0-alpine3.23-slim
```

Expected: JSON manifest output (not an error). If you get `no such manifest` or any error, **stop** — do not proceed.

- [ ] **Step 2: Inspect node target tag**

```bash
docker manifest inspect node:24.15.0-alpine3.23
```

Expected: JSON manifest output. Stop on any error.

- [ ] **Step 3: Inspect redis target tag**

```bash
docker manifest inspect redis:8.6.2-alpine3.23
```

Expected: JSON manifest output. Stop on any error.

---

### Task 2: Review NGINX 1.30.0 changelog for breaking changes

**Files:** potentially `nginx/nginx.conf`, `frontend/nginx.conf` if a breaking change is found

- [ ] **Step 1: Fetch NGINX changelog**

```bash
curl -s https://nginx.org/en/CHANGES | head -200
```

Scan the output for any changes to these directives that our config uses:
`gzip`, `gzip_vary`, `gzip_proxied`, `gzip_comp_level`, `gzip_types`,
`limit_req_zone`, `limit_req`, `limit_conn_zone`, `limit_conn`,
`proxy_pass`, `proxy_http_version`, `proxy_set_header`, `keepalive`,
`add_header`, `server_tokens`, `sendfile`, `tcp_nopush`, `tcp_nodelay`,
`access_log`, `error_log`

- [ ] **Step 2: Assess impact**

If the changelog mentions a breaking change, behavioral change, or removed/renamed directive that matches any directive above:
1. Open `nginx/nginx.conf` and/or `frontend/nginx.conf`
2. Apply the required config fix
3. Commit the config change separately before Task 3:
```bash
git add nginx/nginx.conf frontend/nginx.conf
git commit -m "fix(nginx): update config for NGINX 1.30.0 compatibility"
```

If no breaking changes affect our directives, proceed directly to Task 3 with no file edits.

---

### Task 3: Update all base image references

**Files:**
- Modify: `frontend/Dockerfile`
- Modify: `backend/Dockerfile`
- Modify: `nginx/Dockerfile`
- Modify: `docker-compose.yml`

- [ ] **Step 1: Update frontend/Dockerfile — Node.js builder stage**

Change line 2 from:
```dockerfile
FROM node:24.14.1-alpine3.23 AS builder
```
to:
```dockerfile
FROM node:24.15.0-alpine3.23 AS builder
```

- [ ] **Step 2: Update frontend/Dockerfile — NGINX production stage**

Change the production stage FROM line from:
```dockerfile
FROM nginx:1.29.7-alpine-slim AS production
```
to:
```dockerfile
FROM nginx:1.30.0-alpine3.23-slim AS production
```

- [ ] **Step 3: Update backend/Dockerfile — all three Node.js stages**

Change all three occurrences of `node:24.14.1-alpine3.23` to `node:24.15.0-alpine3.23`:

```dockerfile
FROM node:24.15.0-alpine3.23 AS deps
```
```dockerfile
FROM node:24.15.0-alpine3.23 AS builder
```
```dockerfile
FROM node:24.15.0-alpine3.23 AS production
```

- [ ] **Step 4: Update nginx/Dockerfile — NGINX base image**

Change line 1 from:
```dockerfile
FROM nginx:1.29.7-alpine-slim
```
to:
```dockerfile
FROM nginx:1.30.0-alpine3.23-slim
```

- [ ] **Step 5: Update docker-compose.yml — Redis image**

Change line 42 from:
```yaml
    image: redis:8.6.1-alpine3.23
```
to:
```yaml
    image: redis:8.6.2-alpine3.23
```

- [ ] **Step 6: Verify all changes with grep**

```bash
grep -rn 'node:\|nginx:\|redis:' frontend/Dockerfile backend/Dockerfile nginx/Dockerfile docker-compose.yml
```

Expected output — confirm these exact tags appear and no old tags remain:
```
frontend/Dockerfile:2:FROM node:24.15.0-alpine3.23 AS builder
frontend/Dockerfile:<N>:FROM nginx:1.30.0-alpine3.23-slim AS production
backend/Dockerfile:2:FROM node:24.15.0-alpine3.23 AS deps
backend/Dockerfile:9:FROM node:24.15.0-alpine3.23 AS builder
backend/Dockerfile:16:FROM node:24.15.0-alpine3.23 AS production
nginx/Dockerfile:1:FROM nginx:1.30.0-alpine3.23-slim
docker-compose.yml:42:    image: redis:8.6.2-alpine3.23
```

No lines should contain `24.14.1`, `1.29.7`, or `8.6.1`.

- [ ] **Step 7: Commit all file updates**

```bash
git add frontend/Dockerfile backend/Dockerfile nginx/Dockerfile docker-compose.yml
git commit -m "chore(deps): bump NGINX to 1.30.0, Node to 24.15.0, Redis to 8.6.2

Closes #454"
```

---

### Task 4: Build smoke-test

**Files:** none (build verification only)

- [ ] **Step 1: Run full docker compose build**

```bash
docker compose build 2>&1 | tee /tmp/build-output.txt
echo "Exit code: $?"
```

Expected: all services build without errors, exit code 0. The output should show `FINISHED` for each service (backend, frontend, nginx).

- [ ] **Step 2: Check for build errors**

```bash
grep -i 'error\|failed\|unable to' /tmp/build-output.txt || echo "No errors found"
```

If any errors appear, investigate before proceeding to the PR step.

---

### Task 5: Open PR

**Files:** none

- [ ] **Step 1: Push branch and open PR**

```bash
gh pr create \
  --title "chore(deps): bump NGINX to 1.30.0, Node to 24.15.0, Redis to 8.6.2" \
  --body "$(cat <<'EOF'
## Summary
- Bumps NGINX from `1.29.7-alpine-slim` to `1.30.0-alpine3.23-slim`
- Bumps Node.js from `24.14.1-alpine3.23` to `24.15.0-alpine3.23`
- Bumps Redis from `8.6.1-alpine3.23` to `8.6.2-alpine3.23`

All target tags verified on Docker Hub. NGINX 1.30.0 changelog reviewed for breaking changes. Full `docker compose build` passed.

## Test plan
- [ ] All three target image tags confirmed present on Docker Hub via `docker manifest inspect`
- [ ] NGINX 1.30.0 changelog reviewed — no breaking changes to our `nginx.conf` directives
- [ ] `docker compose build` exits 0 with no errors

Closes #454
EOF
)"
```

- [ ] **Step 2: Merge PR**

```bash
gh pr merge --merge --delete-branch
```
