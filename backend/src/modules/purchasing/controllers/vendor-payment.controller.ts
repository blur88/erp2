import {
  Controller,
  Get,
  Post,
  Body,
  Patch,
  Param,
  Delete,
  Query,
  HttpCode,
  HttpStatus,
  ParseUUIDPipe,
} from "@nestjs/common";
import {
  ApiTags,
  ApiOperation,
  ApiResponse,
  ApiParam,
  ApiBody,
} from "@nestjs/swagger";
import { VendorPaymentService } from "../services/vendor-payment.service";
import {
  CreateVendorPaymentDto,
  UpdateVendorPaymentDto,
  QueryVendorPaymentsDto,
} from "../dto/vendor-payment.dto";
import { UserRole } from "../../../database/entities/user.entity";
import { Auth } from "../../auth/decorators/auth.decorator";
import { CurrentUser } from "../../auth/decorators/current-user.decorator";

@ApiTags("Vendor Payments")
@Controller("purchasing/vendor-payments")
export class VendorPaymentController {
  constructor(private readonly vendorPaymentService: VendorPaymentService) {}

  @Auth(UserRole.ADMIN)
  @Post()
  @ApiOperation({ summary: "Create a new vendor payment" })
  @ApiBody({ type: CreateVendorPaymentDto })
  @ApiResponse({
    status: 201,
    description: "Vendor payment created successfully",
  })
  @ApiResponse({ status: 400, description: "Invalid input data" })
  create(
    @Body() createVendorPaymentDto: CreateVendorPaymentDto,
    @CurrentUser("userId") currentUserId: string,
    @CurrentUser("username") currentUsername: string,
  ) {
    return this.vendorPaymentService.create(
      createVendorPaymentDto,
      currentUserId,
      currentUsername,
    );
  }

  @Get()
  @ApiOperation({ summary: "Get all vendor payments with filters" })
  @ApiResponse({
    status: 200,
    description: "Returns paginated vendor payments",
  })
  findAll(@Query() query: QueryVendorPaymentsDto) {
    return this.vendorPaymentService.findAll(query);
  }

  @Get("deleted")
  @ApiOperation({ summary: "Get all deleted vendor payments" })
  @ApiResponse({
    status: 200,
    description: "Returns paginated deleted vendor payments",
  })
  findDeleted(@Query() query: QueryVendorPaymentsDto) {
    return this.vendorPaymentService.findDeleted(query);
  }

  @Get(":id")
  @ApiOperation({ summary: "Get a vendor payment by ID" })
  @ApiParam({ name: "id", description: "Vendor payment UUID" })
  @ApiResponse({
    status: 200,
    description: "Returns the vendor payment",
  })
  @ApiResponse({ status: 404, description: "Vendor payment not found" })
  findOne(@Param("id", ParseUUIDPipe) id: string) {
    return this.vendorPaymentService.findOne(id);
  }

  @Patch(":id")
  @ApiOperation({ summary: "Update a vendor payment" })
  @ApiParam({ name: "id", description: "Vendor payment UUID" })
  @ApiBody({ type: UpdateVendorPaymentDto })
  @ApiResponse({
    status: 200,
    description: "Vendor payment updated successfully",
  })
  @ApiResponse({ status: 404, description: "Vendor payment not found" })
  update(
    @Param("id", ParseUUIDPipe) id: string,
    @Body() updateVendorPaymentDto: UpdateVendorPaymentDto,
    @CurrentUser("userId") currentUserId: string,
    @CurrentUser("username") currentUsername: string,
  ) {
    return this.vendorPaymentService.update(
      id,
      updateVendorPaymentDto,
      currentUserId,
      currentUsername,
    );
  }

  @Post(":id/restore")
  @ApiOperation({ summary: "Restore a soft deleted vendor payment" })
  @ApiParam({ name: "id", description: "Vendor payment UUID" })
  @ApiResponse({
    status: 200,
    description: "Vendor payment restored successfully",
  })
  @ApiResponse({ status: 404, description: "Vendor payment not found" })
  restore(
    @Param("id", ParseUUIDPipe) id: string,
    @CurrentUser("userId") currentUserId: string,
    @CurrentUser("username") currentUsername: string,
  ) {
    return this.vendorPaymentService.restore(
      id,
      currentUserId,
      currentUsername,
    );
  }

  @Post("bulk-restore")
  @ApiOperation({ summary: "Bulk restore soft deleted vendor payments" })
  @ApiBody({
    schema: {
      type: "object",
      properties: {
        paymentIds: {
          type: "array",
          items: { type: "string" },
          description: "Array of vendor payment IDs to restore",
        },
      },
    },
  })
  @ApiResponse({
    status: 200,
    description: "Vendor payments restored successfully",
  })
  bulkRestore(
    @Body("paymentIds") paymentIds: string[],
    @CurrentUser("userId") currentUserId: string,
    @CurrentUser("username") currentUsername: string,
  ) {
    return this.vendorPaymentService.bulkRestore(
      paymentIds,
      currentUserId,
      currentUsername,
    );
  }

  @Auth(UserRole.ADMIN)
  @Delete(":id")
  @HttpCode(HttpStatus.NO_CONTENT)
  @ApiOperation({ summary: "Soft delete a vendor payment" })
  @ApiParam({ name: "id", description: "Vendor payment UUID" })
  @ApiResponse({
    status: 204,
    description: "Vendor payment deleted successfully",
  })
  @ApiResponse({ status: 404, description: "Vendor payment not found" })
  remove(
    @Param("id", ParseUUIDPipe) id: string,
    @CurrentUser("userId") currentUserId: string,
    @CurrentUser("username") currentUsername: string,
  ) {
    return this.vendorPaymentService.softDelete(
      id,
      currentUserId,
      currentUsername,
    );
  }

  @Auth(UserRole.ADMIN)
  @Delete(":id/permanent")
  @HttpCode(HttpStatus.OK)
  @ApiOperation({ summary: "Hard delete a vendor payment" })
  @ApiParam({ name: "id", description: "Vendor payment UUID" })
  @ApiResponse({
    status: 200,
    description: "Vendor payment permanently deleted successfully",
  })
  @ApiResponse({ status: 404, description: "Vendor payment not found" })
  permanentDelete(
    @Param("id", ParseUUIDPipe) id: string,
    @CurrentUser("userId") currentUserId: string,
    @CurrentUser("username") currentUsername: string,
  ) {
    return this.vendorPaymentService.permanentDelete(
      id,
      currentUserId,
      currentUsername,
    );
  }

  @Post("for-po/:poId")
  @ApiOperation({ summary: "Create vendor payment for purchase order" })
  @ApiParam({ name: "poId", description: "Purchase Order UUID" })
  @ApiResponse({
    status: 201,
    description: "Vendor payment created successfully for PO",
  })
  @ApiResponse({ status: 404, description: "Purchase order not found" })
  createForPurchaseOrder(
    @Param("poId", ParseUUIDPipe) poId: string,
    @CurrentUser("userId") currentUserId: string,
    @CurrentUser("username") currentUsername: string,
  ) {
    return this.vendorPaymentService.createForPurchaseOrder(
      poId,
      currentUserId,
      currentUsername,
    );
  }

  @Get("for-po/:poId")
  @ApiOperation({ summary: "Get vendor payment for purchase order" })
  @ApiParam({ name: "poId", description: "Purchase Order UUID" })
  @ApiResponse({
    status: 200,
    description: "Vendor payment retrieved successfully",
  })
  @ApiResponse({
    status: 404,
    description: "Vendor payment not found for this PO",
  })
  findByPurchaseOrder(@Param("poId", ParseUUIDPipe) poId: string) {
    return this.vendorPaymentService.findByPurchaseOrder(poId);
  }
}
