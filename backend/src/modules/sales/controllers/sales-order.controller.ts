import {
  Controller,
  Get,
  Post,
  Put,
  Delete,
  Body,
  Param,
  Query,
  ParseUUIDPipe,
  HttpCode,
  HttpStatus,
  Request,
} from '@nestjs/common';
import {
  ApiTags,
  ApiOperation,
  ApiResponse,
  ApiParam,
  ApiQuery,
} from '@nestjs/swagger';
import { SalesOrderService } from '../services/sales-order.service';
import {
  CreateSalesOrderDto,
  UpdateSalesOrderDto,
  QuerySalesOrdersDto,
  SalesOrderResponseDto,
  SalesOrderSummaryDto,
  ShipOrderDto,
  CancelOrderDto,
} from '../dto/sales-order.dto';

@ApiTags('Sales Orders')
@Controller('sales-orders')
export class SalesOrderController {
  constructor(private readonly salesOrderService: SalesOrderService) {}

  @Post()
  @ApiOperation({ summary: 'Create a new sales order' })
  @ApiResponse({
    status: 201,
    description: 'Sales order created successfully',
    type: SalesOrderResponseDto,
  })
  @ApiResponse({ status: 400, description: 'Invalid input data' })
  @ApiResponse({ status: 409, description: 'Insufficient inventory or credit limit exceeded' })
  async createSalesOrder(
    @Body() createSalesOrderDto: CreateSalesOrderDto,
  ) {
    const data = await this.salesOrderService.create(createSalesOrderDto, null); // Auth removed - no user tracking
    return { data };
  }

  @Get()
  @ApiOperation({ summary: 'Get all sales orders with filtering and pagination' })
  @ApiResponse({
    status: 200,
    description: 'List of sales orders retrieved successfully',
    type: [SalesOrderResponseDto],
  })
  @ApiQuery({ name: 'search', required: false, description: 'Search by order number or customer name' })
  @ApiQuery({ name: 'customerId', required: false, description: 'Filter by customer ID' })
  @ApiQuery({ name: 'status', required: false, description: 'Filter by order status' })
  @ApiQuery({ name: 'priority', required: false, description: 'Filter by order priority' })
  @ApiQuery({ name: 'fromDate', required: false, description: 'Filter orders from date' })
  @ApiQuery({ name: 'toDate', required: false, description: 'Filter orders to date' })
  @ApiQuery({ name: 'overdue', required: false, type: Boolean, description: 'Filter overdue orders' })
  @ApiQuery({ name: 'sortBy', required: false, description: 'Sort field' })
  @ApiQuery({ name: 'sortOrder', required: false, enum: ['ASC', 'DESC'], description: 'Sort order' })
  @ApiQuery({ name: 'page', required: false, type: Number, description: 'Page number' })
  @ApiQuery({ name: 'limit', required: false, type: Number, description: 'Items per page' })
  async getAllSalesOrders(@Query() query: QuerySalesOrdersDto) {
    const data = await this.salesOrderService.findAll(query);
    return data; // findAll already returns paginated response structure
  }

  @Get('summary')
  @ApiOperation({ summary: 'Get sales orders summary list' })
  @ApiResponse({
    status: 200,
    description: 'Sales order summaries retrieved successfully',
    type: [SalesOrderSummaryDto],
  })
  async getSalesOrderSummaries(): Promise<SalesOrderSummaryDto[]> {
    return this.salesOrderService.findSummaries();
  }

  @Get('dashboard-stats')
  @ApiOperation({ summary: 'Get sales order dashboard statistics' })
  @ApiResponse({
    status: 200,
    description: 'Dashboard statistics retrieved successfully',
  })
  async getDashboardStats() {
    return this.salesOrderService.getDashboardStats();
  }

  @Get(':id')
  @ApiOperation({ summary: 'Get sales order by ID' })
  @ApiParam({ name: 'id', description: 'Sales order ID', type: 'string' })
  @ApiResponse({
    status: 200,
    description: 'Sales order retrieved successfully',
    type: SalesOrderResponseDto,
  })
  @ApiResponse({ status: 404, description: 'Sales order not found' })
  async getSalesOrderById(@Param('id', ParseUUIDPipe) id: string): Promise<SalesOrderResponseDto> {
    return this.salesOrderService.findById(id);
  }

  @Get('number/:orderNumber')
  @ApiOperation({ summary: 'Get sales order by order number' })
  @ApiParam({ name: 'orderNumber', description: 'Order number', type: 'string' })
  @ApiResponse({
    status: 200,
    description: 'Sales order retrieved successfully',
    type: SalesOrderResponseDto,
  })
  @ApiResponse({ status: 404, description: 'Sales order not found' })
  async getSalesOrderByNumber(@Param('orderNumber') orderNumber: string): Promise<SalesOrderResponseDto> {
    return this.salesOrderService.findByOrderNumber(orderNumber);
  }

  @Put(':id')
  @ApiOperation({ summary: 'Update sales order' })
  @ApiParam({ name: 'id', description: 'Sales order ID', type: 'string' })
  @ApiResponse({
    status: 200,
    description: 'Sales order updated successfully',
    type: SalesOrderResponseDto,
  })
  @ApiResponse({ status: 404, description: 'Sales order not found' })
  @ApiResponse({ status: 400, description: 'Invalid input data' })
  async updateSalesOrder(
    @Param('id', ParseUUIDPipe) id: string,
    @Body() updateSalesOrderDto: UpdateSalesOrderDto,
  ): Promise<SalesOrderResponseDto> {
    return this.salesOrderService.update(id, updateSalesOrderDto);
  }

  @Delete(':id')
  @ApiOperation({ summary: 'Delete sales order (soft delete)' })
  @ApiParam({ name: 'id', description: 'Sales order ID', type: 'string' })
  @ApiResponse({ status: 204, description: 'Sales order deleted successfully' })
  @ApiResponse({ status: 404, description: 'Sales order not found' })
  @ApiResponse({ status: 409, description: 'Cannot delete order in current status' })
  @HttpCode(HttpStatus.NO_CONTENT)
  async deleteSalesOrder(@Param('id', ParseUUIDPipe) id: string): Promise<void> {
    return this.salesOrderService.delete(id);
  }

  @Put(':id/confirm')
  @ApiOperation({ summary: 'Confirm sales order' })
  @ApiParam({ name: 'id', description: 'Sales order ID', type: 'string' })
  @ApiResponse({
    status: 200,
    description: 'Sales order confirmed successfully',
    type: SalesOrderResponseDto,
  })
  @ApiResponse({ status: 404, description: 'Sales order not found' })
  @ApiResponse({ status: 409, description: 'Cannot confirm order in current status' })
  async confirmOrder(@Param('id', ParseUUIDPipe) id: string): Promise<SalesOrderResponseDto> {
    return this.salesOrderService.confirmOrder(id);
  }

  @Put(':id/ship')
  @ApiOperation({ summary: 'Ship sales order' })
  @ApiParam({ name: 'id', description: 'Sales order ID', type: 'string' })
  @ApiResponse({
    status: 200,
    description: 'Sales order shipped successfully',
    type: SalesOrderResponseDto,
  })
  @ApiResponse({ status: 404, description: 'Sales order not found' })
  @ApiResponse({ status: 409, description: 'Cannot ship order in current status' })
  async shipOrder(
    @Param('id', ParseUUIDPipe) id: string,
    @Body() shipOrderDto: ShipOrderDto,
  ): Promise<SalesOrderResponseDto> {
    return this.salesOrderService.shipOrder(id, shipOrderDto);
  }

  @Put(':id/deliver')
  @ApiOperation({ summary: 'Mark sales order as delivered' })
  @ApiParam({ name: 'id', description: 'Sales order ID', type: 'string' })
  @ApiResponse({
    status: 200,
    description: 'Sales order marked as delivered successfully',
    type: SalesOrderResponseDto,
  })
  @ApiResponse({ status: 404, description: 'Sales order not found' })
  @ApiResponse({ status: 409, description: 'Cannot deliver order in current status' })
  async deliverOrder(@Param('id', ParseUUIDPipe) id: string): Promise<SalesOrderResponseDto> {
    return this.salesOrderService.deliverOrder(id);
  }

  @Put(':id/complete')
  @ApiOperation({ summary: 'Complete sales order' })
  @ApiParam({ name: 'id', description: 'Sales order ID', type: 'string' })
  @ApiResponse({
    status: 200,
    description: 'Sales order completed successfully',
    type: SalesOrderResponseDto,
  })
  @ApiResponse({ status: 404, description: 'Sales order not found' })
  @ApiResponse({ status: 409, description: 'Cannot complete order in current status' })
  async completeOrder(@Param('id', ParseUUIDPipe) id: string): Promise<SalesOrderResponseDto> {
    return this.salesOrderService.completeOrder(id);
  }

  @Put(':id/cancel')
  @ApiOperation({ summary: 'Cancel sales order' })
  @ApiParam({ name: 'id', description: 'Sales order ID', type: 'string' })
  @ApiResponse({
    status: 200,
    description: 'Sales order cancelled successfully',
    type: SalesOrderResponseDto,
  })
  @ApiResponse({ status: 404, description: 'Sales order not found' })
  @ApiResponse({ status: 409, description: 'Cannot cancel order in current status' })
  async cancelOrder(
    @Param('id', ParseUUIDPipe) id: string,
    @Body() cancelOrderDto: CancelOrderDto,
  ): Promise<SalesOrderResponseDto> {
    return this.salesOrderService.cancelOrder(id, cancelOrderDto.reason);
  }

  @Post(':id/duplicate')
  @ApiOperation({ summary: 'Duplicate sales order' })
  @ApiParam({ name: 'id', description: 'Sales order ID to duplicate', type: 'string' })
  @ApiResponse({
    status: 201,
    description: 'Sales order duplicated successfully',
    type: SalesOrderResponseDto,
  })
  @ApiResponse({ status: 404, description: 'Sales order not found' })
  async duplicateOrder(
    @Param('id', ParseUUIDPipe) id: string,
  ): Promise<SalesOrderResponseDto> {
    return this.salesOrderService.duplicateOrder(id, null); // Auth removed - no user tracking
  }

  @Get(':id/fulfillment-status')
  @ApiOperation({ summary: 'Get order fulfillment status' })
  @ApiParam({ name: 'id', description: 'Sales order ID', type: 'string' })
  @ApiResponse({
    status: 200,
    description: 'Fulfillment status retrieved successfully',
  })
  @ApiResponse({ status: 404, description: 'Sales order not found' })
  async getFulfillmentStatus(@Param('id', ParseUUIDPipe) id: string) {
    return this.salesOrderService.getFulfillmentStatus(id);
  }

  @Get('customer/:customerId')
  @ApiOperation({ summary: 'Get sales orders for a specific customer' })
  @ApiParam({ name: 'customerId', description: 'Customer ID', type: 'string' })
  @ApiResponse({
    status: 200,
    description: 'Customer sales orders retrieved successfully',
    type: [SalesOrderSummaryDto],
  })
  @ApiResponse({ status: 404, description: 'Customer not found' })
  async getOrdersByCustomer(
    @Param('customerId', ParseUUIDPipe) customerId: string,
    @Query('limit') limit?: number,
  ) {
    return this.salesOrderService.findOrdersByCustomer(customerId, limit);
  }

  @Get(':id/invoices')
  @ApiOperation({ summary: 'Get invoices related to sales order' })
  @ApiParam({ name: 'id', description: 'Sales order ID', type: 'string' })
  @ApiResponse({
    status: 200,
    description: 'Related invoices retrieved successfully',
  })
  @ApiResponse({ status: 404, description: 'Sales order not found' })
  async getOrderInvoices(@Param('id', ParseUUIDPipe) id: string) {
    return this.salesOrderService.getOrderInvoices(id);
  }

  @Post(':id/create-invoice')
  @ApiOperation({ summary: 'Create invoice from sales order' })
  @ApiParam({ name: 'id', description: 'Sales order ID', type: 'string' })
  @ApiResponse({
    status: 201,
    description: 'Invoice created successfully from sales order',
  })
  @ApiResponse({ status: 404, description: 'Sales order not found' })
  @ApiResponse({ status: 409, description: 'Cannot create invoice for order in current status' })
  async createInvoiceFromOrder(@Param('id', ParseUUIDPipe) id: string) {
    return this.salesOrderService.createInvoiceFromOrder(id);
  }
}