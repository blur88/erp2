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
import { ApiTags, ApiOperation, ApiResponse, ApiParam, ApiQuery, ApiBody } from '@nestjs/swagger';
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

  @Get('deleted')
  @ApiOperation({ summary: 'Get all soft-deleted customers' })
  @ApiResponse({
    status: 200,
    description: 'List of soft-deleted customers retrieved successfully',
    type: [CustomerResponseDto],
  })
  @ApiQuery({
    name: 'search',
    required: false,
    description: 'Search customers by name, email, or phone',
  })
  async getDeletedCustomers(@Query() query: QueryCustomersDto) {
    return this.customerService.findDeleted(query);
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

  @Delete(':id')
  @ApiOperation({ summary: 'Delete customer' })
  @ApiParam({ name: 'id', description: 'Customer ID', type: 'string' })
  @ApiResponse({ status: 204, description: 'Customer deleted successfully' })
  @ApiResponse({ status: 404, description: 'Customer not found' })
  @ApiResponse({
    status: 400,
    description: 'Cannot delete customer with active orders, invoices, or other dependencies',
    schema: {
      type: 'object',
      properties: {
        message: {
          type: 'string',
          example: "Cannot delete customer 'John Doe' because they have 3 orders and 2 invoices.",
        },
        code: {
          type: 'string',
          example: 'DELETION_PREVENTED_BY_DEPENDENCIES',
        },
        customerName: { type: 'string', example: 'John Doe' },
        customerId: { type: 'string', example: 'uuid' },
        dependencies: {
          type: 'object',
          properties: {
            orders: { type: 'number', example: 3 },
            invoices: { type: 'number', example: 2 },
          },
        },
        suggestions: {
          type: 'array',
          items: { type: 'string' },
          example: [
            'Remove or reassign the 3 orders first',
            'Remove or reassign the 2 invoices first',
          ],
        },
        details: {
          type: 'string',
          example:
            "Customer 'John Doe' (uuid) cannot be deleted due to existing business relationships.",
        },
      },
    },
  })
  @HttpCode(HttpStatus.NO_CONTENT)
  async deleteCustomer(
    @Param('id', ParseUUIDPipe) id: string,
    @CurrentUser('userId') currentUserId: string,
    @CurrentUser('username') currentUsername: string,
  ): Promise<void> {
    return this.customerService.softDelete(id, currentUserId, currentUsername);
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

  @Post('bulk-restore')
  @ApiOperation({ summary: 'Bulk restore soft-deleted customers' })
  @ApiResponse({
    status: 200,
    description: 'Customers restored successfully',
  })
  @ApiResponse({
    status: 400,
    description: 'Invalid customer IDs or customers are not deleted',
  })
  @ApiBody({
    schema: {
      type: 'object',
      properties: {
        customerIds: {
          type: 'array',
          items: { type: 'string', format: 'uuid' },
          description: 'Array of customer IDs to restore',
        },
      },
      required: ['customerIds'],
    },
  })
  @HttpCode(HttpStatus.OK)
  async bulkRestore(
    @Body() body: { customerIds: string[] },
    @CurrentUser('userId') currentUserId: string,
    @CurrentUser('username') currentUsername: string,
  ): Promise<{ message: string; restoredCount: number; failedIds: string[] }> {
    const result = await this.customerService.bulkRestore(
      body.customerIds,
      currentUserId,
      currentUsername,
    );
    return {
      message: `Successfully restored ${result.successCount} of ${body.customerIds.length} customers`,
      restoredCount: result.successCount,
      failedIds: result.failedItems.map((item) => item.id),
    };
  }

  @Post('bulk-permanent-delete')
  @ApiOperation({ summary: 'Bulk permanently delete customers from database' })
  @ApiResponse({
    status: 200,
    description: 'Customers permanently deleted successfully',
  })
  @ApiResponse({
    status: 400,
    description: 'Invalid customer IDs or customers have active references',
  })
  @ApiBody({
    schema: {
      type: 'object',
      properties: {
        customerIds: {
          type: 'array',
          items: { type: 'string', format: 'uuid' },
          description: 'Array of customer IDs to permanently delete',
        },
      },
      required: ['customerIds'],
    },
  })
  @HttpCode(HttpStatus.OK)
  async bulkPermanentDelete(
    @Body() body: { customerIds: string[] },
    @CurrentUser('userId') currentUserId: string,
    @CurrentUser('username') currentUsername: string,
  ): Promise<{ message: string; deletedCount: number; failedIds: string[] }> {
    const result = await this.customerService.bulkPermanentDelete(
      body.customerIds,
      currentUserId,
      currentUsername,
    );
    return {
      message: `Successfully permanently deleted ${result.successCount} of ${body.customerIds.length} customers`,
      deletedCount: result.successCount,
      failedIds: result.failedItems.map((item) => item.id),
    };
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
  async restoreCustomer(
    @Param('id', ParseUUIDPipe) id: string,
    @CurrentUser('userId') currentUserId: string,
    @CurrentUser('username') currentUsername: string,
  ): Promise<CustomerResponseDto> {
    return this.customerService.restore(id, currentUserId, currentUsername);
  }

  @Delete(':id/permanent')
  @ApiOperation({ summary: 'Permanently delete a customer from database' })
  @ApiResponse({
    status: 204,
    description: 'Customer permanently deleted successfully',
  })
  @ApiResponse({ status: 404, description: 'Customer not found' })
  @ApiResponse({
    status: 400,
    description: 'Customer must be soft-deleted first or has active dependencies',
    schema: {
      type: 'object',
      properties: {
        message: {
          type: 'string',
          example:
            "Cannot permanently delete customer 'John Doe' due to active business relationships",
        },
        code: {
          type: 'string',
          example: 'PERMANENT_DELETE_PREVENTED_BY_DEPENDENCIES',
        },
        customerName: { type: 'string', example: 'John Doe' },
        customerId: { type: 'string', example: 'uuid' },
        dependencies: {
          type: 'object',
          properties: {
            orders: { type: 'number', example: 2 },
            invoices: { type: 'number', example: 1 },
            payments: { type: 'number', example: 0 },
          },
        },
        suggestions: {
          type: 'array',
          items: { type: 'string' },
          example: [
            'Complete and archive all pending orders first',
            'Ensure all invoices are fully paid and closed',
          ],
        },
        details: {
          type: 'string',
          example:
            "Customer 'John Doe' (uuid) has 2 active orders, 1 active invoice. Permanent deletion is blocked to preserve financial audit trails and data integrity.",
        },
      },
    },
  })
  @ApiParam({ name: 'id', description: 'Customer ID' })
  @HttpCode(HttpStatus.NO_CONTENT)
  async permanentDelete(
    @Param('id', ParseUUIDPipe) id: string,
    @CurrentUser('userId') currentUserId: string,
    @CurrentUser('username') currentUsername: string,
  ): Promise<void> {
    await this.customerService.permanentDelete(id, currentUserId, currentUsername);
  }
}
