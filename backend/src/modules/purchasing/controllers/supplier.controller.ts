import {
  Controller,
  Get,
  Post,
  Body,
  Patch,
  Param,
  Delete,
  Query,
  Logger,
  ParseUUIDPipe,
  HttpCode,
  HttpStatus,
  UsePipes,
  ValidationPipe,
} from "@nestjs/common";
import {
  ApiTags,
  ApiOperation,
  ApiResponse,
  ApiParam,
  ApiQuery,
  ApiBody,
} from "@nestjs/swagger";
import { SupplierService } from "../services/supplier.service";
import {
  CreateSupplierDto,
  UpdateSupplierDto,
  SupplierQueryDto,
  SupplierResponseDto,
  SupplierListResponseDto,
} from "../dto";
import { CurrentUser } from "../../auth/decorators/current-user.decorator";

@ApiTags("Suppliers")
@Controller("purchasing/suppliers")
@UsePipes(new ValidationPipe({ transform: true, whitelist: true }))
export class SupplierController {
  private readonly logger = new Logger(SupplierController.name);

  constructor(private readonly supplierService: SupplierService) {}

  @Post()
  @ApiOperation({
    summary: "Create supplier",
    description:
      "Create a new supplier with comprehensive information including contact details, payment terms, and performance tracking setup.",
  })
  @ApiResponse({
    status: 201,
    description: "Supplier created successfully",
    type: SupplierResponseDto,
  })
  @ApiResponse({ status: 400, description: "Invalid input data" })
  @ApiResponse({
    status: 409,
    description: "Supplier code or email already exists",
  })
  async create(
    @Body() createSupplierDto: CreateSupplierDto,
    @CurrentUser("userId") currentUserId: string,
    @CurrentUser("username") currentUsername: string,
  ): Promise<SupplierResponseDto> {
    this.logger.log(`Creating supplier: ${createSupplierDto.companyName}`);
    return await this.supplierService.create(
      createSupplierDto,
      currentUserId,
      currentUsername,
    );
  }

  @Get()
  @ApiOperation({
    summary: "Get all suppliers",
    description:
      "Retrieve suppliers with advanced filtering and searching capabilities.",
  })
  @ApiResponse({
    status: 200,
    description: "Suppliers retrieved successfully",
    type: SupplierListResponseDto,
  })
  @ApiQuery({
    name: "search",
    required: false,
    type: String,
    description: "Search by company name, code, contact person, or email",
  })
  @ApiQuery({
    name: "type",
    required: false,
    enum: ["local", "international"],
    description: "Filter by supplier type",
  })
  @ApiQuery({
    name: "status",
    required: false,
    enum: ["active", "inactive", "suspended", "blacklisted"],
    description: "Filter by status",
  })
  @ApiQuery({
    name: "rating",
    required: false,
    enum: ["excellent", "good", "average", "poor", "unrated"],
    description: "Filter by rating",
  })
  @ApiQuery({
    name: "isActive",
    required: false,
    type: Boolean,
    description: "Filter active suppliers only",
  })
  @ApiQuery({
    name: "sortBy",
    required: false,
    type: String,
    description: "Sort by field (default: companyName)",
  })
  @ApiQuery({
    name: "sortOrder",
    required: false,
    enum: ["ASC", "DESC"],
    description: "Sort order (default: ASC)",
  })
  async findAll(
    @Query() query: SupplierQueryDto,
  ): Promise<SupplierListResponseDto> {
    this.logger.log(`Getting suppliers with filters: ${JSON.stringify(query)}`);
    return await this.supplierService.findAll(query);
  }

  @Get("check-duplicate")
  @ApiOperation({
    summary: "Check for duplicate company name",
    description: "Check if a company name already exists in the system.",
  })
  @ApiResponse({
    status: 200,
    description: "Duplicate check completed",
    schema: {
      type: "object",
      properties: {
        exists: { type: "boolean" },
        message: { type: "string" },
      },
    },
  })
  @ApiQuery({
    name: "companyName",
    required: true,
    type: String,
    description: "Company name to check",
  })
  @ApiQuery({
    name: "excludeId",
    required: false,
    type: String,
    description: "Supplier ID to exclude from check (for updates)",
  })
  async checkDuplicate(
    @Query("companyName") companyName: string,
    @Query("excludeId") excludeId?: string,
  ): Promise<{
    exists: boolean;
    isInactive?: boolean;
    supplier?: SupplierResponseDto;
    message?: string;
  }> {
    this.logger.log(`Checking duplicate company name: ${companyName}`);
    return await this.supplierService.checkDuplicateCompanyName(
      companyName,
      excludeId,
    );
  }

  @Get("search")
  @ApiOperation({
    summary: "Search suppliers",
    description:
      "Quick search suppliers by name, code, or contact person with limited results.",
  })
  @ApiResponse({
    status: 200,
    description: "Search results retrieved successfully",
    type: [SupplierResponseDto],
  })
  @ApiQuery({
    name: "q",
    required: true,
    type: String,
    description: "Search query",
  })
  @ApiQuery({
    name: "limit",
    required: false,
    type: Number,
    description: "Maximum results (default: 10)",
  })
  async search(
    @Query("q") query: string,
    @Query("limit") limit?: number,
  ): Promise<SupplierResponseDto[]> {
    this.logger.log(`Searching suppliers with query: ${query}`);
    return await this.supplierService.searchSuppliers(query, limit);
  }

  @Get("deleted")
  @ApiOperation({
    summary: "Get deleted suppliers",
    description: "Retrieve all soft-deleted suppliers with pagination.",
  })
  @ApiResponse({
    status: 200,
    description: "Deleted suppliers retrieved successfully",
    type: SupplierListResponseDto,
  })
  async findDeleted(
    @Query() query: SupplierQueryDto,
  ): Promise<SupplierListResponseDto> {
    this.logger.log("Getting deleted suppliers");
    return await this.supplierService.findDeleted(query);
  }

  @Get("slug/:slug")
  @ApiOperation({ summary: "Get supplier by slug" })
  @ApiParam({ name: "slug", description: "Supplier slug", type: "string" })
  @ApiResponse({
    status: 200,
    description: "Supplier retrieved successfully",
    type: SupplierResponseDto,
  })
  @ApiResponse({ status: 404, description: "Supplier not found" })
  async getSupplierBySlug(
    @Param("slug") slug: string,
  ): Promise<SupplierResponseDto> {
    return this.supplierService.findBySlug(slug);
  }

  @Get(":id/purchase-orders")
  @ApiOperation({ summary: "Get purchase orders for a supplier" })
  @ApiResponse({
    status: 200,
    description: "Purchase orders retrieved successfully",
  })
  async getSupplierPurchaseOrders(
    @Param("id", ParseUUIDPipe) id: string,
  ): Promise<{ data: any[]; total: number }> {
    return await this.supplierService.getSupplierPurchaseOrders(id);
  }

  @Get(":id/grns")
  @ApiOperation({ summary: "Get goods received notes for a supplier" })
  @ApiResponse({ status: 200, description: "GRNs retrieved successfully" })
  async getSupplierGRNs(
    @Param("id", ParseUUIDPipe) id: string,
  ): Promise<{ data: any[]; total: number }> {
    return await this.supplierService.getSupplierGRNs(id);
  }

  @Get(":id/payments")
  @ApiOperation({ summary: "Get vendor payments for a supplier" })
  @ApiResponse({ status: 200, description: "Payments retrieved successfully" })
  async getSupplierPayments(
    @Param("id", ParseUUIDPipe) id: string,
  ): Promise<{ data: any[]; total: number }> {
    return await this.supplierService.getSupplierPayments(id);
  }

  @Get(":id")
  @ApiOperation({
    summary: "Get supplier by ID",
    description:
      "Retrieve detailed information about a specific supplier including relationships and performance data.",
  })
  @ApiResponse({
    status: 200,
    description: "Supplier retrieved successfully",
    type: SupplierResponseDto,
  })
  @ApiResponse({ status: 404, description: "Supplier not found" })
  @ApiParam({ name: "id", description: "Supplier UUID" })
  async findOne(
    @Param("id", ParseUUIDPipe) id: string,
  ): Promise<SupplierResponseDto> {
    this.logger.log(`Getting supplier: ${id}`);
    return await this.supplierService.findOne(id);
  }

  @Patch(":id")
  @ApiOperation({
    summary: "Update supplier",
    description:
      "Update supplier information including contact details, payment terms, and status.",
  })
  @ApiResponse({
    status: 200,
    description: "Supplier updated successfully",
    type: SupplierResponseDto,
  })
  @ApiResponse({ status: 400, description: "Invalid input data" })
  @ApiResponse({ status: 404, description: "Supplier not found" })
  @ApiResponse({
    status: 409,
    description: "Supplier code or email already exists",
  })
  @ApiParam({ name: "id", description: "Supplier UUID" })
  async update(
    @Param("id", ParseUUIDPipe) id: string,
    @Body() updateSupplierDto: UpdateSupplierDto,
    @CurrentUser("userId") currentUserId: string,
    @CurrentUser("username") currentUsername: string,
  ): Promise<SupplierResponseDto> {
    this.logger.log(`Updating supplier: ${id}`);
    return await this.supplierService.update(
      id,
      updateSupplierDto,
      currentUserId,
      currentUsername,
    );
  }

  @Post(":id/activate")
  @ApiOperation({
    summary: "Activate supplier",
    description:
      "Activate a previously deactivated supplier to enable purchase order creation.",
  })
  @ApiResponse({
    status: 200,
    description: "Supplier activated successfully",
    type: SupplierResponseDto,
  })
  @ApiResponse({ status: 404, description: "Supplier not found" })
  @ApiParam({ name: "id", description: "Supplier UUID" })
  async activate(
    @Param("id", ParseUUIDPipe) id: string,
  ): Promise<SupplierResponseDto> {
    this.logger.log(`Activating supplier: ${id}`);
    return await this.supplierService.activate(id);
  }

  @Post(":id/suspend")
  @ApiOperation({
    summary: "Suspend supplier",
    description:
      "Suspend supplier due to performance issues or compliance concerns.",
  })
  @ApiResponse({
    status: 200,
    description: "Supplier suspended successfully",
    type: SupplierResponseDto,
  })
  @ApiResponse({ status: 404, description: "Supplier not found" })
  @ApiParam({ name: "id", description: "Supplier UUID" })
  @ApiBody({
    schema: {
      type: "object",
      properties: {
        reason: { type: "string", minLength: 5, maxLength: 500 },
      },
      required: ["reason"],
    },
  })
  async suspend(
    @Param("id", ParseUUIDPipe) id: string,
    @Body("reason") reason: string,
  ): Promise<SupplierResponseDto> {
    this.logger.log(`Suspending supplier: ${id}`);
    return await this.supplierService.suspend(id, reason);
  }

  @Get(":id/can-purchase")
  @ApiOperation({
    summary: "Check purchase eligibility",
    description:
      "Verify if a supplier can handle a purchase of specified amount based on credit limits and status.",
  })
  @ApiResponse({
    status: 200,
    description: "Purchase eligibility checked successfully",
    schema: {
      type: "object",
      properties: { canPurchase: { type: "boolean" } },
    },
  })
  @ApiResponse({ status: 404, description: "Supplier not found" })
  @ApiParam({ name: "id", description: "Supplier UUID" })
  @ApiQuery({
    name: "amount",
    required: true,
    type: Number,
    description: "Purchase amount to check",
  })
  async canPurchase(
    @Param("id", ParseUUIDPipe) id: string,
    @Query("amount") amount: number,
  ): Promise<{ canPurchase: boolean }> {
    this.logger.log(
      `Checking purchase eligibility for supplier: ${id}, amount: ${amount}`,
    );
    const canPurchase = await this.supplierService.canPurchase(id, amount);
    return { canPurchase };
  }

  @Post(":id/restore")
  @ApiOperation({
    summary: "Restore deleted supplier",
    description: "Restore a soft-deleted supplier to active status.",
  })
  @ApiResponse({
    status: 200,
    description: "Supplier restored successfully",
    type: SupplierResponseDto,
  })
  @ApiResponse({ status: 404, description: "Supplier not found" })
  @ApiParam({ name: "id", description: "Supplier UUID" })
  async restore(
    @Param("id", ParseUUIDPipe) id: string,
    @CurrentUser("userId") currentUserId: string,
    @CurrentUser("username") currentUsername: string,
  ): Promise<SupplierResponseDto> {
    this.logger.log(`Restoring supplier: ${id}`);
    return await this.supplierService.restore(
      id,
      currentUserId,
      currentUsername,
    );
  }

  @Post("bulk-restore")
  @ApiOperation({
    summary: "Bulk restore deleted suppliers",
    description: "Restore multiple soft-deleted suppliers to active status.",
  })
  @ApiResponse({
    status: 200,
    description: "Suppliers restored successfully",
  })
  @ApiBody({
    schema: {
      type: "object",
      properties: {
        supplierIds: {
          type: "array",
          items: { type: "string" },
          description: "Array of supplier UUIDs to restore",
        },
      },
    },
  })
  async bulkRestore(
    @Body() body: { supplierIds: string[] },
    @CurrentUser("userId") currentUserId: string,
    @CurrentUser("username") currentUsername: string,
  ): Promise<{ restoredCount: number; failedIds: string[] }> {
    this.logger.log(`Bulk restoring ${body.supplierIds.length} suppliers`);
    const result = await this.supplierService.bulkRestore(
      body.supplierIds,
      currentUserId,
      currentUsername,
    );
    return {
      restoredCount: result.successCount,
      failedIds: result.failedItems.map((item) => item.id),
    };
  }

  @Post("bulk-permanent-delete")
  @ApiOperation({
    summary: "Bulk permanent delete suppliers",
    description:
      "Permanently delete multiple soft-deleted suppliers from the database. This action cannot be undone.",
  })
  @ApiResponse({
    status: 200,
    description: "Suppliers permanently deleted successfully",
  })
  @ApiBody({
    schema: {
      type: "object",
      properties: {
        supplierIds: {
          type: "array",
          items: { type: "string" },
          description: "Array of supplier UUIDs to permanently delete",
        },
      },
    },
  })
  async bulkPermanentDelete(
    @Body() body: { supplierIds: string[] },
    @CurrentUser("userId") currentUserId: string,
    @CurrentUser("username") currentUsername: string,
  ): Promise<{ deletedCount: number; failedIds: string[] }> {
    this.logger.log(
      `Bulk permanently deleting ${body.supplierIds.length} suppliers`,
    );
    const result = await this.supplierService.bulkPermanentDelete(
      body.supplierIds,
      currentUserId,
      currentUsername,
    );
    return {
      deletedCount: result.successCount,
      failedIds: result.failedItems.map((item) => item.id),
    };
  }

  @Delete(":id/permanent")
  @ApiOperation({
    summary: "Permanently delete supplier",
    description:
      "Permanently delete a soft-deleted supplier from the database. This action cannot be undone.",
  })
  @ApiResponse({
    status: 200,
    description: "Supplier permanently deleted successfully",
  })
  @ApiResponse({ status: 404, description: "Supplier not found" })
  @ApiParam({ name: "id", description: "Supplier UUID" })
  async permanentDelete(
    @Param("id", ParseUUIDPipe) id: string,
    @CurrentUser("userId") currentUserId: string,
    @CurrentUser("username") currentUsername: string,
  ): Promise<void> {
    this.logger.log(`Permanently deleting supplier: ${id}`);
    return await this.supplierService.permanentDelete(
      id,
      currentUserId,
      currentUsername,
    );
  }

  @Delete(":id")
  @ApiOperation({
    summary: "Deactivate supplier",
    description:
      "Soft delete (deactivate) supplier. Cannot be deleted if there are active purchase orders.",
  })
  @ApiResponse({
    status: 200,
    description: "Supplier deactivated successfully",
  })
  @ApiResponse({
    status: 400,
    description: "Cannot deactivate supplier with active purchase orders",
  })
  @ApiResponse({ status: 404, description: "Supplier not found" })
  @ApiParam({ name: "id", description: "Supplier UUID" })
  @HttpCode(HttpStatus.OK)
  async remove(
    @Param("id", ParseUUIDPipe) id: string,
    @CurrentUser("userId") currentUserId: string,
    @CurrentUser("username") currentUsername: string,
  ): Promise<void> {
    this.logger.log(`Deactivating supplier: ${id}`);
    await this.supplierService.softDelete(id, currentUserId, currentUsername);
  }
}
