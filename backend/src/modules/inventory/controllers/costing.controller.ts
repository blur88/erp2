import { Controller, Post, Get, Param, Logger } from "@nestjs/common";
import { ApiTags, ApiOperation, ApiResponse, ApiParam } from "@nestjs/swagger";
import { CostingRecalculationService } from "../services/costing-recalculation.service";
import { CostingStrategyFactory } from "../services/costing/costing-strategy-factory.service";

@ApiTags("Inventory - Costing")
@Controller("inventory/costing")
export class CostingController {
  private readonly logger = new Logger(CostingController.name);

  constructor(
    private costingRecalculationService: CostingRecalculationService,
    private costingStrategyFactory: CostingStrategyFactory,
  ) {}

  @Get("method")
  @ApiOperation({
    summary: "Get current costing method",
    description:
      "Returns the currently configured costing method (AVERAGE, FIFO, LIFO, STANDARD)",
  })
  @ApiResponse({
    status: 200,
    description: "Current costing method retrieved",
    schema: {
      example: {
        costingMethod: "AVERAGE",
        availableMethods: ["AVERAGE", "FIFO", "LIFO", "STANDARD"],
      },
    },
  })
  async getCurrentMethod() {
    const costingMethod =
      await this.costingStrategyFactory.getCurrentCostingMethod();
    const availableMethods = this.costingStrategyFactory.getAvailableMethods();

    return {
      costingMethod,
      availableMethods,
    };
  }

  @Post("recalculate")
  @ApiOperation({
    summary: "Recalculate all product costs",
    description:
      "Recalculates base costs for all products using the current costing method. " +
      "Run this after changing the costing method in settings.",
  })
  @ApiResponse({
    status: 200,
    description: "Cost recalculation completed",
    schema: {
      example: {
        totalProducts: 10,
        updated: 10,
        errors: 0,
        costingMethod: "FIFO",
        results: [
          {
            productId: "123-456",
            productName: "Product A",
            oldCost: 14.0061,
            newCost: 14.5,
            success: true,
          },
        ],
      },
    },
  })
  async recalculateAllCosts() {
    this.logger.log("Starting cost recalculation for all products");
    const result =
      await this.costingRecalculationService.recalculateAllProductCosts();
    this.logger.log(
      `Cost recalculation completed: ${result.updated} updated, ${result.errors} errors`,
    );
    return result;
  }

  @Post("recalculate/:id")
  @ApiOperation({
    summary: "Recalculate single product cost",
    description:
      "Recalculates base cost for a specific product using the current costing method",
  })
  @ApiParam({
    name: "id",
    description: "Product ID",
    example: "85294f77-4e65-4c4d-9c48-173ed37712cb",
  })
  @ApiResponse({
    status: 200,
    description: "Product cost recalculated",
    schema: {
      example: {
        productId: "85294f77-4e65-4c4d-9c48-173ed37712cb",
        productName: "Product A",
        oldCost: 14.0061,
        newCost: 14.5,
        costingMethod: "FIFO",
      },
    },
  })
  async recalculateProductCost(@Param("id") productId: string) {
    this.logger.log(`Recalculating cost for product ${productId}`);
    return await this.costingRecalculationService.recalculateProductCost(
      productId,
    );
  }
}
