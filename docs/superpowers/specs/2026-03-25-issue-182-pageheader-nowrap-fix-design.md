# Design: Issue 182 — PageHeader Action Button Wrapping Fix

**Date:** 2026-03-25
**Issue:** #182
**File:** `frontend/src/components/common/PageHeader.tsx`

## Problem

Action buttons (Primary/Secondary) in `PageHeader` wrap below the title row on desktop viewports when titles are long or containers are narrow. Mobile stacking (via `breakpoints.down('sm')`) is correct and should not change.

## Root Cause

Two missing flex properties on the top row container and left block:

1. The top row container lacks `flexWrap: 'nowrap'` — without it, flex wraps naturally when content pressure exceeds the row width.
2. The left block (title/subtitle) has `minWidth: 0` but lacks `flex: '1 1 auto'` — it doesn't participate in flex growth, so it can passively crowd out the actions box instead of yielding space.

The actions box already has `flexShrink: 0`, which is correct.

## Fix

Two property additions in `PageHeader.tsx`:

### Change 1 — Top row container

Add `flexWrap: 'nowrap'` to the existing sx object on the outer flex row. This locks the title/actions to a single row on desktop.

### Change 2 — Left block

Add `flex: '1 1 auto'` alongside the existing `minWidth: 0` on the title/subtitle box. This designates the left side as the flexible region that absorbs available space and shrinks gracefully, rather than competing with the actions for width.

### No change to the actions box

`flexShrink: 0` is already present and correct — button clusters must never be compressed.

### Responsive behavior unchanged

The `breakpoints.down('sm')` rules (`flexDirection: 'column'`, `alignItems: 'flex-start'`, `alignSelf: 'flex-start'` on actions) remain untouched.

## Edge Case: Long unbroken title strings

`flexWrap: 'nowrap'` on the row prevents the row from wrapping, but text inside the left block can still wrap normally (the block is a block-level container). Long titles will wrap within the left column — this is correct. The `minWidth: 0` on the left block ensures text truncation or wrapping can occur without the block overflowing.

## Scope

- Single file: `frontend/src/components/common/PageHeader.tsx`
- Two lines changed (two property additions)
- No API changes, no migrations, no new components

## Manual QA Checklist

- Long-title page (e.g., a page with a lengthy title string)
- Page with both Primary and Secondary actions
- Page with only one action
- Report page with toolbar slot populated
- Mobile-width check (verify stacking still works)

## Testing

Existing `PageHeader` unit tests should pass without modification. No new test cases are required for this fix — the change is a layout constraint, not behavioral logic.
