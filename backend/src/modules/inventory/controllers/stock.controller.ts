import {
  Controller,
  Get,
  Post,
  Body,
  Param,
  Query,
  ParseUUIDPipe,
} from "@nestjs/common";
import {
  ApiTags,
  ApiOperation,
  ApiResponse,
  ApiParam,
  ApiQuery,
  ApiBody,
} from "@nestjs/swagger";
import { StockMovementService } from "../services/stock-movement.service";
import {
  CreateStockMovementDto,
  QueryStockMovementsDto,
  StockMovementResponseDto,
  StockSummaryDto,
  LowStockAlertDto,
  CreateBulkStockAdjustmentDto,
  BulkStockAdjustmentResponseDto,
} from "../dto/stock.dto";

@ApiTags("Stock Management")
@Controller("inventory/stock")
export class StockController {
  constructor(private readonly stockMovementService: StockMovementService) {}

  // Stock Movements
  @Post("movements")
  @ApiOperation({ summary: "Create a stock movement" })
  @ApiResponse({
    status: 201,
    description: "Stock movement created successfully",
    type: StockMovementResponseDto,
  })
  @ApiResponse({
    status: 400,
    description: "Invalid input data or insufficient stock",
  })
  @ApiResponse({ status: 404, description: "Product not found" })
  @ApiBody({ type: CreateStockMovementDto })
  async createMovement(
    @Body() createMovementDto: CreateStockMovementDto,
  ): Promise<StockMovementResponseDto> {
    return this.stockMovementService.create(createMovementDto);
  }

  @Post("adjustments/bulk")
  @ApiOperation({
    summary:
      "Create bulk stock adjustment with multiple products (DEPRECATED - Use /inventory/stock-adjustments instead)",
    deprecated: true,
  })
  @ApiResponse({
    status: 201,
    description: "Bulk stock adjustment created successfully",
    type: BulkStockAdjustmentResponseDto,
  })
  @ApiResponse({
    status: 400,
    description: "Invalid input data or insufficient stock",
  })
  @ApiResponse({ status: 404, description: "Product not found" })
  @ApiBody({ type: CreateBulkStockAdjustmentDto })
  async createBulkAdjustment(
    @Body() createBulkDto: CreateBulkStockAdjustmentDto,
  ): Promise<BulkStockAdjustmentResponseDto> {
    return this.stockMovementService.createBulkStockAdjustment(createBulkDto);
  }

  @Get("movements")
  @ApiOperation({
    summary: "Get all stock movements with filtering and pagination",
  })
  @ApiResponse({
    status: 200,
    description: "Stock movements retrieved successfully",
  })
  @ApiQuery({ name: "page", required: false, description: "Page number" })
  @ApiQuery({ name: "limit", required: false, description: "Items per page" })
  @ApiQuery({
    name: "productId",
    required: false,
    description: "Filter by product",
  })
  @ApiQuery({
    name: "movementType",
    required: false,
    description: "Filter by movement type",
  })
  @ApiQuery({
    name: "fromDate",
    required: false,
    description: "Filter from date",
  })
  @ApiQuery({ name: "toDate", required: false, description: "Filter to date" })
  @ApiQuery({ name: "search", required: false, description: "Search term" })
  async findAllMovements(@Query() query: QueryStockMovementsDto) {
    return this.stockMovementService.findAll(query);
  }

  @Get("movements/:id")
  @ApiOperation({ summary: "Get a stock movement by ID" })
  @ApiResponse({
    status: 200,
    description: "Stock movement retrieved successfully",
    type: StockMovementResponseDto,
  })
  @ApiResponse({ status: 404, description: "Stock movement not found" })
  @ApiParam({ name: "id", description: "Stock movement ID" })
  async findOneMovement(
    @Param("id", ParseUUIDPipe) id: string,
  ): Promise<StockMovementResponseDto> {
    return this.stockMovementService.findOne(id);
  }

  @Post("movements/:id/reverse")
  @ApiOperation({ summary: "Reverse a stock movement" })
  @ApiResponse({
    status: 201,
    description: "Stock movement reversed successfully",
    type: StockMovementResponseDto,
  })
  @ApiResponse({ status: 400, description: "Movement cannot be reversed" })
  @ApiResponse({ status: 404, description: "Stock movement not found" })
  @ApiParam({ name: "id", description: "Stock movement ID" })
  async reverseMovement(
    @Param("id", ParseUUIDPipe) id: string,
    @Body() body: { reason: string },
  ): Promise<StockMovementResponseDto> {
    return this.stockMovementService.reverseMovement(id, body.reason);
  }

  // Stock Summary and Reports
  @Get("summary/:productId")
  @ApiOperation({ summary: "Get stock summary for a product" })
  @ApiResponse({
    status: 200,
    description: "Stock summary retrieved successfully",
    type: StockSummaryDto,
  })
  @ApiResponse({ status: 404, description: "Product not found" })
  @ApiParam({ name: "productId", description: "Product ID" })
  @ApiQuery({
    name: "fromDate",
    required: false,
    description: "Summary from date",
  })
  @ApiQuery({ name: "toDate", required: false, description: "Summary to date" })
  async getProductStockSummary(
    @Param("productId", ParseUUIDPipe) productId: string,
    @Query("fromDate") fromDate?: string,
    @Query("toDate") toDate?: string,
  ): Promise<StockSummaryDto> {
    const from = fromDate ? new Date(fromDate) : undefined;
    const to = toDate ? new Date(toDate) : undefined;
    return this.stockMovementService.getProductStockSummary(
      productId,
      from,
      to,
    );
  }

  @Get("alerts/low-stock")
  @ApiOperation({ summary: "Get low stock alerts" })
  @ApiResponse({
    status: 200,
    description: "Low stock alerts retrieved successfully",
    type: [LowStockAlertDto],
  })
  async getLowStockAlerts(): Promise<LowStockAlertDto[]> {
    return this.stockMovementService.getLowStockAlerts();
  }

  // Utility endpoints
  @Post("initial/:productId")
  @ApiOperation({ summary: "Record initial stock for a product" })
  @ApiResponse({
    status: 201,
    description: "Initial stock recorded successfully",
    type: StockMovementResponseDto,
  })
  @ApiResponse({ status: 404, description: "Product not found" })
  @ApiParam({ name: "productId", description: "Product ID" })
  async recordInitialStock(
    @Param("productId", ParseUUIDPipe) productId: string,
    @Body() body: { quantity: number; unitCost?: number },
  ): Promise<StockMovementResponseDto> {
    return this.stockMovementService.recordInitialStock(
      productId,
      body.quantity,
      body.unitCost,
    );
  }

  @Post("sale/:productId")
  @ApiOperation({ summary: "Record stock movement for a sale" })
  @ApiResponse({
    status: 201,
    description: "Sale stock movement recorded successfully",
    type: StockMovementResponseDto,
  })
  @ApiResponse({ status: 400, description: "Insufficient stock" })
  @ApiResponse({ status: 404, description: "Product not found" })
  @ApiParam({ name: "productId", description: "Product ID" })
  async recordSale(
    @Param("productId", ParseUUIDPipe) productId: string,
    @Body()
    body: {
      quantity: number;
      unitPrice: number;
      referenceId: string;
    },
  ): Promise<StockMovementResponseDto> {
    return this.stockMovementService.recordSale(
      productId,
      body.quantity,
      body.unitPrice,
      body.referenceId,
    );
  }

  @Post("purchase/:productId")
  @ApiOperation({ summary: "Record stock movement for a purchase receipt" })
  @ApiResponse({
    status: 201,
    description: "Purchase receipt stock movement recorded successfully",
    type: StockMovementResponseDto,
  })
  @ApiResponse({ status: 404, description: "Product not found" })
  @ApiParam({ name: "productId", description: "Product ID" })
  async recordPurchaseReceipt(
    @Param("productId", ParseUUIDPipe) productId: string,
    @Body()
    body: {
      quantity: number;
      unitCost: number;
      referenceId: string;
    },
  ): Promise<StockMovementResponseDto> {
    return this.stockMovementService.recordPurchaseReceipt(
      productId,
      body.quantity,
      body.unitCost,
      body.referenceId,
    );
  }
}
