import {
  Controller,
  Get,
  Post,
  Put,
  Patch,
  Body,
  Param,
  Query,
  ParseUUIDPipe,
  HttpCode,
  HttpStatus,
} from '@nestjs/common';
import {
  ApiTags,
  ApiOperation,
  ApiResponse,
  ApiParam,
  ApiQuery,
  ApiBody,
} from '@nestjs/swagger';
import { PurchaseOrderService } from '../services/purchase-order.service';
import {
  CreatePurchaseOrderDto,
  UpdatePurchaseOrderDto,
  PurchaseOrderQueryDto,
  PurchaseOrderResponseDto,
  PurchaseOrderListResponseDto,
  ApprovePurchaseOrderDto,
  AcknowledgePurchaseOrderDto,
  CancelPurchaseOrderDto,
  PurchaseOrderSummaryDto,
} from '../dto';

@ApiTags('Purchase Orders')
@Controller('purchasing/orders')
export class PurchaseOrderController {
  constructor(private readonly purchaseOrderService: PurchaseOrderService) {}

  @Post()
  @ApiOperation({ summary: 'Create a new purchase order' })
  @ApiResponse({
    status: 201,
    description: 'Purchase order created successfully',
    type: PurchaseOrderResponseDto,
  })
  @ApiResponse({ status: 400, description: 'Invalid input data' })
  @ApiResponse({ status: 404, description: 'Supplier or product not found' })
  async create(
    @Body() createPurchaseOrderDto: CreatePurchaseOrderDto,
  ): Promise<{ data: PurchaseOrderResponseDto }> {
    const data = await this.purchaseOrderService.create(createPurchaseOrderDto, 'system');
    return { data };
  }

  @Get()
  @ApiOperation({ summary: 'Get all purchase orders with filtering and pagination' })
  @ApiResponse({
    status: 200,
    description: 'List of purchase orders retrieved successfully',
    type: PurchaseOrderListResponseDto,
  })
  @ApiQuery({ name: 'page', required: false, type: Number, description: 'Page number' })
  @ApiQuery({ name: 'limit', required: false, type: Number, description: 'Items per page' })
  @ApiQuery({ name: 'search', required: false, description: 'Search by order number, supplier name, or notes' })
  @ApiQuery({ name: 'supplierId', required: false, description: 'Filter by supplier ID' })
  @ApiQuery({ name: 'status', required: false, description: 'Filter by status' })
  @ApiQuery({ name: 'priority', required: false, description: 'Filter by priority' })
  @ApiQuery({ name: 'createdByUserId', required: false, description: 'Filter by creator user ID' })
  @ApiQuery({ name: 'orderDateFrom', required: false, description: 'Filter by order date from' })
  @ApiQuery({ name: 'orderDateTo', required: false, description: 'Filter by order date to' })
  @ApiQuery({ name: 'requiredDateFrom', required: false, description: 'Filter by required date from' })
  @ApiQuery({ name: 'requiredDateTo', required: false, description: 'Filter by required date to' })
  @ApiQuery({ name: 'isOverdue', required: false, type: Boolean, description: 'Filter overdue orders' })
  @ApiQuery({ name: 'sortBy', required: false, description: 'Sort field (orderNumber, orderDate, requiredDate, status, priority, totalAmount, createdAt)' })
  @ApiQuery({ name: 'sortOrder', required: false, enum: ['ASC', 'DESC'], description: 'Sort order' })
  async findAll(
    @Query() query: PurchaseOrderQueryDto,
  ): Promise<PurchaseOrderListResponseDto> {
    return this.purchaseOrderService.findAll(query);
  }

  @Get('summary')
  @ApiOperation({ summary: 'Get purchase order summary statistics' })
  @ApiResponse({
    status: 200,
    description: 'Purchase order summary retrieved successfully',
    type: PurchaseOrderSummaryDto,
  })
  async getSummary(): Promise<PurchaseOrderSummaryDto> {
    return this.purchaseOrderService.getSummary();
  }

  @Get(':id')
  @ApiOperation({ summary: 'Get purchase order by ID' })
  @ApiParam({ name: 'id', description: 'Purchase order ID', type: 'string' })
  @ApiResponse({
    status: 200,
    description: 'Purchase order retrieved successfully',
    type: PurchaseOrderResponseDto,
  })
  @ApiResponse({ status: 404, description: 'Purchase order not found' })
  async findOne(
    @Param('id', ParseUUIDPipe) id: string,
  ): Promise<{ data: PurchaseOrderResponseDto }> {
    const data = await this.purchaseOrderService.findOne(id);
    return { data };
  }

  @Put(':id')
  @ApiOperation({ summary: 'Update purchase order' })
  @ApiParam({ name: 'id', description: 'Purchase order ID', type: 'string' })
  @ApiResponse({
    status: 200,
    description: 'Purchase order updated successfully',
    type: PurchaseOrderResponseDto,
  })
  @ApiResponse({ status: 400, description: 'Invalid input data or order cannot be modified' })
  @ApiResponse({ status: 404, description: 'Purchase order not found' })
  async update(
    @Param('id', ParseUUIDPipe) id: string,
    @Body() updatePurchaseOrderDto: UpdatePurchaseOrderDto,
  ): Promise<{ data: PurchaseOrderResponseDto }> {
    const data = await this.purchaseOrderService.update(id, updatePurchaseOrderDto);
    return { data };
  }

  @Patch(':id/approve')
  @ApiOperation({ summary: 'Approve purchase order' })
  @ApiParam({ name: 'id', description: 'Purchase order ID', type: 'string' })
  @ApiResponse({
    status: 200,
    description: 'Purchase order approved successfully',
    type: PurchaseOrderResponseDto,
  })
  @ApiResponse({ status: 400, description: 'Purchase order cannot be approved in current status' })
  @ApiResponse({ status: 404, description: 'Purchase order not found' })
  async approve(
    @Param('id', ParseUUIDPipe) id: string,
    @Body() approveDto: ApprovePurchaseOrderDto,
  ): Promise<{ data: PurchaseOrderResponseDto }> {
    const data = await this.purchaseOrderService.approve(id, approveDto, 'system');
    return { data };
  }

  @Patch(':id/send')
  @ApiOperation({ summary: 'Send purchase order to supplier' })
  @ApiParam({ name: 'id', description: 'Purchase order ID', type: 'string' })
  @ApiResponse({
    status: 200,
    description: 'Purchase order sent successfully',
    type: PurchaseOrderResponseDto,
  })
  @ApiResponse({ status: 400, description: 'Purchase order cannot be sent in current status' })
  @ApiResponse({ status: 404, description: 'Purchase order not found' })
  @HttpCode(HttpStatus.OK)
  async send(
    @Param('id', ParseUUIDPipe) id: string,
  ): Promise<{ data: PurchaseOrderResponseDto }> {
    const data = await this.purchaseOrderService.send(id);
    return { data };
  }

  @Patch(':id/acknowledge')
  @ApiOperation({ summary: 'Acknowledge purchase order from supplier' })
  @ApiParam({ name: 'id', description: 'Purchase order ID', type: 'string' })
  @ApiResponse({
    status: 200,
    description: 'Purchase order acknowledged successfully',
    type: PurchaseOrderResponseDto,
  })
  @ApiResponse({ status: 400, description: 'Purchase order cannot be acknowledged in current status' })
  @ApiResponse({ status: 404, description: 'Purchase order not found' })
  async acknowledge(
    @Param('id', ParseUUIDPipe) id: string,
    @Body() acknowledgeDto: AcknowledgePurchaseOrderDto,
  ): Promise<{ data: PurchaseOrderResponseDto }> {
    const data = await this.purchaseOrderService.acknowledge(id, acknowledgeDto);
    return { data };
  }

  @Patch(':id/cancel')
  @ApiOperation({ summary: 'Cancel purchase order' })
  @ApiParam({ name: 'id', description: 'Purchase order ID', type: 'string' })
  @ApiResponse({
    status: 200,
    description: 'Purchase order cancelled successfully',
    type: PurchaseOrderResponseDto,
  })
  @ApiResponse({ status: 400, description: 'Purchase order cannot be cancelled in current status' })
  @ApiResponse({ status: 404, description: 'Purchase order not found' })
  async cancel(
    @Param('id', ParseUUIDPipe) id: string,
    @Body() cancelDto: CancelPurchaseOrderDto,
  ): Promise<{ data: PurchaseOrderResponseDto }> {
    const data = await this.purchaseOrderService.cancel(id, cancelDto);
    return { data };
  }

  @Patch(':id/receive')
  @ApiOperation({ summary: 'Mark purchase order as received' })
  @ApiParam({ name: 'id', description: 'Purchase order ID', type: 'string' })
  @ApiResponse({
    status: 200,
    description: 'Purchase order marked as received',
    type: PurchaseOrderResponseDto,
  })
  @ApiResponse({ status: 400, description: 'Purchase order cannot be received in current status' })
  @ApiResponse({ status: 404, description: 'Purchase order not found' })
  async markAsReceived(
    @Param('id', ParseUUIDPipe) id: string,
  ): Promise<{ data: PurchaseOrderResponseDto }> {
    const data = await this.purchaseOrderService.markAsReceived(id);
    return { data };
  }

  @Patch(':id/complete')
  @ApiOperation({ summary: 'Complete purchase order' })
  @ApiParam({ name: 'id', description: 'Purchase order ID', type: 'string' })
  @ApiResponse({
    status: 200,
    description: 'Purchase order completed successfully',
    type: PurchaseOrderResponseDto,
  })
  @ApiResponse({ status: 400, description: 'Purchase order cannot be completed in current status' })
  @ApiResponse({ status: 404, description: 'Purchase order not found' })
  async complete(
    @Param('id', ParseUUIDPipe) id: string,
  ): Promise<{ data: PurchaseOrderResponseDto }> {
    const data = await this.purchaseOrderService.complete(id);
    return { data };
  }
}
