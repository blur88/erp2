# Stock correction browser pass (#1406)

**Tested code commit:** `bd0be7208a444369ee15cf94f5e6d05effd3f332`

Built and started the backend and frontend with `docker compose build backend frontend && docker compose up -d backend frontend`, then exercised fresh, paid purchase and sales orders end to end in Chromium against `http://localhost:3000`.

| Scenario | Result | Screenshot |
| --- | --- | --- |
| Receive a fresh PO; confirm the Return action is available; return it to Ready | Passed | [Purchase action bar](1406-purchase-received-action-bar.png) |
| Fulfil a fresh SO; confirm the Unfulfill action is available; unfulfil it to Ready | Passed | [Sales action bar](1406-sales-fulfilled-action-bar.png) |
| Refuse PO return after later stock movement | Passed; server refusal message shown in the UI | [Return refusal](1406-return-refusal-toast.png) |
| Refuse unfulfill for a legacy fulfilled order without recorded stock costs | Passed; server refusal message shown in the UI | [Unfulfill refusal](1406-unfulfill-refusal-toast.png) |

Browser run `1406-1792350617147` created PO-26-018, PO-26-019, SO-26-022 and SO-26-023. The test product, category, customer, supplier, orders, payments, movements, occurrences, batches and associated journal rows were removed afterward; a database query confirmed zero remaining test products, categories, customers, suppliers or orders.

The return refusal explained that stock had left after receipt and that records cannot prove the returned goods were untouched. The legacy unfulfill refusal explained that stock costs were not recorded batch by batch and could not be restored exactly.
