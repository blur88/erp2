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
| Journal lines on them | 11 / 11 / 2 / 2 / 3 — **29 posted lines** (snapshot; re-run the query, this drifts) |
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

**Verify first** (read-only; run per environment, from the directory holding
that environment's compose files).

`$POSTGRES_USER` / `$POSTGRES_DB` are set **inside** the postgres container
(`docker-compose.yml:8-9`) and are normally *not* exported in your host shell.
Running `psql -U "$POSTGRES_USER"` directly therefore fails with
`FATAL: role "root" does not exist`. Wrap the call in `sh -c` so the variables
resolve container-side:

```bash
pq() { docker compose exec -T postgres sh -c \
  'psql -U "$POSTGRES_USER" -d "$POSTGRES_DB" -tAc "$0"' "$1"; }

# 1. Accounts: exactly one live row per code, with the expected name and shape.
pq "SELECT code||'|'||name||'|isSystem='||\"isSystem\"||'|isPostable='||\"isPostable\"
      FROM chart_of_account
     WHERE code IN ('1200','1210','1220','1230','1240')
       AND \"deletedAt\" IS NULL ORDER BY code;"

# 2. Soft-deleted duplicates at those codes (must return nothing).
pq "SELECT code||'|'||name FROM chart_of_account
     WHERE code IN ('1200','1210','1220','1230','1240')
       AND \"deletedAt\" IS NOT NULL ORDER BY code;"

# 3. Mappings.
pq "SELECT pm.code||' -> '||a.code
      FROM payment_method_account_mappings m
      JOIN payment_methods pm ON pm.id = m.\"paymentMethodId\"
      JOIN chart_of_account a ON a.id = m.\"accountId\" ORDER BY pm.code;"

# 4. Balance-sheet group membership.
pq "SELECT a.code||' -> '||g.\"groupLine\"
      FROM balance_sheet_account_groups g
      JOIN chart_of_account a ON a.id = g.\"accountId\" ORDER BY a.code;"

# 5. Settings wiring — bankAccountId is the fallback for every unmapped
#    BANK-channel method, so a wrong value silently misroutes payments.
pq "SELECT 'bank='||(SELECT code FROM chart_of_account WHERE id = s.\"bankAccountId\")
         ||' cash='||(SELECT code FROM chart_of_account WHERE id = s.\"cashAccountId\")
      FROM accounting_settings s;"
```

Adopt only if **all** of these hold:

- Each of `1200`–`1240` is exactly one **live** account with the expected name,
  `isPostable = true` and `isSystem = true`, and query 2 returns nothing.
- Every payment method in use maps to its intended account.
- Each account's balance-sheet group membership is the intended one.
- `bankAccountId` → `1200` and `cashAccountId` → `1100`.
- Payment methods `CIMB` and `MAYBANK` exist **by code**, not merely by name.

## Adoption does not by itself converge with a migrated database

A hand-built chart can satisfy the accounting checks above while still differing
from what the migration produces, because **mappings resolve by account id, not
by payment-method code**. Posting therefore works correctly, but the seed gate
does not.

Observed on `erp_db` (2026-09-18) — every accounting check above passes, yet:

| | Migration produces | `erp_db` has |
|---|---|---|
| Method codes | `CIMB`, `MAYBANK` | `BANK` (named "CIMB"), `BANK2` (named "Maybank") |
| `isSystem` on `1210`–`1240` | `true` | **`false`** |
| `sortOrder` | CIMB 8, MAYBANK 9, SHOPEE 6, TIKTOK 7 | BANK 2, BANK2 3, SHOPEE 4, TIKTOK 6 |

Consequences if adopted as-is:

- **`verify-seeds.sh` fails.** Its `payment method mappings` check expects
  `CIMB>1200;MAYBANK>1210` and would see `BANK>1200;BANK2>1210`; the
  `payment methods` check fails harder.
- **`isSystem = false` leaves the accounts operator-deletable/renameable**,
  where the migration marks them protected.

Converge before recording the migration as applied (ids are preserved, so the
existing mappings, journal history and group memberships all survive):

```bash
pq "BEGIN;
    UPDATE payment_methods SET code='CIMB',    \"sortOrder\"=8 WHERE code='BANK';
    UPDATE payment_methods SET code='MAYBANK', \"sortOrder\"=9 WHERE code='BANK2';
    UPDATE chart_of_account SET \"isSystem\"=true
      WHERE code IN ('1210','1220','1230','1240');
    COMMIT;"
```

Check for a code collision first — renaming `BANK`→`CIMB` fails if a `CIMB`
method already exists, since `payment_methods.code` is unique. If your
environment's method codes differ from this table, adapt rather than copy.

If you deliberately choose **not** to converge, record that decision: the
database will permanently fail `verify-seeds.sh`, and a future reader must be
able to tell that from an actual regression.

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
