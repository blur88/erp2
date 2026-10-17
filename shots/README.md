# Vendor payment history screenshots (#1401)

Captured in Chromium with the actual SupplierPaymentsTab component and app dark theme, using synthetic payment data in an isolated component harness. These are UI captures, not evidence of backend or migration execution.

- `before.png`: component from `37b958338^`, with only the live payment returned, matching the previous soft-delete filtering.
- `after.png`: component from `632bb2d7e16a50d6857ede59a90c28025f456026`, with the live payment and retained voided payment returned; shows the Status column and Completed/Voided chips.

Viewport: 1280 × 440 CSS pixels, device scale factor 2. The sample supplier heading identifies the harness. No database records were changed. Both images were visually inspected.
