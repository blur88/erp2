import { Module, Global } from "@nestjs/common";
import { TypeOrmModule } from "@nestjs/typeorm";
import { AuditLog } from "@/database/entities/audit-log.entity";
import { AuditLogService } from "./services";
import { AuditLogsController } from "./audit-logs.controller";

@Global() // Make this module global so AuditLogService can be injected anywhere
@Module({
  imports: [TypeOrmModule.forFeature([AuditLog])],
  controllers: [AuditLogsController],
  providers: [AuditLogService],
  exports: [AuditLogService], // Export service for use in other modules
})
export class AuditLogsModule {}
