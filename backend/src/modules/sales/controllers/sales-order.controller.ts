import {
  Controller,
  Get,
  Post,
  Put,
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
} from '@nestjs/swagger';
import { SalesOrderService } from '../services/sales-order.service';
import {
  CreateSalesOrderDto,
  UpdateSalesOrderDto,
  QuerySalesOrdersDto,
  SalesOrderResponseDto,
  SalesOrderSummaryDto,
  RecordPaymentDto,
  RecordRefundDto,
  RecordRefundsDto,
  RecordPaymentsDto,
} from '../dto/sales-order.dto';
import { CurrentUser } from '../../auth/decorators/current-user.decorator';

@ApiTags('Sales Orders')
@Controller('sales-orders')
export class SalesOrderController {
  constructor(private readonly salesOrderService: SalesOrderService) {}

  @Post()
  @ApiOperation({ summary: 'Create a new sales order' })
  @ApiResponse({ status: 201, type: SalesOrderResponseDto })
  async createSalesOrder(
    @Body() dto: CreateSalesOrderDto,
    @CurrentUser('userId') userId: string,
    @CurrentUser('username') username: string,
  ) {
    const data = await this.salesOrderService.create(dto, userId, username);
    return { data };
  }

  @Get('summary')
  @ApiOperation({ summary: 'Get sales orders summary list' })
  @ApiResponse({ status: 200, type: [SalesOrderSummaryDto] })
  async getSalesOrderSummaries() {
    return this.salesOrderService.findSummaries();
  }

  @Get('dashboard-stats')
  @ApiOperation({ summary: 'Get sales order dashboard statistics' })
  async getDashboardStats() {
    return this.salesOrderService.getDashboardStats();
  }

  @Get()
  @ApiOperation({ summary: 'List sales orders' })
  @ApiQuery({ name: 'status', required: false, enum: ['DRAFT', 'FULFILLED', 'CANCELLED'] })
  @ApiQuery({ name: 'paymentStatus', required: false, enum: ['UNPAID', 'PARTIAL', 'PAID', 'OVERPAID'] })
  @ApiQuery({ name: 'customerId', required: false })
  @ApiQuery({ name: 'fromDate', required: false })
  @ApiQuery({ name: 'toDate', required: false })
  @ApiQuery({ name: 'search', required: false })
  @ApiQuery({ name: 'sortBy', required: false })
  @ApiQuery({ name: 'sortOrder', required: false, enum: ['ASC', 'DESC'] })
  @ApiQuery({ name: 'page', required: false, type: Number })
  @ApiQuery({ name: 'limit', required: false, type: Number })
  async getAllSalesOrders(@Query() query: QuerySalesOrdersDto) {
    return this.salesOrderService.findAll(query);
  }

  @Get('customer/:customerId')
  @ApiOperation({ summary: 'Get sales orders for a customer' })
  @ApiParam({ name: 'customerId', type: 'string' })
  async getOrdersByCustomer(
    @Param('customerId', ParseUUIDPipe) customerId: string,
    @Query('limit') limit?: number,
  ) {
    return this.salesOrderService.findOrdersByCustomer(customerId, limit);
  }

  @Get('number/:orderNumber')
  @ApiOperation({ summary: 'Get sales order by order number' })
  async getSalesOrderByNumber(@Param('orderNumber') orderNumber: string): Promise<SalesOrderResponseDto> {
    return this.salesOrderService.findByOrderNumber(orderNumber);
  }

  @Get(':id')
  @ApiOperation({ summary: 'Get sales order by ID' })
  @ApiParam({ name: 'id', type: 'string' })
  @ApiResponse({ status: 200, type: SalesOrderResponseDto })
  async getSalesOrderById(@Param('id', ParseUUIDPipe) id: string): Promise<SalesOrderResponseDto> {
    return this.salesOrderService.findById(id);
  }

  @Put(':id')
  @ApiOperation({ summary: 'Update sales order (DRAFT or READY; FULFILLED/CANCELLED locked)' })
  @ApiParam({ name: 'id', type: 'string' })
  async updateSalesOrder(
    @Param('id', ParseUUIDPipe) id: string,
    @Body() dto: UpdateSalesOrderDto,
    @CurrentUser('userId') userId: string,
    @CurrentUser('username') username: string,
  ): Promise<SalesOrderResponseDto> {
    return this.salesOrderService.update(id, dto, userId, username);
  }

  @Post(':id/fulfill')
  @ApiOperation({ summary: 'Fulfill order (requires status = READY)' })
  @ApiParam({ name: 'id', type: 'string' })
  async fulfillOrder(
    @Param('id', ParseUUIDPipe) id: string,
    @CurrentUser('userId') userId: string,
    @CurrentUser('username') username: string,
  ) {
    const data = await this.salesOrderService.fulfillOrder(id, userId, username);
    return { data };
  }

  @Post(':id/unfulfill')
  @ApiOperation({ summary: 'Unfulfill order (always allowed from FULFILLED)' })
  @ApiParam({ name: 'id', type: 'string' })
  async unfulfillOrder(
    @Param('id', ParseUUIDPipe) id: string,
    @CurrentUser('userId') userId: string,
    @CurrentUser('username') username: string,
  ) {
    const data = await this.salesOrderService.unfulfillOrder(id, userId, username);
    return { data };
  }

  @Post(':id/cancel')
  @ApiOperation({ summary: 'Cancel order (DRAFT + UNPAID only)' })
  @ApiParam({ name: 'id', type: 'string' })
  @HttpCode(HttpStatus.OK)
  async cancelOrder(
    @Param('id', ParseUUIDPipe) id: string,
    @CurrentUser('userId') userId: string,
    @CurrentUser('username') username: string,
  ) {
    const data = await this.salesOrderService.cancel(id, userId, username);
    return { data };
  }

  @Post(':id/uncancel')
  @ApiOperation({ summary: 'Uncancel order (CANCELLED -> DRAFT)' })
  @ApiParam({ name: 'id', type: 'string' })
  @HttpCode(HttpStatus.OK)
  async uncancelOrder(
    @Param('id', ParseUUIDPipe) id: string,
    @CurrentUser('userId') userId: string,
    @CurrentUser('username') username: string,
  ) {
    const data = await this.salesOrderService.uncancel(id, userId, username);
    return { data };
  }

  @Get(':id/payments')
  @ApiOperation({ summary: 'List payment records for a sales order' })
  @ApiParam({ name: 'id', type: 'string' })
  async listPayments(@Param('id', ParseUUIDPipe) id: string) {
    const data = await this.salesOrderService.listPayments(id);
    return { data };
  }

  @Post(':id/payments')
  @ApiOperation({ summary: 'Record a payment (DRAFT orders only)' })
  @ApiParam({ name: 'id', type: 'string' })
  @HttpCode(HttpStatus.OK)
  async recordPayment(
    @Param('id', ParseUUIDPipe) id: string,
    @Body() dto: RecordPaymentDto,
    @CurrentUser('userId') userId: string,
    @CurrentUser('username') username: string,
  ) {
    const data = await this.salesOrderService.recordPayment(id, dto, userId, username);
    return { data };
  }

  @Post(':id/payments/batch')
  @ApiOperation({ summary: 'Record one or more payments (batch)' })
  @HttpCode(HttpStatus.OK)
  async recordPaymentsBatch(
    @Param('id', ParseUUIDPipe) id: string,
    @Body() dto: RecordPaymentsDto,
    @CurrentUser('userId') userId: string,
    @CurrentUser('username') username: string,
  ) {
    const data = await this.salesOrderService.recordPayments(id, dto.payments, userId, username);
    return { data };
  }

  @Post(':id/refunds')
  @ApiOperation({ summary: 'Record one or more refunds (creates negative payment records)' })
  async recordRefunds(
    @Param('id', ParseUUIDPipe) id: string,
    @Body() dto: RecordRefundsDto,
    @CurrentUser('userId') userId: string,
    @CurrentUser('username') username: string,
  ) {
    const data = await this.salesOrderService.recordRefunds(id, dto.refunds, userId, username)
    return { data }
  }

  @Post(':id/duplicate')
  @ApiOperation({ summary: 'Duplicate sales order' })
  @ApiParam({ name: 'id', type: 'string' })
  async duplicateOrder(@Param('id', ParseUUIDPipe) id: string): Promise<SalesOrderResponseDto> {
    return this.salesOrderService.duplicateOrder(id, null);
  }
}
