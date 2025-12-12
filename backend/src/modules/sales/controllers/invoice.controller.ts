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
  Res,
} from '@nestjs/common';
import {
  ApiTags,
  ApiOperation,
  ApiResponse,
  ApiParam,
  ApiQuery,
} from '@nestjs/swagger';
import { Response } from 'express';
import { InvoiceService } from '../services/invoice.service';
import {
  CreateInvoiceDto,
  UpdateInvoiceDto,
  QueryInvoicesDto,
  InvoiceResponseDto,
  InvoiceSummaryDto,
  SendInvoiceDto,
  InvoicePaymentAllocationDto,
  VoidInvoiceDto,
} from '../dto/invoice.dto';

@ApiTags('Invoices')
@Controller('invoices')
export class InvoiceController {
  constructor(private readonly invoiceService: InvoiceService) {}

  @Post()
  @ApiOperation({ summary: 'Create a new invoice' })
  @ApiResponse({
    status: 201,
    description: 'Invoice created successfully',
    type: InvoiceResponseDto,
  })
  @ApiResponse({ status: 400, description: 'Invalid input data' })
  @ApiResponse({ status: 404, description: 'Customer or sales order not found' })
  async createInvoice(@Body() createInvoiceDto: CreateInvoiceDto): Promise<InvoiceResponseDto> {
    return this.invoiceService.create(createInvoiceDto);
  }

  @Get()
  @ApiOperation({ summary: 'Get all invoices with filtering' })
  @ApiResponse({
    status: 200,
    description: 'List of invoices retrieved successfully',
    type: [InvoiceResponseDto],
  })
  @ApiQuery({ name: 'search', required: false, description: 'Search by invoice number or customer name' })
  @ApiQuery({ name: 'customerId', required: false, description: 'Filter by customer ID' })
  @ApiQuery({ name: 'salesOrderId', required: false, description: 'Filter by sales order ID' })
  @ApiQuery({ name: 'status', required: false, description: 'Filter by invoice status' })
  @ApiQuery({ name: 'fromDate', required: false, description: 'Filter invoices from date' })
  @ApiQuery({ name: 'toDate', required: false, description: 'Filter invoices to date' })
  @ApiQuery({ name: 'overdue', required: false, type: Boolean, description: 'Filter overdue invoices' })
  @ApiQuery({ name: 'unpaid', required: false, type: Boolean, description: 'Filter unpaid invoices' })
  @ApiQuery({ name: 'sortBy', required: false, description: 'Sort field' })
  @ApiQuery({ name: 'sortOrder', required: false, enum: ['ASC', 'DESC'], description: 'Sort order' })
  async getAllInvoices(@Query() query: QueryInvoicesDto) {
    return this.invoiceService.findAll(query);
  }

  @Get('deleted')
  @ApiOperation({ summary: 'Get all soft-deleted invoices' })
  @ApiResponse({
    status: 200,
    description: 'Soft-deleted invoices retrieved successfully',
  })
  async getDeletedInvoices(@Query() query: QueryInvoicesDto) {
    return this.invoiceService.findDeleted(query);
  }

  @Get('summary')
  @ApiOperation({ summary: 'Get invoices summary list' })
  @ApiResponse({
    status: 200,
    description: 'Invoice summaries retrieved successfully',
    type: [InvoiceSummaryDto],
  })
  async getInvoiceSummaries(): Promise<InvoiceSummaryDto[]> {
    return this.invoiceService.findSummaries();
  }

  @Get('dashboard-stats')
  @ApiOperation({ summary: 'Get invoice dashboard statistics' })
  @ApiResponse({
    status: 200,
    description: 'Dashboard statistics retrieved successfully',
  })
  async getDashboardStats() {
    return this.invoiceService.getDashboardStats();
  }

  @Get('overdue')
  @ApiOperation({ summary: 'Get overdue invoices' })
  @ApiResponse({
    status: 200,
    description: 'Overdue invoices retrieved successfully',
    type: [InvoiceSummaryDto],
  })
  async getOverdueInvoices() {
    return this.invoiceService.getOverdueInvoices();
  }

  @Get('aging-report')
  @ApiOperation({ summary: 'Get invoice aging report' })
  @ApiResponse({
    status: 200,
    description: 'Aging report retrieved successfully',
  })
  async getAgingReport() {
    return this.invoiceService.getAgingReport();
  }

  @Get(':id')
  @ApiOperation({ summary: 'Get invoice by ID' })
  @ApiParam({ name: 'id', description: 'Invoice ID', type: 'string' })
  @ApiResponse({
    status: 200,
    description: 'Invoice retrieved successfully',
    type: InvoiceResponseDto,
  })
  @ApiResponse({ status: 404, description: 'Invoice not found' })
  async getInvoiceById(@Param('id', ParseUUIDPipe) id: string): Promise<InvoiceResponseDto> {
    return this.invoiceService.findById(id);
  }

  @Get('number/:invoiceNumber')
  @ApiOperation({ summary: 'Get invoice by invoice number' })
  @ApiParam({ name: 'invoiceNumber', description: 'Invoice number', type: 'string' })
  @ApiResponse({
    status: 200,
    description: 'Invoice retrieved successfully',
    type: InvoiceResponseDto,
  })
  @ApiResponse({ status: 404, description: 'Invoice not found' })
  async getInvoiceByNumber(@Param('invoiceNumber') invoiceNumber: string): Promise<InvoiceResponseDto> {
    return this.invoiceService.findByInvoiceNumber(invoiceNumber);
  }

  @Put(':id')
  @ApiOperation({ summary: 'Update invoice' })
  @ApiParam({ name: 'id', description: 'Invoice ID', type: 'string' })
  @ApiResponse({
    status: 200,
    description: 'Invoice updated successfully',
    type: InvoiceResponseDto,
  })
  @ApiResponse({ status: 404, description: 'Invoice not found' })
  @ApiResponse({ status: 400, description: 'Invalid input data' })
  @ApiResponse({ status: 409, description: 'Cannot update invoice in current status' })
  async updateInvoice(
    @Param('id', ParseUUIDPipe) id: string,
    @Body() updateInvoiceDto: UpdateInvoiceDto,
  ): Promise<InvoiceResponseDto> {
    return this.invoiceService.update(id, updateInvoiceDto);
  }

  @Put(':id/sync-items')
  @ApiOperation({ summary: 'Sync invoice items from linked sales order' })
  @ApiParam({ name: 'id', description: 'Invoice ID', type: 'string' })
  @ApiResponse({
    status: 200,
    description: 'Invoice items synced successfully from sales order',
    type: InvoiceResponseDto,
  })
  @ApiResponse({ status: 404, description: 'Invoice or sales order not found' })
  @ApiResponse({ status: 400, description: 'Invoice not linked to sales order or sales order has no items' })
  @ApiResponse({ status: 409, description: 'Cannot sync items for fully paid invoice' })
  async syncItemsFromSalesOrder(
    @Param('id', ParseUUIDPipe) id: string,
  ): Promise<InvoiceResponseDto> {
    return this.invoiceService.syncItemsFromSalesOrder(id);
  }

  @Delete(':id')
  @ApiOperation({ summary: 'Delete invoice (soft delete)' })
  @ApiParam({ name: 'id', description: 'Invoice ID', type: 'string' })
  @ApiResponse({ status: 204, description: 'Invoice deleted successfully' })
  @ApiResponse({ status: 404, description: 'Invoice not found' })
  @ApiResponse({ status: 409, description: 'Cannot delete invoice in current status' })
  @HttpCode(HttpStatus.NO_CONTENT)
  async deleteInvoice(@Param('id', ParseUUIDPipe) id: string): Promise<void> {
    return this.invoiceService.delete(id);
  }

  @Post(':id/send')
  @ApiOperation({ summary: 'Send invoice to customer' })
  @ApiParam({ name: 'id', description: 'Invoice ID', type: 'string' })
  @ApiResponse({
    status: 200,
    description: 'Invoice sent successfully',
    type: InvoiceResponseDto,
  })
  @ApiResponse({ status: 404, description: 'Invoice not found' })
  @ApiResponse({ status: 409, description: 'Cannot send invoice in current status' })
  async sendInvoice(
    @Param('id', ParseUUIDPipe) id: string,
    @Body() sendInvoiceDto: SendInvoiceDto,
  ): Promise<InvoiceResponseDto> {
    return this.invoiceService.sendInvoice(id, sendInvoiceDto);
  }

  @Put(':id/mark-sent')
  @ApiOperation({ summary: 'Mark invoice as sent' })
  @ApiParam({ name: 'id', description: 'Invoice ID', type: 'string' })
  @ApiResponse({
    status: 200,
    description: 'Invoice marked as sent successfully',
    type: InvoiceResponseDto,
  })
  @ApiResponse({ status: 404, description: 'Invoice not found' })
  async markAsSent(@Param('id', ParseUUIDPipe) id: string): Promise<InvoiceResponseDto> {
    return this.invoiceService.markAsSent(id);
  }

  @Post(':id/allocate-payment')
  @ApiOperation({ summary: 'Allocate payment to invoice' })
  @ApiParam({ name: 'id', description: 'Invoice ID', type: 'string' })
  @ApiResponse({
    status: 200,
    description: 'Payment allocated successfully',
    type: InvoiceResponseDto,
  })
  @ApiResponse({ status: 404, description: 'Invoice or payment not found' })
  @ApiResponse({ status: 409, description: 'Payment amount exceeds balance due' })
  async allocatePayment(
    @Param('id', ParseUUIDPipe) id: string,
    @Body() allocationDto: InvoicePaymentAllocationDto,
  ): Promise<InvoiceResponseDto> {
    return this.invoiceService.allocatePayment(id, allocationDto);
  }

  @Put(':id/void')
  @ApiOperation({ summary: 'Void invoice' })
  @ApiParam({ name: 'id', description: 'Invoice ID', type: 'string' })
  @ApiResponse({
    status: 200,
    description: 'Invoice voided successfully',
    type: InvoiceResponseDto,
  })
  @ApiResponse({ status: 404, description: 'Invoice not found' })
  @ApiResponse({ status: 409, description: 'Cannot void invoice in current status' })
  async voidInvoice(
    @Param('id', ParseUUIDPipe) id: string,
    @Body() voidInvoiceDto: VoidInvoiceDto,
  ): Promise<InvoiceResponseDto> {
    return this.invoiceService.voidInvoice(id, voidInvoiceDto.reason);
  }

  
  @Post(':id/duplicate')
  @ApiOperation({ summary: 'Duplicate invoice' })
  @ApiParam({ name: 'id', description: 'Invoice ID to duplicate', type: 'string' })
  @ApiResponse({
    status: 201,
    description: 'Invoice duplicated successfully',
    type: InvoiceResponseDto,
  })
  @ApiResponse({ status: 404, description: 'Invoice not found' })
  async duplicateInvoice(@Param('id', ParseUUIDPipe) id: string): Promise<InvoiceResponseDto> {
    return this.invoiceService.duplicateInvoice(id);
  }


  @Get(':id/payments')
  @ApiOperation({ summary: 'Get payments for invoice' })
  @ApiParam({ name: 'id', description: 'Invoice ID', type: 'string' })
  @ApiResponse({
    status: 200,
    description: 'Invoice payments retrieved successfully',
  })
  @ApiResponse({ status: 404, description: 'Invoice not found' })
  async getInvoicePayments(@Param('id', ParseUUIDPipe) id: string) {
    return this.invoiceService.getInvoicePayments(id);
  }

  @Get('customer/:customerId')
  @ApiOperation({ summary: 'Get invoices for a specific customer' })
  @ApiParam({ name: 'customerId', description: 'Customer ID', type: 'string' })
  @ApiResponse({
    status: 200,
    description: 'Customer invoices retrieved successfully',
    type: [InvoiceSummaryDto],
  })
  @ApiResponse({ status: 404, description: 'Customer not found' })
  async getInvoicesByCustomer(
    @Param('customerId', ParseUUIDPipe) customerId: string,
    @Query('limit') limit?: number,
  ) {
    return this.invoiceService.findInvoicesByCustomer(customerId, limit);
  }

  @Get(':id/history')
  @ApiOperation({ summary: 'Get invoice history and activity log' })
  @ApiParam({ name: 'id', description: 'Invoice ID', type: 'string' })
  @ApiResponse({
    status: 200,
    description: 'Invoice history retrieved successfully',
  })
  @ApiResponse({ status: 404, description: 'Invoice not found' })
  async getInvoiceHistory(@Param('id', ParseUUIDPipe) id: string) {
    return this.invoiceService.getInvoiceHistory(id);
  }

  @Post('batch-send')
  @ApiOperation({ summary: 'Send multiple invoices in batch' })
  @ApiResponse({
    status: 200,
    description: 'Batch send completed',
  })
  @ApiResponse({ status: 400, description: 'Invalid invoice IDs provided' })
  async batchSendInvoices(@Body('invoiceIds') invoiceIds: string[]) {
    return this.invoiceService.batchSendInvoices(invoiceIds);
  }

  @Get('stats/revenue')
  @ApiOperation({ summary: 'Get revenue statistics from invoices' })
  @ApiResponse({
    status: 200,
    description: 'Revenue statistics retrieved successfully',
  })
  async getRevenueStats(
    @Query('fromDate') fromDate?: string,
    @Query('toDate') toDate?: string,
  ) {
    return this.invoiceService.getRevenueStatistics(fromDate, toDate);
  }

  @Post(':id/restore')
  @ApiOperation({ summary: 'Restore soft-deleted invoice' })
  @ApiParam({ name: 'id', description: 'Invoice ID', type: 'string' })
  @ApiResponse({
    status: 200,
    description: 'Invoice restored successfully',
    type: InvoiceResponseDto,
  })
  @ApiResponse({ status: 404, description: 'Invoice not found' })
  @ApiResponse({ status: 409, description: 'Invoice is not deleted' })
  async restoreInvoice(@Param('id', ParseUUIDPipe) id: string): Promise<InvoiceResponseDto> {
    return this.invoiceService.restore(id);
  }

  @Post('bulk-restore')
  @ApiOperation({ summary: 'Bulk restore soft-deleted invoices' })
  @ApiResponse({
    status: 200,
    description: 'Invoices restored successfully',
  })
  @ApiResponse({ status: 400, description: 'Invalid input data' })
  async bulkRestoreInvoices(
    @Body()
    body: {
      invoiceIds: string[];
    },
  ): Promise<{ message: string; restoredCount: number; failedIds: string[] }> {
    const result = await this.invoiceService.bulkRestore(body.invoiceIds);
    return {
      message: `Successfully restored ${result.restoredCount} of ${body.invoiceIds.length} invoices`,
      restoredCount: result.restoredCount,
      failedIds: result.failedIds,
    };
  }
}