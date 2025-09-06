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
} from '@nestjs/common';
import {
  ApiTags,
  ApiOperation,
  ApiResponse,
  ApiParam,
  ApiQuery,
} from '@nestjs/swagger';
import { CustomerService } from '../services/customer.service';
import {
  CreateCustomerDto,
  UpdateCustomerDto,
  QueryCustomersDto,
  CustomerResponseDto,
  CustomerSummaryDto,
  CreditCheckDto,
  CreditCheckResponseDto,
} from '../dto/customer.dto';

@ApiTags('Customers')
@Controller('v1/customers')
export class CustomerController {
  constructor(private readonly customerService: CustomerService) {}

  @Post()
  @ApiOperation({ summary: 'Create a new customer' })
  @ApiResponse({
    status: 201,
    description: 'Customer created successfully',
    type: CustomerResponseDto,
  })
  @ApiResponse({ status: 400, description: 'Invalid input data' })
  @ApiResponse({ status: 409, description: 'Customer with email already exists' })
  async createCustomer(@Body() createCustomerDto: CreateCustomerDto): Promise<CustomerResponseDto> {
    return this.customerService.create(createCustomerDto);
  }

  @Get()
  @ApiOperation({ summary: 'Get all customers with filtering and pagination' })
  @ApiResponse({
    status: 200,
    description: 'List of customers retrieved successfully',
    type: [CustomerResponseDto],
  })
  @ApiQuery({ name: 'search', required: false, description: 'Search customers by name, email, or phone' })
  @ApiQuery({ name: 'type', required: false, enum: ['individual', 'business'], description: 'Filter by customer type' })
  @ApiQuery({ name: 'status', required: false, enum: ['active', 'inactive', 'suspended', 'blacklisted'], description: 'Filter by status' })
  @ApiQuery({ name: 'priceLevel', required: false, enum: ['retail', 'wholesale', 'special'], description: 'Filter by price level' })
  @ApiQuery({ name: 'isActive', required: false, type: Boolean, description: 'Filter by active status' })
  @ApiQuery({ name: 'sortBy', required: false, description: 'Sort field' })
  @ApiQuery({ name: 'sortOrder', required: false, enum: ['ASC', 'DESC'], description: 'Sort order' })
  @ApiQuery({ name: 'page', required: false, type: Number, description: 'Page number' })
  @ApiQuery({ name: 'limit', required: false, type: Number, description: 'Items per page' })
  async getAllCustomers(@Query() query: QueryCustomersDto) {
    return this.customerService.findAll(query);
  }

  @Get('summary')
  @ApiOperation({ summary: 'Get customers summary list' })
  @ApiResponse({
    status: 200,
    description: 'Customer summaries retrieved successfully',
    type: [CustomerSummaryDto],
  })
  async getCustomerSummaries(): Promise<CustomerSummaryDto[]> {
    return this.customerService.findSummaries();
  }

  @Get(':id')
  @ApiOperation({ summary: 'Get customer by ID' })
  @ApiParam({ name: 'id', description: 'Customer ID', type: 'string' })
  @ApiResponse({
    status: 200,
    description: 'Customer retrieved successfully',
    type: CustomerResponseDto,
  })
  @ApiResponse({ status: 404, description: 'Customer not found' })
  async getCustomerById(@Param('id', ParseUUIDPipe) id: string): Promise<CustomerResponseDto> {
    return this.customerService.findById(id);
  }

  @Get('code/:customerCode')
  @ApiOperation({ summary: 'Get customer by customer code' })
  @ApiParam({ name: 'customerCode', description: 'Customer code', type: 'string' })
  @ApiResponse({
    status: 200,
    description: 'Customer retrieved successfully',
    type: CustomerResponseDto,
  })
  @ApiResponse({ status: 404, description: 'Customer not found' })
  async getCustomerByCode(@Param('customerCode') customerCode: string): Promise<CustomerResponseDto> {
    return this.customerService.findByCode(customerCode);
  }

  @Put(':id')
  @ApiOperation({ summary: 'Update customer' })
  @ApiParam({ name: 'id', description: 'Customer ID', type: 'string' })
  @ApiResponse({
    status: 200,
    description: 'Customer updated successfully',
    type: CustomerResponseDto,
  })
  @ApiResponse({ status: 404, description: 'Customer not found' })
  @ApiResponse({ status: 400, description: 'Invalid input data' })
  async updateCustomer(
    @Param('id', ParseUUIDPipe) id: string,
    @Body() updateCustomerDto: UpdateCustomerDto,
  ): Promise<CustomerResponseDto> {
    return this.customerService.update(id, updateCustomerDto);
  }

  @Delete(':id')
  @ApiOperation({ summary: 'Delete customer' })
  @ApiParam({ name: 'id', description: 'Customer ID', type: 'string' })
  @ApiResponse({ status: 204, description: 'Customer deleted successfully' })
  @ApiResponse({ status: 404, description: 'Customer not found' })
  @ApiResponse({ status: 409, description: 'Cannot delete customer with existing orders' })
  @HttpCode(HttpStatus.NO_CONTENT)
  async deleteCustomer(@Param('id', ParseUUIDPipe) id: string): Promise<void> {
    return this.customerService.delete(id);
  }

  @Post('credit-check')
  @ApiOperation({ summary: 'Check customer credit limit' })
  @ApiResponse({
    status: 200,
    description: 'Credit check completed',
    type: CreditCheckResponseDto,
  })
  @ApiResponse({ status: 404, description: 'Customer not found' })
  async checkCredit(@Body() creditCheckDto: CreditCheckDto): Promise<CreditCheckResponseDto> {
    return this.customerService.checkCredit(creditCheckDto.customerId, creditCheckDto.amount);
  }

  @Put(':id/credit-limit')
  @ApiOperation({ summary: 'Update customer credit limit' })
  @ApiParam({ name: 'id', description: 'Customer ID', type: 'string' })
  @ApiResponse({
    status: 200,
    description: 'Credit limit updated successfully',
    type: CustomerResponseDto,
  })
  @ApiResponse({ status: 404, description: 'Customer not found' })
  async updateCreditLimit(
    @Param('id', ParseUUIDPipe) id: string,
    @Body('creditLimit') creditLimit: number,
  ): Promise<CustomerResponseDto> {
    return this.customerService.updateCreditLimit(id, creditLimit);
  }

  @Put(':id/activate')
  @ApiOperation({ summary: 'Activate customer' })
  @ApiParam({ name: 'id', description: 'Customer ID', type: 'string' })
  @ApiResponse({
    status: 200,
    description: 'Customer activated successfully',
    type: CustomerResponseDto,
  })
  @ApiResponse({ status: 404, description: 'Customer not found' })
  async activateCustomer(@Param('id', ParseUUIDPipe) id: string): Promise<CustomerResponseDto> {
    return this.customerService.activate(id);
  }

  @Put(':id/deactivate')
  @ApiOperation({ summary: 'Deactivate customer' })
  @ApiParam({ name: 'id', description: 'Customer ID', type: 'string' })
  @ApiResponse({
    status: 200,
    description: 'Customer deactivated successfully',
    type: CustomerResponseDto,
  })
  @ApiResponse({ status: 404, description: 'Customer not found' })
  async deactivateCustomer(@Param('id', ParseUUIDPipe) id: string): Promise<CustomerResponseDto> {
    return this.customerService.deactivate(id);
  }

  @Put(':id/suspend')
  @ApiOperation({ summary: 'Suspend customer' })
  @ApiParam({ name: 'id', description: 'Customer ID', type: 'string' })
  @ApiResponse({
    status: 200,
    description: 'Customer suspended successfully',
    type: CustomerResponseDto,
  })
  @ApiResponse({ status: 404, description: 'Customer not found' })
  async suspendCustomer(
    @Param('id', ParseUUIDPipe) id: string,
    @Body('reason') reason?: string,
  ): Promise<CustomerResponseDto> {
    return this.customerService.suspend(id, reason);
  }

  @Get(':id/sales-history')
  @ApiOperation({ summary: 'Get customer sales history' })
  @ApiParam({ name: 'id', description: 'Customer ID', type: 'string' })
  @ApiResponse({
    status: 200,
    description: 'Sales history retrieved successfully',
  })
  @ApiResponse({ status: 404, description: 'Customer not found' })
  async getCustomerSalesHistory(
    @Param('id', ParseUUIDPipe) id: string,
    @Query('limit') limit?: number,
  ) {
    return this.customerService.getSalesHistory(id, limit);
  }

  @Get(':id/outstanding-invoices')
  @ApiOperation({ summary: 'Get customer outstanding invoices' })
  @ApiParam({ name: 'id', description: 'Customer ID', type: 'string' })
  @ApiResponse({
    status: 200,
    description: 'Outstanding invoices retrieved successfully',
  })
  @ApiResponse({ status: 404, description: 'Customer not found' })
  async getOutstandingInvoices(@Param('id', ParseUUIDPipe) id: string) {
    return this.customerService.getOutstandingInvoices(id);
  }

  @Get(':id/statistics')
  @ApiOperation({ summary: 'Get customer statistics' })
  @ApiParam({ name: 'id', description: 'Customer ID', type: 'string' })
  @ApiResponse({
    status: 200,
    description: 'Customer statistics retrieved successfully',
  })
  @ApiResponse({ status: 404, description: 'Customer not found' })
  async getCustomerStatistics(@Param('id', ParseUUIDPipe) id: string) {
    return this.customerService.getCustomerStatistics(id);
  }

  @Get('deleted')
  @ApiOperation({ summary: 'Get all soft-deleted customers' })
  @ApiResponse({
    status: 200,
    description: 'List of soft-deleted customers retrieved successfully',
    type: [CustomerResponseDto],
  })
  @ApiQuery({ name: 'search', required: false, description: 'Search customers by name, email, or phone' })
  @ApiQuery({ name: 'page', required: false, type: Number, description: 'Page number' })
  @ApiQuery({ name: 'limit', required: false, type: Number, description: 'Items per page' })
  async getDeletedCustomers(@Query() query: QueryCustomersDto) {
    return this.customerService.findDeleted(query);
  }

  @Post(':id/restore')
  @ApiOperation({ summary: 'Restore soft-deleted customer' })
  @ApiParam({ name: 'id', description: 'Customer ID', type: 'string' })
  @ApiResponse({
    status: 200,
    description: 'Customer restored successfully',
    type: CustomerResponseDto,
  })
  @ApiResponse({ status: 404, description: 'Customer not found' })
  async restoreCustomer(@Param('id', ParseUUIDPipe) id: string): Promise<CustomerResponseDto> {
    return this.customerService.restore(id);
  }
}