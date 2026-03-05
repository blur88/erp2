# Design: @mui/x-date-pickers v8 + date-fns v4 Upgrade

**Date:** 2026-03-01

## Summary

Upgrade `@mui/x-date-pickers` from v7 to v8 and `date-fns` from v2 to v4.

## Key Findings

- `@mui/x-date-pickers@8.27.2` still supports `@mui/material@^7.x` — no MUI core upgrade required.
- `date-fns@4.x` is required to keep the `AdapterDateFns` import name in v8 (v2 would require renaming to `AdapterDateFnsV2`).
- `date-fns` function API (`format`, `formatDistanceToNow`, `startOfWeek`, etc.) is unchanged across v2/v3/v4.
- `chartjs-adapter-date-fns@3.0.0` supports `date-fns >= 2.0.0` — no change needed.
- Library is used in 1 file for provider setup (`src/main.tsx`) and 13 files for date formatting utilities.

## Breaking Changes (none affecting this codebase)

- date-fns v3/v4: ESM-first, flat package structure, internal TypeScript types changed.
- x-date-pickers v8: `AdapterDateFns` renamed to `AdapterDateFnsV2` for date-fns v2 users (not applicable here).
