import { DataSource } from "typeorm";
import { CostingMethod } from "../../src/common/costing/supported-costing-methods";
import {
  toMinorUnits,
  formatMoney,
  formatScale4,
} from "../../src/common/utils/money";

export async function activateValuationForTest(
  ds: DataSource,
  opts: {
    method: CostingMethod;
    products: Array<{
      productId: string;
      quantity: string;
      value: string;
      layers?: Array<{ quantity: string; value: string }>;
    }>;
  },
): Promise<void> {
  await deactivateValuationForTest(ds);
  await ds.query(
    `UPDATE inventory_valuation_state SET status = 'active', "activatedAt" = now(), "pausedAt" = NULL WHERE id = true`,
  );
  for (const product of opts.products) {
    const quantity = toMinorUnits(product.quantity);
    const value = toMinorUnits(product.value);
    const layers =
      product.layers ??
      (opts.method === "FIFO" && quantity > 0n
        ? [{ quantity: product.quantity, value: product.value }]
        : []);
    if (opts.method === "FIFO") {
      const layerQty = layers.reduce(
        (sum, layer) => sum + toMinorUnits(layer.quantity),
        0n,
      );
      const layerValue = layers.reduce(
        (sum, layer) => sum + toMinorUnits(layer.value),
        0n,
      );
      if (layerQty !== quantity || layerValue !== value)
        throw new Error(
          `FIFO layers do not match product ${product.productId} position`,
        );
    }
    const [entry] = await ds.query(
      `INSERT INTO stock_valuation_entries ("productId", kind, method, quantity, value, "runningQuantity", "runningValue") VALUES ($1, 'cutover_opening', $2, $3, $4, $3, $4) RETURNING id`,
      [product.productId, opts.method, product.quantity, product.value],
    );
    await ds.query(
      `INSERT INTO product_valuation_balances ("productId", "quantityOnHand", "valueOnHand", method, "lastEntryId") VALUES ($1, $2, $3, $4, $5)`,
      [
        product.productId,
        product.quantity,
        product.value,
        opts.method,
        entry.id,
      ],
    );
    for (const layer of layers) {
      const layerQty = toMinorUnits(layer.quantity);
      const layerValue = toMinorUnits(layer.value);
      const unitValue =
        layerQty === 0n ? 0n : (layerValue * 10000n + layerQty / 2n) / layerQty;
      await ds.query(
        `INSERT INTO inventory_cost_layers ("productId", "sourceEntryId", quantity, "unitValue", "remainingQuantity", "remainingValue") VALUES ($1, $2, $3, $4, $3, $5)`,
        [
          product.productId,
          entry.id,
          layer.quantity,
          formatScale4(unitValue),
          formatMoney(layerValue),
        ],
      );
    }
  }
}

export async function deactivateValuationForTest(
  ds: DataSource,
): Promise<void> {
  await ds.query(
    `UPDATE inventory_valuation_state SET status = 'inactive', "activatedAt" = NULL, "pausedAt" = NULL WHERE id = true`,
  );
  await ds.query(
    `TRUNCATE TABLE inventory_layer_consumptions, inventory_cost_layers, stock_valuation_entries, product_valuation_balances`,
  );
}
