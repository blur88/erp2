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
} from "@nestjs/common";
import {
  ApiTags,
  ApiOperation,
  ApiResponse,
  ApiParam,
  ApiQuery,
  ApiBody,
} from "@nestjs/swagger";
import { StockAdjustmentService } from "../services/stock-adjustment.service";
import {
  CreateStockAdjustmentDto,
  UpdateStockAdjustmentDto,
  QueryStockAdjustmentsDto,
  StockAdjustmentResponseDto,
  StockAdjustmentListResponseDto,
} from "../dto/stock-adjustment.dto";
import { CurrentUser } from "../../auth/decorators/current-user.decorator";

@ApiTags("Stock Adjustments")
@Controller("inventory/stock-adjustments")
export class StockAdjustmentController {
  constructor(
    private readonly stockAdjustmentService: StockAdjustmentService,
  ) {}

  @Post()
  @ApiOperation({ summary: "Create a new stock adjustment (as draft)" })
  @ApiResponse({
    status: 201,
    description: "Stock adjustment created successfully",
    type: StockAdjustmentResponseDto,
  })
  @ApiResponse({ status: 400, description: "Invalid input data" })
  @ApiResponse({ status: 404, description: "Product not found" })
  @ApiBody({ type: CreateStockAdjustmentDto })
  async create(
    @Body() createDto: CreateStockAdjustmentDto,
    @CurrentUser("userId") currentUserId: string,
    @CurrentUser("username") currentUsername: string,
  ): Promise<StockAdjustmentResponseDto> {
    return this.stockAdjustmentService.create(
      createDto,
      currentUserId,
      currentUsername,
    );
  }

  @Get("deleted")
  @ApiOperation({
    summary: "Get deleted stock adjustments with filtering (no pagination)",
  })
  @ApiResponse({
    status: 200,
    description: "List of deleted stock adjustments retrieved successfully",
    type: [StockAdjustmentListResponseDto],
  })
  @ApiQuery({ name: "search", required: false, description: "Search term" })
  @ApiQuery({ name: "sortBy", required: false, description: "Sort field" })
  @ApiQuery({
    name: "sortOrder",
    required: false,
    description: "Sort order (ASC/DESC)",
  })
  async getDeletedStockAdjustments(@Query() query: QueryStockAdjustmentsDto) {
    const data = await this.stockAdjustmentService.findDeleted(query);
    return data;
  }

  @Get()
  @ApiOperation({
    summary: "Get all stock adjustments with filtering (no pagination)",
  })
  @ApiResponse({
    status: 200,
    description: "Stock adjustments retrieved successfully",
  })
  @ApiQuery({
    name: "status",
    required: false,
    description: "Filter by status",
  })
  @ApiQuery({
    name: "fromDate",
    required: false,
    description: "Filter from date",
  })
  @ApiQuery({ name: "toDate", required: false, description: "Filter to date" })
  @ApiQuery({ name: "search", required: false, description: "Search term" })
  @ApiQuery({ name: "sortBy", required: false, description: "Sort field" })
  @ApiQuery({
    name: "sortOrder",
    required: false,
    description: "Sort order (ASC/DESC)",
  })
  async findAll(@Query() query: QueryStockAdjustmentsDto) {
    return this.stockAdjustmentService.findAll(query);
  }

  @Get("by-number/:adjustmentNumber")
  @ApiOperation({ summary: "Get stock adjustment by adjustment number" })
  @ApiParam({
    name: "adjustmentNumber",
    description: "Adjustment number (e.g. SA-001)",
    type: "string",
  })
  @ApiResponse({
    status: 200,
    description: "Stock adjustment retrieved successfully",
  })
  @ApiResponse({ status: 404, description: "Stock adjustment not found" })
  async findByAdjustmentNumber(
    @Param("adjustmentNumber") adjustmentNumber: string,
  ): Promise<StockAdjustmentResponseDto> {
    return this.stockAdjustmentService.findByAdjustmentNumber(adjustmentNumber);
  }

  @Get(":id")
  @ApiOperation({ summary: "Get a stock adjustment by ID" })
  @ApiResponse({
    status: 200,
    description: "Stock adjustment retrieved successfully",
    type: StockAdjustmentResponseDto,
  })
  @ApiResponse({ status: 404, description: "Stock adjustment not found" })
  @ApiParam({ name: "id", description: "Stock adjustment ID" })
  async findOne(
    @Param("id", ParseUUIDPipe) id: string,
  ): Promise<StockAdjustmentResponseDto> {
    return this.stockAdjustmentService.findOne(id);
  }

  @Put(":id")
  @ApiOperation({ summary: "Update a stock adjustment (draft only)" })
  @ApiResponse({
    status: 200,
    description: "Stock adjustment updated successfully",
    type: StockAdjustmentResponseDto,
  })
  @ApiResponse({
    status: 400,
    description: "Invalid input data or adjustment not editable",
  })
  @ApiResponse({ status: 404, description: "Stock adjustment not found" })
  @ApiParam({ name: "id", description: "Stock adjustment ID" })
  @ApiBody({ type: UpdateStockAdjustmentDto })
  async update(
    @Param("id", ParseUUIDPipe) id: string,
    @Body() updateDto: UpdateStockAdjustmentDto,
    @CurrentUser("userId") currentUserId: string,
    @CurrentUser("username") currentUsername: string,
  ): Promise<StockAdjustmentResponseDto> {
    return this.stockAdjustmentService.update(
      id,
      updateDto,
      currentUserId,
      currentUsername,
    );
  }

  @Post(":id/complete")
  @ApiOperation({
    summary: "Complete a stock adjustment (post to stock movements)",
  })
  @ApiResponse({
    status: 200,
    description: "Stock adjustment completed successfully",
    type: StockAdjustmentResponseDto,
  })
  @ApiResponse({ status: 400, description: "Adjustment cannot be completed" })
  @ApiResponse({ status: 404, description: "Stock adjustment not found" })
  @ApiParam({ name: "id", description: "Stock adjustment ID" })
  async complete(
    @Param("id", ParseUUIDPipe) id: string,
  ): Promise<StockAdjustmentResponseDto> {
    return this.stockAdjustmentService.complete(id);
  }

  @Post(":id/uncomplete")
  @ApiOperation({
    summary:
      "Revert a completed stock adjustment back to draft (reverses stock movements)",
  })
  @ApiResponse({
    status: 200,
    description: "Stock adjustment reverted to draft successfully",
    type: StockAdjustmentResponseDto,
  })
  @ApiResponse({
    status: 400,
    description: "Only completed adjustments can be reverted",
  })
  @ApiResponse({ status: 404, description: "Stock adjustment not found" })
  @ApiParam({ name: "id", description: "Stock adjustment ID" })
  async uncomplete(
    @Param("id", ParseUUIDPipe) id: string,
  ): Promise<StockAdjustmentResponseDto> {
    return this.stockAdjustmentService.uncomplete(id);
  }

  @Delete(":id")
  @HttpCode(HttpStatus.NO_CONTENT)
  @ApiOperation({
    summary: "Delete a stock adjustment (soft delete, draft only)",
  })
  @ApiResponse({
    status: 204,
    description: "Stock adjustment deleted successfully",
  })
  @ApiResponse({
    status: 400,
    description: "Only draft adjustments can be deleted",
  })
  @ApiResponse({ status: 404, description: "Stock adjustment not found" })
  @ApiParam({ name: "id", description: "Stock adjustment ID" })
  async remove(
    @Param("id", ParseUUIDPipe) id: string,
    @CurrentUser("userId") currentUserId: string,
    @CurrentUser("username") currentUsername: string,
  ): Promise<void> {
    return this.stockAdjustmentService.softDelete(
      id,
      currentUserId,
      currentUsername,
    );
  }

  @Post(":id/restore")
  @ApiOperation({ summary: "Restore a deleted stock adjustment" })
  @ApiResponse({
    status: 200,
    description: "Stock adjustment restored successfully",
    type: StockAdjustmentResponseDto,
  })
  @ApiResponse({ status: 400, description: "Stock adjustment is not deleted" })
  @ApiResponse({ status: 404, description: "Stock adjustment not found" })
  @ApiParam({ name: "id", description: "Stock adjustment ID" })
  async restore(
    @Param("id", ParseUUIDPipe) id: string,
    @CurrentUser("userId") currentUserId: string,
    @CurrentUser("username") currentUsername: string,
  ): Promise<StockAdjustmentResponseDto> {
    return this.stockAdjustmentService.restore(
      id,
      currentUserId,
      currentUsername,
    );
  }

  @Delete(":id/permanent")
  @ApiOperation({
    summary: "Permanently delete a stock adjustment from database",
  })
  @ApiResponse({
    status: 204,
    description: "Stock adjustment permanently deleted successfully",
  })
  @ApiResponse({ status: 404, description: "Stock adjustment not found" })
  @ApiResponse({
    status: 400,
    description: "Stock adjustment must be soft-deleted first",
  })
  @ApiParam({ name: "id", description: "Stock adjustment ID" })
  @HttpCode(HttpStatus.NO_CONTENT)
  async permanentDelete(
    @Param("id", ParseUUIDPipe) id: string,
    @CurrentUser("userId") currentUserId: string,
    @CurrentUser("username") currentUsername: string,
  ): Promise<void> {
    await this.stockAdjustmentService.permanentDelete(
      id,
      currentUserId,
      currentUsername,
    );
  }

  @Post("bulk-permanent-delete")
  @ApiOperation({
    summary: "Bulk permanently delete stock adjustments from database",
  })
  @ApiResponse({
    status: 200,
    description: "Stock adjustments permanently deleted successfully",
  })
  @ApiBody({
    schema: {
      type: "object",
      properties: {
        stockAdjustmentIds: {
          type: "array",
          items: { type: "string" },
          description: "Array of stock adjustment IDs to permanently delete",
        },
      },
    },
  })
  async bulkPermanentDelete(
    @Body() body: { stockAdjustmentIds: string[] },
    @CurrentUser("userId") currentUserId: string,
    @CurrentUser("username") currentUsername: string,
  ): Promise<any> {
    const result = await this.stockAdjustmentService.bulkPermanentDelete(
      body.stockAdjustmentIds,
      currentUserId,
      currentUsername,
    );
    return {
      message: `Successfully permanently deleted ${result.successCount} of ${body.stockAdjustmentIds.length} stock adjustments`,
      ...result,
    };
  }
}
