import { MigrationInterface, QueryRunner } from "typeorm";

export class AddInventoryValuation1792680000000 implements MigrationInterface {
  name = "AddInventoryValuation1792680000000";

  public async up(queryRunner: QueryRunner): Promise<void> {
    await queryRunner.query(`
      CREATE TABLE "inventory_valuation_state" (
        "id" boolean NOT NULL DEFAULT true,
        "status" character varying(10) NOT NULL DEFAULT 'inactive',
        "activatedAt" TIMESTAMP WITH TIME ZONE,
        "pausedAt" TIMESTAMP WITH TIME ZONE,
        "appliedReconciliationId" uuid,
        CONSTRAINT "PK_f13943f6a6f9f15f47d5695e4e4" PRIMARY KEY ("id"),
        CONSTRAINT "CHK_inventory_valuation_state_singleton" CHECK ("id" = true),
        CONSTRAINT "CHK_inventory_valuation_state_status" CHECK ("status" IN ('inactive', 'active'))
      )
    `);
    await queryRunner.query(
      `INSERT INTO "inventory_valuation_state" ("id", "status") VALUES (true, 'inactive')`,
    );

    await queryRunner.query(`
      CREATE TABLE "product_valuation_balances" (
        "productId" uuid NOT NULL,
        "quantityOnHand" numeric(15,4) NOT NULL,
        "valueOnHand" numeric(15,2) NOT NULL,
        "method" character varying(10) NOT NULL,
        "lastEntryId" uuid,
        "updatedAt" TIMESTAMP WITH TIME ZONE NOT NULL DEFAULT now(),
        CONSTRAINT "PK_8b8b76f1238e5a27f35e2239148" PRIMARY KEY ("productId"),
        CONSTRAINT "CHK_product_valuation_balance_method" CHECK ("method" IN ('AVERAGE', 'FIFO')),
        CONSTRAINT "FK_product_valuation_balance_product" FOREIGN KEY ("productId")
          REFERENCES "products"("id") ON DELETE RESTRICT ON UPDATE NO ACTION
      )
    `);
    await queryRunner.query(
      `CREATE INDEX "IDX_product_valuation_balances_method" ON "product_valuation_balances" ("method")`,
    );

    await queryRunner.query(`
      CREATE TABLE "stock_valuation_entries" (
        "id" uuid NOT NULL DEFAULT uuid_generate_v4(),
        "productId" uuid NOT NULL,
        "movementId" uuid,
        "kind" character varying(30) NOT NULL,
        "method" character varying(10) NOT NULL,
        "quantity" numeric(15,4) NOT NULL,
        "value" numeric(15,2) NOT NULL,
        "runningQuantity" numeric(15,4) NOT NULL,
        "runningValue" numeric(15,2) NOT NULL,
        "journalEntryId" uuid,
        "reversesEntryId" uuid,
        "defaultUnitValue" numeric(15,4),
        "explanation" text,
        "actorUserId" uuid,
        "createdAt" TIMESTAMP WITH TIME ZONE NOT NULL DEFAULT now(),
        CONSTRAINT "PK_6d4ab06f6a2c09c17c1b25c5122" PRIMARY KEY ("id"),
        CONSTRAINT "CHK_stock_valuation_entry_movement_or_registration"
          CHECK ("movementId" IS NOT NULL OR "kind" IN ('cutover_opening', 'method_change')),
        CONSTRAINT "CHK_stock_valuation_entry_method" CHECK ("method" IN ('AVERAGE', 'FIFO')),
        CONSTRAINT "FK_stock_valuation_entry_product" FOREIGN KEY ("productId")
          REFERENCES "products"("id") ON DELETE RESTRICT ON UPDATE NO ACTION,
        CONSTRAINT "FK_stock_valuation_entry_movement" FOREIGN KEY ("movementId")
          REFERENCES "stock_movements"("id") ON DELETE RESTRICT ON UPDATE NO ACTION,
        CONSTRAINT "FK_stock_valuation_entry_journal_entry" FOREIGN KEY ("journalEntryId")
          REFERENCES "journal_entry"("id") ON DELETE RESTRICT ON UPDATE NO ACTION,
        CONSTRAINT "FK_stock_valuation_entry_reverses_entry" FOREIGN KEY ("reversesEntryId")
          REFERENCES "stock_valuation_entries"("id") ON DELETE RESTRICT ON UPDATE NO ACTION
      )
    `);
    await queryRunner.query(
      `CREATE UNIQUE INDEX "UQ_stock_valuation_entry_movement" ON "stock_valuation_entries" ("movementId")`,
    );
    await queryRunner.query(
      `CREATE UNIQUE INDEX "UQ_stock_valuation_entry_reverses" ON "stock_valuation_entries" ("reversesEntryId")`,
    );
    await queryRunner.query(
      `CREATE INDEX "IDX_stock_valuation_entries_product" ON "stock_valuation_entries" ("productId", "createdAt")`,
    );

    await queryRunner.query(`
      CREATE TABLE "inventory_cost_layers" (
        "id" uuid NOT NULL DEFAULT uuid_generate_v4(),
        "productId" uuid NOT NULL,
        "sourceEntryId" uuid,
        "quantity" numeric(15,4) NOT NULL,
        "unitValue" numeric(15,4) NOT NULL,
        "remainingQuantity" numeric(15,4) NOT NULL,
        "remainingValue" numeric(15,2) NOT NULL,
        "createdAt" TIMESTAMP WITH TIME ZONE NOT NULL DEFAULT now(),
        CONSTRAINT "PK_b0b89e97f21918ae04f4da83fe7" PRIMARY KEY ("id"),
        CONSTRAINT "CHK_inventory_cost_layer_remaining_quantity_nonnegative" CHECK ("remainingQuantity" >= 0),
        CONSTRAINT "CHK_inventory_cost_layer_remaining_value_nonnegative" CHECK ("remainingValue" >= 0),
        CONSTRAINT "CHK_inventory_cost_layer_empty_value" CHECK ("remainingQuantity" > 0 OR "remainingValue" = 0),
        CONSTRAINT "FK_inventory_cost_layer_product" FOREIGN KEY ("productId")
          REFERENCES "products"("id") ON DELETE RESTRICT ON UPDATE NO ACTION,
        CONSTRAINT "FK_inventory_cost_layer_source_entry" FOREIGN KEY ("sourceEntryId")
          REFERENCES "stock_valuation_entries"("id") ON DELETE RESTRICT ON UPDATE NO ACTION
      )
    `);
    await queryRunner.query(
      `CREATE INDEX "IDX_inventory_cost_layers_product" ON "inventory_cost_layers" ("productId", "id")`,
    );

    await queryRunner.query(`
      CREATE TABLE "inventory_layer_consumptions" (
        "id" uuid NOT NULL DEFAULT uuid_generate_v4(),
        "layerId" uuid NOT NULL,
        "entryId" uuid NOT NULL,
        "quantity" numeric(15,4) NOT NULL,
        "value" numeric(15,2) NOT NULL,
        "createdAt" TIMESTAMP WITH TIME ZONE NOT NULL DEFAULT now(),
        CONSTRAINT "PK_ec7e8ab4dbfbfe04e40e881b9a6" PRIMARY KEY ("id"),
        CONSTRAINT "CHK_inventory_layer_consumption_quantity_positive" CHECK ("quantity" > 0),
        CONSTRAINT "FK_inventory_layer_consumption_layer" FOREIGN KEY ("layerId")
          REFERENCES "inventory_cost_layers"("id") ON DELETE RESTRICT ON UPDATE NO ACTION,
        CONSTRAINT "FK_inventory_layer_consumption_entry" FOREIGN KEY ("entryId")
          REFERENCES "stock_valuation_entries"("id") ON DELETE RESTRICT ON UPDATE NO ACTION
      )
    `);
    await queryRunner.query(
      `CREATE INDEX "IDX_inventory_layer_consumptions_layer" ON "inventory_layer_consumptions" ("layerId", "createdAt")`,
    );
    await queryRunner.query(
      `CREATE INDEX "IDX_inventory_layer_consumptions_entry" ON "inventory_layer_consumptions" ("entryId")`,
    );

    await queryRunner.query(`
      CREATE FUNCTION "stock_valuation_entry_immutable"() RETURNS trigger AS $$
      BEGIN
        RAISE EXCEPTION 'stock valuation entries are immutable'
          USING ERRCODE = 'check_violation';
      END;
      $$ LANGUAGE plpgsql
    `);
    await queryRunner.query(`
      CREATE TRIGGER "trg_stock_valuation_entry_immutable"
      BEFORE UPDATE OR DELETE ON "stock_valuation_entries"
      FOR EACH ROW EXECUTE FUNCTION "stock_valuation_entry_immutable"()
    `);
    await queryRunner.query(`
      CREATE FUNCTION "inventory_layer_consumption_immutable"() RETURNS trigger AS $$
      BEGIN
        RAISE EXCEPTION 'inventory layer consumptions are immutable'
          USING ERRCODE = 'check_violation';
      END;
      $$ LANGUAGE plpgsql
    `);
    await queryRunner.query(`
      CREATE TRIGGER "trg_inventory_layer_consumption_immutable"
      BEFORE UPDATE OR DELETE ON "inventory_layer_consumptions"
      FOR EACH ROW EXECUTE FUNCTION "inventory_layer_consumption_immutable"()
    `);
    await queryRunner.query(`
      CREATE FUNCTION "stock_movement_valuation_coverage"() RETURNS trigger AS $$
      DECLARE
        v_status text;
      BEGIN
        SELECT "status" INTO v_status
          FROM "inventory_valuation_state"
         WHERE "id" = true;
        IF v_status = 'active' AND NOT EXISTS (
          SELECT 1 FROM "stock_valuation_entries" WHERE "movementId" = NEW."id"
        ) THEN
          RAISE EXCEPTION 'stock movement % has no valuation entry while valuation is active', NEW."id"
            USING ERRCODE = 'check_violation';
        END IF;
        RETURN NULL;
      END;
      $$ LANGUAGE plpgsql
    `);
    await queryRunner.query(`
      CREATE CONSTRAINT TRIGGER "trg_stock_movement_valuation_coverage"
      AFTER INSERT ON "stock_movements"
      DEFERRABLE INITIALLY DEFERRED
      FOR EACH ROW EXECUTE FUNCTION "stock_movement_valuation_coverage"()
    `);
  }

  public async down(queryRunner: QueryRunner): Promise<void> {
    const [counts] = await queryRunner.query(`
      SELECT (SELECT count(*) FROM "stock_valuation_entries") AS entries,
             (SELECT count(*) FROM "product_valuation_balances") AS balances,
             (SELECT count(*) FROM "inventory_cost_layers") AS layers,
             (SELECT count(*) FROM "inventory_layer_consumptions") AS consumptions,
             (SELECT status FROM "inventory_valuation_state" WHERE id = true) AS status
    `);
    if (
      BigInt(counts.entries) > 0n ||
      BigInt(counts.balances) > 0n ||
      BigInt(counts.layers) > 0n ||
      BigInt(counts.consumptions) > 0n ||
      counts.status !== "inactive"
    ) {
      throw new Error(
        "Cannot revert AddInventoryValuation while valuation data exists or valuation is active.",
      );
    }

    await queryRunner.query(
      `DROP TRIGGER "trg_stock_movement_valuation_coverage" ON "stock_movements"`,
    );
    await queryRunner.query(
      `DROP FUNCTION "stock_movement_valuation_coverage"()`,
    );
    await queryRunner.query(
      `DROP TRIGGER "trg_inventory_layer_consumption_immutable" ON "inventory_layer_consumptions"`,
    );
    await queryRunner.query(
      `DROP FUNCTION "inventory_layer_consumption_immutable"()`,
    );
    await queryRunner.query(
      `DROP TRIGGER "trg_stock_valuation_entry_immutable" ON "stock_valuation_entries"`,
    );
    await queryRunner.query(
      `DROP FUNCTION "stock_valuation_entry_immutable"()`,
    );
    await queryRunner.query(`DROP TABLE "inventory_layer_consumptions"`);
    await queryRunner.query(`DROP TABLE "inventory_cost_layers"`);
    await queryRunner.query(`DROP TABLE "stock_valuation_entries"`);
    await queryRunner.query(`DROP TABLE "product_valuation_balances"`);
    await queryRunner.query(`DROP TABLE "inventory_valuation_state"`);
  }
}
