import { Controller, Get, Query, Res } from "@nestjs/common";
import { Response } from "express";
import { ApiTags, ApiOperation, ApiQuery, ApiResponse } from "@nestjs/swagger";
import { InventoryAnalyticsService } from "../services/inventory-analytics.service";
import { ExportService } from "../../../common/services/export.service";
import {
  normalizeIds,
  sendExcel,
} from "../../../common/utils/export-controller.util";
import {
  InventoryAnalyticsQueryDto,
  InventoryAnalyticsResponseDto,
} from "../dto/inventory-analytics.dto";

@ApiTags("Inventory Analytics")
@Controller("inventory/analytics")
export class InventoryAnalyticsController {
  constructor(
    private readonly inventoryAnalyticsService: InventoryAnalyticsService,
    private readonly exportService: ExportService,
  ) {}

  @Get("dashboard")
  @ApiOperation({
    summary: "Get inventory analytics for the overview dashboard",
  })
  @ApiResponse({ status: 200, type: InventoryAnalyticsResponseDto })
  async getDashboardAnalytics(
    @Query() query: InventoryAnalyticsQueryDto,
  ): Promise<InventoryAnalyticsResponseDto> {
    return this.inventoryAnalyticsService.getInventoryDashboardAnalytics(query);
  }

  @Get("inventory-summary")
  @ApiOperation({
    summary:
      "Get inventory summary report - shows product-level inventory data with values and profit potential",
  })
  @ApiQuery({
    name: "productIds",
    required: false,
    type: [String],
    description: "Filter by product IDs",
  })
  @ApiQuery({
    name: "categoryId",
    required: false,
    description: "Filter by category ID",
  })
  @ApiQuery({
    name: "priceListId",
    required: false,
    description: "Price list ID to use for unit price calculation",
  })
  @ApiResponse({
    status: 200,
    description: "Inventory summary report retrieved successfully",
  })
  async getInventorySummary(
    @Query("productIds") productIds?: string | string[],
    @Query("categoryId") categoryId?: string,
    @Query("priceListId") priceListId?: string,
  ) {
    return this.inventoryAnalyticsService.getInventorySummary({
      productIds: Array.isArray(productIds)
        ? productIds
        : productIds
          ? [productIds]
          : undefined,
      categoryId,
      priceListId,
    });
  }

  @Get("historical-inventory")
  @ApiOperation({
    summary:
      "Get historical inventory report - shows aggregated inventory by product based on stock movements",
  })
  @ApiQuery({
    name: "productIds",
    required: false,
    type: [String],
    description: "Filter by product IDs",
  })
  @ApiQuery({
    name: "categoryId",
    required: false,
    description: "Filter by category ID",
  })
  @ApiQuery({
    name: "startDate",
    required: false,
    type: String,
    description: "Start date for filtering (ISO 8601 format)",
  })
  @ApiQuery({
    name: "endDate",
    required: false,
    type: String,
    description: "End date for filtering (ISO 8601 format)",
  })
  @ApiResponse({
    status: 200,
    description: "Historical inventory report retrieved successfully",
  })
  async getHistoricalInventory(
    @Query("productIds") productIds?: string | string[],
    @Query("categoryId") categoryId?: string,
    @Query("startDate") startDate?: string,
    @Query("endDate") endDate?: string,
  ) {
    return this.inventoryAnalyticsService.getHistoricalInventory({
      productIds: Array.isArray(productIds)
        ? productIds
        : productIds
          ? [productIds]
          : undefined,
      categoryId,
      startDate: startDate ? new Date(startDate) : undefined,
      endDate: endDate ? new Date(endDate) : undefined,
    });
  }

  @Get("movement-summary")
  @ApiOperation({
    summary:
      "Get inventory movement summary - shows quantity in, out, and on hand by product",
  })
  @ApiQuery({
    name: "productIds",
    required: false,
    type: [String],
    description: "Filter by product IDs",
  })
  @ApiQuery({
    name: "categoryId",
    required: false,
    description: "Filter by category ID",
  })
  @ApiQuery({
    name: "startDate",
    required: false,
    type: String,
    description: "Start date for filtering movements (ISO 8601 format)",
  })
  @ApiQuery({
    name: "endDate",
    required: false,
    type: String,
    description: "End date for filtering movements (ISO 8601 format)",
  })
  @ApiResponse({
    status: 200,
    description: "Movement summary report retrieved successfully",
  })
  async getMovementSummary(
    @Query("productIds") productIds?: string | string[],
    @Query("categoryId") categoryId?: string,
    @Query("startDate") startDate?: string,
    @Query("endDate") endDate?: string,
  ) {
    return this.inventoryAnalyticsService.getMovementSummary({
      productIds: Array.isArray(productIds)
        ? productIds
        : productIds
          ? [productIds]
          : undefined,
      categoryId,
      startDate: startDate ? new Date(startDate) : undefined,
      endDate: endDate ? new Date(endDate) : undefined,
    });
  }

  @Get("price-list")
  @ApiOperation({
    summary:
      "Get product price list report - shows products with prices, discounts, and sales costs",
  })
  @ApiQuery({
    name: "productIds",
    required: false,
    type: [String],
    description: "Filter by product IDs",
  })
  @ApiQuery({
    name: "categoryId",
    required: false,
    description: "Filter by category ID",
  })
  @ApiQuery({
    name: "priceListId",
    required: false,
    type: String,
    description:
      "Price list ID to use for pricing (uses default if not specified)",
  })
  @ApiQuery({
    name: "discountPercent",
    required: false,
    type: Number,
    description: "Discount percentage to apply (0-100)",
  })
  @ApiResponse({
    status: 200,
    description: "Price list report retrieved successfully",
  })
  async getPriceList(
    @Query("productIds") productIds?: string | string[],
    @Query("categoryId") categoryId?: string,
    @Query("priceListId") priceListId?: string,
    @Query("discountPercent") discountPercent?: string,
  ) {
    return this.inventoryAnalyticsService.getPriceList({
      productIds: Array.isArray(productIds)
        ? productIds
        : productIds
          ? [productIds]
          : undefined,
      categoryId,
      priceListId,
      discountPercent: discountPercent
        ? parseFloat(discountPercent)
        : undefined,
    });
  }

  @Get("product-cost")
  @ApiOperation({
    summary:
      "Get product cost report - shows cost changes based on stock movements with running average",
  })
  @ApiQuery({
    name: "productIds",
    required: false,
    type: [String],
    description: "Filter by product IDs",
  })
  @ApiQuery({
    name: "startDate",
    required: false,
    type: String,
    description: "Start date for filtering movements (ISO 8601 format)",
  })
  @ApiQuery({
    name: "endDate",
    required: false,
    type: String,
    description: "End date for filtering movements (ISO 8601 format)",
  })
  @ApiResponse({
    status: 200,
    description: "Product cost report retrieved successfully",
  })
  async getProductCost(
    @Query("productIds") productIds?: string | string[],
    @Query("startDate") startDate?: string,
    @Query("endDate") endDate?: string,
  ) {
    return this.inventoryAnalyticsService.getProductCost({
      productIds: Array.isArray(productIds)
        ? productIds
        : productIds
          ? [productIds]
          : undefined,
      startDate: startDate ? new Date(startDate) : undefined,
      endDate: endDate ? new Date(endDate) : undefined,
    });
  }

  @Get("inventory-summary/export")
  @ApiOperation({ summary: "Export inventory summary to Excel" })
  async exportInventorySummary(
    @Query("productIds") productIds: string | string[] | undefined,
    @Query("categoryId") categoryId: string | undefined,
    @Query("priceListId") priceListId: string | undefined,
    @Res() res: Response,
  ): Promise<void> {
    const { data } = await this.inventoryAnalyticsService.getInventorySummary({
      productIds: normalizeIds(productIds),
      categoryId,
      priceListId,
    });
    const columns = [
      {
        key: "categoryName",
        header: "Category",
        type: "string" as const,
        width: 20,
      },
      {
        key: "productName",
        header: "Product",
        type: "string" as const,
        width: 30,
      },
      { key: "type", header: "Type", type: "string" as const, width: 12 },
      {
        key: "stockQuantity",
        header: "Stock",
        type: "number" as const,
        width: 12,
      },
      {
        key: "baseCost",
        header: "Base Cost",
        type: "currency" as const,
        width: 15,
      },
      {
        key: "unitPrice",
        header: "Unit Price",
        type: "currency" as const,
        width: 15,
      },
      {
        key: "inventoryValue",
        header: "Inventory Value",
        type: "currency" as const,
        width: 18,
      },
      {
        key: "salesValue",
        header: "Sales Value",
        type: "currency" as const,
        width: 15,
      },
      {
        key: "potentialProfit",
        header: "Potential Profit",
        type: "currency" as const,
        width: 18,
      },
    ];
    const buffer = await this.exportService.exportGrouped(
      "Inventory Summary",
      columns,
      data as any[],
      {
        groupKey: "categoryName",
        groupLabel: "Category",
        subtotalColumns: [
          "stockQuantity",
          "inventoryValue",
          "salesValue",
          "potentialProfit",
        ],
      },
    );
    sendExcel(res, buffer, "inventory-summary");
  }

  @Get("historical-inventory/export")
  @ApiOperation({ summary: "Export historical inventory to Excel" })
  async exportHistoricalInventory(
    @Query("productIds") productIds: string | string[] | undefined,
    @Query("categoryId") categoryId: string | undefined,
    @Query("startDate") startDate: string | undefined,
    @Query("endDate") endDate: string | undefined,
    @Res() res: Response,
  ): Promise<void> {
    const { data } =
      await this.inventoryAnalyticsService.getHistoricalInventory({
        productIds: normalizeIds(productIds),
        categoryId,
        startDate: startDate ? new Date(startDate) : undefined,
        endDate: endDate ? new Date(endDate) : undefined,
      });
    const columns = [
      {
        key: "categoryName",
        header: "Category",
        type: "string" as const,
        width: 20,
      },
      {
        key: "productName",
        header: "Product",
        type: "string" as const,
        width: 30,
      },
      {
        key: "quantity",
        header: "Quantity",
        type: "number" as const,
        width: 12,
      },
      {
        key: "unitValue",
        header: "Unit Value",
        type: "currency" as const,
        width: 15,
      },
      {
        key: "totalValue",
        header: "Total Value",
        type: "currency" as const,
        width: 15,
      },
    ];
    const buffer = await this.exportService.exportGrouped(
      "Historical Inventory",
      columns,
      data as any[],
      {
        groupKey: "categoryName",
        groupLabel: "Category",
        subtotalColumns: ["quantity", "totalValue"],
      },
    );
    sendExcel(res, buffer, "historical-inventory");
  }

  @Get("movement-summary/export")
  @ApiOperation({ summary: "Export movement summary to Excel" })
  async exportMovementSummary(
    @Query("productIds") productIds: string | string[] | undefined,
    @Query("categoryId") categoryId: string | undefined,
    @Query("startDate") startDate: string | undefined,
    @Query("endDate") endDate: string | undefined,
    @Res() res: Response,
  ): Promise<void> {
    const { data } = await this.inventoryAnalyticsService.getMovementSummary({
      productIds: normalizeIds(productIds),
      categoryId,
      startDate: startDate ? new Date(startDate) : undefined,
      endDate: endDate ? new Date(endDate) : undefined,
    });
    const columns = [
      {
        key: "categoryName",
        header: "Category",
        type: "string" as const,
        width: 20,
      },
      {
        key: "productName",
        header: "Product",
        type: "string" as const,
        width: 30,
      },
      {
        key: "quantityIn",
        header: "Quantity In",
        type: "number" as const,
        width: 14,
      },
      {
        key: "quantityOut",
        header: "Quantity Out",
        type: "number" as const,
        width: 14,
      },
      {
        key: "quantityOnHand",
        header: "Quantity On Hand",
        type: "number" as const,
        width: 18,
      },
    ];
    const buffer = await this.exportService.exportGrouped(
      "Movement Summary",
      columns,
      data as any[],
      {
        groupKey: "categoryName",
        groupLabel: "Category",
        subtotalColumns: ["quantityIn", "quantityOut", "quantityOnHand"],
      },
    );
    sendExcel(res, buffer, "movement-summary");
  }

  @Get("price-list/export")
  @ApiOperation({ summary: "Export price list to Excel" })
  async exportPriceList(
    @Query("productIds") productIds: string | string[] | undefined,
    @Query("categoryId") categoryId: string | undefined,
    @Query("priceListId") priceListId: string | undefined,
    @Query("discountPercent") discountPercent: string | undefined,
    @Res() res: Response,
  ): Promise<void> {
    const { data } = await this.inventoryAnalyticsService.getPriceList({
      productIds: normalizeIds(productIds),
      categoryId,
      priceListId,
      discountPercent: discountPercent
        ? parseFloat(discountPercent)
        : undefined,
    });
    const columns = [
      {
        key: "categoryName",
        header: "Category",
        type: "string" as const,
        width: 20,
      },
      {
        key: "productName",
        header: "Product",
        type: "string" as const,
        width: 30,
      },
      { key: "price", header: "Price", type: "currency" as const, width: 15 },
      {
        key: "discountedPrice",
        header: "Discounted Price",
        type: "currency" as const,
        width: 18,
      },
      {
        key: "salesCost",
        header: "Sales Cost",
        type: "currency" as const,
        width: 15,
      },
    ];
    const buffer = await this.exportService.exportGrouped(
      "Price List",
      columns,
      data as any[],
      {
        groupKey: "categoryName",
        groupLabel: "Category",
        subtotalColumns: [],
      },
    );
    sendExcel(res, buffer, "price-list");
  }

  @Get("product-cost/export")
  @ApiOperation({ summary: "Export product cost report to Excel" })
  async exportProductCost(
    @Query("productIds") productIds: string | string[] | undefined,
    @Query("startDate") startDate: string | undefined,
    @Query("endDate") endDate: string | undefined,
    @Res() res: Response,
  ): Promise<void> {
    const { data } = await this.inventoryAnalyticsService.getProductCost({
      productIds: normalizeIds(productIds),
      startDate: startDate ? new Date(startDate) : undefined,
      endDate: endDate ? new Date(endDate) : undefined,
    });
    const columns = [
      {
        key: "categoryName",
        header: "Category",
        type: "string" as const,
        width: 20,
      },
      {
        key: "productName",
        header: "Product",
        type: "string" as const,
        width: 30,
      },
      {
        key: "transactionType",
        header: "Transaction Type",
        type: "string" as const,
        width: 24,
      },
      {
        key: "orderNumber",
        header: "Order #",
        type: "string" as const,
        width: 15,
      },
      { key: "orderDate", header: "Date", type: "date" as const, width: 14 },
      {
        key: "quantityChange",
        header: "Quantity Change",
        type: "number" as const,
        width: 18,
      },
      {
        key: "quantityAfter",
        header: "Quantity After",
        type: "number" as const,
        width: 16,
      },
      {
        key: "costChange",
        header: "Cost Change",
        type: "currency" as const,
        width: 15,
      },
      {
        key: "totalCost",
        header: "Total Cost",
        type: "currency" as const,
        width: 15,
      },
      {
        key: "averageCost",
        header: "Average Cost",
        type: "currency" as const,
        width: 15,
      },
    ];
    const buffer = await this.exportService.exportGrouped(
      "Product Cost",
      columns,
      data as any[],
      {
        groupKey: "categoryName",
        groupLabel: "Category",
        subtotalColumns: ["quantityChange", "costChange", "totalCost"],
      },
    );
    sendExcel(res, buffer, "product-cost");
  }
}
