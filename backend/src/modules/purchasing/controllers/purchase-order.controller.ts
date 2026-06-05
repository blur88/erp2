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
} from "@nestjs/common";
import {
  ApiTags,
  ApiOperation,
  ApiResponse,
  ApiParam,
  ApiQuery,
  ApiBody,
} from "@nestjs/swagger";
import { PurchaseOrderService } from "../services/purchase-order.service";
import {
  CreatePurchaseOrderDto,
  UpdatePurchaseOrderDto,
  PurchaseOrderQueryDto,
  PurchaseOrderResponseDto,
  PurchaseOrderListResponseDto,
  PurchaseOrderSummaryDto,
  RecordOrderPaymentsDto,
} from "../dto";
import { CurrentUser } from "../../auth/decorators/current-user.decorator";

@ApiTags("Purchase Orders")
@Controller("purchasing/orders")
export class PurchaseOrderController {
  constructor(private readonly purchaseOrderService: PurchaseOrderService) {}

  @Post()
  @ApiOperation({ summary: "Create a new purchase order" })
  @ApiResponse({
    status: 201,
    description: "Purchase order created successfully",
    type: PurchaseOrderResponseDto,
  })
  @ApiResponse({ status: 400, description: "Invalid input data" })
  @ApiResponse({ status: 404, description: "Supplier or product not found" })
  async create(
    @Body() createPurchaseOrderDto: CreatePurchaseOrderDto,
    @CurrentUser("userId") currentUserId: string,
    @CurrentUser("username") currentUsername: string,
  ): Promise<{ data: PurchaseOrderResponseDto }> {
    const data = await this.purchaseOrderService.create(
      createPurchaseOrderDto,
      currentUserId,
      currentUsername,
    );
    return { data };
  }

  @Get("deleted")
  @ApiOperation({ summary: "Get all deleted purchase orders" })
  @ApiResponse({
    status: 200,
    description: "List of deleted purchase orders retrieved successfully",
    type: PurchaseOrderListResponseDto,
  })
  @ApiQuery({
    name: "page",
    required: false,
    type: Number,
    description: "Page number",
  })
  @ApiQuery({
    name: "limit",
    required: false,
    type: Number,
    description: "Items per page",
  })
  async findDeleted(
    @Query() query: PurchaseOrderQueryDto,
  ): Promise<PurchaseOrderListResponseDto> {
    return this.purchaseOrderService.findDeleted(query);
  }

  @Get()
  @ApiOperation({
    summary: "Get all purchase orders with filtering and pagination",
  })
  @ApiResponse({
    status: 200,
    description: "List of purchase orders retrieved successfully",
    type: PurchaseOrderListResponseDto,
  })
  @ApiQuery({
    name: "page",
    required: false,
    type: Number,
    description: "Page number",
  })
  @ApiQuery({
    name: "limit",
    required: false,
    type: Number,
    description: "Items per page",
  })
  @ApiQuery({
    name: "search",
    required: false,
    description: "Search by order number, supplier name, or notes",
  })
  @ApiQuery({
    name: "supplierId",
    required: false,
    description: "Filter by supplier ID",
  })
  @ApiQuery({
    name: "orderDateFrom",
    required: false,
    description: "Filter by order date from",
  })
  @ApiQuery({
    name: "orderDateTo",
    required: false,
    description: "Filter by order date to",
  })
  @ApiQuery({
    name: "sortBy",
    required: false,
    description: "Sort field (orderNumber, orderDate, totalAmount, createdAt)",
  })
  @ApiQuery({
    name: "sortOrder",
    required: false,
    enum: ["ASC", "DESC"],
    description: "Sort order",
  })
  async findAll(
    @Query() query: PurchaseOrderQueryDto,
  ): Promise<PurchaseOrderListResponseDto> {
    return this.purchaseOrderService.findAll(query);
  }

  @Get("summary")
  @ApiOperation({ summary: "Get purchase order summary statistics" })
  @ApiResponse({
    status: 200,
    description: "Purchase order summary retrieved successfully",
    type: PurchaseOrderSummaryDto,
  })
  async getSummary(): Promise<PurchaseOrderSummaryDto> {
    return this.purchaseOrderService.getSummary();
  }

  @Get("by-number/:orderNumber")
  @ApiOperation({ summary: "Get purchase order by order number" })
  @ApiParam({
    name: "orderNumber",
    description: "Purchase order number (e.g. PO-001)",
    type: "string",
  })
  @ApiResponse({
    status: 200,
    description: "Purchase order retrieved successfully",
  })
  @ApiResponse({ status: 404, description: "Purchase order not found" })
  async findByOrderNumber(
    @Param("orderNumber") orderNumber: string,
  ): Promise<{ data: PurchaseOrderResponseDto }> {
    const data = await this.purchaseOrderService.findByOrderNumber(orderNumber);
    return { data };
  }

  @Get(":id")
  @ApiOperation({ summary: "Get purchase order by ID" })
  @ApiParam({ name: "id", description: "Purchase order ID", type: "string" })
  @ApiResponse({
    status: 200,
    description: "Purchase order retrieved successfully",
    type: PurchaseOrderResponseDto,
  })
  @ApiResponse({ status: 404, description: "Purchase order not found" })
  async findOne(
    @Param("id", ParseUUIDPipe) id: string,
  ): Promise<{ data: PurchaseOrderResponseDto }> {
    const data = await this.purchaseOrderService.findOne(id);
    return { data };
  }

  @Put(":id")
  @ApiOperation({ summary: "Update purchase order" })
  @ApiParam({ name: "id", description: "Purchase order ID", type: "string" })
  @ApiResponse({
    status: 200,
    description: "Purchase order updated successfully",
    type: PurchaseOrderResponseDto,
  })
  @ApiResponse({
    status: 400,
    description: "Invalid input data or order cannot be modified",
  })
  @ApiResponse({ status: 404, description: "Purchase order not found" })
  async update(
    @Param("id", ParseUUIDPipe) id: string,
    @Body() updatePurchaseOrderDto: UpdatePurchaseOrderDto,
    @CurrentUser("userId") currentUserId: string,
    @CurrentUser("username") currentUsername: string,
  ): Promise<{ data: PurchaseOrderResponseDto }> {
    const data = await this.purchaseOrderService.update(
      id,
      updatePurchaseOrderDto,
      currentUserId,
      currentUsername,
    );
    return { data };
  }

  @Post(":id/restore")
  @ApiOperation({ summary: "Restore a deleted purchase order" })
  @ApiParam({ name: "id", description: "Purchase order ID", type: "string" })
  @ApiResponse({
    status: 200,
    description: "Purchase order restored successfully",
    type: PurchaseOrderResponseDto,
  })
  @ApiResponse({ status: 404, description: "Purchase order not found" })
  @HttpCode(HttpStatus.OK)
  async restore(
    @Param("id", ParseUUIDPipe) id: string,
    @CurrentUser("userId") currentUserId: string,
    @CurrentUser("username") currentUsername: string,
  ): Promise<{ data: PurchaseOrderResponseDto }> {
    const data = await this.purchaseOrderService.restore(
      id,
      currentUserId,
      currentUsername,
    );
    return { data };
  }

  @Post("bulk-restore")
  @ApiOperation({ summary: "Bulk restore deleted purchase orders" })
  @ApiResponse({
    status: 200,
    description: "Purchase orders restored successfully",
  })
  @HttpCode(HttpStatus.OK)
  async bulkRestore(
    @Body() body: { orderIds: string[] },
    @CurrentUser("userId") currentUserId: string,
    @CurrentUser("username") currentUsername: string,
  ): Promise<{ restoredCount: number; failedIds: string[] }> {
    return this.purchaseOrderService.bulkRestore(
      body.orderIds,
      currentUserId,
      currentUsername,
    );
  }

  @Post("bulk-permanent-delete")
  @ApiOperation({ summary: "Permanently delete multiple purchase orders" })
  @ApiResponse({
    status: 200,
    description: "Purchase orders permanently deleted successfully",
  })
  @HttpCode(HttpStatus.OK)
  async bulkPermanentDelete(
    @Body() body: { orderIds: string[] },
    @CurrentUser("userId") currentUserId: string,
    @CurrentUser("username") currentUsername: string,
  ): Promise<{ deletedCount: number; failedIds: string[] }> {
    return this.purchaseOrderService.bulkPermanentDelete(
      body.orderIds,
      currentUserId,
      currentUsername,
    );
  }

  @Delete(":id/permanent")
  @ApiOperation({ summary: "Permanently delete a purchase order" })
  @ApiParam({ name: "id", description: "Purchase order ID", type: "string" })
  @ApiResponse({
    status: 200,
    description: "Purchase order permanently deleted successfully",
  })
  @ApiResponse({ status: 404, description: "Purchase order not found" })
  @HttpCode(HttpStatus.OK)
  async permanentDelete(
    @Param("id", ParseUUIDPipe) id: string,
    @CurrentUser("userId") currentUserId: string,
    @CurrentUser("username") currentUsername: string,
  ): Promise<{ message: string }> {
    await this.purchaseOrderService.permanentDelete(
      id,
      currentUserId,
      currentUsername,
    );
    return { message: "Purchase order permanently deleted successfully" };
  }

  @Post(":id/receive")
  @ApiOperation({
    summary:
      "Receive goods for purchase order - changes GRN status to received and updates product quantities",
  })
  @ApiParam({ name: "id", description: "Purchase order ID", type: "string" })
  @ApiResponse({
    status: 200,
    description: "Goods received successfully",
    type: PurchaseOrderResponseDto,
  })
  @ApiResponse({ status: 404, description: "Purchase order not found" })
  @ApiResponse({ status: 400, description: "GRN must be in draft status" })
  @HttpCode(HttpStatus.OK)
  async receiveGoods(
    @Param("id", ParseUUIDPipe) id: string,
    @CurrentUser("userId") currentUserId: string,
    @CurrentUser("username") currentUsername: string,
  ): Promise<{ data: PurchaseOrderResponseDto }> {
    const data = await this.purchaseOrderService.receiveGoods(
      id,
      currentUserId,
      currentUsername,
    );
    return { data };
  }

  @Post(":id/return")
  @ApiOperation({
    summary:
      "Return goods for purchase order - changes GRN status back to draft and reverts product quantities",
  })
  @ApiParam({ name: "id", description: "Purchase order ID", type: "string" })
  @ApiResponse({
    status: 200,
    description: "Goods returned successfully",
    type: PurchaseOrderResponseDto,
  })
  @ApiResponse({ status: 404, description: "Purchase order not found" })
  @ApiResponse({ status: 400, description: "GRN must be in received status" })
  @HttpCode(HttpStatus.OK)
  async returnGoods(
    @Param("id", ParseUUIDPipe) id: string,
    @CurrentUser("userId") currentUserId: string,
    @CurrentUser("username") currentUsername: string,
  ): Promise<{ data: PurchaseOrderResponseDto }> {
    const data = await this.purchaseOrderService.returnGoods(
      id,
      currentUserId,
      currentUsername,
    );
    return { data };
  }

  @Post(":id/pay")
  @ApiOperation({
    summary: "Mark purchase order as paid - creates vendor payment",
  })
  @ApiParam({ name: "id", description: "Purchase order ID", type: "string" })
  @ApiResponse({
    status: 200,
    description: "Purchase order marked as paid successfully",
    type: PurchaseOrderResponseDto,
  })
  @ApiResponse({ status: 404, description: "Purchase order not found" })
  @ApiResponse({ status: 400, description: "Purchase order already paid" })
  @HttpCode(HttpStatus.OK)
  async markAsPaid(
    @Param("id", ParseUUIDPipe) id: string,
  ): Promise<{ data: PurchaseOrderResponseDto; payment: any }> {
    const result = await this.purchaseOrderService.markAsPaid(id);
    return { data: result.order, payment: result.payment };
  }

  @Post(":id/record-payment")
  @ApiOperation({ summary: "Record payment for purchase order" })
  @ApiParam({ name: "id", description: "Purchase order ID", type: "string" })
  @ApiBody({
    schema: {
      type: "object",
      properties: {
        amount: {
          type: "number",
          description: "Payment amount to record",
        },
      },
      required: ["amount"],
    },
  })
  @ApiResponse({
    status: 200,
    description: "Payment recorded successfully",
    type: PurchaseOrderResponseDto,
  })
  @ApiResponse({ status: 404, description: "Purchase order not found" })
  @HttpCode(HttpStatus.OK)
  async recordPayment(
    @Param("id", ParseUUIDPipe) id: string,
    @Body() body: { amount: number },
  ): Promise<{ data: PurchaseOrderResponseDto }> {
    const result = await this.purchaseOrderService.recordPayment(
      id,
      body.amount,
    );
    return { data: result };
  }

  @Post(":id/record-payments")
  @ApiOperation({
    summary: "Record multiple payment lines for a purchase order",
  })
  @ApiParam({ name: "id", description: "Purchase Order ID" })
  @HttpCode(HttpStatus.OK)
  async recordOrderPayments(
    @Param("id", ParseUUIDPipe) id: string,
    @Body() dto: RecordOrderPaymentsDto,
  ): Promise<PurchaseOrderResponseDto> {
    return this.purchaseOrderService.recordOrderPayments(id, dto.payments);
  }

  @Post(":id/unpay")
  @ApiOperation({
    summary: "Unmark purchase order as paid - hard deletes vendor payment",
  })
  @ApiParam({ name: "id", description: "Purchase order ID", type: "string" })
  @ApiResponse({
    status: 200,
    description: "Purchase order unmarked as paid successfully",
    type: PurchaseOrderResponseDto,
  })
  @ApiResponse({ status: 404, description: "Purchase order not found" })
  @ApiResponse({ status: 404, description: "Vendor payment not found" })
  @HttpCode(HttpStatus.OK)
  async markAsUnpaid(
    @Param("id", ParseUUIDPipe) id: string,
  ): Promise<{ data: PurchaseOrderResponseDto }> {
    const result = await this.purchaseOrderService.markAsUnpaid(id);
    return { data: result };
  }

  @Get(":id/payment-status")
  @ApiOperation({ summary: "Check payment status of purchase order" })
  @ApiParam({ name: "id", description: "Purchase order ID", type: "string" })
  @ApiResponse({
    status: 200,
    description: "Payment status retrieved successfully",
  })
  @ApiResponse({ status: 404, description: "Purchase order not found" })
  async getPaymentStatus(
    @Param("id", ParseUUIDPipe) id: string,
  ): Promise<{ isPaid: boolean; payment?: any }> {
    const result = await this.purchaseOrderService.getPaymentStatus(id);
    return result;
  }

  @Delete(":id")
  @ApiOperation({ summary: "Delete purchase order (soft delete)" })
  @ApiParam({ name: "id", description: "Purchase order ID", type: "string" })
  @ApiResponse({
    status: 200,
    description: "Purchase order deleted successfully",
  })
  @ApiResponse({ status: 404, description: "Purchase order not found" })
  @HttpCode(HttpStatus.OK)
  async remove(
    @Param("id", ParseUUIDPipe) id: string,
    @CurrentUser("userId") currentUserId: string,
    @CurrentUser("username") currentUsername: string,
  ): Promise<{ message: string }> {
    await this.purchaseOrderService.remove(id, currentUserId, currentUsername);
    return { message: "Purchase order deleted successfully" };
  }
}
