-- Isolated temporary catalog/data fixture for the postcheck script test.
-- The postcheck runs in the same psql session, so these tables shadow any
-- application tables and disappear automatically when the connection closes.
CREATE TEMP TABLE products (id uuid PRIMARY KEY);
CREATE TEMP TABLE purchase_order_items (id uuid PRIMARY KEY);
CREATE TEMP TABLE stock_occurrences (
  id uuid PRIMARY KEY,
  kind text NOT NULL,
  "reversesOccurrenceId" uuid,
  "documentType" text NOT NULL,
  "documentId" uuid NOT NULL,
  "isLegacy" boolean NOT NULL DEFAULT false,
  "legacyJournalEntryId" uuid
);
CREATE TEMP TABLE stock_movements (
  id uuid PRIMARY KEY,
  "productId" uuid NOT NULL,
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
  "batchId" uuid NOT NULL
);

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
ALTER TABLE stock_batch_consumptions
  ADD CONSTRAINT "FK_7a90005ab332be99fb12c7d6c84"
  FOREIGN KEY ("movementId") REFERENCES stock_movements(id) ON DELETE RESTRICT;
ALTER TABLE stock_batch_consumptions
  ADD CONSTRAINT "FK_51f795684690dbcdee919a915f2"
  FOREIGN KEY ("batchId") REFERENCES purchase_cost_history(id) ON DELETE RESTRICT;

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

INSERT INTO products VALUES ('00000000-0000-4000-8000-000000000001');
INSERT INTO purchase_order_items VALUES ('00000000-0000-4000-8000-000000000008');
INSERT INTO stock_occurrences VALUES
  ('00000000-0000-4000-8000-000000000002', 'receipt', NULL, 'purchase_order', '00000000-0000-4000-8000-000000000010', false, NULL),
  ('00000000-0000-4000-8000-000000000003', 'receipt_reversal', '00000000-0000-4000-8000-000000000002', 'purchase_order', '00000000-0000-4000-8000-000000000010', false, NULL),
  ('00000000-0000-4000-8000-000000000007', 'receipt', NULL, 'purchase_order', '00000000-0000-4000-8000-000000000010', false, NULL);
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
   '00000000-0000-4000-8000-000000000005');
