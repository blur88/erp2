import { Controller, Get, Query, Param } from "@nestjs/common";
import { ApiTags, ApiOperation, ApiResponse, ApiQuery } from "@nestjs/swagger";
import { AuditLogService } from "./services";
import { QueryAuditLogsDto, AuditAction } from "./dto";

@ApiTags("Audit Logs")
@Controller("audit-logs")
export class AuditLogsController {
  constructor(private readonly auditLogService: AuditLogService) {}

  @Get()
  @ApiOperation({ summary: "Get all audit logs with filtering and pagination" })
  @ApiResponse({
    status: 200,
    description: "Audit logs retrieved successfully",
  })
  @ApiQuery({ name: "page", required: false, type: Number })
  @ApiQuery({ name: "limit", required: false, type: Number })
  @ApiQuery({ name: "search", required: false, type: String })
  @ApiQuery({ name: "action", required: false, enum: AuditAction })
  @ApiQuery({ name: "entityType", required: false, type: String })
  @ApiQuery({ name: "entityId", required: false, type: String })
  @ApiQuery({ name: "userId", required: false, type: String })
  @ApiQuery({ name: "username", required: false, type: String })
  @ApiQuery({ name: "startDate", required: false, type: String })
  @ApiQuery({ name: "endDate", required: false, type: String })
  async findAll(@Query() query: QueryAuditLogsDto) {
    return this.auditLogService.findAll(query);
  }

  @Get("entity/:entityType/:entityId")
  @ApiOperation({ summary: "Get audit logs for a specific entity" })
  @ApiResponse({
    status: 200,
    description: "Entity audit logs retrieved successfully",
  })
  async findByEntity(
    @Param("entityType") entityType: string,
    @Param("entityId") entityId: string,
  ) {
    const data = await this.auditLogService.findByEntity(entityType, entityId);
    return { data };
  }

  @Get("user/:userId")
  @ApiOperation({ summary: "Get audit logs for a specific user" })
  @ApiResponse({
    status: 200,
    description: "User audit logs retrieved successfully",
  })
  async findByUser(@Param("userId") userId: string) {
    const data = await this.auditLogService.findByUser(userId);
    return { data };
  }

  @Get("statistics")
  @ApiOperation({ summary: "Get audit log statistics" })
  @ApiResponse({
    status: 200,
    description: "Statistics retrieved successfully",
  })
  @ApiQuery({ name: "startDate", required: false, type: String })
  @ApiQuery({ name: "endDate", required: false, type: String })
  async getStatistics(
    @Query("startDate") startDate?: string,
    @Query("endDate") endDate?: string,
  ) {
    const start = startDate ? new Date(startDate) : undefined;
    const end = endDate ? new Date(endDate) : undefined;
    return this.auditLogService.getStatistics(start, end);
  }
}
