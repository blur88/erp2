import { Module } from "@nestjs/common";
import { TypeOrmModule } from "@nestjs/typeorm";
import { MulterModule } from "@nestjs/platform-express";

import { PrintSettingsService } from "./print-settings.service";
import { PrintSettingsController } from "./print-settings.controller";
import { PrintSettings } from "../../database/entities/print-settings.entity";

/**
 * Print Settings Module
 * Handles print settings and document templates
 */
@Module({
  imports: [
    // TypeORM for PrintSettings entity
    TypeOrmModule.forFeature([PrintSettings]),

    // Multer for file upload
    MulterModule.register({
      dest: "./uploads/logos",
    }),
  ],
  controllers: [PrintSettingsController],
  providers: [PrintSettingsService],
  exports: [PrintSettingsService, TypeOrmModule],
})
export class PrintSettingsModule {}
