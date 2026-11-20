# Upgrading to the Ingress-only entry point (#1959)

[ADR 0003](../adr/0003-ingress-only-entry-point.md) makes the NGINX Ingress the only port Compose publishes for the app. Existing installs need one check and possibly one `.env` edit.

## What changes on the host

| Before | After |
|---|---|
| `http://localhost:3000` (frontend) | `http://localhost` |
| `http://localhost:3001/api` (backend) | `http://localhost/api` |
| `http://localhost:3001/api/docs` | `http://localhost/api/docs` |
| `localhost:8080/health`, `443` | not published |

Anything of yours that called `:3000` or `:3001` must call port 80 instead: scripts, monitors, reverse proxies and bookmarks. Those calls now go through the Ingress's rate limits, as intended. A reverse proxy or TLS terminator in front of the stack should forward to port 80. The Ingress's rate limits key on the connecting address and do not read `X-Forwarded-For`, so behind such a proxy all users share the proxy's address and one budget. Terminate TLS in a way that preserves the client address (for example a TCP/stream proxy), or treat this as a known limit.

The only direct probes left are in CI: `scripts/verify-backup-restart.sh` and the health waits in `.github/workflows/ci.yml` target `:3001` on host-networked jobs that run the backend container without Compose.

## Your existing `.env`

`docker compose` reads `ALLOWED_ORIGINS` and `FRONTEND_URL` from `.env`. The new defaults are `http://localhost`, but a `.env` copied from an older `.env.example` still says `http://localhost:3000` (and `http://localhost:3001`), and `.env` wins over the defaults.

Set both to the URL people type in the browser, with no path:

```env
# Local stack
ALLOWED_ORIGINS=http://localhost
FRONTEND_URL=http://localhost

# Behind your own domain
ALLOWED_ORIGINS=https://erp.example.com
FRONTEND_URL=https://erp.example.com
```

`setup.sh` already wrote your domain into both on first run, so a production `.env` it generated needs no change.

Then recreate the backend so it picks the values up: `docker compose up -d backend` (or `docker compose -f docker-compose.prod.yml up -d backend`).

Browsers don't apply CORS to same-origin requests, so a stale value rarely breaks the web app itself. Fix it anyway: any cross-origin client you add later is checked against this list.

## Verify

```bash
curl -s -o /dev/null -w '%{http_code}\n' http://localhost/api/health   # 200
curl -s -o /dev/null -w '%{http_code}\n' http://localhost/             # 200
curl -s -o /dev/null --max-time 3 http://localhost:3001/api/health || echo "3001 closed, as intended"
```
