import { ApiProperty } from "@nestjs/swagger";
import {
  IsArray,
  IsBoolean,
  IsEnum,
  IsOptional,
  IsString,
} from "class-validator";

export enum BackupDatabase {
  POSTGRESQL = "postgresql",
  REDIS = "redis",
}

export class CreateBackupDto {
  @ApiProperty({
    description: "Type of backup",
    enum: ["manual", "scheduled"],
    default: "manual",
  })
  @IsEnum(["manual", "scheduled"])
  @IsOptional()
  backupType?: "manual" | "scheduled" = "manual";

  @ApiProperty({
    description: "Databases to include in backup",
    enum: BackupDatabase,
    isArray: true,
    default: ["postgresql", "redis"],
  })
  @IsArray()
  @IsOptional()
  databases?: BackupDatabase[] = [
    BackupDatabase.POSTGRESQL,
    BackupDatabase.REDIS,
  ];

  @ApiProperty({
    description: "Include system settings in backup",
    default: true,
  })
  @IsBoolean()
  @IsOptional()
  includeSettings?: boolean = true;

  @ApiProperty({
    description: "User creating the backup",
    default: "system",
  })
  @IsString()
  @IsOptional()
  createdBy?: string = "system";

  @ApiProperty({
    description: "Optional description for the backup",
    required: false,
  })
  @IsString()
  @IsOptional()
  description?: string;
}
