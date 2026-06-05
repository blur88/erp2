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
import { GoodsReceivedNoteService } from "../services/goods-received-note.service";
import {
  CreateGoodsReceivedNoteDto,
  UpdateGoodsReceivedNoteDto,
  GoodsReceivedNoteQueryDto,
  GoodsReceivedNoteResponseDto,
  GoodsReceivedNoteListResponseDto,
} from "../dto/goods-received-note.dto";
import { UserRole } from "../../../database/entities/user.entity";
import { Auth } from "../../auth/decorators/auth.decorator";
import { CurrentUser } from "../../auth/decorators/current-user.decorator";

@ApiTags("Goods Received Notes")
@Controller("purchasing/goods-received-notes")
@UsePipes(new ValidationPipe({ transform: true, whitelist: true }))
export class GoodsReceivedNoteController {
  private readonly logger = new Logger(GoodsReceivedNoteController.name);

  constructor(private readonly grnService: GoodsReceivedNoteService) {}

  @Auth(UserRole.ADMIN)
  @Post()
  @ApiOperation({
    summary: "Create goods received note",
    description:
      "Create a new goods received note for a purchase order with receipt details and quality inspection tracking.",
  })
  @ApiResponse({
    status: 201,
    description: "GRN created successfully",
    type: GoodsReceivedNoteResponseDto,
  })
  @ApiResponse({ status: 400, description: "Invalid input data" })
  @ApiResponse({ status: 404, description: "Purchase order not found" })
  async create(
    @Body() createDto: CreateGoodsReceivedNoteDto,
    @CurrentUser("userId") currentUserId: string,
    @CurrentUser("username") currentUsername: string,
  ): Promise<GoodsReceivedNoteResponseDto> {
    this.logger.log(`Creating GRN for PO: ${createDto.purchaseOrderId}`);
    return await this.grnService.create(
      createDto,
      currentUserId,
      currentUsername,
    );
  }

  @Get()
  @ApiOperation({
    summary: "Get all goods received notes",
    description:
      "Retrieve goods received notes with advanced filtering, searching, and pagination capabilities.",
  })
  @ApiResponse({
    status: 200,
    description: "GRNs retrieved successfully",
    type: GoodsReceivedNoteListResponseDto,
  })
  @ApiQuery({
    name: "page",
    required: false,
    type: Number,
    description: "Page number (default: 1)",
  })
  @ApiQuery({
    name: "limit",
    required: false,
    type: Number,
    description: "Items per page (default: 10, max: 100)",
  })
  @ApiQuery({
    name: "search",
    required: false,
    type: String,
    description: "Search by GRN number, PO number, or supplier name",
  })
  @ApiQuery({
    name: "status",
    required: false,
    description: "Filter by status",
  })
  @ApiQuery({ name: "type", required: false, description: "Filter by type" })
  @ApiQuery({
    name: "supplierId",
    required: false,
    type: String,
    description: "Filter by supplier",
  })
  @ApiQuery({
    name: "purchaseOrderId",
    required: false,
    type: String,
    description: "Filter by purchase order",
  })
  @ApiQuery({
    name: "sortBy",
    required: false,
    type: String,
    description: "Sort by field (default: receivedDate)",
  })
  @ApiQuery({
    name: "sortOrder",
    required: false,
    enum: ["ASC", "DESC"],
    description: "Sort order (default: DESC)",
  })
  async findAll(
    @Query() query: GoodsReceivedNoteQueryDto,
  ): Promise<GoodsReceivedNoteListResponseDto> {
    this.logger.log(`Getting GRNs with filters: ${JSON.stringify(query)}`);
    return await this.grnService.findAll(query);
  }

  @Get("deleted")
  @ApiOperation({
    summary: "Get deleted goods received notes",
    description:
      "Retrieve all soft-deleted goods received notes with pagination.",
  })
  @ApiResponse({
    status: 200,
    description: "Deleted GRNs retrieved successfully",
    type: GoodsReceivedNoteListResponseDto,
  })
  async findDeleted(
    @Query() query: GoodsReceivedNoteQueryDto,
  ): Promise<GoodsReceivedNoteListResponseDto> {
    this.logger.log("Getting deleted GRNs");
    return await this.grnService.findDeleted(query);
  }

  @Get(":id")
  @ApiOperation({
    summary: "Get goods received note by ID",
    description:
      "Retrieve detailed information about a specific goods received note including all line items and quality inspection results.",
  })
  @ApiResponse({
    status: 200,
    description: "GRN retrieved successfully",
    type: GoodsReceivedNoteResponseDto,
  })
  @ApiResponse({ status: 404, description: "GRN not found" })
  @ApiParam({ name: "id", description: "GRN UUID" })
  async findOne(
    @Param("id", ParseUUIDPipe) id: string,
  ): Promise<GoodsReceivedNoteResponseDto> {
    this.logger.log(`Getting GRN: ${id}`);
    return await this.grnService.findOne(id);
  }

  @Patch(":id")
  @ApiOperation({
    summary: "Update goods received note",
    description:
      "Update GRN information including delivery details, inspection status, and notes.",
  })
  @ApiResponse({
    status: 200,
    description: "GRN updated successfully",
    type: GoodsReceivedNoteResponseDto,
  })
  @ApiResponse({ status: 400, description: "Invalid input data" })
  @ApiResponse({ status: 404, description: "GRN not found" })
  @ApiParam({ name: "id", description: "GRN UUID" })
  async update(
    @Param("id", ParseUUIDPipe) id: string,
    @Body() updateDto: UpdateGoodsReceivedNoteDto,
    @CurrentUser("userId") currentUserId: string,
    @CurrentUser("username") currentUsername: string,
  ): Promise<GoodsReceivedNoteResponseDto> {
    this.logger.log(`Updating GRN: ${id}`);
    return await this.grnService.update(
      id,
      updateDto,
      currentUserId,
      currentUsername,
    );
  }

  @Post(":id/restore")
  @ApiOperation({
    summary: "Restore deleted goods received note",
    description: "Restore a soft-deleted goods received note to active status.",
  })
  @ApiResponse({
    status: 200,
    description: "GRN restored successfully",
    type: GoodsReceivedNoteResponseDto,
  })
  @ApiResponse({ status: 404, description: "GRN not found" })
  @ApiParam({ name: "id", description: "GRN UUID" })
  async restore(
    @Param("id", ParseUUIDPipe) id: string,
    @CurrentUser("userId") currentUserId: string,
    @CurrentUser("username") currentUsername: string,
  ): Promise<GoodsReceivedNoteResponseDto> {
    this.logger.log(`Restoring GRN: ${id}`);
    return await this.grnService.restore(id, currentUserId, currentUsername);
  }

  @Post("bulk-restore")
  @ApiOperation({
    summary: "Bulk restore deleted goods received notes",
    description:
      "Restore multiple soft-deleted goods received notes to active status.",
  })
  @ApiResponse({
    status: 200,
    description: "GRNs restored successfully",
  })
  @ApiBody({
    schema: {
      type: "object",
      properties: {
        grnIds: {
          type: "array",
          items: { type: "string" },
          description: "Array of GRN UUIDs to restore",
        },
      },
    },
  })
  async bulkRestore(
    @Body() body: { grnIds: string[] },
    @CurrentUser("userId") currentUserId: string,
    @CurrentUser("username") currentUsername: string,
  ): Promise<{ restoredCount: number; failedIds: string[] }> {
    this.logger.log(`Bulk restoring ${body.grnIds.length} GRNs`);
    return await this.grnService.bulkRestore(
      body.grnIds,
      currentUserId,
      currentUsername,
    );
  }

  @Auth(UserRole.ADMIN)
  @Post("bulk-permanent-delete")
  @ApiOperation({
    summary: "Bulk permanent delete goods received notes",
    description:
      "Permanently delete multiple soft-deleted goods received notes from the database. This action cannot be undone.",
  })
  @ApiResponse({
    status: 200,
    description: "GRNs permanently deleted successfully",
  })
  @ApiBody({
    schema: {
      type: "object",
      properties: {
        grnIds: {
          type: "array",
          items: { type: "string" },
          description: "Array of GRN UUIDs to permanently delete",
        },
      },
    },
  })
  async bulkPermanentDelete(
    @Body() body: { grnIds: string[] },
    @CurrentUser("userId") currentUserId: string,
    @CurrentUser("username") currentUsername: string,
  ): Promise<{ deletedCount: number; failedIds: string[] }> {
    this.logger.log(`Bulk permanently deleting ${body.grnIds.length} GRNs`);
    return await this.grnService.bulkPermanentDelete(
      body.grnIds,
      currentUserId,
      currentUsername,
    );
  }

  @Auth(UserRole.ADMIN)
  @Delete(":id/permanent")
  @ApiOperation({
    summary: "Permanently delete goods received note",
    description:
      "Permanently delete a soft-deleted goods received note from the database. This action cannot be undone.",
  })
  @ApiResponse({
    status: 200,
    description: "GRN permanently deleted successfully",
  })
  @ApiResponse({ status: 404, description: "GRN not found" })
  @ApiParam({ name: "id", description: "GRN UUID" })
  async permanentDelete(
    @Param("id", ParseUUIDPipe) id: string,
    @CurrentUser("userId") currentUserId: string,
    @CurrentUser("username") currentUsername: string,
  ): Promise<void> {
    this.logger.log(`Permanently deleting GRN: ${id}`);
    return await this.grnService.permanentDelete(
      id,
      currentUserId,
      currentUsername,
    );
  }

  @Auth(UserRole.ADMIN)
  @Delete(":id")
  @ApiOperation({
    summary: "Soft delete goods received note",
    description:
      "Soft delete (deactivate) goods received note. Can be restored later if needed.",
  })
  @ApiResponse({ status: 200, description: "GRN soft deleted successfully" })
  @ApiResponse({ status: 404, description: "GRN not found" })
  @ApiParam({ name: "id", description: "GRN UUID" })
  @HttpCode(HttpStatus.OK)
  async remove(
    @Param("id", ParseUUIDPipe) id: string,
    @CurrentUser("userId") currentUserId: string,
    @CurrentUser("username") currentUsername: string,
  ): Promise<void> {
    this.logger.log(`Soft deleting GRN: ${id}`);
    await this.grnService.softDelete(id, currentUserId, currentUsername);
  }
}
