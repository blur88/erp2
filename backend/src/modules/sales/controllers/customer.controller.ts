import {
  Controller,
  Get,
  Post,
  Put,
  Body,
  Param,
  Query,
  ParseUUIDPipe,
} from '@nestjs/common';
import { ApiTags, ApiOperation, ApiResponse, ApiParam, ApiQuery } from '@nestjs/swagger';
import { CustomerService } from '../services/customer.service';
import {
  CreateCustomerDto,
  UpdateCustomerDto,
  QueryCustomersDto,
  CustomerResponseDto,
  CustomerSummaryDto,
} from '../dto/customer.dto';
import { CurrentUser } from '../../auth/decorators/current-user.decorator';

@ApiTags('Customers')
@Controller('customers')
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
  @ApiResponse({
    status: 409,
    description: 'Customer with email already exists',
  })
  async createCustomer(
    @Body() createCustomerDto: CreateCustomerDto,
    @CurrentUser('userId') currentUserId: string,
    @CurrentUser('username') currentUsername: string,
  ): Promise<CustomerResponseDto> {
    return this.customerService.create(createCustomerDto, currentUserId, currentUsername);
  }

  @Get()
  @ApiOperation({ summary: 'Get all customers with filtering and pagination' })
  @ApiResponse({
    status: 200,
    description: 'List of customers retrieved successfully',
    type: [CustomerResponseDto],
  })
  @ApiQuery({
    name: 'search',
    required: false,
    description: 'Search customers by name, email, or phone',
  })
  @ApiQuery({
    name: 'type',
    required: false,
    enum: ['individual', 'business'],
    description: 'Filter by customer type',
  })
  @ApiQuery({
    name: 'status',
    required: false,
    enum: ['active', 'inactive', 'suspended', 'blacklisted'],
    description: 'Filter by status',
  })
  @ApiQuery({
    name: 'pricingScheme',
    required: false,
    enum: ['retail', 'wholesale', 'special'],
    description: 'Filter by price level',
  })
  @ApiQuery({
    name: 'isActive',
    required: false,
    type: Boolean,
    description: 'Filter by active status',
  })
  @ApiQuery({ name: 'sortBy', required: false, description: 'Sort field' })
  @ApiQuery({
    name: 'sortOrder',
    required: false,
    enum: ['ASC', 'DESC'],
    description: 'Sort order',
  })
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

  @Get('slug/:slug')
  @ApiOperation({ summary: 'Get customer by slug' })
  @ApiParam({ name: 'slug', description: 'Customer slug', type: 'string' })
  @ApiResponse({
    status: 200,
    description: 'Customer retrieved successfully',
    type: CustomerResponseDto,
  })
  @ApiResponse({ status: 404, description: 'Customer not found' })
  async getCustomerBySlug(@Param('slug') slug: string): Promise<CustomerResponseDto> {
    return this.customerService.findBySlug(slug);
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
    @CurrentUser('userId') currentUserId: string,
    @CurrentUser('username') currentUsername: string,
  ): Promise<CustomerResponseDto> {
    return this.customerService.update(id, updateCustomerDto, currentUserId, currentUsername);
  }

  @Get(':id/sales-history')
  @ApiOperation({ summary: 'Get customer sales history' })
  @ApiParam({ name: 'id', description: 'Customer ID', type: 'string' })
  @ApiResponse({
    status: 200,
    description: 'Sales history retrieved successfully',
  })
  @ApiResponse({ status: 404, description: 'Customer not found' })
  async getCustomerSalesHistory(@Param('id', ParseUUIDPipe) id: string) {
    return this.customerService.getSalesHistory(id);
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

  @Post(':id/update-metrics')
  @ApiOperation({ summary: 'Update specific customer metrics' })
  @ApiParam({ name: 'id', description: 'Customer ID', type: 'string' })
  @ApiResponse({
    status: 200,
    description: 'Customer metrics updated successfully',
  })
  @ApiResponse({ status: 404, description: 'Customer not found' })
  async updateCustomerMetrics(@Param('id', ParseUUIDPipe) id: string) {
    await this.customerService.updateCustomerMetrics(id);
    return { message: 'Customer metrics updated successfully' };
  }
}
