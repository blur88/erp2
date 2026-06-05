import { Test, TestingModule } from "@nestjs/testing";
import { getRepositoryToken } from "@nestjs/typeorm";
import { InventoryIntegrationService } from "./inventory-integration.service";
import { Product } from "../../../database/entities/product.entity";
import { StockMovement } from "../../../database/entities/stock-movement.entity";
import { SalesOrder } from "../../../database/entities/sales-order.entity";
import { SalesOrderItem } from "../../../database/entities/sales-order-item.entity";
import { BaseCostCalculatorService } from "../../inventory/services/base-cost-calculator.service";
import { SettingsService } from "../../settings/settings.service";

describe("InventoryIntegrationService", () => {
  let service: InventoryIntegrationService;
  let baseCostCalculator: { reduceStock: jest.Mock; restoreStock: jest.Mock };

  beforeEach(async () => {
    baseCostCalculator = { reduceStock: jest.fn(), restoreStock: jest.fn() };
    const module: TestingModule = await Test.createTestingModule({
      providers: [
        InventoryIntegrationService,
        {
          provide: getRepositoryToken(Product),
          useValue: { findOne: jest.fn(), save: jest.fn() },
        },
        {
          provide: getRepositoryToken(StockMovement),
          useValue: { create: jest.fn((d) => d), save: jest.fn() },
        },
        { provide: getRepositoryToken(SalesOrder), useValue: {} },
        { provide: getRepositoryToken(SalesOrderItem), useValue: {} },
        { provide: BaseCostCalculatorService, useValue: baseCostCalculator },
        { provide: SettingsService, useValue: {} },
      ],
    }).compile();
    service = module.get(InventoryIntegrationService);
  });

  it("adjustStock uses the supplied manager and lets reduceStock errors propagate (no swallow)", async () => {
    const product = { id: "p1", stockQuantity: 10 };
    const findOne = jest.fn().mockResolvedValue(product);
    const save = jest.fn().mockResolvedValue(product);
    const movementSave = jest.fn().mockResolvedValue({ id: "m1" });
    const manager = {
      getRepository: jest
        .fn()
        .mockImplementation((entity) =>
          entity === StockMovement
            ? { create: jest.fn((d) => d), save: movementSave }
            : { findOne, save },
        ),
    } as any;
    baseCostCalculator.reduceStock.mockRejectedValue(new Error("cost failure"));

    await expect(
      service.adjustStock(
        "p1",
        -2,
        "Sales order fulfillment: SO-1",
        "order-1",
        "user-1",
        undefined,
        manager,
      ),
    ).rejects.toThrow("cost failure");
    expect(findOne).toHaveBeenCalled();
  });
});
