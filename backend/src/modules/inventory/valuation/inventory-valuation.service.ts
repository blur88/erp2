import { ConflictException, Injectable } from "@nestjs/common";
import { EntityManager } from "typeorm";
import {
  toMinorUnits,
  formatScale4,
  formatMoney,
} from "../../../common/utils/money";
import { CostingMethod } from "../../../common/costing/supported-costing-methods";
import { RegionalSettings } from "../../../database/entities/regional-settings.entity";
import {
  InventoryValuationState,
  InventoryValuationStatus,
} from "../../../database/entities/inventory-valuation-state.entity";
import { ProductValuationBalance } from "../../../database/entities/product-valuation-balance.entity";
import { InventoryCostLayer } from "../../../database/entities/inventory-cost-layer.entity";
import { InventoryLayerConsumption } from "../../../database/entities/inventory-layer-consumption.entity";
import {
  StockValuationEntry,
  StockValuationEntryKind,
} from "../../../database/entities/stock-valuation-entry.entity";
import {
  averageDecrease,
  fifoConsume,
  unitValueScale4,
  allocateCentsByWeight,
} from "./valuation-math";
import { PendingValuation } from "./valuation.types";

const centsFromDb = (value: string): bigint => toMinorUnits(value) / 100n;
const qtyFromDb = (value: string): bigint => toMinorUnits(value);
const formatQty = (value: bigint): string => formatScale4(value);
const formatCents = (value: bigint): string => formatMoney(value * 100n);
const abs = (value: bigint): bigint => (value < 0n ? -value : value);
const roundRatio = (n: bigint, d: bigint): bigint => (n * 2n + d) / (2n * d);

@Injectable()
export class InventoryValuationService {
  async isActive(manager: EntityManager): Promise<boolean> {
    const state = await manager.findOne(InventoryValuationState, {
      where: { id: true },
    });
    return state?.status === InventoryValuationStatus.ACTIVE;
  }

  async entryForMovement(
    manager: EntityManager,
    movementId: string,
  ): Promise<StockValuationEntry | null> {
    return manager.findOne(StockValuationEntry, { where: { movementId } });
  }

  async currentMethod(
    manager: EntityManager,
    productId?: string,
  ): Promise<CostingMethod> {
    if (productId && (await this.isActive(manager))) {
      const balance = await manager.findOne(ProductValuationBalance, {
        where: { productId },
      });
      if (balance) return balance.method;
    }
    const settings = await manager.findOne(RegionalSettings, {
      where: { isActive: true },
    });
    return (settings?.costingMethod ?? "AVERAGE") as CostingMethod;
  }

  async ensureBalance(
    manager: EntityManager,
    productId: string,
  ): Promise<void> {
    if (!(await this.isActive(manager))) return;
    const method = await this.currentMethod(manager);
    await manager.query(
      `INSERT INTO product_valuation_balances ("productId", "quantityOnHand", "valueOnHand", method, "lastEntryId") VALUES ($1, 0, 0, $2, NULL) ON CONFLICT ("productId") DO NOTHING`,
      [productId, method],
    );
  }

  async valueDecrease(
    manager: EntityManager,
    productId: string,
    quantityMinor: bigint,
    kind: StockValuationEntryKind.ISSUE,
  ): Promise<PendingValuation> {
    const method = await this.currentMethod(manager, productId);
    const layers =
      method === "FIFO"
        ? await manager.query(
            `SELECT id, "remainingQuantity", "remainingValue" FROM inventory_cost_layers WHERE "productId" = $1 AND "remainingQuantity" > 0 ORDER BY "createdAt", id FOR UPDATE`,
            [productId],
          )
        : [];
    const rows = await manager.query(
      `SELECT "quantityOnHand", "valueOnHand", method FROM product_valuation_balances WHERE "productId" = $1 FOR UPDATE`,
      [productId],
    );
    const balance = rows[0];
    if (!balance)
      throw new Error(`Missing valuation balance for product ${productId}`);
    const quantity = qtyFromDb(balance.quantityOnHand);
    const value = centsFromDb(balance.valueOnHand);
    let valueDecrease: bigint;
    let layerDraws: PendingValuation["layerDraws"] = [];
    if (method === "FIFO") {
      const consumed = fifoConsume(
        layers.map((layer: any) => ({
          id: layer.id,
          remainingQty: qtyFromDb(layer.remainingQuantity),
          remainingValue: centsFromDb(layer.remainingValue),
        })),
        quantityMinor,
      );
      valueDecrease = consumed.value;
      layerDraws = consumed.draws;
      for (const draw of consumed.draws)
        await manager.query(
          `UPDATE inventory_cost_layers SET "remainingQuantity" = "remainingQuantity" - $2::numeric, "remainingValue" = "remainingValue" - $3::numeric WHERE id = $1`,
          [draw.layerId, formatQty(draw.qty), formatCents(draw.value)],
        );
    } else
      valueDecrease = averageDecrease(
        { qty: quantity, value },
        quantityMinor,
      ).value;
    const runningQuantityMinor = quantity - quantityMinor;
    const runningValueCents = value - valueDecrease;
    await manager.query(
      `UPDATE product_valuation_balances SET "quantityOnHand" = $2, "valueOnHand" = $3 WHERE "productId" = $1`,
      [
        productId,
        formatQty(runningQuantityMinor),
        formatCents(runningValueCents),
      ],
    );
    return {
      productId,
      kind,
      method,
      quantityMinor: -quantityMinor,
      valueCents: -valueDecrease,
      runningQuantityMinor,
      runningValueCents,
      layerDraws,
    };
  }

  async valueIncrease(
    manager: EntityManager,
    productId: string,
    quantityMinor: bigint,
    valueCents: bigint,
    kind:
      | StockValuationEntryKind.RECEIPT
      | StockValuationEntryKind.FOUND
      | StockValuationEntryKind.OPENING,
    extras: {
      defaultUnitValueScale4?: bigint | null;
      explanation?: string | null;
    } = {},
  ): Promise<PendingValuation> {
    if (quantityMinor <= 0n || valueCents < 0n)
      throw new Error(
        "valueIncrease requires positive quantity and non-negative value",
      );
    const method = await this.currentMethod(manager, productId);
    const rows = await manager.query(
      `SELECT "quantityOnHand", "valueOnHand" FROM product_valuation_balances WHERE "productId" = $1 FOR UPDATE`,
      [productId],
    );
    const balance = rows[0];
    if (!balance)
      throw new Error(`Missing valuation balance for product ${productId}`);
    const qty = qtyFromDb(balance.quantityOnHand);
    const value = centsFromDb(balance.valueOnHand);
    const runningQuantityMinor = qty + quantityMinor;
    const runningValueCents = value + valueCents;
    const openLayer =
      method === "FIFO"
        ? {
            qty: quantityMinor,
            unitValueScale4: unitValueScale4(quantityMinor, valueCents) ?? 0n,
            value: valueCents,
          }
        : undefined;
    if (method === "FIFO") {
      // The layer is linked to its immutable entry by commit; defer creation.
    }
    await manager.query(
      `UPDATE product_valuation_balances SET "quantityOnHand" = $2, "valueOnHand" = $3 WHERE "productId" = $1`,
      [
        productId,
        formatQty(runningQuantityMinor),
        formatCents(runningValueCents),
      ],
    );
    return {
      productId,
      kind,
      method,
      quantityMinor,
      valueCents,
      runningQuantityMinor,
      runningValueCents,
      layerDraws: [],
      openLayer,
      ...extras,
    };
  }

  async valueDecreaseReversal(
    manager: EntityManager,
    original: StockValuationEntry,
  ): Promise<PendingValuation> {
    const quantity = abs(qtyFromDb(original.quantity));
    const value = abs(centsFromDb(original.value));
    const method = await this.currentMethod(manager, original.productId);
    const rows = await manager.query(
      `SELECT "quantityOnHand", "valueOnHand" FROM product_valuation_balances WHERE "productId" = $1 FOR UPDATE`,
      [original.productId],
    );
    if (!rows[0])
      throw new Error(
        `Missing valuation balance for product ${original.productId}`,
      );
    const runningQuantityMinor = qtyFromDb(rows[0].quantityOnHand) + quantity;
    const runningValueCents = centsFromDb(rows[0].valueOnHand) + value;
    await manager.query(
      `UPDATE product_valuation_balances SET "quantityOnHand" = $2, "valueOnHand" = $3 WHERE "productId" = $1`,
      [
        original.productId,
        formatQty(runningQuantityMinor),
        formatCents(runningValueCents),
      ],
    );
    const openLayer =
      method === "FIFO"
        ? {
            qty: quantity,
            unitValueScale4: unitValueScale4(quantity, value) ?? 0n,
            value,
          }
        : undefined;
    return {
      productId: original.productId,
      kind: StockValuationEntryKind.DECREASE_REVERSAL,
      method,
      quantityMinor: quantity,
      valueCents: value,
      runningQuantityMinor,
      runningValueCents,
      layerDraws: [],
      openLayer,
      reversesEntryId: original.id || undefined,
    };
  }

  async valueIncreaseReversal(
    manager: EntityManager,
    original: StockValuationEntry,
  ): Promise<PendingValuation> {
    await this.assertIncreaseReversible(manager, original);
    const method = await this.currentMethod(manager, original.productId);
    const quantity = abs(qtyFromDb(original.quantity));
    const value = abs(centsFromDb(original.value));
    const rows = await manager.query(
      `SELECT "quantityOnHand", "valueOnHand" FROM product_valuation_balances WHERE "productId" = $1 FOR UPDATE`,
      [original.productId],
    );
    if (!rows[0])
      throw new Error(
        `Missing valuation balance for product ${original.productId}`,
      );
    const runningQuantityMinor = qtyFromDb(rows[0].quantityOnHand) - quantity;
    const runningValueCents = centsFromDb(rows[0].valueOnHand) - value;
    let closeLayerId: string | undefined;
    if (method === "FIFO") {
      const [layer] = await manager.query(
        `SELECT id FROM inventory_cost_layers WHERE "productId" = $1 AND "sourceEntryId" = $2 AND "remainingQuantity" > 0 FOR UPDATE`,
        [original.productId, original.id],
      );
      if (!layer)
        throw new ConflictException(
          "The receipt layer has been consumed and cannot be reversed automatically. Record a stock correction.",
        );
      closeLayerId = layer.id;
      await manager.query(
        `UPDATE inventory_cost_layers SET "remainingQuantity" = 0, "remainingValue" = 0 WHERE id = $1`,
        [layer.id],
      );
    }
    await manager.query(
      `UPDATE product_valuation_balances SET "quantityOnHand" = $2, "valueOnHand" = $3 WHERE "productId" = $1`,
      [
        original.productId,
        formatQty(runningQuantityMinor),
        formatCents(runningValueCents),
      ],
    );
    return {
      productId: original.productId,
      kind: StockValuationEntryKind.INCREASE_REVERSAL,
      method,
      quantityMinor: -quantity,
      valueCents: -value,
      runningQuantityMinor,
      runningValueCents,
      layerDraws: [],
      closeLayerId,
      reversesEntryId: original.id,
    };
  }

  async assertIncreaseReversible(
    manager: EntityManager,
    original: StockValuationEntry,
  ): Promise<void> {
    const later = await manager.query(
      `SELECT "createdAt" FROM stock_valuation_entries WHERE "productId" = $1 AND kind = 'method_change' AND "createdAt" > $2 ORDER BY "createdAt" LIMIT 1`,
      [original.productId, original.createdAt],
    );
    if (later[0]) {
      const date = new Date(later[0].createdAt).toISOString().slice(0, 10);
      throw new ConflictException(
        `This receipt was valued before the costing method changed on ${date}; it cannot be reversed automatically. Record a stock correction.`,
      );
    }
    if (original.method === "FIFO") {
      const [layer] = await manager.query(
        `SELECT "remainingQuantity", quantity FROM inventory_cost_layers WHERE "productId" = $1 AND "sourceEntryId" = $2`,
        [original.productId, original.id],
      );
      if (
        !layer ||
        qtyFromDb(layer.remainingQuantity) !== qtyFromDb(layer.quantity)
      )
        throw new ConflictException(
          "The receipt layer has been consumed and cannot be reversed automatically. Record a stock correction.",
        );
    }
  }

  async findEntryForMovement(
    manager: EntityManager,
    movementId: string,
  ): Promise<StockValuationEntry | null> {
    return manager.findOne(StockValuationEntry, { where: { movementId } });
  }

  async commit(
    manager: EntityManager,
    pendings: PendingValuation[],
    movementIds: string[],
    journalEntryId: string | null,
    actorUserId?: string,
  ): Promise<StockValuationEntry[]> {
    const entries: StockValuationEntry[] = [];
    for (let index = 0; index < pendings.length; index += 1) {
      const p = pendings[index];
      const result = await manager.query(
        `INSERT INTO stock_valuation_entries ("productId", "movementId", kind, method, quantity, value, "runningQuantity", "runningValue", "journalEntryId", "reversesEntryId", "defaultUnitValue", explanation, "actorUserId") VALUES ($1,$2,$3,$4,$5,$6,$7,$8,$9,$10,$11,$12,$13) RETURNING *`,
        [
          p.productId,
          movementIds[index] ?? null,
          p.kind,
          p.method,
          formatQty(p.quantityMinor),
          formatCents(p.valueCents),
          formatQty(p.runningQuantityMinor),
          formatCents(p.runningValueCents),
          journalEntryId,
          p.reversesEntryId ?? null,
          p.defaultUnitValueScale4 == null
            ? null
            : formatQty(p.defaultUnitValueScale4),
          p.explanation ?? null,
          actorUserId ?? null,
        ],
      );
      const entry = result[0] as StockValuationEntry;
      entries.push(entry);
      for (const draw of p.layerDraws)
        await manager.query(
          `INSERT INTO inventory_layer_consumptions ("layerId", "entryId", quantity, value) VALUES ($1,$2,$3,$4)`,
          [
            draw.layerId,
            entry.id,
            formatQty(draw.qty),
            formatCents(draw.value),
          ],
        );
      if (p.openLayer)
        await manager.query(
          `INSERT INTO inventory_cost_layers ("productId", "sourceEntryId", quantity, "unitValue", "remainingQuantity", "remainingValue") VALUES ($1,$2,$3,$4,$3,$5)`,
          [
            p.productId,
            entry.id,
            formatQty(p.openLayer.qty),
            formatQty(p.openLayer.unitValueScale4),
            formatCents(p.openLayer.value),
          ],
        );
      if (p.closeLayerId)
        await manager.query(
          `UPDATE inventory_cost_layers SET "remainingQuantity" = 0, "remainingValue" = 0 WHERE id = $1`,
          [p.closeLayerId],
        );
      await manager.query(
        `UPDATE product_valuation_balances SET "lastEntryId" = $2 WHERE "productId" = $1`,
        [p.productId, entry.id],
      );
    }
    if (journalEntryId) {
      const settings = await manager.query(
        `SELECT "inventoryAccountId" FROM accounting_settings LIMIT 1`,
      );
      const inventoryAccountId = settings[0]?.inventoryAccountId;
      const lines = inventoryAccountId
        ? await manager.query(
            `SELECT debit, credit FROM journal_entry_line WHERE "entryId" = $1 AND "accountId" = $2`,
            [journalEntryId, inventoryAccountId],
          )
        : [];
      const actualDebit = lines.reduce(
        (sum: bigint, line: any) => sum + centsFromDb(line.debit),
        0n,
      );
      const actualCredit = lines.reduce(
        (sum: bigint, line: any) => sum + centsFromDb(line.credit),
        0n,
      );
      const expectedDebit = pendings.reduce(
        (sum, p) => sum + (p.valueCents > 0n ? p.valueCents : 0n),
        0n,
      );
      const expectedCredit = pendings.reduce(
        (sum, p) => sum + (p.valueCents < 0n ? -p.valueCents : 0n),
        0n,
      );
      if (actualDebit !== expectedDebit || actualCredit !== expectedCredit)
        throw new Error(
          `Valuation does not match posting: debits ${actualDebit} vs ${expectedDebit}, credits ${actualCredit} vs ${expectedCredit}`,
        );
    } else if (pendings.some((p) => p.valueCents !== 0n))
      throw new Error(
        "Valuation does not match posting: no journal for non-zero valuation",
      );
    return entries;
  }
}
