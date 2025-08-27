import {
  Controller,
  Get,
  Post,
  Put,
  Body,
  Param,
  Query,
  UseGuards,
  ParseUUIDPipe,
  HttpCode,
  HttpStatus,
} from '@nestjs/common';
import {
  ApiTags,
  ApiOperation,
  ApiResponse,
  ApiBearerAuth,
  ApiParam,
  ApiQuery,
} from '@nestjs/swagger';
import { JwtAuthGuard } from '../../../common/guards/jwt-auth.guard';
import { RolesGuard } from '../../../common/guards/roles.guard';
import { Roles } from '../../../common/decorators/auth.decorator';
import { CurrentUser } from '../../../common/decorators/user.decorator';
import { UserRole, User } from '../../../database/entities/user.entity';
import { QuotationService } from '../services/quotation.service';
import {
  CreateQuotationDto,
  UpdateQuotationDto,
  QueryQuotationsDto,
  QuotationResponseDto,
  QuotationSummaryDto,
  ConvertQuotationDto,
  SendQuotationDto,
  QuotationStatus,
} from '../dto/quotation.dto';

@ApiTags('Quotations')
@ApiBearerAuth()
@Controller('api/v1/quotations')
@UseGuards(JwtAuthGuard, RolesGuard)
export class QuotationController {
  constructor(private readonly quotationService: QuotationService) {}

  @Post()
  @ApiOperation({ summary: 'Create a new quotation' })
  @ApiResponse({
    status: 201,
    description: 'Quotation created successfully',
    type: QuotationResponseDto,
  })
  @ApiResponse({ status: 400, description: 'Invalid input data' })
  @ApiResponse({ status: 404, description: 'Customer or product not found' })
  @Roles(UserRole.ADMIN, UserRole.MANAGER, UserRole.SALES_REP)
  async createQuotation(
    @Body() createQuotationDto: CreateQuotationDto,
    @CurrentUser() user: User,
  ): Promise<QuotationResponseDto> {
    return this.quotationService.create(createQuotationDto, user.id);
  }

  @Get()
  @ApiOperation({ summary: 'Get all quotations with filtering and pagination' })
  @ApiResponse({
    status: 200,
    description: 'List of quotations retrieved successfully',
    type: [QuotationResponseDto],
  })
  @ApiQuery({ name: 'customerId', required: false, description: 'Filter by customer ID' })
  @ApiQuery({ name: 'status', required: false, enum: QuotationStatus, description: 'Filter by status' })
  @ApiQuery({ name: 'fromDate', required: false, description: 'Filter quotations from date' })
  @ApiQuery({ name: 'toDate', required: false, description: 'Filter quotations to date' })
  @ApiQuery({ name: 'search', required: false, description: 'Search by quotation number or reference' })
  @ApiQuery({ name: 'expiringInDays', required: false, type: Number, description: 'Filter by expiring quotations' })
  @ApiQuery({ name: 'sortBy', required: false, description: 'Sort field' })
  @ApiQuery({ name: 'sortOrder', required: false, enum: ['ASC', 'DESC'], description: 'Sort order' })
  @ApiQuery({ name: 'page', required: false, type: Number, description: 'Page number' })
  @ApiQuery({ name: 'limit', required: false, type: Number, description: 'Items per page' })
  @Roles(UserRole.ADMIN, UserRole.MANAGER, UserRole.SALES_REP, UserRole.USER)
  async getAllQuotations(@Query() query: QueryQuotationsDto) {
    return this.quotationService.findAll(query);
  }

  @Get('summary')
  @ApiOperation({ summary: 'Get quotations summary list' })
  @ApiQuery({ name: 'customerId', required: false, description: 'Filter by customer ID' })
  @ApiResponse({
    status: 200,
    description: 'Quotation summaries retrieved successfully',
    type: [QuotationSummaryDto],
  })
  @Roles(UserRole.ADMIN, UserRole.MANAGER, UserRole.SALES_REP, UserRole.USER)
  async getQuotationSummaries(@Query('customerId') customerId?: string): Promise<QuotationSummaryDto[]> {
    return this.quotationService.getSummaries(customerId);
  }

  @Get(':id')
  @ApiOperation({ summary: 'Get quotation by ID' })
  @ApiParam({ name: 'id', description: 'Quotation ID', type: 'string' })
  @ApiResponse({
    status: 200,
    description: 'Quotation retrieved successfully',
    type: QuotationResponseDto,
  })
  @ApiResponse({ status: 404, description: 'Quotation not found' })
  @Roles(UserRole.ADMIN, UserRole.MANAGER, UserRole.SALES_REP, UserRole.USER)
  async getQuotationById(@Param('id', ParseUUIDPipe) id: string): Promise<QuotationResponseDto> {
    return this.quotationService.findById(id);
  }

  @Put(':id')
  @ApiOperation({ summary: 'Update quotation' })
  @ApiParam({ name: 'id', description: 'Quotation ID', type: 'string' })
  @ApiResponse({
    status: 200,
    description: 'Quotation updated successfully',
    type: QuotationResponseDto,
  })
  @ApiResponse({ status: 404, description: 'Quotation not found' })
  @ApiResponse({ status: 400, description: 'Cannot update quotation in current status' })
  @Roles(UserRole.ADMIN, UserRole.MANAGER, UserRole.SALES_REP)
  async updateQuotation(
    @Param('id', ParseUUIDPipe) id: string,
    @Body() updateQuotationDto: UpdateQuotationDto,
  ): Promise<QuotationResponseDto> {
    return this.quotationService.update(id, updateQuotationDto);
  }

  @Post(':id/send')
  @ApiOperation({ summary: 'Send quotation to customer' })
  @ApiParam({ name: 'id', description: 'Quotation ID', type: 'string' })
  @ApiResponse({
    status: 200,
    description: 'Quotation sent successfully',
    type: QuotationResponseDto,
  })
  @ApiResponse({ status: 404, description: 'Quotation not found' })
  @ApiResponse({ status: 400, description: 'Only draft quotations can be sent' })
  @Roles(UserRole.ADMIN, UserRole.MANAGER, UserRole.SALES_REP)
  async sendQuotation(
    @Param('id', ParseUUIDPipe) id: string,
    @Body() sendQuotationDto: Omit<SendQuotationDto, 'quotationId'>,
  ): Promise<QuotationResponseDto> {
    return this.quotationService.send({ ...sendQuotationDto, quotationId: id });
  }

  @Put(':id/accept')
  @ApiOperation({ summary: 'Accept quotation' })
  @ApiParam({ name: 'id', description: 'Quotation ID', type: 'string' })
  @ApiResponse({
    status: 200,
    description: 'Quotation accepted successfully',
    type: QuotationResponseDto,
  })
  @ApiResponse({ status: 404, description: 'Quotation not found' })
  @ApiResponse({ status: 400, description: 'Only sent quotations can be accepted' })
  @Roles(UserRole.ADMIN, UserRole.MANAGER, UserRole.SALES_REP)
  async acceptQuotation(@Param('id', ParseUUIDPipe) id: string): Promise<QuotationResponseDto> {
    return this.quotationService.accept(id);
  }

  @Put(':id/reject')
  @ApiOperation({ summary: 'Reject quotation' })
  @ApiParam({ name: 'id', description: 'Quotation ID', type: 'string' })
  @ApiResponse({
    status: 200,
    description: 'Quotation rejected successfully',
    type: QuotationResponseDto,
  })
  @ApiResponse({ status: 404, description: 'Quotation not found' })
  @ApiResponse({ status: 400, description: 'Only sent quotations can be rejected' })
  @Roles(UserRole.ADMIN, UserRole.MANAGER, UserRole.SALES_REP)
  async rejectQuotation(
    @Param('id', ParseUUIDPipe) id: string,
    @Body('reason') reason?: string,
  ): Promise<QuotationResponseDto> {
    return this.quotationService.reject(id, reason);
  }

  @Post(':id/convert')
  @ApiOperation({ summary: 'Convert quotation to sales order' })
  @ApiParam({ name: 'id', description: 'Quotation ID', type: 'string' })
  @ApiResponse({
    status: 201,
    description: 'Quotation converted to sales order successfully',
    schema: {
      type: 'object',
      properties: {
        salesOrderId: { type: 'string', format: 'uuid' },
        quotationId: { type: 'string', format: 'uuid' },
        message: { type: 'string' },
      },
    },
  })
  @ApiResponse({ status: 404, description: 'Quotation not found' })
  @ApiResponse({ status: 400, description: 'Quotation cannot be converted to sales order' })
  @Roles(UserRole.ADMIN, UserRole.MANAGER, UserRole.SALES_REP)
  async convertToSalesOrder(
    @Param('id', ParseUUIDPipe) id: string,
    @Body() convertDto: Omit<ConvertQuotationDto, 'quotationId'>,
    @CurrentUser() user: User,
  ): Promise<{ salesOrderId: string; quotationId: string; message: string }> {
    const salesOrderId = await this.quotationService.convertToSalesOrder(
      { ...convertDto, quotationId: id },
      user.id,
    );

    return {
      salesOrderId,
      quotationId: id,
      message: 'Quotation converted to sales order successfully',
    };
  }

  @Post('update-expired')
  @ApiOperation({ summary: 'Update expired quotations' })
  @ApiResponse({
    status: 200,
    description: 'Expired quotations updated successfully',
    schema: {
      type: 'object',
      properties: {
        updatedCount: { type: 'number' },
        message: { type: 'string' },
      },
    },
  })
  @HttpCode(HttpStatus.OK)
  @Roles(UserRole.ADMIN, UserRole.MANAGER)
  async updateExpiredQuotations(): Promise<{ updatedCount: number; message: string }> {
    const updatedCount = await this.quotationService.updateExpiredQuotations();

    return {
      updatedCount,
      message: `${updatedCount} quotations marked as expired`,
    };
  }

  @Get('expiring/:days')
  @ApiOperation({ summary: 'Get quotations expiring in specified days' })
  @ApiParam({ name: 'days', description: 'Number of days', type: 'number' })
  @ApiResponse({
    status: 200,
    description: 'Expiring quotations retrieved successfully',
    type: [QuotationSummaryDto],
  })
  @Roles(UserRole.ADMIN, UserRole.MANAGER, UserRole.SALES_REP)
  async getExpiringQuotations(@Param('days') days: number): Promise<QuotationSummaryDto[]> {
    return this.quotationService.getSummaries().then(summaries =>
      summaries.filter(summary => 
        summary.status === QuotationStatus.SENT && 
        summary.daysUntilExpiry <= days && 
        summary.daysUntilExpiry > 0
      )
    );
  }

  @Get('customer/:customerId')
  @ApiOperation({ summary: 'Get quotations by customer' })
  @ApiParam({ name: 'customerId', description: 'Customer ID', type: 'string' })
  @ApiQuery({ name: 'status', required: false, enum: QuotationStatus, description: 'Filter by status' })
  @ApiResponse({
    status: 200,
    description: 'Customer quotations retrieved successfully',
    type: [QuotationSummaryDto],
  })
  @Roles(UserRole.ADMIN, UserRole.MANAGER, UserRole.SALES_REP, UserRole.USER)
  async getQuotationsByCustomer(
    @Param('customerId', ParseUUIDPipe) customerId: string,
    @Query('status') status?: QuotationStatus,
  ) {
    const query: QueryQuotationsDto = { 
      customerId,
      ...(status && { status }),
    };
    
    return this.quotationService.findAll(query);
  }
}