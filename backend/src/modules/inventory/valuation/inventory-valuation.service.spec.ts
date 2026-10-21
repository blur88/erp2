import { jest } from "@jest/globals";
import { EntityManager } from "typeorm";
import { InventoryValuationService } from "./inventory-valuation.service";
import { PendingValuation } from "./valuation.types";
import { StockValuationEntryKind } from "../../../database/entities/stock-valuation-entry.entity";

function pending(valueCents: bigint): PendingValuation {
  return {
    productId: "product-1",
    kind:
      valueCents >= 0n
        ? StockValuationEntryKind.RECEIPT
        : StockValuationEntryKind.ISSUE,
    method: "AVERAGE",
    quantityMinor: 10000n,
    valueCents,
    runningQuantityMinor: 10000n,
    runningValueCents: valueCents,
    layerDraws: [],
  };
}

describe("InventoryValuationService.commit", () => {
  let service: InventoryValuationService;
  let manager: Pick<EntityManager, "query">;
  let inventoryLines: Array<{ debit: string; credit: string }>;

  beforeEach(() => {
    inventoryLines = [];
    manager = {
      query: jest.fn(async (sql: string) => {
        if (sql.includes("accounting_settings"))
          return [{ inventoryAccountId: "inventory-account" }];
        if (sql.includes("journal_entry_line")) return inventoryLines;
        if (sql.includes("INSERT INTO stock_valuation_entries"))
          return [{ id: "entry-1" }];
        return [];
      }),
    } as unknown as Pick<EntityManager, "query">;
    service = new InventoryValuationService();
  });

  it("accepts posted debit and credit gross totals matching positive and negative valuation values", async () => {
    inventoryLines = [
      { debit: "500.00", credit: "0.00" },
      { debit: "0.00", credit: "200.00" },
    ];
    await expect(
      service.commit(
        manager as EntityManager,
        [pending(50000n), pending(-20000n)],
        ["move-1", "move-2"],
        "journal-1",
      ),
    ).resolves.toHaveLength(2);
  });

  it("rejects posted lines with debit and credit directions swapped", async () => {
    inventoryLines = [
      { debit: "200.00", credit: "0.00" },
      { debit: "0.00", credit: "500.00" },
    ];
    await expect(
      service.commit(
        manager as EntityManager,
        [pending(50000n), pending(-20000n)],
        ["move-1", "move-2"],
        "journal-1",
      ),
    ).rejects.toThrow(
      "Valuation does not match posting: debits 20000 vs 50000, credits 50000 vs 20000",
    );
  });

  it("rejects wrong gross totals even when their net is equal", async () => {
    inventoryLines = [
      { debit: "600.00", credit: "0.00" },
      { debit: "0.00", credit: "300.00" },
    ];
    await expect(
      service.commit(
        manager as EntityManager,
        [pending(50000n), pending(-20000n)],
        ["move-1", "move-2"],
        "journal-1",
      ),
    ).rejects.toThrow(
      "Valuation does not match posting: debits 60000 vs 50000, credits 30000 vs 20000",
    );
  });

  it("rejects a non-zero valuation when no journal is posted", async () => {
    await expect(
      service.commit(
        manager as EntityManager,
        [pending(50000n)],
        ["move-1"],
        null,
      ),
    ).rejects.toThrow("Valuation does not match posting");
  });
});
