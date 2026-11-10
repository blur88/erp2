# Accounting Removal and Rebuild — Historical

> **Historical record. This does not describe the current system.** Accounting is live: `AccountingModule` is registered in `backend/src/app.module.ts`, with journal entries and a chart of accounts. For current architecture see `AGENTS.md` and `app.module.ts`; for vocabulary see `GLOSSARY.md`.

## Removal (#884, July 2026)

The original accounting module was removed around 2026-07-09: `modules/accounting`, journal entries, the chart of accounts, the auto-post `AccountingService` calls from sibling services, the settings-level accounting mappings, and the search dependency on `JournalEntry`. For a short period the agent documentation described the system as having no accounting at all.

## Rebuild as v1 (#886, from July 2026)

Accounting was rebuilt as v1 from 2026-07-11 (first core backend merge: PR #889) around a leaf posting port: other modules post through `ACCOUNTING_POSTING_PORT` rather than calling accounting services directly. Later work built on it, including expenses (#942), owner equity as a separate module (#1022), provider settlements, and bank reconciliation (#1342).

## Why the old description lingered

`CLAUDE.md` kept the "accounting module was removed (#884) — no journal entries, no chart of accounts" paragraph and a hard-coded twelve-module list long after the rebuild, while other sections of the same file described live journal-line mechanics. #1425 replaced that file with a short brief that points at `app.module.ts` instead of listing modules, and moved this history here.

## Accounting report printing (#1214 → #1223)

The Profit & Loss, Balance Sheet and Form B reports once printed from inside `#root`, covered by a Playwright gate (`Accounting Reports - Print/PDF Gate`, #1214). #1223 removed that print path and the gate together. The current rules are in `docs/frontend/testing-and-print.md`.
