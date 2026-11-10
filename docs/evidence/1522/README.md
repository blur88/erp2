# Unhandled MSW request inventory (#1522)

Discovery ran `cd frontend && npx vitest run`: 265 files and 2977 tests passed. The temporary discovery callback appended method, URL, current test name and test path directly with `appendFileSync` to a JSONL file. It used MSW 3's `onUnhandledFrame({ frame })` callback and read `frame.data.request`. The deliberate `inventory positive control` GET is the first entry in `discovery.jsonl`; the pre-run confirmation was observed but not preserved. The preserved positive-control evidence is line 1 of `discovery.jsonl` from the full run. Earlier callbacks using `onUnhandledRequest` were ignored and their empty results were discarded, as recorded in the [scope-correction comment](https://github.com/blur88/erp2/issues/1522#issuecomment-6500518346).

The remaining 18 entries identify four affected files:

| File | Requests | Repair |
| --- | --- | --- |
| CreateProductPage.typechange.test.tsx | 3 default-currency and 3 duplicate-name checks | Mock currency and duplicate-check hooks, matching the existing product-page test |
| ProductsPage.test.tsx | 6 category queries | Mock categories query |
| ProductViewPage.test.tsx | 4 regional-settings queries and 1 stock-movements query | Mock settings and movements queries |
| CategoryViewPage.test.tsx | 1 regional-settings query | Mock settings query |

Existing assertions and complete application-store stubs remain in place. No application request is intentionally passed through. The isolation probe deliberately makes unhandled requests and expects rejection.

MSW 3.0.1 renamed the listen option to `onUnhandledFrame`; using `onUnhandledRequest: 'error'` would leave the warning default active. See the scope correction on issue #1522.

`cd frontend && npx vitest run src/mocks/__tests__/unhandledRequests.test.ts` runs through the configured shared setup files, including `frontend/src/setupTests.ts`. It sends unhandled Axios GET and fetch requests to `http://localhost:3001/...`, asserting MSW-specific rejection instead of a backend response; Axios also explicitly asserts no response. There is no separate server or policy inside the test.

The test was run with Compose running and after `docker compose stop`. `stack-running.txt` and `stack-stopped.txt` preserve `docker compose ps` immediately alongside each test output. After `docker compose start`, `stack-restored.txt` records the restored services. These are local development results.
