import {
  Controller,
  Get,
  Post,
  Body,
  Patch,
  Param,
  Delete,
  Query,
  ParseUUIDPipe,
  HttpStatus,
  HttpCode,
} from '@nestjs/common';
import {
  ApiTags,
  ApiOperation,
  ApiResponse,
  ApiParam,
  ApiQuery,
  ApiBody,
} from '@nestjs/swagger';
import { StockMovementService } from '../services/stock-movement.service';
import { StockAdjustmentService } from '../services/stock-adjustment.service';
import {
  CreateStockMovementDto,
  QueryStockMovementsDto,
  StockMovementResponseDto,
  CreateStockAdjustmentDto,
  UpdateStockAdjustmentDto,
  QueryStockAdjustmentsDto,
  StockAdjustmentResponseDto,
  BulkStockAdjustmentDto,
  StockTransferDto,
  StockReservationDto,
  StockSummaryDto,
  LowStockAlertDto,
} from '../dto/stock.dto';

@ApiTags('Stock Management')
@Controller('inventory/stock')
export class StockController {
  constructor(
    private readonly stockMovementService: StockMovementService,
    private readonly stockAdjustmentService: StockAdjustmentService,
  ) {}

  // Stock Movements
  @Post('movements')
  @ApiOperation({ summary: 'Create a stock movement' })
  @ApiResponse({
    status: 201,
    description: 'Stock movement created successfully',
    type: StockMovementResponseDto,
  })
  @ApiResponse({ status: 400, description: 'Invalid input data or insufficient stock' })
  @ApiResponse({ status: 404, description: 'Product not found' })
  @ApiBody({ type: CreateStockMovementDto })
  async createMovement(
    @Body() createMovementDto: CreateStockMovementDto,
  ): Promise<StockMovementResponseDto> {
    return this.stockMovementService.create(createMovementDto);
  }

  @Get('movements')
  @ApiOperation({ summary: 'Get all stock movements with filtering and pagination' })
  @ApiResponse({
    status: 200,
    description: 'Stock movements retrieved successfully',
  })
  @ApiQuery({ name: 'page', required: false, description: 'Page number' })
  @ApiQuery({ name: 'limit', required: false, description: 'Items per page' })
  @ApiQuery({ name: 'productId', required: false, description: 'Filter by product' })
  @ApiQuery({ name: 'movementType', required: false, description: 'Filter by movement type' })
  @ApiQuery({ name: 'status', required: false, description: 'Filter by status' })
  @ApiQuery({ name: 'fromDate', required: false, description: 'Filter from date' })
  @ApiQuery({ name: 'toDate', required: false, description: 'Filter to date' })
  @ApiQuery({ name: 'search', required: false, description: 'Search term' })
  async findAllMovements(@Query() query: QueryStockMovementsDto) {
    return this.stockMovementService.findAll(query);
  }

  @Get('movements/:id')
  @ApiOperation({ summary: 'Get a stock movement by ID' })
  @ApiResponse({
    status: 200,
    description: 'Stock movement retrieved successfully',
    type: StockMovementResponseDto,
  })
  @ApiResponse({ status: 404, description: 'Stock movement not found' })
  @ApiParam({ name: 'id', description: 'Stock movement ID' })
  async findOneMovement(@Param('id', ParseUUIDPipe) id: string): Promise<StockMovementResponseDto> {
    return this.stockMovementService.findOne(id);
  }

  @Post('movements/:id/reverse')
  @ApiOperation({ summary: 'Reverse a stock movement' })
  @ApiResponse({
    status: 201,
    description: 'Stock movement reversed successfully',
    type: StockMovementResponseDto,
  })
  @ApiResponse({ status: 400, description: 'Movement cannot be reversed' })
  @ApiResponse({ status: 404, description: 'Stock movement not found' })
  @ApiParam({ name: 'id', description: 'Stock movement ID' })
  async reverseMovement(
    @Param('id', ParseUUIDPipe) id: string,
    @Body() body: { reason: string },
  ): Promise<StockMovementResponseDto> {
    return this.stockMovementService.reverseMovement(id, body.reason);
  }

  @Post('transfer')
  @ApiOperation({ summary: 'Transfer stock between locations' })
  @ApiResponse({
    status: 201,
    description: 'Stock transferred successfully',
  })
  @ApiResponse({ status: 400, description: 'Invalid transfer data or insufficient stock' })
  @ApiResponse({ status: 404, description: 'Product not found' })
  @ApiBody({ type: StockTransferDto })
  async transferStock(
    @Body() transferDto: StockTransferDto,
  ) {
    return this.stockMovementService.transferStock(transferDto);
  }

  // Stock Adjustments
  @Post('adjustments')
  @ApiOperation({ summary: 'Create a stock adjustment' })
  @ApiResponse({
    status: 201,
    description: 'Stock adjustment created successfully',
    type: StockAdjustmentResponseDto,
  })
  @ApiResponse({ status: 400, description: 'Invalid input data' })
  @ApiResponse({ status: 404, description: 'Product not found' })
  @ApiBody({ type: CreateStockAdjustmentDto })
  async createAdjustment(
    @Body() createAdjustmentDto: CreateStockAdjustmentDto,
  ): Promise<StockAdjustmentResponseDto> {
    return this.stockAdjustmentService.create(createAdjustmentDto);
  }

  @Get('adjustments')
  @ApiOperation({ summary: 'Get all stock adjustments with filtering and pagination' })
  @ApiResponse({
    status: 200,
    description: 'Stock adjustments retrieved successfully',
  })
  @ApiQuery({ name: 'page', required: false, description: 'Page number' })
  @ApiQuery({ name: 'limit', required: false, description: 'Items per page' })
  @ApiQuery({ name: 'productId', required: false, description: 'Filter by product' })
  @ApiQuery({ name: 'type', required: false, description: 'Filter by adjustment type' })
  @ApiQuery({ name: 'status', required: false, description: 'Filter by status' })
  @ApiQuery({ name: 'requiresApproval', required: false, description: 'Filter by approval requirement' })
  @ApiQuery({ name: 'search', required: false, description: 'Search term' })
  async findAllAdjustments(@Query() query: QueryStockAdjustmentsDto) {
    return this.stockAdjustmentService.findAll(query);
  }


  @Get('adjustments/:id')
  @ApiOperation({ summary: 'Get a stock adjustment by ID' })
  @ApiResponse({
    status: 200,
    description: 'Stock adjustment retrieved successfully',
    type: StockAdjustmentResponseDto,
  })
  @ApiResponse({ status: 404, description: 'Stock adjustment not found' })
  @ApiParam({ name: 'id', description: 'Stock adjustment ID' })
  async findOneAdjustment(@Param('id', ParseUUIDPipe) id: string): Promise<StockAdjustmentResponseDto> {
    return this.stockAdjustmentService.findOne(id);
  }

  @Patch('adjustments/:id')
  @ApiOperation({ summary: 'Update a stock adjustment (only if pending)' })
  @ApiResponse({
    status: 200,
    description: 'Stock adjustment updated successfully',
    type: StockAdjustmentResponseDto,
  })
  @ApiResponse({ status: 400, description: 'Invalid update data or adjustment not pending' })
  @ApiResponse({ status: 403, description: 'Not authorized to modify this adjustment' })
  @ApiResponse({ status: 404, description: 'Stock adjustment not found' })
  @ApiParam({ name: 'id', description: 'Stock adjustment ID' })
  @ApiBody({ type: UpdateStockAdjustmentDto })
  async updateAdjustment(
    @Param('id', ParseUUIDPipe) id: string,
    @Body() updateAdjustmentDto: UpdateStockAdjustmentDto,
  ): Promise<StockAdjustmentResponseDto> {
    return this.stockAdjustmentService.update(id, updateAdjustmentDto);
  }


  @Post('adjustments/:id/cancel')
  @ApiOperation({ summary: 'Cancel a stock adjustment (only if pending)' })
  @ApiResponse({
    status: 200,
    description: 'Stock adjustment cancelled successfully',
    type: StockAdjustmentResponseDto,
  })
  @ApiResponse({ status: 400, description: 'Only pending adjustments can be cancelled' })
  @ApiResponse({ status: 403, description: 'You can only cancel your own adjustments' })
  @ApiResponse({ status: 404, description: 'Stock adjustment not found' })
  @ApiParam({ name: 'id', description: 'Stock adjustment ID' })
  @HttpCode(HttpStatus.OK)
  async cancelAdjustment(
    @Param('id', ParseUUIDPipe) id: string,
    @Body() body: { reason: string },
  ): Promise<StockAdjustmentResponseDto> {
    return this.stockAdjustmentService.cancel(id, body.reason);
  }

  @Post('adjustments/bulk')
  @ApiOperation({ summary: 'Create bulk stock adjustments' })
  @ApiResponse({
    status: 201,
    description: 'Bulk stock adjustments created successfully',
  })
  @ApiResponse({ status: 400, description: 'Invalid bulk adjustment data' })
  @ApiBody({ type: BulkStockAdjustmentDto })
  async createBulkAdjustments(
    @Body() bulkAdjustmentDto: BulkStockAdjustmentDto,
  ): Promise<StockAdjustmentResponseDto[]> {
    return this.stockAdjustmentService.createBulk(bulkAdjustmentDto);
  }

  // Stock Summary and Reports
  @Get('summary/:productId')
  @ApiOperation({ summary: 'Get stock summary for a product' })
  @ApiResponse({
    status: 200,
    description: 'Stock summary retrieved successfully',
    type: StockSummaryDto,
  })
  @ApiResponse({ status: 404, description: 'Product not found' })
  @ApiParam({ name: 'productId', description: 'Product ID' })
  @ApiQuery({ name: 'fromDate', required: false, description: 'Summary from date' })
  @ApiQuery({ name: 'toDate', required: false, description: 'Summary to date' })
  async getProductStockSummary(
    @Param('productId', ParseUUIDPipe) productId: string,
    @Query('fromDate') fromDate?: string,
    @Query('toDate') toDate?: string,
  ): Promise<StockSummaryDto> {
    const from = fromDate ? new Date(fromDate) : undefined;
    const to = toDate ? new Date(toDate) : undefined;
    return this.stockMovementService.getProductStockSummary(productId, from, to);
  }

  @Get('alerts/low-stock')
  @ApiOperation({ summary: 'Get low stock alerts' })
  @ApiResponse({
    status: 200,
    description: 'Low stock alerts retrieved successfully',
    type: [LowStockAlertDto],
  })
  async getLowStockAlerts(): Promise<LowStockAlertDto[]> {
    return this.stockMovementService.getLowStockAlerts();
  }

  // Utility endpoints
  @Post('initial/:productId')
  @ApiOperation({ summary: 'Record initial stock for a product' })
  @ApiResponse({
    status: 201,
    description: 'Initial stock recorded successfully',
    type: StockMovementResponseDto,
  })
  @ApiResponse({ status: 404, description: 'Product not found' })
  @ApiParam({ name: 'productId', description: 'Product ID' })
  async recordInitialStock(
    @Param('productId', ParseUUIDPipe) productId: string,
    @Body() body: { quantity: number; unitCost?: number },
  ): Promise<StockMovementResponseDto> {
    return this.stockMovementService.recordInitialStock(
      productId,
      body.quantity,
      body.unitCost,
    );
  }

  @Post('sale/:productId')
  @ApiOperation({ summary: 'Record stock movement for a sale' })
  @ApiResponse({
    status: 201,
    description: 'Sale stock movement recorded successfully',
    type: StockMovementResponseDto,
  })
  @ApiResponse({ status: 400, description: 'Insufficient stock' })
  @ApiResponse({ status: 404, description: 'Product not found' })
  @ApiParam({ name: 'productId', description: 'Product ID' })
  async recordSale(
    @Param('productId', ParseUUIDPipe) productId: string,
    @Body() body: {
      quantity: number;
      unitPrice: number;
      referenceId: string;
      referenceNumber: string;
    },
  ): Promise<StockMovementResponseDto> {
    return this.stockMovementService.recordSale(
      productId,
      body.quantity,
      body.unitPrice,
      body.referenceId,
      body.referenceNumber,
    );
  }

  @Post('purchase/:productId')
  @ApiOperation({ summary: 'Record stock movement for a purchase receipt' })
  @ApiResponse({
    status: 201,
    description: 'Purchase receipt stock movement recorded successfully',
    type: StockMovementResponseDto,
  })
  @ApiResponse({ status: 404, description: 'Product not found' })
  @ApiParam({ name: 'productId', description: 'Product ID' })
  async recordPurchaseReceipt(
    @Param('productId', ParseUUIDPipe) productId: string,
    @Body() body: {
      quantity: number;
      unitCost: number;
      referenceId: string;
      referenceNumber: string;
    },
  ): Promise<StockMovementResponseDto> {
    return this.stockMovementService.recordPurchaseReceipt(
      productId,
      body.quantity,
      body.unitCost,
      body.referenceId,
      body.referenceNumber,
    );
  }
}