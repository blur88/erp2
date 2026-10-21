import { MigrationInterface, QueryRunner } from 'typeorm';

export class AddCostingMethodChanges1792939200000 implements MigrationInterface {
  name = 'AddCostingMethodChanges1792939200000';
  async up(q: QueryRunner): Promise<void> {
    await q.query(`CREATE TABLE costing_method_changes (
      id uuid PRIMARY KEY DEFAULT gen_random_uuid(), "fromMethod" varchar(10) NOT NULL,
      "toMethod" varchar(10) NOT NULL, "requestedEffectiveDate" date NOT NULL,
      status varchar(12) NOT NULL DEFAULT 'proposed', "preparedByUserId" uuid NOT NULL,
      "approvedByUserId" uuid NULL, "approvedAt" timestamptz NULL, "contentHash" varchar(64) NULL,
      "snapshotTakenAt" timestamptz NOT NULL DEFAULT now(), "appliedAt" timestamptz NULL,
      "appliedDate" date NULL, "appliedByUserId" uuid NULL, explanation text NOT NULL,
      "createdAt" timestamptz NOT NULL DEFAULT now(),
      CONSTRAINT CHK_costing_method_change_methods CHECK ("fromMethod" IN ('AVERAGE','FIFO') AND "toMethod" IN ('AVERAGE','FIFO') AND "fromMethod" <> "toMethod"),
      CONSTRAINT CHK_costing_method_change_status CHECK (status IN ('proposed','approved','applied','withdrawn'))
    )`);
    await q.query(`CREATE TABLE costing_method_change_products (
      id uuid PRIMARY KEY DEFAULT gen_random_uuid(), "changeId" uuid NOT NULL REFERENCES costing_method_changes(id) ON DELETE RESTRICT,
      "productId" uuid NOT NULL REFERENCES products(id) ON DELETE RESTRICT, method varchar(10) NOT NULL,
      quantity numeric(15,4) NOT NULL, "valueBefore" numeric(15,2) NOT NULL, "valueAfter" numeric(15,2) NOT NULL,
      "layersBefore" jsonb NOT NULL DEFAULT '[]', "batchesBefore" jsonb NOT NULL DEFAULT '[]', "layersAfter" jsonb NOT NULL DEFAULT '[]',
      "supersededAt" timestamptz NULL, CONSTRAINT CHK_costing_method_change_product_method CHECK (method IN ('AVERAGE','FIFO'))
    )`);
    await q.query(`CREATE INDEX IDX_costing_method_changes_status ON costing_method_changes(status)`);
    await q.query(`CREATE INDEX IDX_costing_method_change_products_change ON costing_method_change_products("changeId")`);
    await q.query(`CREATE UNIQUE INDEX UQ_costing_method_change_open ON costing_method_changes ((status)) WHERE status IN ('proposed','approved')`);
  }
  async down(q: QueryRunner): Promise<void> {
    await q.query('DROP TABLE costing_method_change_products');
    await q.query('DROP TABLE costing_method_changes');
  }
}
