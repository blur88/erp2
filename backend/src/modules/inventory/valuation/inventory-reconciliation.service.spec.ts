import { DataSource } from "typeorm";
import { jest } from "@jest/globals";
import { InventoryReconciliationService } from "./inventory-reconciliation.service";

describe("InventoryReconciliationService", () => {
  it("returns accepted-without-evidence rows separately from readiness conditions", async () => {
    const manager = { query: jest.fn() };
    const ds = { manager } as unknown as DataSource;
    const service = new InventoryReconciliationService(ds);
    const record = {
      id: "reconciliation-id",
      acceptedWithoutEvidence: [
        {
          productId: "product-id",
          batchId: "batch-id",
          note: "reviewed exception",
        },
      ],
    };
    jest.spyOn(service, "findOne").mockResolvedValue(record as any);
    jest
      .spyOn(service as any, "evaluate")
      .mockResolvedValue([
        { condition: "costs are reviewed", ok: true, details: [] },
      ]);

    await expect(service.readiness(record.id)).resolves.toEqual({
      conditions: [{ condition: "costs are reviewed", ok: true, details: [] }],
      acceptedWithoutEvidence: record.acceptedWithoutEvidence,
    });
  });
});
