import { Test, TestingModule } from "@nestjs/testing";
import { getRepositoryToken } from "@nestjs/typeorm";
import { BaseCostCalculatorService } from "./base-cost-calculator.service";
import { Product } from "../../../database/entities/product.entity";
import { PurchaseCostHistory } from "../../../database/entities/purchase-cost-history.entity";
import { CostingStrategyFactory } from "./costing/costing-strategy-factory.service";

describe("BaseCostCalculatorService", () => {
  let service: BaseCostCalculatorService;

  beforeEach(async () => {
    const module: TestingModule = await Test.createTestingModule({
      providers: [
        BaseCostCalculatorService,
        {
          provide: getRepositoryToken(Product),
          useValue: { findOne: jest.fn(), update: jest.fn() },
        },
        {
          provide: getRepositoryToken(PurchaseCostHistory),
          useValue: { find: jest.fn(), update: jest.fn() },
        },
        {
          provide: CostingStrategyFactory,
          useValue: {
            getActiveStrategy: jest
              .fn()
              .mockResolvedValue({
                determineBatchReduction: jest.fn().mockReturnValue([]),
                calculateBaseCost: jest.fn().mockResolvedValue(0),
              }),
            getCurrentCostingMethod: jest.fn().mockResolvedValue("FIFO"),
          },
        },
      ],
    }).compile();
    service = module.get(BaseCostCalculatorService);
  });

  it("reduceStock reads cost-history batches through the supplied manager", async () => {
    const find = jest.fn().mockResolvedValue([]); // empty → early return after find
    const manager = {
      getRepository: jest.fn().mockReturnValue({ find, update: jest.fn() }),
    } as any;

    await service.reduceStock("product-1", 5, manager);

    expect(manager.getRepository).toHaveBeenCalled();
    expect(find).toHaveBeenCalled();
  });
});
