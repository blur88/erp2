# Unhandled MSW request inventory (#1522)

Discovery ran `cd frontend && npx vitest run`: 265 files and 2977 tests passed. The temporary discovery callback appended method, URL, current test name and test path directly with `appendFileSync` to a JSONL file. It used MSW 3's `onUnhandledFrame({ frame })` callback and read `frame.data.request`. The deliberate `inventory positive control` GET is the first entry in `discovery.jsonl`; it was confirmed before the full run. Earlier callbacks using `onUnhandledRequest` were ignored and their empty results were discarded.

The remaining 18 entries identify four affected files:

| File | Requests | Repair |
| --- | --- | --- |
| CreateProductPage.typechange.test.tsx | 3 default-currency and 3 duplicate-name checks | Mock currency and duplicate-check hooks, matching the existing product-page test |
| ProductsPage.test.tsx | 6 category queries | Mock categories query |
| ProductViewPage.test.tsx | 4 regional-settings queries and 1 stock-movements query | Mock settings and movements queries |
| CategoryViewPage.test.tsx | 1 regional-settings query | Mock settings query |

Existing assertions and complete application-store stubs remain in place. No application request is intentionally passed through. The isolation probe deliberately makes unhandled requests and expects rejection.

MSW 3.0.1 renamed the listen option to `onUnhandledFrame`; using `onUnhandledRequest: 'error'` would leave the warning default active. See the scope correction on issue #1522.

`node docs/evidence/1522/isolation-probe.mjs` was run with Compose running, then after `docker compose stop`; both results are preserved. It asserts MSW's rejection cause for a real local HTTP listener and the backend URL, and asserts the listener received zero requests. Compose was subsequently started again. These are local development results.
