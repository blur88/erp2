# Stock correction browser pass (#1406)

**Tested code commit:** `2e17a0176140d797ff10880cc442a50658d1b9b4`

Built `erp-backend:latest` and `erp-frontend:latest` from this commit with `VITE_BUILD_SHA=2e17a0176 docker compose build backend frontend`. Ran the browser pass in cached Playwright Chromium against an isolated QA stack at `http://localhost:13000`; the backend used disposable database `erp_browser_test` and Redis DB 15.

| Scenario | Result | Screenshot |
| --- | --- | --- |
| Receive a fresh PO, then return it to Ready without an intervening stock movement | Passed | [Received PO action bar](1406-purchase-received-action-bar.png) |
| Fulfill and unfulfill a fully batch-covered SO | Passed | [Fulfilled SO action bar](1406-sales-fulfilled-action-bar.png) |
| Refuse to return a received PO after its stock left in a later sale | Passed; refusal toast preserved the receipt and order state | [Return refusal](1406-return-refusal-toast.png) |
| Refuse a legacy fulfilled SO without recorded stock-cost evidence | Passed; legacy refusal toast shown | [Legacy unfulfill refusal](1406-unfulfill-refusal-toast.png) |
| Fulfill 8 units with 5 batch-covered and 3 unvalued | Passed; history showed `Unvalued stock gap: 3`, and unfulfill was refused | [Partial gap history](1406-partial-gap-history.png), [partial-gap refusal](1406-partial-gap-unfulfill-refusal.png) |
| Fulfill 8 units with no cost batches | Passed; history showed `Unvalued stock gap: 8`, and unfulfill was refused | [Wholly unbatched gap history](1406-wholly-unbatched-gap-history.png), [wholly unbatched refusal](1406-wholly-unbatched-gap-unfulfill-refusal.png) |
| Save a product edit loaded before a sale | Passed; the sale reduced stock from 5 to 4, and the subsequent notes edit preserved stock at 4 | [Stale edit after sale](1406-stale-product-edit-after-sale.png) |
| Update an existing product from a CSV row with blank `stockquantity` | Passed; the update completed and stock remained 6 | [CSV blank-stock update](1406-csv-blank-stock-update.png) |

Browser run: `1406-1792456428590`. Key documents were PO-26-006/PO-26-007 and SO-26-010 through SO-26-013. The run also exercised two additional products for stale-edit and CSV checks. Screenshots were visually inspected at 1440 × 1100 CSS pixels, device scale factor 1.

Cleanup completed after the run: the disposable `erp_browser_test` database was dropped, the `erp1406qa-backend` and `erp1406qa-frontend` containers were removed, and the `erp1406qa` network was removed. Redis DB 15 had zero keys. The existing application containers and production/dev database were not used for browser mutations.
