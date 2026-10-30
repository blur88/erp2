# Session coordination

[Issue #1548](https://github.com/blur88/erp2/issues/1548) introduces the shared Session record. The overall design is [spec #1546](https://github.com/blur88/erp2/issues/1546); the [decision record](https://github.com/blur88/erp2/issues/1345#issuecomment-6505446834) governs it. This document owns the accepted limits for that design.

## Current implementation

The [coordinator](../../frontend/src/services/session/coordinator.ts) opens one shared IndexedDB record. Each sign-in gives it a new id from `crypto.getRandomValues`. Redux auth is an in-memory view. Startup deletes `persist:erp-app` without reading or migrating it, requiring an upgrade sign-in. Remaining notification persistence uses a separate key until T2 removes it.

Every request through the Axios transport re-reads the shared record before attaching credentials. A tab that missed a change therefore cannot use its old token on its next request. A refresh saves only while both the Session id and the refresh token tried still match. Sign-out deletes only the matching Session; refresh-failure deletion also matches the token tried. Single-field writes occur inside one readwrite transaction and leave other fields untouched. Activity updates keep the later timestamp.

Failure to open storage at startup or sign-in reports “This browser's storage is unavailable” and establishes no Session. A required runtime read or write failure rejects the operation. There is no in-memory storage fallback or automatic reopening after a runtime failure.

T1 provides an injectable channel and clock, subscriptions and disposal. It does not install live channel or resume listeners, nor does it poll. [T2 (#1549)](https://github.com/blur88/erp2/issues/1549) adds propagation, resume handling, user-switch cleanup and removal of notification persistence. Refresh locking, shared idle handling and Session-tagged drafts follow in later tickets under #1345.

## Accepted limits

- **Delivered messages.** The design's one-second sign-out bound applies to a running tab after BroadcastChannel delivery. A missed message may leave stale content visible until reconciliation. Requests always check shared storage. Live delivery is not yet implemented in T1.
- **Lost refresh responses and paused holders.** The planned lock/recovery protocol accepts Session loss if the server rotates a refresh token and its response is lost or delayed beyond recovery. Its nominal window is 45 seconds, not a precise frozen-tab cutoff; request duration and browser scheduling can extend it. T1 does not yet serialize refreshes between tabs.
- **Mixed versions during rollout.** Old tabs do not participate in coordination. Until reloaded, they can produce refresh conflicts or inconsistent sign-out. Disruption is not limited to one sign-out.
- **Notifications.** The target behavior is per-tab history lost on reload. T1 still persists notifications separately; T2 removes persistence. The upgrade removes the old combined auth/notification record without migration.
- **Browser verification.** Unit tests use `fake-indexeddb` and do not prove browser suspension or storage durability. The earlier spike used Chromium over HTTP at a LAN IP; it did not run the application. The real application's LAN HTTP browser run belongs to [T3 (#1550)](https://github.com/blur88/erp2/issues/1550). No production host exists and these are not production results.

## Verification

[Coordinator tests](../../frontend/src/services/session/__tests__/coordinator.test.ts) use several instances sharing one `fake-indexeddb` database. [Transport tests](../../frontend/src/services/__tests__/apiSessionExit.test.ts) exercise the Axios request adapter. [Sign-out tests](../../frontend/src/services/auth/__tests__/signOut.test.ts) check shared deletion and local clearing before best-effort backend logout.
