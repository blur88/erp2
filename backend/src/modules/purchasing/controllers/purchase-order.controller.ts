import {
  Controller,
  Get,
  Post,
  Put,
  Patch,
  Delete,
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
  PurchaseOrderSummaryDto,
  RecordOrderPaymentsDto,
} from '../dto';
import { CurrentUser } from '../../auth/decorators/current-user.decorator';

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
    @CurrentUser('userId') currentUserId: string,
    @CurrentUser('username') currentUsername: string,
  ): Promise<{ data: PurchaseOrderResponseDto }> {
    const data = await this.purchaseOrderService.create(
      createPurchaseOrderDto,
      currentUserId,
      currentUsername,
    );
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
  @ApiQuery({ name: 'orderDateFrom', required: false, description: 'Filter by order date from' })
  @ApiQuery({ name: 'orderDateTo', required: false, description: 'Filter by order date to' })
  @ApiQuery({ name: 'sortBy', required: false, description: 'Sort field (orderNumber, orderDate, totalAmount, createdAt)' })
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

  @Get('by-number/:orderNumber')
  @ApiOperation({ summary: 'Get purchase order by order number' })
  @ApiParam({ name: 'orderNumber', description: 'Purchase order number (e.g. PO-001)', type: 'string' })
  @ApiResponse({ status: 200, description: 'Purchase order retrieved successfully' })
  @ApiResponse({ status: 404, description: 'Purchase order not found' })
  async findByOrderNumber(
    @Param('orderNumber') orderNumber: string,
  ): Promise<{ data: PurchaseOrderResponseDto }> {
    const data = await this.purchaseOrderService.findByOrderNumber(orderNumber);
    return { data };
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
    @CurrentUser('userId') currentUserId: string,
    @CurrentUser('username') currentUsername: string,
  ): Promise<{ data: PurchaseOrderResponseDto }> {
    const data = await this.purchaseOrderService.update(
      id,
      updatePurchaseOrderDto,
      currentUserId,
      currentUsername,
    );
    return { data };
  }

  @Post(':id/cancel')
  @ApiOperation({ summary: 'Cancel purchase order' })
  @ApiParam({ name: 'id', description: 'Purchase order ID', type: 'string' })
  @ApiResponse({
    status: 200,
    description: 'Purchase order cancelled successfully',
    type: PurchaseOrderResponseDto,
  })
  @HttpCode(HttpStatus.OK)
  async cancel(
    @Param('id', ParseUUIDPipe) id: string,
    @CurrentUser('userId') currentUserId: string,
    @CurrentUser('username') currentUsername: string,
  ): Promise<{ data: PurchaseOrderResponseDto }> {
    const data = await this.purchaseOrderService.cancel(id, currentUserId, currentUsername);
    return { data };
  }

  @Post(':id/uncancel')
  @ApiOperation({ summary: 'Uncancel purchase order' })
  @ApiParam({ name: 'id', description: 'Purchase order ID', type: 'string' })
  @ApiResponse({
    status: 200,
    description: 'Purchase order uncancelled successfully',
    type: PurchaseOrderResponseDto,
  })
  @HttpCode(HttpStatus.OK)
  async uncancel(
    @Param('id', ParseUUIDPipe) id: string,
    @CurrentUser('userId') currentUserId: string,
    @CurrentUser('username') currentUsername: string,
  ): Promise<{ data: PurchaseOrderResponseDto }> {
    const data = await this.purchaseOrderService.uncancel(id, currentUserId, currentUsername);
    return { data };
  }

  @Post(':id/receive')
  @ApiOperation({ summary: 'Receive goods for purchase order - posts stock + cost, transitions READY -> RECEIVED' })
  @ApiParam({ name: 'id', description: 'Purchase order ID', type: 'string' })
  @ApiResponse({
    status: 200,
    description: 'Goods received successfully',
    type: PurchaseOrderResponseDto,
  })
  @ApiResponse({ status: 404, description: 'Purchase order not found' })
  @ApiResponse({ status: 400, description: 'Order must be Ready to receive' })
  @HttpCode(HttpStatus.OK)
  async receiveGoods(
    @Param('id', ParseUUIDPipe) id: string,
    @CurrentUser('userId') currentUserId: string,
    @CurrentUser('username') currentUsername: string,
  ): Promise<{ data: PurchaseOrderResponseDto }> {
    const data = await this.purchaseOrderService.receive(id, currentUserId, currentUsername);
    return { data };
  }

  @Post(':id/return')
  @ApiOperation({ summary: 'Return goods for purchase order - reverses stock + cost, transitions RECEIVED -> READY' })
  @ApiParam({ name: 'id', description: 'Purchase order ID', type: 'string' })
  @ApiResponse({
    status: 200,
    description: 'Goods returned successfully',
    type: PurchaseOrderResponseDto,
  })
  @ApiResponse({ status: 404, description: 'Purchase order not found' })
  @ApiResponse({ status: 400, description: 'Order must be Received to return' })
  @HttpCode(HttpStatus.OK)
  async returnGoods(
    @Param('id', ParseUUIDPipe) id: string,
    @CurrentUser('userId') currentUserId: string,
    @CurrentUser('username') currentUsername: string,
  ): Promise<{ data: PurchaseOrderResponseDto }> {
    const data = await this.purchaseOrderService.return(id, currentUserId, currentUsername);
    return { data };
  }

  @Get(':id/payments')
  @ApiOperation({ summary: 'List vendor payments for purchase order' })
  @ApiParam({ name: 'id', description: 'Purchase order ID', type: 'string' })
  @ApiResponse({ status: 200, description: 'Vendor payments retrieved successfully' })
  async getPayments(@Param('id', ParseUUIDPipe) id: string): Promise<{ data: any[] }> {
    const data = await this.purchaseOrderService.getPayments(id);
    return { data };
  }

  @Post(':id/payments')
  @ApiOperation({ summary: 'Record vendor payments for a purchase order' })
  @ApiParam({ name: 'id', description: 'Purchase order ID', type: 'string' })
  @HttpCode(HttpStatus.OK)
  async recordVendorPayments(
    @Param('id', ParseUUIDPipe) id: string,
    @Body() dto: RecordOrderPaymentsDto,
    @CurrentUser('userId') currentUserId: string,
    @CurrentUser('username') currentUsername: string,
  ): Promise<PurchaseOrderResponseDto> {
    return this.purchaseOrderService.recordVendorPayments(
      id,
      dto.payments,
      currentUserId,
      currentUsername,
    );
  }

  @Post(':id/unpay')
  @ApiOperation({ summary: 'Unmark purchase order as paid - hard deletes vendor payment' })
  @ApiParam({ name: 'id', description: 'Purchase order ID', type: 'string' })
  @ApiResponse({
    status: 200,
    description: 'Purchase order unmarked as paid successfully',
    type: PurchaseOrderResponseDto,
  })
  @ApiResponse({ status: 404, description: 'Purchase order not found' })
  @ApiResponse({ status: 404, description: 'Vendor payment not found' })
  @HttpCode(HttpStatus.OK)
  async markAsUnpaid(
    @Param('id', ParseUUIDPipe) id: string,
    @CurrentUser('userId') currentUserId: string,
    @CurrentUser('username') currentUsername: string,
  ): Promise<{ data: PurchaseOrderResponseDto }> {
    const result = await this.purchaseOrderService.unpay(id, currentUserId, currentUsername);
    return { data: result };
  }

}
