import {
  Controller,
  Get,
  Post,
  Body,
  Patch,
  Param,
  Delete,
  Query,
  UseGuards,
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
  ApiBearerAuth,
  ApiBody,
} from '@nestjs/swagger';
import { JwtAuthGuard } from '../../../common/guards/jwt-auth.guard';
import { RolesGuard } from '../../../common/guards/roles.guard';
import { PermissionsGuard } from '../../../common/guards/permissions.guard';
import { Roles } from '../../../common/decorators/auth.decorator';
import { User } from '../../../common/decorators/user.decorator';
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
  StockAdjustmentActionDto,
  BulkStockAdjustmentDto,
  StockTransferDto,
  StockReservationDto,
  StockSummaryDto,
  LowStockAlertDto,
} from '../dto/stock.dto';

@ApiTags('Stock Management')
@ApiBearerAuth()
@Controller('inventory/stock')
@UseGuards(JwtAuthGuard, RolesGuard, PermissionsGuard)
export class StockController {
  constructor(
    private readonly stockMovementService: StockMovementService,
    private readonly stockAdjustmentService: StockAdjustmentService,
  ) {}

  // Stock Movements
  @Post('movements')
  @Roles('admin', 'inventory_manager', 'inventory_staff')
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
    @User('id') userId: string,
  ): Promise<StockMovementResponseDto> {
    return this.stockMovementService.create(createMovementDto, userId);
  }

  @Get('movements')
  @Roles('admin', 'inventory_manager', 'inventory_staff', 'sales_manager')
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
  @Roles('admin', 'inventory_manager', 'inventory_staff', 'sales_manager')
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
  @Roles('admin', 'inventory_manager')
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
    @User('id') userId: string,
  ): Promise<StockMovementResponseDto> {
    return this.stockMovementService.reverseMovement(id, body.reason, userId);
  }

  @Post('transfer')
  @Roles('admin', 'inventory_manager', 'inventory_staff')
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
    @User('id') userId: string,
  ) {
    return this.stockMovementService.transferStock(transferDto, userId);
  }

  // Stock Adjustments
  @Post('adjustments')
  @Roles('admin', 'inventory_manager', 'inventory_staff')
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
    @User('id') userId: string,
  ): Promise<StockAdjustmentResponseDto> {
    return this.stockAdjustmentService.create(createAdjustmentDto, userId);
  }

  @Get('adjustments')
  @Roles('admin', 'inventory_manager', 'inventory_staff')
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

  @Get('adjustments/pending-approvals')
  @Roles('admin', 'inventory_manager')
  @ApiOperation({ summary: 'Get adjustments pending approval' })
  @ApiResponse({
    status: 200,
    description: 'Pending adjustments retrieved successfully',
  })
  async getPendingAdjustments() {
    return this.stockAdjustmentService.getAdjustmentsRequiringApproval();
  }

  @Get('adjustments/pending-count')
  @Roles('admin', 'inventory_manager')
  @ApiOperation({ summary: 'Get count of adjustments pending approval' })
  @ApiResponse({
    status: 200,
    description: 'Pending count retrieved successfully',
  })
  async getPendingAdjustmentsCount(): Promise<{ count: number }> {
    const count = await this.stockAdjustmentService.getPendingApprovalsCount();
    return { count };
  }

  @Get('adjustments/:id')
  @Roles('admin', 'inventory_manager', 'inventory_staff')
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
  @Roles('admin', 'inventory_manager', 'inventory_staff')
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
    @User('id') userId: string,
  ): Promise<StockAdjustmentResponseDto> {
    return this.stockAdjustmentService.update(id, updateAdjustmentDto, userId);
  }

  @Post('adjustments/:id/approve')
  @Roles('admin', 'inventory_manager')
  @ApiOperation({ summary: 'Approve a stock adjustment' })
  @ApiResponse({
    status: 200,
    description: 'Stock adjustment approved successfully',
    type: StockAdjustmentResponseDto,
  })
  @ApiResponse({ status: 400, description: 'Adjustment cannot be approved or validation failed' })
  @ApiResponse({ status: 404, description: 'Stock adjustment not found' })
  @ApiParam({ name: 'id', description: 'Stock adjustment ID' })
  @ApiBody({ type: StockAdjustmentActionDto })
  @HttpCode(HttpStatus.OK)
  async approveAdjustment(
    @Param('id', ParseUUIDPipe) id: string,
    @Body() actionDto: StockAdjustmentActionDto,
    @User('id') userId: string,
  ): Promise<StockAdjustmentResponseDto> {
    return this.stockAdjustmentService.approve(id, actionDto, userId);
  }

  @Post('adjustments/:id/reject')
  @Roles('admin', 'inventory_manager')
  @ApiOperation({ summary: 'Reject a stock adjustment' })
  @ApiResponse({
    status: 200,
    description: 'Stock adjustment rejected successfully',
    type: StockAdjustmentResponseDto,
  })
  @ApiResponse({ status: 400, description: 'Adjustment cannot be rejected or reason missing' })
  @ApiResponse({ status: 404, description: 'Stock adjustment not found' })
  @ApiParam({ name: 'id', description: 'Stock adjustment ID' })
  @ApiBody({ type: StockAdjustmentActionDto })
  @HttpCode(HttpStatus.OK)
  async rejectAdjustment(
    @Param('id', ParseUUIDPipe) id: string,
    @Body() actionDto: StockAdjustmentActionDto,
    @User('id') userId: string,
  ): Promise<StockAdjustmentResponseDto> {
    return this.stockAdjustmentService.reject(id, actionDto, userId);
  }

  @Post('adjustments/:id/cancel')
  @Roles('admin', 'inventory_manager', 'inventory_staff')
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
    @User('id') userId: string,
  ): Promise<StockAdjustmentResponseDto> {
    return this.stockAdjustmentService.cancel(id, body.reason, userId);
  }

  @Post('adjustments/bulk')
  @Roles('admin', 'inventory_manager')
  @ApiOperation({ summary: 'Create bulk stock adjustments' })
  @ApiResponse({
    status: 201,
    description: 'Bulk stock adjustments created successfully',
  })
  @ApiResponse({ status: 400, description: 'Invalid bulk adjustment data' })
  @ApiBody({ type: BulkStockAdjustmentDto })
  async createBulkAdjustments(
    @Body() bulkAdjustmentDto: BulkStockAdjustmentDto,
    @User('id') userId: string,
  ): Promise<StockAdjustmentResponseDto[]> {
    return this.stockAdjustmentService.createBulk(bulkAdjustmentDto, userId);
  }

  // Stock Summary and Reports
  @Get('summary/:productId')
  @Roles('admin', 'inventory_manager', 'inventory_staff', 'sales_manager')
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
  @Roles('admin', 'inventory_manager', 'inventory_staff')
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
  @Roles('admin', 'inventory_manager')
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
    @User('id') userId: string,
  ): Promise<StockMovementResponseDto> {
    return this.stockMovementService.recordInitialStock(
      productId,
      body.quantity,
      body.unitCost,
      userId,
    );
  }

  @Post('sale/:productId')
  @Roles('admin', 'inventory_manager', 'inventory_staff', 'sales_staff')
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
    @User('id') userId: string,
  ): Promise<StockMovementResponseDto> {
    return this.stockMovementService.recordSale(
      productId,
      body.quantity,
      body.unitPrice,
      body.referenceId,
      body.referenceNumber,
      userId,
    );
  }

  @Post('purchase/:productId')
  @Roles('admin', 'inventory_manager', 'inventory_staff')
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
    @User('id') userId: string,
  ): Promise<StockMovementResponseDto> {
    return this.stockMovementService.recordPurchaseReceipt(
      productId,
      body.quantity,
      body.unitCost,
      body.referenceId,
      body.referenceNumber,
      userId,
    );
  }
}