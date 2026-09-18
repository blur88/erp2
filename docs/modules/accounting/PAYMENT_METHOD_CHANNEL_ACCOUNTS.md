# Payment-method channel accounts — rollout and reconciliation

Covers migration `1789658118888-AddPaymentMethodChannelAccounts` (issue #1243).

## What the migration does

1. Renames COA `1200 Bank` → `CIMB`, **preserving the row id**, so journal
   history, `settings.bankAccountId` and the `N38`/`BANK_BALANCE` group role
   carry over. CIMB remains the fallback for unmapped BANK-channel methods.
2. Adds `1210 Maybank`, `1220 Shopee`, `1230 TikTok`, `1240 Atome` as postable
   Asset children of `1000`.
3. Adds the `CIMB` and `MAYBANK` payment methods.
4. Inserts six mappings **only where the method has no mapping**:
   `Cash→1100`, `CIMB→1200`, `Maybank→1210`, `Shopee→1220`, `TikTok→1230`,
   `Atome→1240`.

All four steps run in the migration runner's own transaction
(`migrationsTransactionMode: 'each'`), so any failure rolls back every earlier
step, the `1200` rename included, and leaves no `migrations` row.

## It is EXPECTED to abort on a hand-built database

**The dev database `erp_db` already fails this migration**, and any environment
where an operator built this chart by hand will too. That is the designed
outcome, not a defect.

Observed on `erp_db` (2026-09-18, migration not applied):

| Fact | Value |
|---|---|
| Accounts present | `1200 CIMB`, `1210 Maybank`, `1220 Shopee`, `1230 TikTok`, `1240 Atome` |
| Journal lines on them | 11 / 11 / 2 / 2 / 3 — **29 posted lines** |
| Balance-sheet groups | `1200`,`1210` → `BANK_BALANCE`; `1220`,`1230`,`1240` → `OTHER_CURRENT_ASSETS` |
| Mappings | already correct, via hand-made methods `BANK`→1200 and `BANK2`→1210 |

The migration aborts at the A2 conflict scan with
`account 1210 already exists (name: "Maybank")`.

## Do NOT "rename or remove it and re-run"

Both destroy data or reporting:

- **Remove** is usually impossible. `journal_entry_line.accountId` is
  `ON DELETE NO ACTION` (`InitialSchema:164`), so a posted account cannot be
  deleted at all.
- **Rename** appears to work and is worse. The migration then creates a *fresh*
  account at that code with a **new id**. Journal lines and
  `balance_sheet_account_groups` rows are keyed by account **id**, not code, so
  they stay on the renamed-away account. The new account belongs to no group,
  and per #1239 a non-zero balance outside every group produces an unmapped
  finding and **Balance Check Unavailable**.

## Reconciliation: adopt the existing accounts

When the existing accounts already *are* the intended ones — same codes, same
names, correct group membership, correct mappings — the correct action is to
adopt them and record the migration as applied. Nothing needs to be created.

**Verify first** (read-only; run per environment):

```bash
docker compose exec -T postgres psql -U "$POSTGRES_USER" -d "$POSTGRES_DB" -tAc "
SELECT code||'|'||name FROM chart_of_account
 WHERE code IN ('1200','1210','1220','1230','1240') ORDER BY code;"

docker compose exec -T postgres psql -U "$POSTGRES_USER" -d "$POSTGRES_DB" -tAc "
SELECT pm.code||' -> '||a.code
  FROM payment_method_account_mappings m
  JOIN payment_methods pm ON pm.id = m.\"paymentMethodId\"
  JOIN chart_of_account a ON a.id = m.\"accountId\" ORDER BY pm.code;"

docker compose exec -T postgres psql -U "$POSTGRES_USER" -d "$POSTGRES_DB" -tAc "
SELECT a.code||' -> '||g.\"groupLine\"
  FROM balance_sheet_account_groups g
  JOIN chart_of_account a ON a.id = g.\"accountId\" ORDER BY a.code;"
```

Adopt only if **all** of these hold:

- Each of `1200`–`1240` is exactly one live account with the expected name.
- Every payment method in use maps to its intended account.
- Each account's balance-sheet group membership is the intended one.

Then record the migration as applied, in one transaction, so the chain does not
try to run it again:

```sql
BEGIN;
INSERT INTO migrations (timestamp, name)
VALUES (1789658118888, 'AddPaymentMethodChannelAccounts1789658118888');
COMMIT;
```

Take a database backup before this. Marking a migration applied is itself
irreversible in practice, because `down()` throws (below).

**If the accounts differ from the intended structure**, do not adopt. Decide
per account whether to remap the payment method to the existing account
(preferred — keeps history and group membership) or to introduce a new account
at a different code and migrate balances deliberately. There is no automated
path for that case, by design.

## `down()` is irreversible

`down()` throws. `up()` is conditional at every step, so nothing records
whether the migration or an operator created a given account, method or
mapping, and deleting on shape alone would destroy operator data — an operator
who mapped Maybank by hand before the migration produces a row identical to
what step 4 would have inserted, and step 4 skipped it.

Unwind by restoring a pre-migration backup. Same resolution, and for the same
reason, as `1786862759868-AddOwnerEquity.ts:103`.

## Known consequence of the rename

Because the `1200` rename preserves the row id, **existing journal history
posted to the generic "Bank" account now displays as "CIMB"** in every report.
This was accepted deliberately as the cost of keeping the id, its history, its
`bankAccountId` wiring and its `N38` group role intact.

## Gate

`backend/scripts/verify-payment-method-migration.sh` covers six scenarios on a
disposable database: fresh install, conflicting-account abort, transactional
rollback after real writes, existing-mapping preservation, repurposed `1200`
abort and soft-deleted `1200` abort. It needs `backend/.env.local` (or the
`DB_*` environment) and is not part of CI.
