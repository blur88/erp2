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
  Logger,
  ParseUUIDPipe,
  HttpCode,
  HttpStatus,
  UsePipes,
  ValidationPipe,
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
import { JwtAuthGuard } from '../../../common/guards';
import { User } from '../../../common/decorators';
import { SupplierService } from '../services/supplier.service';
import {
  CreateSupplierDto,
  UpdateSupplierDto,
  SupplierQueryDto,
  SupplierResponseDto,
  SupplierListResponseDto,
  SupplierPerformanceDto,
  UpdateSupplierBalanceDto,
  SupplierPerformanceMetricsDto,
  SupplierAnalyticsDto,
} from '../dto';

@ApiTags('Suppliers')
@Controller('suppliers')
@UseGuards(JwtAuthGuard)
@ApiBearerAuth()
@UsePipes(new ValidationPipe({ transform: true, whitelist: true }))
export class SupplierController {
  private readonly logger = new Logger(SupplierController.name);

  constructor(private readonly supplierService: SupplierService) {}

  @Post()
  @ApiOperation({ 
    summary: 'Create supplier',
    description: 'Create a new supplier with comprehensive information including contact details, payment terms, and performance tracking setup.'
  })
  @ApiResponse({
    status: 201,
    description: 'Supplier created successfully',
    type: SupplierResponseDto,
  })
  @ApiResponse({ status: 400, description: 'Invalid input data' })
  @ApiResponse({ status: 409, description: 'Supplier code or email already exists' })
  async create(@Body() createSupplierDto: CreateSupplierDto): Promise<SupplierResponseDto> {
    this.logger.log(`Creating supplier: ${createSupplierDto.companyName}`);
    return await this.supplierService.create(createSupplierDto);
  }

  @Get()
  @ApiOperation({ 
    summary: 'Get all suppliers',
    description: 'Retrieve suppliers with advanced filtering, searching, and pagination capabilities.'
  })
  @ApiResponse({
    status: 200,
    description: 'Suppliers retrieved successfully',
    type: SupplierListResponseDto,
  })
  @ApiQuery({ name: 'page', required: false, type: Number, description: 'Page number (default: 1)' })
  @ApiQuery({ name: 'limit', required: false, type: Number, description: 'Items per page (default: 10, max: 100)' })
  @ApiQuery({ name: 'search', required: false, type: String, description: 'Search by company name, code, contact person, or email' })
  @ApiQuery({ name: 'type', required: false, enum: ['local', 'international'], description: 'Filter by supplier type' })
  @ApiQuery({ name: 'status', required: false, enum: ['active', 'inactive', 'suspended', 'blacklisted'], description: 'Filter by status' })
  @ApiQuery({ name: 'rating', required: false, enum: ['excellent', 'good', 'average', 'poor', 'unrated'], description: 'Filter by rating' })
  @ApiQuery({ name: 'isActive', required: false, type: Boolean, description: 'Filter active suppliers only' })
  @ApiQuery({ name: 'sortBy', required: false, type: String, description: 'Sort by field (default: companyName)' })
  @ApiQuery({ name: 'sortOrder', required: false, enum: ['ASC', 'DESC'], description: 'Sort order (default: ASC)' })
  async findAll(@Query() query: SupplierQueryDto): Promise<SupplierListResponseDto> {
    this.logger.log(`Getting suppliers with filters: ${JSON.stringify(query)}`);
    return await this.supplierService.findAll(query);
  }

  @Get('search')
  @ApiOperation({ 
    summary: 'Search suppliers',
    description: 'Quick search suppliers by name, code, or contact person with limited results.'
  })
  @ApiResponse({
    status: 200,
    description: 'Search results retrieved successfully',
    type: [SupplierResponseDto],
  })
  @ApiQuery({ name: 'q', required: true, type: String, description: 'Search query' })
  @ApiQuery({ name: 'limit', required: false, type: Number, description: 'Maximum results (default: 10)' })
  async search(
    @Query('q') query: string,
    @Query('limit') limit?: number,
  ): Promise<SupplierResponseDto[]> {
    this.logger.log(`Searching suppliers with query: ${query}`);
    return await this.supplierService.searchSuppliers(query, limit);
  }

  @Get('performance-metrics')
  @ApiOperation({ 
    summary: 'Get supplier performance metrics',
    description: 'Retrieve performance metrics for all or specific suppliers including delivery rates, quality scores, and spending analysis.'
  })
  @ApiResponse({
    status: 200,
    description: 'Performance metrics retrieved successfully',
    type: [SupplierPerformanceMetricsDto],
  })
  @ApiQuery({ name: 'supplierIds', required: false, type: [String], description: 'Specific supplier IDs (comma separated)' })
  @ApiQuery({ name: 'includeInactive', required: false, type: Boolean, description: 'Include inactive suppliers' })
  async getPerformanceMetrics(
    @Query('supplierIds') supplierIds?: string[],
    @Query('includeInactive') includeInactive?: boolean,
  ): Promise<SupplierPerformanceMetricsDto[]> {
    this.logger.log('Getting supplier performance metrics');
    
    // Parse comma-separated supplier IDs if provided as string
    const parsedSupplierIds = typeof supplierIds === 'string' 
      ? supplierIds.split(',').map(id => id.trim())
      : supplierIds;

    return await this.supplierService.getPerformanceMetrics(parsedSupplierIds, includeInactive);
  }

  @Get('top-suppliers')
  @ApiOperation({ 
    summary: 'Get top suppliers by purchase volume',
    description: 'Retrieve top performing suppliers ranked by total purchase volume with performance metrics.'
  })
  @ApiResponse({
    status: 200,
    description: 'Top suppliers retrieved successfully',
    type: [SupplierPerformanceMetricsDto],
  })
  @ApiQuery({ name: 'limit', required: false, type: Number, description: 'Number of top suppliers (default: 10)' })
  async getTopSuppliers(@Query('limit') limit?: number): Promise<SupplierPerformanceMetricsDto[]> {
    this.logger.log(`Getting top ${limit || 10} suppliers`);
    return await this.supplierService.getTopSuppliers(limit);
  }

  @Get('over-credit-limit')
  @ApiOperation({ 
    summary: 'Get suppliers over credit limit',
    description: 'Retrieve suppliers whose current balance exceeds their credit limit.'
  })
  @ApiResponse({
    status: 200,
    description: 'Suppliers over credit limit retrieved successfully',
    type: [SupplierResponseDto],
  })
  async getSuppliersOverCreditLimit(): Promise<SupplierResponseDto[]> {
    this.logger.log('Getting suppliers over credit limit');
    return await this.supplierService.findOverCreditLimit();
  }

  @Get(':id')
  @ApiOperation({ 
    summary: 'Get supplier by ID',
    description: 'Retrieve detailed information about a specific supplier including relationships and performance data.'
  })
  @ApiResponse({
    status: 200,
    description: 'Supplier retrieved successfully',
    type: SupplierResponseDto,
  })
  @ApiResponse({ status: 404, description: 'Supplier not found' })
  @ApiParam({ name: 'id', description: 'Supplier UUID' })
  async findOne(@Param('id', ParseUUIDPipe) id: string): Promise<SupplierResponseDto> {
    this.logger.log(`Getting supplier: ${id}`);
    return await this.supplierService.findOne(id);
  }

  @Patch(':id')
  @ApiOperation({ 
    summary: 'Update supplier',
    description: 'Update supplier information including contact details, payment terms, and status.'
  })
  @ApiResponse({
    status: 200,
    description: 'Supplier updated successfully',
    type: SupplierResponseDto,
  })
  @ApiResponse({ status: 400, description: 'Invalid input data' })
  @ApiResponse({ status: 404, description: 'Supplier not found' })
  @ApiResponse({ status: 409, description: 'Supplier code or email already exists' })
  @ApiParam({ name: 'id', description: 'Supplier UUID' })
  async update(
    @Param('id', ParseUUIDPipe) id: string,
    @Body() updateSupplierDto: UpdateSupplierDto,
  ): Promise<SupplierResponseDto> {
    this.logger.log(`Updating supplier: ${id}`);
    return await this.supplierService.update(id, updateSupplierDto);
  }

  @Post(':id/performance')
  @ApiOperation({ 
    summary: 'Update supplier performance metrics',
    description: 'Record delivery performance, quality assessment, and update supplier ratings based on actual performance data.'
  })
  @ApiResponse({ status: 200, description: 'Performance metrics updated successfully' })
  @ApiResponse({ status: 404, description: 'Supplier not found' })
  @ApiParam({ name: 'id', description: 'Supplier UUID' })
  @HttpCode(HttpStatus.OK)
  async updatePerformanceMetrics(
    @Param('id', ParseUUIDPipe) id: string,
    @Body() performanceDto: SupplierPerformanceDto,
  ): Promise<void> {
    this.logger.log(`Updating performance metrics for supplier: ${id}`);
    await this.supplierService.updatePerformanceMetrics(id, performanceDto);
  }

  @Post(':id/balance')
  @ApiOperation({ 
    summary: 'Update supplier balance',
    description: 'Increase or decrease supplier account balance for credit management and payment tracking.'
  })
  @ApiResponse({
    status: 200,
    description: 'Supplier balance updated successfully',
    type: SupplierResponseDto,
  })
  @ApiResponse({ status: 404, description: 'Supplier not found' })
  @ApiParam({ name: 'id', description: 'Supplier UUID' })
  async updateBalance(
    @Param('id', ParseUUIDPipe) id: string,
    @Body() balanceDto: UpdateSupplierBalanceDto,
  ): Promise<SupplierResponseDto> {
    this.logger.log(`Updating balance for supplier: ${id}`);
    return await this.supplierService.updateBalance(id, balanceDto);
  }

  @Post(':id/activate')
  @ApiOperation({ 
    summary: 'Activate supplier',
    description: 'Activate a previously deactivated supplier to enable purchase order creation.'
  })
  @ApiResponse({
    status: 200,
    description: 'Supplier activated successfully',
    type: SupplierResponseDto,
  })
  @ApiResponse({ status: 404, description: 'Supplier not found' })
  @ApiParam({ name: 'id', description: 'Supplier UUID' })
  async activate(@Param('id', ParseUUIDPipe) id: string): Promise<SupplierResponseDto> {
    this.logger.log(`Activating supplier: ${id}`);
    return await this.supplierService.activate(id);
  }

  @Post(':id/suspend')
  @ApiOperation({ 
    summary: 'Suspend supplier',
    description: 'Suspend supplier due to performance issues or compliance concerns.'
  })
  @ApiResponse({
    status: 200,
    description: 'Supplier suspended successfully',
    type: SupplierResponseDto,
  })
  @ApiResponse({ status: 404, description: 'Supplier not found' })
  @ApiParam({ name: 'id', description: 'Supplier UUID' })
  @ApiBody({ 
    schema: { 
      type: 'object', 
      properties: { 
        reason: { type: 'string', minLength: 5, maxLength: 500 } 
      },
      required: ['reason']
    } 
  })
  async suspend(
    @Param('id', ParseUUIDPipe) id: string,
    @Body('reason') reason: string,
  ): Promise<SupplierResponseDto> {
    this.logger.log(`Suspending supplier: ${id}`);
    return await this.supplierService.suspend(id, reason);
  }

  @Get(':id/can-purchase')
  @ApiOperation({ 
    summary: 'Check purchase eligibility',
    description: 'Verify if a supplier can handle a purchase of specified amount based on credit limits and status.'
  })
  @ApiResponse({
    status: 200,
    description: 'Purchase eligibility checked successfully',
    schema: { type: 'object', properties: { canPurchase: { type: 'boolean' } } },
  })
  @ApiResponse({ status: 404, description: 'Supplier not found' })
  @ApiParam({ name: 'id', description: 'Supplier UUID' })
  @ApiQuery({ name: 'amount', required: true, type: Number, description: 'Purchase amount to check' })
  async canPurchase(
    @Param('id', ParseUUIDPipe) id: string,
    @Query('amount') amount: number,
  ): Promise<{ canPurchase: boolean }> {
    this.logger.log(`Checking purchase eligibility for supplier: ${id}, amount: ${amount}`);
    const canPurchase = await this.supplierService.canPurchase(id, amount);
    return { canPurchase };
  }

  @Delete(':id')
  @ApiOperation({ 
    summary: 'Deactivate supplier',
    description: 'Soft delete (deactivate) supplier. Cannot be deleted if there are active purchase orders.'
  })
  @ApiResponse({ status: 200, description: 'Supplier deactivated successfully' })
  @ApiResponse({ status: 400, description: 'Cannot deactivate supplier with active purchase orders' })
  @ApiResponse({ status: 404, description: 'Supplier not found' })
  @ApiParam({ name: 'id', description: 'Supplier UUID' })
  @HttpCode(HttpStatus.OK)
  async remove(@Param('id', ParseUUIDPipe) id: string): Promise<void> {
    this.logger.log(`Deactivating supplier: ${id}`);
    await this.supplierService.remove(id);
  }
}