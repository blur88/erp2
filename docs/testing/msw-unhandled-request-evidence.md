# MSW unhandled-request gate evidence (#1538)

Local development test evidence, captured 2026-10-30. No production claims.

## Mutation probe

Temporary file `src/mocks/__tests__/unhandledPositiveControl.test.ts`:

```ts
import { it } from 'vitest'
it('positive control: absorbed unmocked requests must fail', async () => {
  await fetch('http://localhost:3001/__gate_positive_control__').catch(() => undefined)
})
```

Before the gate, `cd frontend && npx vitest run src/mocks/__tests__/unhandledPositiveControl.test.ts` exited 0:

```text
 v5.0.3 /home/blur/erp2/frontend


 Test Files  1 passed (1)
      Tests  1 passed (1)
   Start at  03:06:14
   Duration  905ms (setup 45%, transform 27%, tests 22%, worker 4%, import 1%)

```

With the gate, `cd frontend && npx vitest run src/mocks/__tests__/unhandledRequests.test.ts src/mocks/__tests__/unhandledPositiveControl.test.ts` exited 1. The intentional tests passed and the absorbed request failed:

```text
 v5.0.3 /home/blur/erp2/frontend

stderr | src/mocks/__tests__/unhandledPositiveControl.test.ts > positive control: absorbed unmocked requests must fail
[MSW] Error: intercepted a request without a matching request handler:

  • GET http://localhost:3001/__gate_positive_control__

If you still wish to intercept this unhandled request, please create a request handler for it.
Read more: https://mswjs.io/docs/http/intercepting-requests

 ❯ |node| src/mocks/__tests__/unhandledPositiveControl.test.ts (1 test | 1 failed) 2263ms
   × positive control: absorbed unmocked requests must fail 1932ms

⎯⎯⎯⎯⎯⎯⎯ Failed Tests 1 ⎯⎯⎯⎯⎯⎯⎯

 FAIL  |node| src/mocks/__tests__/unhandledPositiveControl.test.ts > positive control: absorbed unmocked requests must fail
Error: Unhandled MSW requests:
GET http://localhost:3001/__gate_positive_control__
 ❯ reportUnhandledRequests src/mocks/unhandledRequests.ts:16:11
     14|   const pending = consumeUnhandledRequests()
     15|   if (pending.length) {
     16|     throw new Error(`Unhandled MSW requests:\n${pending.join('\n')}`)
       |           ^
     17|   }
     18| }

⎯⎯⎯⎯⎯⎯⎯⎯⎯⎯⎯⎯⎯⎯⎯⎯⎯⎯⎯⎯⎯⎯⎯⎯[1/1]⎯


 Test Files  1 failed | 1 passed (2)
      Tests  1 failed | 2 passed (3)
   Start at  03:08:40
   Duration  12.16s (setup 43%, transform 21%, tests 20%, import 15%, worker 1%)

```

The permanent regression harness uses fixture files excluded from normal discovery, then runs them in a child Vitest process. It asserts test failure and both methods/URLs, plus the afterAll diagnostic following failed beforeAll setup (no afterEach). Intentional axios/fetch tests consume and assert their own exact recorded entries.

`cd frontend && npx vitest run src/test/__tests__/mswUnhandledGate.test.ts` passed (1 test). In a private scratch copy, removing only `afterEach(reportUnhandledRequests)` made that same command exit 1; removing only `afterAll(reportUnhandledRequests)` also made it exit 1. Both mutations were restored. No mutation changed the live worktree.

## Implementation adjustment

Installed MSW 3.0.1 `src/core/experimental/on-unhandled-frame.ts` documents that callback `defaults.error()` only prints. An ordinary thrown Error produces a synthetic 500 instead of network rejection. The implementation therefore records via `request:unhandled` and retains `onUnhandledFrame: 'error'`. The unchanged rejection assertions in the intentional tests verify no response reaches axios/fetch. The scope adjustment is recorded on issue #1538.

The optional lint guard is omitted.

## Inventory

Full inventory run is pending; the positive control remains present for that run.
