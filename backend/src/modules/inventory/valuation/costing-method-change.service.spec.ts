import { jest } from "@jest/globals";
import { CostingMethodChangeService } from "./costing-method-change.service";

function makeService(latestMovementDate: string | null = "2026-10-20") {
  const query = jest.fn(async (sql: string) => {
    if (sql.includes('SELECT "costingMethod"'))
      return [{ costingMethod: "AVERAGE" }];
    if (sql.includes("AS today")) return [{ today: "2026-10-22" }];
    if (sql.includes('MAX("movementDate")'))
      return [{ day: latestMovementDate }];
    return [];
  });
  const manager = { query } as any;
  const dataSource = {
    transaction: async (callback: (manager: any) => unknown) =>
      callback(manager),
  } as any;
  return { service: new CostingMethodChangeService(dataSource), query };
}

describe("CostingMethodChangeService.propose", () => {
  it("refuses a proposal for the already-selected method before inserting", async () => {
    const { service, query } = makeService();

    await expect(
      service.propose(
        { toMethod: "AVERAGE", effectiveDate: "2026-10-22", explanation: "same" },
        { userId: "preparer" },
      ),
    ).rejects.toThrow("The proposed costing method must differ from the current method.");
    expect(query.mock.calls.some(([sql]) => sql.includes("INSERT INTO costing_method_changes"))).toBe(false);
  });

  it("refuses an effective date before today before inserting", async () => {
    const { service, query } = makeService();

    await expect(
      service.propose(
        { toMethod: "FIFO", effectiveDate: "2026-10-21", explanation: "past" },
        { userId: "preparer" },
      ),
    ).rejects.toThrow("The effective date cannot be before today.");
    expect(query.mock.calls.some(([sql]) => sql.includes("INSERT INTO costing_method_changes"))).toBe(false);
  });

  it("refuses an effective date before the latest movement before inserting", async () => {
    const { service, query } = makeService("2026-10-23");

    await expect(
      service.propose(
        { toMethod: "FIFO", effectiveDate: "2026-10-22", explanation: "before movement" },
        { userId: "preparer" },
      ),
    ).rejects.toThrow("The effective date cannot be before the latest stock movement.");
    expect(query.mock.calls.some(([sql]) => sql.includes("INSERT INTO costing_method_changes"))).toBe(false);
  });
});
