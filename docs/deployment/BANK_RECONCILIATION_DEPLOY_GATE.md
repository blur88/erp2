# Bank Reconciliation Deployment Gate (#1342)

## Overview & Scope
This document specifies the pre-deployment preflight gates, deployment steps, and post-deployment validation procedures for feature branch `#1342` (Bank Reconciliation).

> [!NOTE]
> **Open Item O4**: Production legacy table inspection is open until this preflight is executed directly against the target production database during the staging/release window.
> **Prerequisite #1298**: Bank account flagging (`isBankAccount` in Chart of Accounts) is a prerequisite for accounts to appear as selectable in bank reconciliations.

---

## 1. Pre-Deployment Gate (Preflight Script)

Run the preflight query against the target database before executing database migrations:

```bash
docker compose exec -T postgres psql -U "$POSTGRES_USER" -d "$POSTGRES_DB" \
  -f /path/to/backend/scripts/preflight-bank-reconciliation.sql
```

The script inspects `information_schema.tables` and classifies matching tables into three categories:

| Category | Table Names | Gate Policy | Action Required |
|---|---|---|---|
| **legacy** | `bank_reconciliations`, `reconciled_transactions` | **BLOCKER** | If any legacy table exists in production, deploy must abort immediately until data migration/deprecation plan is executed. |
| **new** | `bank_statement_reconciliations`, `bank_statement_reconciliation_lines`, `bank_statement_reconciliation_setup_marks`, `bank_statement_reconciliation_versions`, `bank_statement_reconciliation_version_lines` | **BLOCKER (Pre-deploy)** | Prior to migration run, none of these tables should exist. If present, deploy must halt to investigate partial prior deploy. |
| **review** | Any table matching `%reconcil%` not in `legacy` or `new` | **DECISION REQUIRED** | Requires manual review and recorded sign-off before proceeding. |

---

## 2. Migration Execution

Once preflight passes with zero blockers:

```bash
cd backend && npm run migration:run
```

---

## 3. Post-Deployment Verification Gate

Verify the database schema and system state following migration:

### 3.1 Five Tables Created
Verify all 5 tables exist under the current schema:
1. `bank_statement_reconciliations`
2. `bank_statement_reconciliation_lines`
3. `bank_statement_reconciliation_setup_marks`
4. `bank_statement_reconciliation_versions`
5. `bank_statement_reconciliation_version_lines`

```sql
SELECT table_name
FROM information_schema.tables
WHERE table_schema = current_schema()
  AND table_name LIKE 'bank_statement_reconciliation%'
ORDER BY table_name;
```

### 3.2 Eight Triggers Enabled
Confirm all 8 immutability, reservation, and status triggers are present and enabled:
1. `trg_bsr_no_delete_completed` ON `bank_statement_reconciliations`
2. `trg_bsr_no_direct_update_to_completed` ON `bank_statement_reconciliations`
3. `trg_bsr_no_modify_completed_lines` ON `bank_statement_reconciliation_lines`
4. `trg_bsr_no_modify_setup_marks` ON `bank_statement_reconciliation_setup_marks`
5. `trg_bsr_versions_append_only` ON `bank_statement_reconciliation_versions`
6. `trg_bsr_version_lines_append_only` ON `bank_statement_reconciliation_version_lines`
7. `trg_bsr_assert_reservation_on_complete` ON `bank_statement_reconciliation_versions`
8. `trg_bsr_prevent_active_bank_account_delete` ON `bank_statement_reconciliations`

```sql
SELECT event_object_table, trigger_name, status
FROM information_schema.triggers
WHERE event_object_table LIKE 'bank_statement_reconciliation%'
ORDER BY event_object_table, trigger_name;
```

### 3.3 Foreign Key Constraint `FK_bsr_current_version`
Confirm circular foreign key between `bank_statement_reconciliations.current_version_id` and `bank_statement_reconciliation_versions.id`:

```sql
SELECT conname, confdeltype, confupdtype
FROM pg_constraint
WHERE conname = 'FK_bsr_current_version';
```

### 3.4 Numbering Sequence Configuration
Verify row `Bank Reconciliations` exists in `document_numbering_settings` with format `BR-YY-XXXXX`:

```sql
SELECT id, document_type, prefix, current_sequence
FROM document_numbering_settings
WHERE document_type = 'Bank Reconciliations';
```

### 3.5 Bank Account Options
Verify active flagged bank accounts (`is_bank_account = true AND is_active = true`) match chart of accounts and appear in the "Bank Account" dropdown on `/accounting/bank-reconciliations/create`.

---

## 4. CI Workflow Run
Trigger the GitHub Actions CI pipeline against `main`:
```bash
gh workflow run ci.yml --ref main
```
Confirm all pipeline stages (backend lint/type-check/test/e2e, frontend lint/type-check/test, Docker builds) succeed.
