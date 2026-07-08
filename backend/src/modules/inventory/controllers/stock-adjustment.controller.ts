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
import { StockAdjustmentService } from '../services/stock-adjustment.service';
import {
  CreateStockAdjustmentDto,
  UpdateStockAdjustmentDto,
  QueryStockAdjustmentsDto,
  StockAdjustmentResponseDto,
} from '../dto/stock-adjustment.dto';
import { CurrentUser } from '../../auth/decorators/current-user.decorator';

@ApiTags('Stock Adjustments')
@Controller('inventory/stock-adjustments')
export class StockAdjustmentController {
  constructor(
    private readonly stockAdjustmentService: StockAdjustmentService,
  ) {}

  @Post()
  @ApiOperation({ summary: 'Create a new stock adjustment (as draft)' })
  @ApiResponse({
    status: 201,
    description: 'Stock adjustment created successfully',
    type: StockAdjustmentResponseDto,
  })
  @ApiResponse({ status: 400, description: 'Invalid input data' })
  @ApiResponse({ status: 404, description: 'Product not found' })
  @ApiBody({ type: CreateStockAdjustmentDto })
  async create(
    @Body() createDto: CreateStockAdjustmentDto,
    @CurrentUser('userId') currentUserId: string,
    @CurrentUser('username') currentUsername: string,
  ): Promise<StockAdjustmentResponseDto> {
    return this.stockAdjustmentService.create(createDto, currentUserId, currentUsername);
  }

  @Get()
  @ApiOperation({ summary: 'Get all stock adjustments with filtering (no pagination)' })
  @ApiResponse({
    status: 200,
    description: 'Stock adjustments retrieved successfully',
  })
  @ApiQuery({ name: 'status', required: false, description: 'Filter by status' })
  @ApiQuery({ name: 'fromDate', required: false, description: 'Filter from date' })
  @ApiQuery({ name: 'toDate', required: false, description: 'Filter to date' })
  @ApiQuery({ name: 'search', required: false, description: 'Search term' })
  @ApiQuery({ name: 'sortBy', required: false, description: 'Sort field' })
  @ApiQuery({ name: 'sortOrder', required: false, description: 'Sort order (ASC/DESC)' })
  async findAll(@Query() query: QueryStockAdjustmentsDto) {
    return this.stockAdjustmentService.findAll(query);
  }

  @Get('by-number/:adjustmentNumber')
  @ApiOperation({ summary: 'Get stock adjustment by adjustment number' })
  @ApiParam({ name: 'adjustmentNumber', description: 'Adjustment number (e.g. SA-001)', type: 'string' })
  @ApiResponse({ status: 200, description: 'Stock adjustment retrieved successfully' })
  @ApiResponse({ status: 404, description: 'Stock adjustment not found' })
  async findByAdjustmentNumber(
    @Param('adjustmentNumber') adjustmentNumber: string,
  ): Promise<StockAdjustmentResponseDto> {
    return this.stockAdjustmentService.findByAdjustmentNumber(adjustmentNumber);
  }

  @Get(':id')
  @ApiOperation({ summary: 'Get a stock adjustment by ID' })
  @ApiResponse({
    status: 200,
    description: 'Stock adjustment retrieved successfully',
    type: StockAdjustmentResponseDto,
  })
  @ApiResponse({ status: 404, description: 'Stock adjustment not found' })
  @ApiParam({ name: 'id', description: 'Stock adjustment ID' })
  async findOne(
    @Param('id', ParseUUIDPipe) id: string,
  ): Promise<StockAdjustmentResponseDto> {
    return this.stockAdjustmentService.findOne(id);
  }

  @Put(':id')
  @ApiOperation({ summary: 'Update a stock adjustment (draft only)' })
  @ApiResponse({
    status: 200,
    description: 'Stock adjustment updated successfully',
    type: StockAdjustmentResponseDto,
  })
  @ApiResponse({ status: 400, description: 'Invalid input data or adjustment not editable' })
  @ApiResponse({ status: 404, description: 'Stock adjustment not found' })
  @ApiParam({ name: 'id', description: 'Stock adjustment ID' })
  @ApiBody({ type: UpdateStockAdjustmentDto })
  async update(
    @Param('id', ParseUUIDPipe) id: string,
    @Body() updateDto: UpdateStockAdjustmentDto,
    @CurrentUser('userId') currentUserId: string,
    @CurrentUser('username') currentUsername: string,
  ): Promise<StockAdjustmentResponseDto> {
    return this.stockAdjustmentService.update(id, updateDto, currentUserId, currentUsername);
  }

  @Post(':id/complete')
  @ApiOperation({ summary: 'Complete a stock adjustment (post to stock movements)' })
  @ApiResponse({
    status: 200,
    description: 'Stock adjustment completed successfully',
    type: StockAdjustmentResponseDto,
  })
  @ApiResponse({ status: 400, description: 'Adjustment cannot be completed' })
  @ApiResponse({ status: 404, description: 'Stock adjustment not found' })
  @ApiParam({ name: 'id', description: 'Stock adjustment ID' })
  async complete(
    @Param('id', ParseUUIDPipe) id: string,
  ): Promise<StockAdjustmentResponseDto> {
    return this.stockAdjustmentService.complete(id);
  }
  @Patch(':id/notes')
  @ApiOperation({ summary: 'Update only the notes of a stock adjustment (any status)' })
  @ApiResponse({ status: 200, description: 'Notes updated successfully', type: StockAdjustmentResponseDto })
  @ApiResponse({ status: 404, description: 'Stock adjustment not found' })
  @ApiParam({ name: 'id', description: 'Stock adjustment ID' })
  @ApiBody({ schema: { type: 'object', properties: { notes: { type: 'string' } } } })
  async updateNotes(
    @Param('id', ParseUUIDPipe) id: string,
    @Body() body: { notes?: string },
    @CurrentUser('userId') currentUserId: string,
    @CurrentUser('username') currentUsername: string,
  ): Promise<StockAdjustmentResponseDto> {
    return this.stockAdjustmentService.updateNotes(id, body.notes, currentUserId, currentUsername);
  }

  @Delete(':id')
  @HttpCode(HttpStatus.NO_CONTENT)
  @ApiOperation({ summary: 'Delete a stock adjustment (soft delete, draft only)' })
  @ApiResponse({
    status: 204,
    description: 'Stock adjustment deleted successfully',
  })
  @ApiResponse({ status: 400, description: 'Only draft adjustments can be deleted' })
  @ApiResponse({ status: 404, description: 'Stock adjustment not found' })
  @ApiParam({ name: 'id', description: 'Stock adjustment ID' })
  async remove(
    @Param('id', ParseUUIDPipe) id: string,
    @CurrentUser('userId') currentUserId: string,
    @CurrentUser('username') currentUsername: string,
  ): Promise<void> {
    return this.stockAdjustmentService.softDelete(id, currentUserId, currentUsername);
  }
}
