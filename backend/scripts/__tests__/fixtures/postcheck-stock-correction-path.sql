-- Isolated temporary catalog/data fixture for the postcheck script test.
-- The postcheck runs in the same psql session, so these tables shadow any
-- application tables and disappear automatically when the connection closes.
CREATE TEMP TABLE products (id uuid PRIMARY KEY, name text NOT NULL);
CREATE TEMP TABLE purchase_order_items (id uuid PRIMARY KEY);
CREATE TEMP TABLE journal_entry (id uuid PRIMARY KEY);
CREATE TEMP TABLE stock_occurrences (
  id uuid PRIMARY KEY,
  kind text NOT NULL,
  "reversesOccurrenceId" uuid,
  "documentType" text NOT NULL,
  "documentId" uuid NOT NULL,
  "isLegacy" boolean NOT NULL DEFAULT false,
  "legacyJournalEntryId" uuid,
  "hasValuationGap" boolean NOT NULL DEFAULT false,
  reason text
);
CREATE TEMP TABLE stock_movements (
  id uuid PRIMARY KEY,
  "productId" uuid NOT NULL,
  "movementType" text,
  quantity numeric(15,4),
  "previousBalance" numeric(15,4),
  "newBalance" numeric(15,4),
  "occurrenceId" uuid,
  "purchaseOrderItemId" uuid,
  "reversesMovementId" uuid,
  "productSequence" bigint
);
CREATE TEMP TABLE purchase_cost_history (
  id uuid PRIMARY KEY,
  "productId" uuid NOT NULL,
  "purchaseOrderId" uuid,
  "occurrenceId" uuid,
  "purchaseOrderItemId" uuid,
  "reversedAt" timestamptz,
  "reversedByOccurrenceId" uuid
);
CREATE TEMP TABLE stock_batch_consumptions (
  id uuid PRIMARY KEY,
  "movementId" uuid NOT NULL,
  "batchId" uuid NOT NULL,
  quantity numeric(15,4) NOT NULL CONSTRAINT "CHK_stock_batch_consumptions_quantity_positive" CHECK (quantity > 0)
);
CREATE TEMP TABLE stock_movement_valuation_gaps (
  "movementId" uuid PRIMARY KEY,
  quantity numeric(15,4) NOT NULL CONSTRAINT "CHK_stock_movement_valuation_gap_quantity_positive" CHECK (quantity > 0),
  "valueScale8" numeric(24,8) NOT NULL DEFAULT 0 CONSTRAINT "CHK_stock_movement_valuation_gap_value_zero" CHECK ("valueScale8" = 0),
  status text NOT NULL DEFAULT 'unvalued_gap' CONSTRAINT "CHK_stock_movement_valuation_gap_status" CHECK (status = 'unvalued_gap'),
  CONSTRAINT "FK_stock_movement_valuation_gap_movement"
    FOREIGN KEY ("movementId") REFERENCES stock_movements(id) ON DELETE RESTRICT
);
ALTER TABLE stock_occurrences ADD CONSTRAINT "CHK_stock_occurrence_valuation_gap_kind"
  CHECK (NOT "hasValuationGap" OR kind = 'fulfilment');
ALTER TABLE stock_occurrences ADD CONSTRAINT "CHK_stock_occurrence_reversal_reason_length"
  CHECK (kind NOT IN ('receipt_reversal', 'fulfilment_reversal') OR
    (reason IS NOT NULL AND char_length(btrim(reason)) BETWEEN 3 AND 500));

ALTER TABLE purchase_cost_history
  ADD CONSTRAINT "FK_purchase_cost_history_occurrence"
  FOREIGN KEY ("occurrenceId") REFERENCES stock_occurrences(id) ON DELETE RESTRICT;
ALTER TABLE purchase_cost_history
  ADD CONSTRAINT "FK_a200937c3bef6072ce44d760fe3"
  FOREIGN KEY ("productId") REFERENCES products(id) ON DELETE RESTRICT;
ALTER TABLE stock_movements
  ADD CONSTRAINT "FK_a3acb59db67e977be45e382fc56"
  FOREIGN KEY ("productId") REFERENCES products(id) ON DELETE RESTRICT;
ALTER TABLE purchase_cost_history
  ADD CONSTRAINT "FK_5c780823d6beebab76e469e2e17"
  FOREIGN KEY ("reversedByOccurrenceId") REFERENCES stock_occurrences(id) ON DELETE RESTRICT;
ALTER TABLE stock_movements
  ADD CONSTRAINT "FK_6e87ea9ab16010d08671f12b633"
  FOREIGN KEY ("reversesMovementId") REFERENCES stock_movements(id) ON DELETE RESTRICT;
ALTER TABLE stock_movements
  ADD CONSTRAINT "FK_ac607027d537535d292b28f3854"
  FOREIGN KEY ("occurrenceId") REFERENCES stock_occurrences(id) ON DELETE RESTRICT;
ALTER TABLE stock_movements
  ADD CONSTRAINT "FK_060822dfc7623d639b8c187bdda"
  FOREIGN KEY ("purchaseOrderItemId") REFERENCES purchase_order_items(id) ON DELETE RESTRICT;
ALTER TABLE purchase_cost_history
  ADD CONSTRAINT "FK_54f778f185d6a7cec057169ce19"
  FOREIGN KEY ("purchaseOrderItemId") REFERENCES purchase_order_items(id) ON DELETE RESTRICT;
ALTER TABLE stock_occurrences
  ADD CONSTRAINT "FK_a803b54b23d2fb8c0fe7f5389f9"
  FOREIGN KEY ("reversesOccurrenceId") REFERENCES stock_occurrences(id) ON DELETE RESTRICT;
ALTER TABLE stock_occurrences
  ADD CONSTRAINT "FK_stock_occurrences_legacy_journal"
  FOREIGN KEY ("legacyJournalEntryId") REFERENCES journal_entry(id) ON DELETE RESTRICT;
ALTER TABLE stock_batch_consumptions
  ADD CONSTRAINT "FK_7a90005ab332be99fb12c7d6c84"
  FOREIGN KEY ("movementId") REFERENCES stock_movements(id) ON DELETE RESTRICT;
ALTER TABLE stock_batch_consumptions
  ADD CONSTRAINT "FK_51f795684690dbcdee919a915f2"
  FOREIGN KEY ("batchId") REFERENCES purchase_cost_history(id) ON DELETE RESTRICT;
CREATE FUNCTION pg_temp.noop_gap_trigger() RETURNS trigger LANGUAGE plpgsql AS $$ BEGIN RETURN NEW; END $$;
CREATE TRIGGER "trg_stock_movement_valuation_gap_immutable"
  BEFORE UPDATE OR DELETE ON stock_movement_valuation_gaps
  FOR EACH ROW EXECUTE FUNCTION pg_temp.noop_gap_trigger();
CREATE CONSTRAINT TRIGGER "trg_stock_occurrence_valuation_gap_consistency"
  AFTER INSERT OR UPDATE ON stock_occurrences DEFERRABLE INITIALLY DEFERRED
  FOR EACH ROW EXECUTE FUNCTION pg_temp.noop_gap_trigger();
CREATE CONSTRAINT TRIGGER "trg_stock_movement_valuation_gap_consistency"
  AFTER INSERT ON stock_movement_valuation_gaps DEFERRABLE INITIALLY DEFERRED
  FOR EACH ROW EXECUTE FUNCTION pg_temp.noop_gap_trigger();

CREATE UNIQUE INDEX "UQ_stock_occurrence_reverses"
  ON stock_occurrences ("reversesOccurrenceId") WHERE "reversesOccurrenceId" IS NOT NULL;
CREATE UNIQUE INDEX "UQ_stock_movement_reverses"
  ON stock_movements ("reversesMovementId") WHERE "reversesMovementId" IS NOT NULL;
CREATE UNIQUE INDEX "UQ_stock_movement_product_sequence"
  ON stock_movements ("productId", "productSequence") WHERE "productSequence" IS NOT NULL;
CREATE UNIQUE INDEX "UQ_stock_movement_occurrence_item"
  ON stock_movements ("occurrenceId", "purchaseOrderItemId")
  WHERE "occurrenceId" IS NOT NULL AND "purchaseOrderItemId" IS NOT NULL;
CREATE UNIQUE INDEX "UQ_purchase_cost_history_occurrence_item"
  ON purchase_cost_history ("occurrenceId", "purchaseOrderItemId")
  WHERE "occurrenceId" IS NOT NULL AND "purchaseOrderItemId" IS NOT NULL;

INSERT INTO products VALUES ('00000000-0000-4000-8000-000000000001', 'Gap exposure product');
INSERT INTO purchase_order_items VALUES ('00000000-0000-4000-8000-000000000008');
INSERT INTO stock_occurrences
  (id, kind, "reversesOccurrenceId", "documentType", "documentId", "isLegacy", "legacyJournalEntryId", "hasValuationGap", reason)
VALUES
  ('00000000-0000-4000-8000-000000000002', 'receipt', NULL, 'purchase_order', '00000000-0000-4000-8000-000000000010', false, NULL, false, NULL),
  ('00000000-0000-4000-8000-000000000003', 'receipt_reversal', '00000000-0000-4000-8000-000000000002', 'purchase_order', '00000000-0000-4000-8000-000000000010', false, NULL, false, 'valid reason'),
  ('00000000-0000-4000-8000-000000000007', 'receipt', NULL, 'purchase_order', '00000000-0000-4000-8000-000000000010', false, NULL, false, NULL),
  ('00000000-0000-4000-8000-000000000009', 'fulfilment', NULL, 'sales_order', '00000000-0000-4000-8000-000000000015', false, NULL, true, NULL),
  ('00000000-0000-4000-8000-000000000010', 'fulfilment', NULL, 'sales_order', '00000000-0000-4000-8000-000000000016', false, NULL, true, NULL);
INSERT INTO stock_movements (id, "productId", "occurrenceId", "purchaseOrderItemId", "productSequence") VALUES
  ('00000000-0000-4000-8000-000000000004', '00000000-0000-4000-8000-000000000001',
   '00000000-0000-4000-8000-000000000002', '00000000-0000-4000-8000-000000000008', 1);
INSERT INTO purchase_cost_history
  (id, "productId", "purchaseOrderId", "occurrenceId", "purchaseOrderItemId", "reversedAt", "reversedByOccurrenceId")
VALUES
  ('00000000-0000-4000-8000-000000000005', '00000000-0000-4000-8000-000000000001',
   '00000000-0000-4000-8000-000000000010', '00000000-0000-4000-8000-000000000002', '00000000-0000-4000-8000-000000000008',
   now(), '00000000-0000-4000-8000-000000000003');
INSERT INTO stock_batch_consumptions VALUES
  ('00000000-0000-4000-8000-000000000006', '00000000-0000-4000-8000-000000000004',
    '00000000-0000-4000-8000-000000000005', 1);
INSERT INTO stock_movements
  (id, "productId", "movementType", quantity, "occurrenceId", "productSequence")
VALUES
  ('00000000-0000-4000-8000-000000000012', '00000000-0000-4000-8000-000000000001', 'sale', -8,
    '00000000-0000-4000-8000-000000000009', 2),
  ('00000000-0000-4000-8000-000000000013', '00000000-0000-4000-8000-000000000001', 'sale', -8,
    '00000000-0000-4000-8000-000000000010', 3);
INSERT INTO stock_batch_consumptions VALUES
  ('00000000-0000-4000-8000-000000000017', '00000000-0000-4000-8000-000000000013',
    '00000000-0000-4000-8000-000000000005', 5);
INSERT INTO stock_movement_valuation_gaps ("movementId", quantity) VALUES
  ('00000000-0000-4000-8000-000000000012', 8),
  ('00000000-0000-4000-8000-000000000013', 3);
