import {
  Controller,
  Get,
  Param,
  Query,
  ParseUUIDPipe,
} from '@nestjs/common';
import {
  ApiTags,
  ApiOperation,
  ApiResponse,
  ApiParam,
  ApiQuery,
} from '@nestjs/swagger';
import { StockMovementService } from '../services/stock-movement.service';
import {
  QueryStockMovementsDto,
  StockMovementResponseDto,
  StockSummaryDto,
  LowStockAlertDto,
} from '../dto/stock.dto';

@ApiTags('Stock Management')
@Controller('inventory/stock')
export class StockController {
  constructor(
    private readonly stockMovementService: StockMovementService,
  ) {}

  // Stock Movements (read-only)
  @Get('movements')
  @ApiOperation({ summary: 'Get all stock movements with filtering and pagination' })
  @ApiResponse({
    status: 200,
    description: 'Stock movements retrieved successfully',
  })
  @ApiQuery({ name: 'page', required: false, description: 'Page number' })
  @ApiQuery({ name: 'limit', required: false, description: 'Items per page' })
  @ApiQuery({ name: 'productId', required: false, description: 'Filter by product' })
  @ApiQuery({ name: 'movementType', required: false, description: 'Filter by movement type' })
  @ApiQuery({ name: 'fromDate', required: false, description: 'Filter from date' })
  @ApiQuery({ name: 'toDate', required: false, description: 'Filter to date' })
  @ApiQuery({ name: 'search', required: false, description: 'Search term' })
  async findAllMovements(@Query() query: QueryStockMovementsDto) {
    return this.stockMovementService.findAll(query);
  }

  @Get('movements/:id')
  @ApiOperation({ summary: 'Get a stock movement by ID' })
  @ApiResponse({
    status: 200,
    description: 'Stock movement retrieved successfully',
    type: StockMovementResponseDto,
  })
  @ApiResponse({ status: 404, description: 'Stock movement not found' })
  @ApiParam({ name: 'id', description: 'Stock movement ID' })
  async findOneMovement(@Param('id', ParseUUIDPipe) id: string): Promise<StockMovementResponseDto> {
    return this.stockMovementService.findOne(id);
  }

  // Stock Summary and Reports
  @Get('summary/:productId')
  @ApiOperation({ summary: 'Get stock summary for a product' })
  @ApiResponse({
    status: 200,
    description: 'Stock summary retrieved successfully',
    type: StockSummaryDto,
  })
  @ApiResponse({ status: 404, description: 'Product not found' })
  @ApiParam({ name: 'productId', description: 'Product ID' })
  @ApiQuery({ name: 'fromDate', required: false, description: 'Summary from date' })
  @ApiQuery({ name: 'toDate', required: false, description: 'Summary to date' })
  async getProductStockSummary(
    @Param('productId', ParseUUIDPipe) productId: string,
    @Query('fromDate') fromDate?: string,
    @Query('toDate') toDate?: string,
  ): Promise<StockSummaryDto> {
    const from = fromDate ? new Date(fromDate) : undefined;
    const to = toDate ? new Date(toDate) : undefined;
    return this.stockMovementService.getProductStockSummary(productId, from, to);
  }

  @Get('alerts/low-stock')
  @ApiOperation({ summary: 'Get low stock alerts' })
  @ApiResponse({
    status: 200,
    description: 'Low stock alerts retrieved successfully',
    type: [LowStockAlertDto],
  })
  async getLowStockAlerts(): Promise<LowStockAlertDto[]> {
    return this.stockMovementService.getLowStockAlerts();
  }

}
