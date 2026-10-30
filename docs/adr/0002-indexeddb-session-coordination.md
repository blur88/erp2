---
status: accepted
---

# IndexedDB Session storage and refresh locking

## Decision

Use one IndexedDB Session record, a separate IndexedDB refresh-lock record and BroadcastChannel change notifications. IndexedDB is authoritative; a message only tells a tab to read it again. Redux holds each tab's in-memory view. The coordinator owns storage transactions and concurrency rules, with injectable storage, channel and clock and an explicit dispose operation.

This is the decision in [#1345 Q7–Q9, Q17 and Q21](https://github.com/blur88/erp2/issues/1345#issuecomment-6505446834), implemented incrementally from [T1 (#1548)](https://github.com/blur88/erp2/issues/1548). T1 adds the Session record, request reconciliation, matched deletion and writes. The refresh lock and live BroadcastChannel adapters belong to subsequent tickets; this ADR records their design, not completed implementation.

Plain HTTP on a LAN address is a supported deployment requirement. Browser API availability was validated locally over a LAN IP in the [2026-10-05 spike](https://github.com/blur88/erp2/issues/1345#issuecomment-5989812220), not in production. That spike reported IndexedDB, BroadcastChannel and `crypto.getRandomValues` available while Web Locks, `crypto.randomUUID` and `crypto.subtle` were absent. The coordinator uses `crypto.getRandomValues` for Session ids.

## Evidence and alternatives

The spike comment reports four tabs making 300 increments each (1,200 expected): `localStorage` lost 376 updates without a guard and 195 under a SharedWorker mutex; IndexedDB lost zero. It explicitly says the cause of the losses was not isolated, and the real application was not verified. These are the spike author's reported measurements; raw run output is not preserved in this repository, so they are not independently verified run evidence here.

Web Locks require a secure context and do not meet the LAN HTTP requirement. A SharedWorker was considered in the spike, but the accepted decision uses IndexedDB transactions and no worker. The shared record and read/modify/write transaction occupy the same storage system; no cross-store atomicity is assumed.

## Consequences

Every authenticated request must finish a required shared read before attaching credentials. Refresh saves match both the Session id and the token tried, while Sign out matches the Session id (and token tried for refresh failures). Activity writes update only their field and preserve later activity. Storage failure stops the required operation rather than falling back to memory.

The later refresh lock uses compare-and-swap inside a readwrite transaction; holder id and granted expiry together identify ownership. BroadcastChannel cannot replace transactional comparisons. The design and its trade-offs, rollout constraints and verification status are owned by [Session coordination](../frontend/session-coordination.md#accepted-limits), rather than repeated here.
