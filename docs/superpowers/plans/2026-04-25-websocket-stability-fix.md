# WebSocket Stability Fix Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Fix intermittent "transport close" WebSocket disconnections and suppress noisy reconnect toasts for sub-5-second blips.

**Architecture:** Add a root-namespace NestJS WebSocket gateway with explicit heartbeat config; patch the NGINX `/socket.io/` location to disable keepalive connection recycling; add a disconnect timestamp ref in `useWebSocket.tsx` to gate the reconnect toast.

**Tech Stack:** NestJS 11 + `@nestjs/websockets` ^11 + `socket.io` ^4.8, React 19 + `socket.io-client` ^4.7, NGINX

---

## File Map

| File | Action | Responsibility |
|------|--------|----------------|
| `backend/src/modules/dashboard/gateways/app-websocket-gateway.ts` | Create | Root namespace (`/`) gateway with heartbeat config |
| `backend/src/modules/dashboard/dashboard-module.ts` | Modify | Register `AppWebSocketGateway` as provider |
| `nginx/nginx.conf` | Modify | Add `keepalive_requests 0` to `/socket.io/` location |
| `frontend/src/hooks/useWebSocket.tsx` | Modify | Add `disconnectTimeRef`, debounce reconnect toast |

---

## Task 1: Create root namespace gateway with heartbeat config

The frontend `WebSocketProvider` connects to the root namespace (`/`) but no NestJS gateway is registered there — only on `dashboard`. This task adds the missing gateway with correct `pingTimeout`.

**Files:**
- Create: `backend/src/modules/dashboard/gateways/app-websocket-gateway.ts`

- [ ] **Step 1: Write the failing test**

Create `backend/src/modules/dashboard/gateways/app-websocket-gateway.spec.ts`:

```typescript
import { AppWebSocketGateway } from './app-websocket-gateway';

describe('AppWebSocketGateway', () => {
  let gateway: AppWebSocketGateway;

  beforeEach(() => {
    gateway = new AppWebSocketGateway();
  });

  it('should be defined', () => {
    expect(gateway).toBeDefined();
  });
});
```

- [ ] **Step 2: Run test to verify it fails**

```bash
cd backend && npx jest src/modules/dashboard/gateways/app-websocket-gateway.spec.ts --no-coverage
```

Expected: FAIL — `Cannot find module './app-websocket-gateway'`

- [ ] **Step 3: Create the gateway**

Create `backend/src/modules/dashboard/gateways/app-websocket-gateway.ts`:

```typescript
import { WebSocketGateway, WebSocketServer } from '@nestjs/websockets';
import { Server } from 'socket.io';

@WebSocketGateway({
  cors: {
    origin: '*',
    methods: ['GET', 'POST'],
  },
  pingInterval: 25000,
  pingTimeout: 60000,
})
export class AppWebSocketGateway {
  @WebSocketServer()
  server: Server;
}
```

- [ ] **Step 4: Run test to verify it passes**

```bash
cd backend && npx jest src/modules/dashboard/gateways/app-websocket-gateway.spec.ts --no-coverage
```

Expected: PASS

- [ ] **Step 5: Commit**

```bash
cd backend && git add src/modules/dashboard/gateways/app-websocket-gateway.ts src/modules/dashboard/gateways/app-websocket-gateway.spec.ts
git commit -m "feat(websocket): add root namespace gateway with heartbeat config"
```

---

## Task 2: Register the new gateway in DashboardModule

**Files:**
- Modify: `backend/src/modules/dashboard/dashboard-module.ts`

- [ ] **Step 1: Add `AppWebSocketGateway` to providers**

Edit `backend/src/modules/dashboard/dashboard-module.ts`. Change:

```typescript
import { DashboardWebSocketGateway } from './gateways/dashboard-websocket-gateway';
```

to:

```typescript
import { DashboardWebSocketGateway } from './gateways/dashboard-websocket-gateway';
import { AppWebSocketGateway } from './gateways/app-websocket-gateway';
```

And change:

```typescript
  providers: [DashboardService, DashboardWebSocketGateway],
```

to:

```typescript
  providers: [DashboardService, DashboardWebSocketGateway, AppWebSocketGateway],
```

- [ ] **Step 2: Verify backend compiles**

```bash
cd backend && npm run build 2>&1 | tail -20
```

Expected: no TypeScript errors, build succeeds.

- [ ] **Step 3: Commit**

```bash
git add backend/src/modules/dashboard/dashboard-module.ts
git commit -m "feat(websocket): register AppWebSocketGateway in DashboardModule"
```

---

## Task 3: Fix NGINX keepalive recycling for WebSocket path

The `/socket.io/` location block in `nginx/nginx.conf` inherits upstream keepalive connection pooling, which can recycle the TCP tunnel mid-WebSocket session.

**Files:**
- Modify: `nginx/nginx.conf` — `/socket.io/` location block (lines 163–182)

- [ ] **Step 1: Add `keepalive_requests 0` to the WebSocket location**

Open `nginx/nginx.conf`. Find the `location /socket.io/` block (currently lines 163–182) and add `keepalive_requests 0;` after `proxy_buffering off;`:

```nginx
        # WebSocket support for Socket.IO
        location /socket.io/ {
            proxy_pass http://backend;
            proxy_http_version 1.1;

            # WebSocket headers
            proxy_set_header Upgrade $http_upgrade;
            proxy_set_header Connection "upgrade";
            proxy_set_header Host $host;
            proxy_set_header X-Real-IP $remote_addr;
            proxy_set_header X-Forwarded-For $proxy_add_x_forwarded_for;
            proxy_set_header X-Forwarded-Proto $scheme;

            # WebSocket timeouts
            proxy_cache_bypass $http_upgrade;
            proxy_read_timeout 86400s;
            proxy_send_timeout 86400s;

            # Buffer settings
            proxy_buffering off;
            keepalive_requests 0;
        }
```

- [ ] **Step 2: Validate the NGINX config**

```bash
docker compose exec nginx nginx -t 2>&1 || echo "Container not running — validate after deploy"
```

If the container is running, expected: `nginx: configuration file /etc/nginx/nginx.conf test is successful`

- [ ] **Step 3: Commit**

```bash
git add nginx/nginx.conf
git commit -m "fix(nginx): disable keepalive recycling on WebSocket proxy path"
```

---

## Task 4: Debounce reconnect toast in useWebSocket.tsx

Only show "Real-time connection restored" if the connection was down for more than 5 seconds.

**Files:**
- Modify: `frontend/src/hooks/useWebSocket.tsx`

- [ ] **Step 1: Write the failing test**

Create `frontend/src/hooks/__tests__/useWebSocket.reconnect.test.tsx`:

```typescript
import { renderHook, act } from '@testing-library/react'
import { vi, describe, it, expect, beforeEach } from 'vitest'

// Mock dependencies
vi.mock('./useNotification', () => ({
  useNotification: () => ({ showNotification: mockShowNotification }),
}))
vi.mock('./useRedux', () => ({
  useAppDispatch: () => vi.fn(),
  useAppSelector: (selector: any) => selector({ auth: { isAuthenticated: true, accessToken: 'token' } }),
}))
vi.mock('@/store/slices/notificationSlice', () => ({
  addNotification: vi.fn(),
}))

const mockShowNotification = vi.fn()

// Mock socket.io-client
const mockSocket = {
  on: vi.fn(),
  onAny: vi.fn(),
  disconnect: vi.fn(),
  emit: vi.fn(),
  connected: true,
}
vi.mock('socket.io-client', () => ({
  io: () => mockSocket,
}))

import { WebSocketProvider } from '../useWebSocket'

describe('useWebSocket reconnect toast debounce', () => {
  beforeEach(() => {
    vi.clearAllMocks()
    vi.useFakeTimers()
  })

  afterEach(() => {
    vi.useRealTimers()
  })

  it('does NOT show toast when reconnect happens within 5 seconds of disconnect', () => {
    // Simulate: disconnect then reconnect within 5s
    // Find the 'disconnect' and 'reconnect' handlers registered on the mock socket
    const handlers: Record<string, Function> = {}
    mockSocket.on.mockImplementation((event: string, cb: Function) => {
      handlers[event] = cb
    })

    const wrapper = ({ children }: any) => <WebSocketProvider>{children}</WebSocketProvider>
    renderHook(() => {}, { wrapper })

    act(() => {
      handlers['disconnect']?.('transport close')
      // Reconnect fires 2 seconds later (within 5s threshold)
      vi.advanceTimersByTime(2000)
      handlers['reconnect']?.(1)
    })

    expect(mockShowNotification).not.toHaveBeenCalledWith(
      'Real-time connection restored',
      'success',
    )
  })

  it('DOES show toast when reconnect happens after more than 5 seconds', () => {
    const handlers: Record<string, Function> = {}
    mockSocket.on.mockImplementation((event: string, cb: Function) => {
      handlers[event] = cb
    })

    const wrapper = ({ children }: any) => <WebSocketProvider>{children}</WebSocketProvider>
    renderHook(() => {}, { wrapper })

    act(() => {
      handlers['disconnect']?.('transport close')
      // Reconnect fires 6 seconds later (beyond 5s threshold)
      vi.advanceTimersByTime(6000)
      handlers['reconnect']?.(1)
    })

    expect(mockShowNotification).toHaveBeenCalledWith(
      'Real-time connection restored',
      'success',
    )
  })
})
```

- [ ] **Step 2: Run test to verify it fails**

```bash
cd frontend && npx vitest run src/hooks/__tests__/useWebSocket.reconnect.test.tsx
```

Expected: FAIL — toast fires unconditionally regardless of timing.

- [ ] **Step 3: Add disconnect timestamp ref and debounce logic**

Edit `frontend/src/hooks/useWebSocket.tsx`. After the existing refs (around line 35):

```typescript
  const socketRef = useRef<Socket | null>(null)
  const listenersRef = useRef<Map<string, Set<Function>>>(new Map())
  const disconnectTimeRef = useRef<number | null>(null)
```

Then update the `disconnect` handler (around line 71) to record the timestamp:

```typescript
      socket.on('disconnect', (reason) => {
        console.log('WebSocket disconnected:', reason)
        disconnectTimeRef.current = Date.now()
        setIsConnected(false)
        if (reason === 'io server disconnect') {
          socket.connect()
        }
      })
```

Then update the `reconnect` handler (around line 88) to check elapsed time:

```typescript
      socket.on('reconnect', (attemptNumber) => {
        console.log('WebSocket reconnected after', attemptNumber, 'attempts')
        setIsConnected(true)
        const downFor = disconnectTimeRef.current ? Date.now() - disconnectTimeRef.current : 0
        if (downFor > 5000) {
          showNotification('Real-time connection restored', 'success')
        }
        disconnectTimeRef.current = null
      })
```

- [ ] **Step 4: Run test to verify it passes**

```bash
cd frontend && npx vitest run src/hooks/__tests__/useWebSocket.reconnect.test.tsx
```

Expected: PASS — both cases pass.

- [ ] **Step 5: Run TypeScript check**

```bash
cd frontend && npm run type-check 2>&1 | tail -20
```

Expected: no errors.

- [ ] **Step 6: Commit**

```bash
git add frontend/src/hooks/useWebSocket.tsx frontend/src/hooks/__tests__/useWebSocket.reconnect.test.tsx
git commit -m "fix(websocket): debounce reconnect toast — only show if down >5s"
```

---

## Task 5: End-to-end verification in Docker

- [ ] **Step 1: Rebuild and restart affected containers**

```bash
docker compose build backend nginx && docker compose up -d backend nginx
```

Expected: both containers start healthy (`docker compose ps` shows `healthy`).

- [ ] **Step 2: Open browser devtools and confirm WebSocket upgrade**

Open the app at `http://localhost`. In devtools Network tab, filter to `WS`. Confirm:
- A connection to `/socket.io/` appears
- Status shows `101 Switching Protocols`
- The connection stays open (no `transport close` in console for 2+ minutes)

- [ ] **Step 3: Confirm no disconnect/reconnect cycle in console**

Wait 2 minutes on the dashboard. Expected: no `WebSocket disconnected: transport close` log entries.

- [ ] **Step 4: Simulate a backend restart and check toast behavior**

```bash
docker compose restart backend
```

Watch the browser. Expected:
- Console shows `WebSocket disconnected: transport close` then `WebSocket reconnected after N attempts`
- "Real-time connection restored" toast appears (backend takes >5s to restart and reconnect)

- [ ] **Step 5: Create PR closing issue #430**

```bash
gh pr create --title "fix(websocket): resolve transport close disconnections and debounce reconnect toast" --body "$(cat <<'EOF'
## Summary
- Add root namespace (`/`) WebSocket gateway with `pingTimeout: 60000` to match what the frontend actually connects to
- Disable NGINX keepalive connection recycling on the `/socket.io/` proxy path
- Debounce the "Real-time connection restored" toast — only shown if connection was down >5 seconds

## Test plan
- [ ] Backend test: `AppWebSocketGateway` instantiates correctly
- [ ] Frontend test: reconnect toast debounce — fires after >5s, silent for <5s
- [ ] Docker: WebSocket stays connected for 2+ minutes with no `transport close` in console
- [ ] Docker: backend restart triggers toast (down >5s); brief blip does not

Closes #430

🤖 Generated with [Claude Code](https://claude.com/claude-code)
EOF
)"
```

---

## Self-Review Notes

- **Spec coverage:** All three root causes addressed — heartbeat config (Task 1–2), NGINX keepalive (Task 3), toast debounce (Task 4). ✓
- **Namespace mismatch:** The spec calls out that the frontend connects to `/` not `dashboard`. Task 1 creates `AppWebSocketGateway` on `/`. ✓
- **No placeholders:** All code is complete. ✓
- **Type consistency:** `disconnectTimeRef` typed as `useRef<number | null>(null)` and accessed consistently. ✓
- **Out of scope preserved:** `DashboardWebSocketGateway` unchanged, dashboard stays REST-based. ✓
