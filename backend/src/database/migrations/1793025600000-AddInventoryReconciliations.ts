import { MigrationInterface, QueryRunner } from 'typeorm';

export class AddInventoryReconciliations1793025600000 implements MigrationInterface {
  name = 'AddInventoryReconciliations1793025600000';
  async up(q: QueryRunner): Promise<void> {
    await q.query(`CREATE TYPE inventory_cost_evidence_enum AS ENUM ('unreviewed','supported','accepted_without_evidence')`);
    await q.query(`CREATE TABLE inventory_reconciliations (
      id uuid PRIMARY KEY DEFAULT gen_random_uuid(), status varchar(12) NOT NULL DEFAULT 'proposed',
      "preparedByUserId" uuid NOT NULL, "approvedByUserId" uuid NULL, "approvedAt" timestamptz NULL,
      "contentHash" varchar(64) NULL, "cutoffAt" timestamptz NULL,
      "controlAccountBalanceAtPreparation" numeric(15,2) NOT NULL, "controlAccountBalanceAtCutoff" numeric(15,2) NULL,
      "openingBalanceEntries" jsonb NOT NULL DEFAULT '[]', "approvedTotalValue" numeric(15,2) NOT NULL DEFAULT 0,
      difference numeric(15,2) NOT NULL DEFAULT 0, "differenceExplanation" text NULL, snapshot jsonb NOT NULL DEFAULT '{}',
      "correctingEntryId" uuid NULL UNIQUE REFERENCES journal_entry(id) ON DELETE RESTRICT,
      "createdAt" timestamptz NOT NULL DEFAULT now(), CONSTRAINT CHK_inventory_reconciliation_status CHECK (status IN ('proposed','approved','applied','aborted','superseded'))
    )`);
    await q.query(`CREATE UNIQUE INDEX UQ_inventory_reconciliation_open ON inventory_reconciliations ((status)) WHERE status IN ('proposed','approved')`);
    await q.query(`CREATE INDEX IDX_inventory_reconciliations_status ON inventory_reconciliations(status)`);
    await q.query(`CREATE TABLE inventory_opening_positions (
      id uuid PRIMARY KEY DEFAULT gen_random_uuid(), "reconciliationId" uuid NOT NULL REFERENCES inventory_reconciliations(id) ON DELETE RESTRICT,
      "productId" uuid NOT NULL REFERENCES products(id) ON DELETE RESTRICT, "approvedQuantity" numeric(15,4) NOT NULL,
      "approvedValue" numeric(15,2) NOT NULL, "uncoveredQuantity" numeric(15,4) NOT NULL DEFAULT 0,
      "uncoveredUnitCost" numeric(15,4) NULL, "uncoveredCostEvidence" inventory_cost_evidence_enum NOT NULL DEFAULT 'unreviewed',
      evidence text NULL, uncertainties text NULL, "valuationChangeExplanation" text NULL,
      CONSTRAINT UQ_inventory_opening_position_product UNIQUE ("reconciliationId","productId"),
      CONSTRAINT CHK_inventory_opening_position_uncovered CHECK ("uncoveredQuantity" >= 0)
    )`);
    await q.query(`CREATE INDEX IDX_inventory_opening_positions_reconciliation ON inventory_opening_positions("reconciliationId")`);
    await q.query(`CREATE TABLE inventory_opening_position_batches (
      id uuid PRIMARY KEY DEFAULT gen_random_uuid(), "positionId" uuid NOT NULL REFERENCES inventory_opening_positions(id) ON DELETE RESTRICT,
      "batchId" uuid NOT NULL REFERENCES purchase_cost_history(id) ON DELETE RESTRICT, "remainingQuantity" numeric(15,4) NOT NULL,
      "landedCost" numeric(15,4) NOT NULL, "costEvidence" inventory_cost_evidence_enum NOT NULL DEFAULT 'unreviewed', note text NULL,
      "releaseQuantity" numeric(15,4) NOT NULL DEFAULT 0, "releaseReason" text NULL,
      CONSTRAINT UQ_inventory_opening_position_batch UNIQUE ("positionId","batchId"),
      CONSTRAINT CHK_inventory_opening_position_batch_release CHECK ("releaseQuantity" >= 0 AND "releaseQuantity" <= "remainingQuantity"),
      CONSTRAINT CHK_inventory_opening_position_batch_release_reason CHECK ("releaseQuantity" = 0 OR length(trim("releaseReason")) > 0)
    )`);
    await q.query(`CREATE INDEX IDX_inventory_opening_position_batches_position ON inventory_opening_position_batches("positionId")`);
    await q.query(`CREATE TABLE inventory_cutover_batch_releases (
      id uuid PRIMARY KEY DEFAULT gen_random_uuid(), "reconciliationId" uuid NOT NULL REFERENCES inventory_reconciliations(id) ON DELETE RESTRICT,
      "batchId" uuid NOT NULL REFERENCES purchase_cost_history(id) ON DELETE RESTRICT, quantity numeric(15,4) NOT NULL CHECK (quantity > 0),
      reason text NOT NULL, "createdAt" timestamptz NOT NULL DEFAULT now()
    )`);
    await q.query(`CREATE TABLE inventory_reconciliation_journal_lines (
      id uuid PRIMARY KEY DEFAULT gen_random_uuid(), "reconciliationId" uuid NOT NULL REFERENCES inventory_reconciliations(id) ON DELETE RESTRICT,
      "accountId" uuid NOT NULL REFERENCES chart_of_account(id) ON DELETE RESTRICT, debit numeric(15,2) NOT NULL DEFAULT 0,
      credit numeric(15,2) NOT NULL DEFAULT 0, explanation text NOT NULL,
      CONSTRAINT CHK_inventory_reconciliation_journal_line_sign CHECK (debit >= 0 AND credit >= 0 AND NOT (debit > 0 AND credit > 0))
    )`);
    await q.query(`CREATE INDEX IDX_inventory_reconciliation_journal_lines_reconciliation ON inventory_reconciliation_journal_lines("reconciliationId")`);
    await q.query(`CREATE FUNCTION inventory_reconciliation_content_guard() RETURNS trigger AS $$
      DECLARE rid uuid; st text;
      BEGIN
        IF TG_TABLE_NAME = 'inventory_opening_positions' THEN rid := COALESCE(NEW."reconciliationId",OLD."reconciliationId");
        ELSIF TG_TABLE_NAME = 'inventory_reconciliation_journal_lines' THEN rid := COALESCE(NEW."reconciliationId",OLD."reconciliationId");
        ELSE SELECT "reconciliationId" INTO rid FROM inventory_opening_positions WHERE id=COALESCE(NEW."positionId",OLD."positionId"); END IF;
        SELECT status INTO st FROM inventory_reconciliations WHERE id=rid;
        IF st IN ('approved','applied','aborted','superseded') THEN RAISE EXCEPTION 'reconciliation content is immutable while status is %',st USING ERRCODE='check_violation'; END IF;
        RETURN COALESCE(NEW,OLD);
      END; $$ LANGUAGE plpgsql`);
    for (const table of ['inventory_opening_positions','inventory_opening_position_batches','inventory_reconciliation_journal_lines'])
      await q.query(`CREATE TRIGGER trg_${table}_content_guard BEFORE INSERT OR UPDATE OR DELETE ON ${table} FOR EACH ROW EXECUTE FUNCTION inventory_reconciliation_content_guard()`);
    await q.query(`CREATE FUNCTION inventory_reconciliation_header_guard() RETURNS trigger AS $$
      BEGIN
        IF OLD.status IN ('applied','aborted','superseded') AND NEW IS DISTINCT FROM OLD THEN RAISE EXCEPTION 'terminal reconciliation header is immutable' USING ERRCODE='check_violation'; END IF;
        IF NEW.status <> OLD.status AND NOT (
          (OLD.status='proposed' AND NEW.status IN ('approved','aborted','superseded')) OR
          (OLD.status='approved' AND NEW.status IN ('proposed','applied','aborted','superseded'))
        ) THEN RAISE EXCEPTION 'invalid reconciliation status transition: % to %',OLD.status,NEW.status USING ERRCODE='check_violation'; END IF;
        IF OLD.status='approved' AND NEW.status='proposed' AND (NEW."approvedByUserId" IS NOT NULL OR NEW."approvedAt" IS NOT NULL OR NEW."contentHash" IS NOT NULL) THEN RAISE EXCEPTION 'reopen must clear approval fields' USING ERRCODE='check_violation'; END IF;
        IF NEW."correctingEntryId" IS DISTINCT FROM OLD."correctingEntryId" AND NEW.status <> 'applied' THEN RAISE EXCEPTION 'correctingEntryId may only be set with status applied' USING ERRCODE='check_violation'; END IF;
        IF OLD.status='approved' AND NEW.status='approved' AND NEW IS DISTINCT FROM OLD THEN RAISE EXCEPTION 'approved reconciliation header is immutable; reopen it first' USING ERRCODE='check_violation'; END IF;
        RETURN NEW;
      END; $$ LANGUAGE plpgsql`);
    await q.query(`CREATE TRIGGER trg_inventory_reconciliation_header_guard BEFORE UPDATE ON inventory_reconciliations FOR EACH ROW EXECUTE FUNCTION inventory_reconciliation_header_guard()`);
    await q.query(`CREATE FUNCTION inventory_cutover_batch_release_immutable() RETURNS trigger AS $$ BEGIN RAISE EXCEPTION 'inventory cutover batch releases are immutable' USING ERRCODE='check_violation'; END; $$ LANGUAGE plpgsql`);
    await q.query(`CREATE TRIGGER trg_inventory_cutover_batch_release_immutable BEFORE UPDATE OR DELETE ON inventory_cutover_batch_releases FOR EACH ROW EXECUTE FUNCTION inventory_cutover_batch_release_immutable()`);
  }
  async down(q: QueryRunner): Promise<void> {
    await q.query('DROP TABLE inventory_reconciliation_journal_lines'); await q.query('DROP TABLE inventory_cutover_batch_releases');
    await q.query('DROP TABLE inventory_opening_position_batches'); await q.query('DROP TABLE inventory_opening_positions'); await q.query('DROP TABLE inventory_reconciliations');
    await q.query('DROP FUNCTION inventory_cutover_batch_release_immutable()'); await q.query('DROP FUNCTION inventory_reconciliation_header_guard()'); await q.query('DROP FUNCTION inventory_reconciliation_content_guard()'); await q.query('DROP TYPE inventory_cost_evidence_enum');
  }
}
