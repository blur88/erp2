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
| Journal lines on them | 11 / 11 / 2 / 2 / 3 — **29 posted lines** (snapshot; drifts — query 6 below re-runs it) |
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

# 6. Journal lines per account — re-runs the snapshot in the table above.
pq "SELECT a.code||'|lines='||count(l.id)
      FROM chart_of_account a
      LEFT JOIN journal_entry_line l ON l.\"accountId\" = a.id
     WHERE a.code IN ('1200','1210','1220','1230','1240')
     GROUP BY a.code ORDER BY a.code;"
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
- `sortOrder` values differ from the seeded set. (Display ordering only; it is
  not repaired, and is one of the permanent `verify-seeds.sh` divergences
  below.)

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

- Accept that `verify-seeds.sh` will fail on this database, permanently, and
  **capture the failing set as a file** so later drift is a diff rather than a
  recollection. See *Pinning the expected-failure set* below.

**Do not run `verify-seeds.sh` against a live database expecting a pass.** It
was written for `erp_gate_candidate` — a database `verify-baseline.sh` builds
fresh from migrations and never boots — so several of its checks cannot pass on
any database that has been used, adopted or not. Verified by running it against
an adopted clone of `erp_db` (2026-09-18): **seven** of its **13** checks fail,
in two distinct classes.

**Run it only AFTER the `migrations` INSERT below, and pass `CAND_DB`:**

```bash
(cd backend && CAND_DB=erp_db DB_USERNAME=erp_user bash scripts/verify-seeds.sh)
```

**Run it from `backend/`.** The script resolves `../docker-compose.yml`
(`verify-seeds.sh:25,34`) and `.env.local` relative to the working directory, so
from the repo root it looks for a compose file one level above the repo and
aborts with `cannot query PostgreSQL to check whether 'erp_db' exists` — a
message that looks like a database problem but is a working-directory one.

`CAND_DB` defaults to `erp_gate_candidate` (`verify-seeds.sh:21`), so without it
you are checking the wrong database entirely. And **before** the INSERT the
script's preflight aborts with `exit 2` before running a single content check:

```
PREREQUISITE NOT MET: database 'erp_db' is stale — expected 18 migrations,
candidate has 17.
```

That is this migration not yet being recorded — not a fault, and not something
`verify-baseline.sh` will fix despite what the message suggests. None of the
seven failures below is observable until the INSERT has been made.

*Unrelated to this migration.* Measured by running the same gate against a
**freshly migrated and booted** database, where exactly **one** check fails — so
anything beyond that is caused by the database's own history, not by adoption:

| Check | Fails on | Why |
|---|---|---|
| `users (no default admin)` | **any booted database** | expects 0; the seeder creates `admin` on first boot |
| `company_settings (lazy)` / `print_settings (lazy)` | a database with saved settings | expect 0; created lazily on first use, so a fresh boot still passes |
| `doc numbers` | a database with transactions | expects pristine sequences (`nextNumber` 1, no reset year) |

*Expected on a hand-built chart, specific to this migration:*

| Check | Expected vs actual on `erp_db` |
|---|---|
| `payment_methods` count | 9 vs 6 |
| `payment methods` values | seeded nine vs the six curated rows |
| `payment method mappings` | `CIMB>1200;MAYBANK>1210` vs `BANK>1200;BANK2>1210` |

Everything else passes, including `chart_of_account`, `COA tuples` and
`settings mappings` — which is the meaningful signal that adoption left the
chart correct.

### Pinning the expected-failure set

Recording "seven failures" in prose is not enough. A future reader comparing by
eye has no prompt to notice an **eighth**, and the count is fragile in a silent
direction: three of the 13 checks (`payment methods`, `payment method
mappings`, `COA tuples`) are exact-string comparisons, so any later migration
that adds a seed row changes an expected string and moves the count. CLAUDE.md
records this exact trap for a different gate — *stale counts train readers to
wave through a mismatch, the exact reflex that would miss the real failure*
(#1164).

**A naive `gate | grep FAIL | sort > baseline` is unsafe**, and an earlier
revision of this document shipped exactly that. If the preflight aborts
(`exit 2`), the gate emits **no** `FAIL` lines, so the baseline is written
**empty**; a later run that also aborts produces an empty diff and **exit 0**,
reporting "no drift" when the checks never ran. `sort` is last in the pipe, so
its exit status masks the gate's. Confirmed with a shell mock: empty baseline,
`DIFF_EXIT=0`. This is the same shape as a suite reporting `Tests: 0 total` and
being read as green.

So the capture must separate the log from the status, reject anything that is
not "checks ran and some failed", and validate the names before saving. Save
this as `capture-seed-baseline.sh` next to the deployment notes:

```bash
#!/usr/bin/env bash
# Capture erp_db's expected verify-seeds.sh failures.
#
# Never writes the baseline unless the gate ran to completion AND the captured
# set matches the reviewed one. Every write is checked: an unchecked redirect
# that fails leaves a STALE baseline in place, which then validates clean while
# the gate is reporting new failures.
set -uo pipefail
REPO="${REPO:-/home/blur/erp2}"
EVIDENCE_DIR="${EVIDENCE_DIR:-.}"
stamp=$(date -u +%Y%m%dT%H%M%SZ)
log="$EVIDENCE_DIR/erp_db-seed-$stamp.log"
cand=$(mktemp)
trap 'rm -f "$cand"' EXIT

# Retained as deployment evidence, not a temp file: it is the only record of
# WHICH values differed. Fail loudly if it cannot be written.
if ! : > "$log" 2>/dev/null; then
  echo "REFUSED: cannot write the evidence log $log" >&2
  exit 1
fi

# MUST run from backend/: the script resolves ../docker-compose.yml and
# .env.local relative to its working directory.
(cd "$REPO/backend" && CAND_DB=erp_db DB_USERNAME=erp_user \
   bash scripts/verify-seeds.sh) >"$log" 2>&1
status=$?
echo "gate exit status: $status" >> "$log"

# 1 = checks ran, some failed (the expected state for this database).
# 2 = preflight aborted, nothing checked. 0 = everything passed, itself a
# surprise here. Neither may overwrite the baseline.
if [ "$status" -ne 1 ]; then
  echo "REFUSED: gate exited $status; expected 1 (checks ran, some failed)." >&2
  echo "Evidence: $log" >&2
  exit 1
fi

# Exit 1 alone does not prove the run COMPLETED — the script could die partway
# through its checks for an unrelated reason and still exit non-zero. Require
# its terminal marker.
if ! grep -q '^FAIL: seed verification failed' "$log"; then
  echo "REFUSED: gate exited 1 but never printed its completion marker" >&2
  echo "('FAIL: seed verification failed'), so the run did not finish." >&2
  echo "Evidence: $log" >&2
  exit 1
fi

# Extract into a CANDIDATE first. Writing straight to the baseline means a
# failed write leaves the previous file to be validated in its place.
if ! grep '^  FAIL' "$log" | sed 's/ — expected.*//' | sed 's/^ *//' | sort > "$cand"; then
  echo "REFUSED: could not extract the failing set from $log" >&2
  exit 1
fi
if [ ! -s "$cand" ]; then
  echo "REFUSED: extracted an EMPTY failing set despite exit 1. Evidence: $log" >&2
  exit 1
fi

# Validate the CANDIDATE, never the stored baseline.
if ! diff -q "$cand" erp_db-seed-expected.txt >/dev/null 2>&1; then
  echo "DRIFT: the failing set differs from the reviewed one." >&2
  echo "The accepted baseline is left UNCHANGED. Evidence: $log" >&2
  diff erp_db-seed-expected.txt "$cand" >&2 || true
  exit 2
fi

# Only now replace the baseline, and only if the write succeeds.
if ! cp "$cand" erp_db-seed-baseline.txt; then
  echo "REFUSED: validation passed but the baseline could not be written." >&2
  echo "The stored baseline may be stale. Evidence: $log" >&2
  exit 1
fi
echo "OK: $(wc -l < erp_db-seed-baseline.txt) names, matching the reviewed set."
echo "Evidence: $log"
```

Write the reviewed seven names to `erp_db-seed-expected.txt` (the block below)
so that validation has something to compare against.

Every later check re-runs the same script and diffs:

```bash
bash capture-seed-baseline.sh   # refuses if the gate did not run its checks
```

Exit statuses, all three verified against shell mocks (2026-09-19):

| Exit | Meaning |
|---|---|
| `0` | gate completed, failing set matches the reviewed seven, baseline written — the expected steady state |
| `1` | **refused.** Preflight aborted, everything passed, the run exited 1 without its completion marker, the extracted set was empty, or the baseline could not be written. No baseline is written or trusted |
| `2` | gate completed but the failing set **drifted**. The differing names are printed and the accepted baseline is left **unchanged** |

Only `0` is a pass. Neither `1` nor `2` may be scripted past.

Every path verified against shell mocks (2026-09-19), including the two that
previously produced a false pass:

| Scenario | Result |
|---|---|
| seven expected failures | `OK: 7 names`, exit 0 |
| an eighth failure, baseline read-only | `DRIFT`, names `FAIL COA tuples`, exit 2, baseline intact |
| exit 1 with no completion marker | `REFUSED: … never printed its completion marker`, exit 1 |
| preflight abort (exit 2) | `REFUSED: gate exited 2`, exit 1 |
| validation passes, baseline unwritable | `REFUSED: … could not be written`, exit 1 |

The last two rows are the ones that matter most. An earlier revision wrote the
baseline with an **unchecked** redirect, so when that write failed the *stale*
file was validated in its place: it printed `Permission denied` and then `OK`,
exiting 0, while the gate was reporting an eighth failure. Extracting to a
temporary candidate, validating the candidate, and only then replacing the
baseline — checking that write too — is what closes it. Otherwise, **any line where the new baseline differs from the
reviewed set is new and must be explained** — do not assume it is benign
because the count still looks familiar. Stripping the `— expected [...], got
[...]` tail keeps the baseline stable against drifting row counts while still
catching a new *check name*.

The set captured on the adopted clone (2026-09-18, migration set ending
`1789658118888`) was:

```
FAIL company_settings (lazy)
FAIL doc numbers
FAIL payment method mappings
FAIL payment methods
FAIL payment_methods
FAIL print_settings (lazy)
FAIL users (no default admin)
```

If your set differs from this in **any** way — count or names — re-derive it
rather than assuming the difference is benign.

`verify-seeds.sh` describes a *freshly seeded* database. A long-lived database
whose payment methods were curated by hand is not one, and forcing it to look
like one destroys operator intent.

**→ This branch is done. Go to *Record the migration as applied* below.** (The
next section is background on a recipe that used to be here and was removed; it
prescribes no action.)

### Why there is no "just rename the method codes" recipe

An earlier revision of this document carried one, for a database "close to
seed": all nine methods present, with the `CIMB`/`MAYBANK` names on differently
-coded rows. **That state cannot exist**, so the recipe was removed rather than
tested. Proven on disposable databases 2026-09-18:

- The "nine" are the seven from `InitialSchema` **plus `CIMB` and `MAYBANK`,
  which this migration creates**. A database that has not run the migration has
  **seven** methods (verified: `ATOME,BANK,CASH,CC,SHOPEE,TIKTOK,TNG`) and no
  `CIMB`/`MAYBANK` at all.
- A database that *does* have nine has already applied the migration — so it is
  not reading this document.
- In that state the collision query returns `CIMB` and `MAYBANK` by code, and
  the recipe's own precondition ("proceed only if that returns nothing")
  forbids running it.

The preconditions were therefore mutually contradictory: satisfying the method
count required a database that failed the collision check. Any operator who
reached that recipe would have been in a state its own guard rejected — and if
they had skipped the guard, the `UPDATE ... SET code='CIMB'` would have hit the
unique index, or worse, consumed a seeded row.

If a future database genuinely needs method codes changed, treat it as its own
analysis. Do not reconstruct a generic recipe from this document.

## Record the migration as applied

This step is **mandatory** and is where the adoption branch ends. Without it the
migration is still pending, so every subsequent deploy re-runs it, it aborts
again on the same conflict, and nothing you did above takes effect on the
chain.

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
