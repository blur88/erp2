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

**What it does NOT do: balance-sheet group membership.** The migration creates
no `balance_sheet_account_groups` rows. `1200` keeps its `N38`/`BANK_BALANCE`
role because its id is preserved, but `1210`–`1240` are created in **no group**.
Per #1239 an account that contributes to **no LHDN line** — neither via a group
nor as a settings key's target — produces an unmapped finding and **Balance
Check Unavailable** when it carries a non-zero balance. `1210`–`1240` are
neither, so after a fresh migration they need group membership assigned at
**`/accounting/settings`** → Balance Sheet groups before they carry balances.
On `erp_db` the membership already exists because an operator created it by
hand.

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

**Adoption blockers** — if any of these fails, do NOT adopt. Each one means the
accounts are not the ones this migration is about, so adopting would misroute
real money or misreport it:

- Each of `1200`–`1240` is exactly one **live** account with the expected name
  and `isPostable = true`, and query 2 returns nothing.
- Every payment method in use maps to its intended account.
- Each account's balance-sheet group membership is the intended one.
- `bankAccountId` → `1200` and `cashAccountId` → `1100`.

**Repairable divergences** — these do NOT block adoption. They make the
database differ from a freshly migrated one without affecting posting, and the
next section says what to do about each:

- `isSystem` is `false` on `1210`–`1240` (the migration sets `true`).
- Payment methods `CIMB` / `MAYBANK` do not exist by **code** (only by name, on
  differently-coded rows).
- `sortOrder` values differ from the seeded set.

The split matters: `isSystem` and a method's code have no bearing on which
account a payment posts to — mappings resolve by account **id**. Treating them
as blockers would stop an adoption that is otherwise correct and safe.

## Adoption does not converge with a migrated database

A hand-built chart can satisfy every *accounting* check above while still
differing from what the migration produces, because **mappings resolve by
account id, not by payment-method code**. Posting works correctly; the seed
gate does not.

**Derive the divergence from `verify-seeds.sh`, never from a snapshot.** That
script's `payment methods` check (`verify-seeds.sh:153`) is the authority on
what a migrated database contains. Comparing against a remembered diff is how
an earlier revision of this document shipped a "convergence" transaction that
did not converge. Run the comparison:

```bash
# What a migrated database has, per the gate:
sed -n 153p backend/scripts/verify-seeds.sh

# What this database has, same format:
pq "SELECT string_agg(code||'|'||name||'|'||\"sortOrder\"||'|'||
           \"useForPurchases\"||'|'||\"accountingChannel\", ';' ORDER BY code)
      FROM payment_methods WHERE \"deletedAt\" IS NULL;"
```

A migrated database has **nine** payment methods: the seven from
`InitialSchema:213-222` (`CASH`, `BANK`, `TNG`, `CC`, `ATOME`, `SHOPEE`,
`TIKTOK`) plus `CIMB` and `MAYBANK` from this migration.

### `erp_db` cannot be converged by a transaction, and should not be

Observed 2026-09-18 (a snapshot — re-run the comparison above; this drifts):

```
ATOME|Atome|5   BANK|CIMB|2   BANK2|Maybank|3   CASH|Cash|1
SHOPEE|Shopee|4 TIKTOK|TikTok|6
```

Only **six** methods, and `BANK` has been repurposed: its code is the seeded
`Bank Transfer` row, but it now carries the name "CIMB". `TNG` and `CC` are
gone. `SHOPEE` and `TIKTOK` sort orders differ. Accounts `1210`–`1240` have
`isSystem = false`.

**Do not try to rename `BANK` → `CIMB`.** That consumes the seeded row, so the
database ends up *also* missing `BANK`/`Bank Transfer` — further from the gate
than before, and `down()` throws, so the only unwind is a backup restore.
Re-creating `TNG` and `CC` is equally wrong: an operator removed them
deliberately, and this document is not the place to overrule that.

For a database this far from seed, the supported path is to **adopt without
converging** and record the decision:

- Repair only what is safe and id-preserving:

  ```bash
  pq "UPDATE chart_of_account SET \"isSystem\" = true
        WHERE code IN ('1210','1220','1230','1240');"
  ```

  This changes **no behaviour today**: `isSystem` is read in exactly one place
  (`accounting-seeder.service.ts:220` `validateHierarchy`), which only covers
  `STANDARD_COA_CHILDREN` — and `1210`–`1240` are deliberately not in that
  constant. `chart-of-account.service.ts` has no `isSystem` guard and no delete
  method at all, so the column protects nothing at present. The UPDATE is worth
  running anyway for forward-compatibility: it aligns these rows with what the
  migration produces, so a future guard, or a future `standard-coa.ts` entry,
  does not suddenly fail on them. It does not affect posting, mappings or
  history.

- Accept that `verify-seeds.sh` will fail on this database, permanently, on its
  `payment methods` and `payment method mappings` checks. **Record that in the
  deployment notes**, with the output of the comparison above, so a future
  reader can distinguish it from a real regression.

`verify-seeds.sh` describes a *freshly seeded* database. A long-lived database
whose payment methods were curated by hand is not one, and forcing it to look
like one destroys operator intent.

**→ This branch is done. Skip the next section entirely — it does not apply to
you — and go to *Both paths end here: record the migration as applied*.**

### Alternative: if your database is close to seed (`erp_db` is NOT)

**Do not run anything in this section on a database like `erp_db`.** It applies
only where the comparison above shows **all nine** methods present and the only
difference is that two of them carry the `CIMB`/`MAYBANK` *names* under
different `code` values. On `erp_db` the rename below would consume the seeded
`Bank Transfer` row — the failure described at the top of the previous section.

Where that precondition does hold — all nine methods present, the `CIMB`/
`MAYBANK` rows differing only in their `code` — a rename is safe and
id-preserving. The recipe changes `code` and `sortOrder`; it does not touch
`name`. Check for collisions first, **including soft-deleted rows**,
since the unique index on `code` has no partial predicate:

```bash
pq "SELECT code||'|'||name||'|deleted='||(\"deletedAt\" IS NOT NULL)
      FROM payment_methods WHERE code IN ('CIMB','MAYBANK');"
```

Proceed only if that returns nothing. Statements in a single `pq` call are sent
as one implicit transaction and abort together on error — **do not split them
into separate `pq` calls**, which would lose atomicity and could leave a
half-renamed method set:

```bash
pq "UPDATE payment_methods SET code='CIMB',    \"sortOrder\"=8 WHERE code='<old-cimb-code>';
    UPDATE payment_methods SET code='MAYBANK', \"sortOrder\"=9 WHERE code='<old-maybank-code>';
    UPDATE chart_of_account SET \"isSystem\"=true WHERE code IN ('1210','1220','1230','1240');"
```

Then re-run the comparison and confirm the strings match.

**→ Now go to *Both paths end here: record the migration as applied*.**

## Both paths end here: record the migration as applied

Whichever branch you took — adopt-without-converging, or the close-to-seed
rename — this step is **mandatory**. Without it the migration is still pending,
so every subsequent deploy re-runs it, it aborts again on the same conflict, and
nothing you did above takes effect on the chain.

Record it in one transaction, so the chain does not try to run it again:

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
