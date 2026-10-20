import { MigrationInterface, QueryRunner } from 'typeorm';

export class AddStockMovementValuationGaps1792455000000 implements MigrationInterface {
  name = 'AddStockMovementValuationGaps1792455000000';

  public async up(queryRunner: QueryRunner): Promise<void> {
    await queryRunner.query(
      `ALTER TABLE "stock_occurrences" ADD "hasValuationGap" boolean NOT NULL DEFAULT false`,
    );
    await queryRunner.query(
      `COMMENT ON COLUMN "stock_occurrences"."hasValuationGap" IS 'Whether this fulfillment contains unvalued stock provenance gaps'`,
    );
    await queryRunner.query(
      `ALTER TABLE "stock_occurrences" ADD CONSTRAINT "CHK_stock_occurrence_valuation_gap_kind" CHECK (NOT "hasValuationGap" OR "kind" = 'fulfilment')`,
    );
    await queryRunner.query(`
      CREATE TABLE "stock_movement_valuation_gaps" (
        "movementId" uuid NOT NULL,
        "quantity" numeric(15,4) NOT NULL,
        "valueScale8" numeric(24,8) NOT NULL DEFAULT '0',
        "status" character varying(30) NOT NULL DEFAULT 'unvalued_gap',
        "createdAt" TIMESTAMP WITH TIME ZONE NOT NULL DEFAULT now(),
        CONSTRAINT "PK_572cc0ea03c004f55c866f58bdd" PRIMARY KEY ("movementId"),
        CONSTRAINT "CHK_stock_movement_valuation_gap_quantity_positive" CHECK ("quantity" > 0),
        CONSTRAINT "CHK_stock_movement_valuation_gap_value_zero" CHECK ("valueScale8" = 0),
        CONSTRAINT "CHK_stock_movement_valuation_gap_status" CHECK ("status" = 'unvalued_gap'),
        CONSTRAINT "FK_stock_movement_valuation_gap_movement"
          FOREIGN KEY ("movementId") REFERENCES "stock_movements"("id") ON DELETE RESTRICT ON UPDATE NO ACTION
      )
    `);
    await queryRunner.query(`
      COMMENT ON TABLE "stock_movement_valuation_gaps" IS
        'Unvalued stock coverage gaps; zero posted value preserves interim COGS and does not assert known zero cost'
    `);
    await queryRunner.query(
      `COMMENT ON COLUMN "stock_movement_valuation_gaps"."movementId" IS 'Unique sale movement whose batch coverage is incomplete'`,
    );
    await queryRunner.query(
      `COMMENT ON COLUMN "stock_movement_valuation_gaps"."quantity" IS 'Uncovered quantity, recorded separately from batch consumption'`,
    );
    await queryRunner.query(
      `COMMENT ON COLUMN "stock_movement_valuation_gaps"."valueScale8" IS 'Compatibility posted value; zero is explicitly unvalued, not known zero cost'`,
    );
    await queryRunner.query(`
      CREATE FUNCTION "stock_movement_valuation_gap_immutable"() RETURNS trigger AS $$
      DECLARE
        v_movement_id uuid;
      BEGIN
        IF TG_OP = 'INSERT' THEN
          SELECT m.id INTO v_movement_id
            FROM stock_movements m
            JOIN stock_occurrences o ON o.id = m."occurrenceId"
           WHERE m.id = NEW."movementId"
             AND m."movementType"::text = 'sale'
             AND m.quantity < 0
             AND o.kind::text = 'fulfilment'
           FOR KEY SHARE OF m, o;
          IF NOT FOUND THEN
            RAISE EXCEPTION 'valuation gaps must reference sale movements in fulfillment occurrences'
              USING ERRCODE = 'check_violation';
          END IF;
          RETURN NEW;
        END IF;
        RAISE EXCEPTION 'stock movement valuation gaps are immutable'
          USING ERRCODE = 'check_violation';
      END;
      $$ LANGUAGE plpgsql
    `);
    await queryRunner.query(`
      CREATE TRIGGER "trg_stock_movement_valuation_gap_immutable"
      BEFORE UPDATE OR DELETE ON "stock_movement_valuation_gaps"
      FOR EACH ROW EXECUTE FUNCTION "stock_movement_valuation_gap_immutable"()
    `);
    await queryRunner.query(`
      CREATE FUNCTION "stock_occurrence_valuation_gap_consistency"() RETURNS trigger AS $$
      DECLARE
        v_occurrence_id uuid;
        v_marked boolean;
        v_has_gap boolean;
      BEGIN
        IF TG_TABLE_NAME = 'stock_occurrences' THEN
          v_occurrence_id := NEW.id;
        ELSE
          SELECT m."occurrenceId" INTO v_occurrence_id
            FROM stock_movements m
           WHERE m.id = NEW."movementId";
        END IF;

        SELECT o."hasValuationGap" INTO v_marked
          FROM stock_occurrences o
         WHERE o.id = v_occurrence_id;
        SELECT EXISTS (
          SELECT 1
            FROM stock_movement_valuation_gaps g
            JOIN stock_movements m ON m.id = g."movementId"
           WHERE m."occurrenceId" = v_occurrence_id
        ) INTO v_has_gap;

        IF v_marked IS DISTINCT FROM v_has_gap THEN
          RAISE EXCEPTION 'valuation-gap records do not agree with occurrence marker'
            USING ERRCODE = 'check_violation';
        END IF;
        RETURN NULL;
      END;
      $$ LANGUAGE plpgsql
    `);
    await queryRunner.query(`
      CREATE CONSTRAINT TRIGGER "trg_stock_occurrence_valuation_gap_consistency"
      AFTER INSERT OR UPDATE ON "stock_occurrences"
      DEFERRABLE INITIALLY DEFERRED
      FOR EACH ROW EXECUTE FUNCTION "stock_occurrence_valuation_gap_consistency"()
    `);
    await queryRunner.query(`
      CREATE CONSTRAINT TRIGGER "trg_stock_movement_valuation_gap_consistency"
      AFTER INSERT ON "stock_movement_valuation_gaps"
      DEFERRABLE INITIALLY DEFERRED
      FOR EACH ROW EXECUTE FUNCTION "stock_occurrence_valuation_gap_consistency"()
    `);
  }

  public async down(queryRunner: QueryRunner): Promise<void> {
    const evidence: { gap_count: string; marked_occurrence_count: string }[] =
      await queryRunner.query(`
        SELECT
          (SELECT count(*)::text FROM "stock_movement_valuation_gaps") AS gap_count,
          (SELECT count(*)::text FROM "stock_occurrences" WHERE "hasValuationGap") AS marked_occurrence_count
      `);
    if (BigInt(evidence[0].gap_count) > 0n || BigInt(evidence[0].marked_occurrence_count) > 0n) {
      throw new Error(
        'Cannot revert AddStockMovementValuationGaps: populated valuation-gap evidence would be lost.',
      );
    }

    await queryRunner.query(
      `DROP TRIGGER "trg_stock_movement_valuation_gap_consistency" ON "stock_movement_valuation_gaps"`,
    );
    await queryRunner.query(
      `DROP TRIGGER "trg_stock_occurrence_valuation_gap_consistency" ON "stock_occurrences"`,
    );
    await queryRunner.query(`DROP FUNCTION "stock_occurrence_valuation_gap_consistency"()`);
    await queryRunner.query(
      `DROP TRIGGER "trg_stock_movement_valuation_gap_immutable" ON "stock_movement_valuation_gaps"`,
    );
    await queryRunner.query(`DROP FUNCTION "stock_movement_valuation_gap_immutable"()`);
    await queryRunner.query(`DROP TABLE "stock_movement_valuation_gaps"`);
    await queryRunner.query(
      `ALTER TABLE "stock_occurrences" DROP CONSTRAINT "CHK_stock_occurrence_valuation_gap_kind"`,
    );
    await queryRunner.query(`ALTER TABLE "stock_occurrences" DROP COLUMN "hasValuationGap"`);
  }
}
