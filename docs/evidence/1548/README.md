# T1 storage error screenshot

The [screenshot](storage-unavailable.png) shows the actual application startup path with `IDBFactory.open` deliberately denied. The [raw browser output](storage-unavailable.json) records its URL, `isSecureContext` and visible alert. This verifies only the error display, not real-backend multi-tab coordination; the latter belongs to T3 (#1550). This is local development evidence, not production evidence.

The development server used `cd frontend && npm run dev -- --host 0.0.0.0 --port 5174`. Playwright 1.64.1 was available outside the repository; its Chromium was installed with `node /home/blur/.npm/_npx/e41f203b7505f1fb/node_modules/playwright/cli.js install chromium`.

Capture command:

```bash
PLAYWRIGHT_PACKAGE=/home/blur/.npm/_npx/e41f203b7505f1fb/node_modules/playwright \
SESSION_TEST_URL=http://10.1.1.34:5174/login \
SESSION_SCREENSHOT_PATH=/tmp/1548-storage-unavailable-rerun.png \
node docs/evidence/1548/capture-storage-error.cjs
```

`PLAYWRIGHT_PACKAGE` may instead point at another installed Playwright package. The helper deliberately denies browser storage before the application loads, waits for the required alert, captures it and reports the browser observations.
