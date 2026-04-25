# WebSocket Stability Fix — Design Spec

**Issue:** #430
**Date:** 2026-04-25
**Scope:** Fix intermittent "transport close" disconnections and suppress noisy reconnect toasts

---

## Problem

The Socket.IO connection established by `WebSocketProvider` (root namespace `/`) disconnects intermittently with reason `"transport close"` and auto-reconnects. Three root causes:

1. **No `pingTimeout`/`pingInterval` on the server.** Default `pingTimeout` is 20s — too short for Docker networking latency spikes. A missed ping closes the connection before recovery is possible.
2. **NGINX `keepalive 32` upstream pooling.** HTTP keepalive connection recycling can interfere with long-lived WebSocket tunnels, causing NGINX to close the underlying TCP connection mid-session.
3. **Noisy reconnect toast.** The `reconnect` event fires a "Real-time connection restored" notification on every auto-recovery, including sub-second blips the user never noticed.

**Out of scope:** The `DashboardWebSocketGateway` uses a `dashboard` namespace that the frontend never connects to — this is a separate cleanup issue. The dashboard page is REST-based and stays that way.

---

## Solution: Option B — Stable + Silent

### 1. Backend — Root namespace gateway with heartbeat config

`frontend/src/hooks/useWebSocket.tsx` connects to the root namespace (`/`). There is no NestJS gateway registered on `/` — only on `dashboard`. Add a minimal root gateway with explicit heartbeat settings:

- `pingInterval: 25000` (25s — matches Socket.IO default, explicit for clarity)
- `pingTimeout: 60000` (60s — tripled from 20s default to tolerate Docker network latency)

**File:** `backend/src/modules/dashboard/gateways/app-websocket-gateway.ts` (new file)
**Module:** Register in `DashboardModule`

The existing `DashboardWebSocketGateway` (`namespace: 'dashboard'`) is left unchanged.

### 2. NGINX — Disable keepalive reuse on WebSocket path

The `/socket.io/` location block already sets correct WebSocket upgrade headers. Add:

```nginx
proxy_http_version 1.1;
keepalive_requests 0;
```

`keepalive_requests 0` disables connection reuse for the WebSocket proxy path, preventing NGINX from recycling the TCP tunnel mid-session.

**File:** `nginx/nginx.conf`

### 3. Frontend — Debounced reconnect toast

In `useWebSocket.tsx`, track the timestamp when `disconnect` fires using a `useRef`. In the `reconnect` handler, only call `showNotification` if `Date.now() - disconnectTimeRef.current > 5000`. Sub-second blips produce no visible notification.

**File:** `frontend/src/hooks/useWebSocket.tsx`

---

## Files Changed

| File | Change |
|------|--------|
| `backend/src/modules/dashboard/gateways/app-websocket-gateway.ts` | New root namespace gateway with heartbeat config |
| `backend/src/modules/dashboard/dashboard.module.ts` | Register new gateway |
| `nginx/nginx.conf` | Add `keepalive_requests 0` to `/socket.io/` location |
| `frontend/src/hooks/useWebSocket.tsx` | Add disconnect timestamp ref, debounce reconnect toast |

---

## What We're NOT Changing

- Transport order stays `['websocket', 'polling']` — polling fallback is a safety net
- Dashboard page stays REST-based
- `DashboardWebSocketGateway` namespace mismatch — separate cleanup ticket
- No Redis adapter — single backend instance, in-memory adapter is correct

---

## Testing

1. Start Docker Compose, open browser devtools network tab
2. Filter to WS connections — confirm `/socket.io/` upgrades to WebSocket
3. Let the connection sit for 2+ minutes — confirm no `transport close` in console
4. Simulate a brief disconnect (restart backend container) — confirm toast only appears if down >5s
5. Confirm existing notification events (`realtime_update`, `system_notification`, `business_alert`) still fire correctly
