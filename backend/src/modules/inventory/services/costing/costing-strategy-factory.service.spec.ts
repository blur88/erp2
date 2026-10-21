import { CostingStrategyFactory } from "./costing-strategy-factory.service";
import { AverageCostingStrategy } from "./average-costing-strategy.service";
import { FifoCostingStrategy } from "./fifo-costing-strategy.service";

describe("CostingStrategyFactory", () => {
  it("rejects an unsupported stored costing method instead of falling back", async () => {
    const average = {} as AverageCostingStrategy;
    const fifo = {} as FifoCostingStrategy;
    const factory = new CostingStrategyFactory(
      { findOne: async () => ({ costingMethod: "LIFO" }) } as any,
      average,
      fifo,
    );

    await expect(factory.getActiveStrategy()).rejects.toThrow(
      /unsupported costing method "LIFO"/i,
    );
  });
});
