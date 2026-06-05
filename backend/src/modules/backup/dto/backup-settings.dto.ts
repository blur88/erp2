import { ApiProperty } from "@nestjs/swagger";
import { Expose } from "class-transformer";
import {
  IsBoolean,
  IsInt,
  IsOptional,
  IsString,
  Matches,
  Max,
  Min,
} from "class-validator";

export class UpdateBackupSettingsDto {
  @ApiProperty({
    description:
      "Number of days to retain backups before auto-cleanup (1-365 days)",
    example: 30,
    minimum: 1,
    maximum: 365,
  })
  @IsInt()
  @Min(1)
  @Max(365)
  @IsOptional()
  retentionDays?: number;

  @ApiProperty({
    description: "Enable automatic backup cleanup",
    default: true,
  })
  @IsBoolean()
  @IsOptional()
  autoCleanupEnabled?: boolean;

  @ApiProperty({
    description: "Time of day to run cleanup (HH:MM format)",
    example: "02:00",
  })
  @IsString()
  @Matches(/^([0-1][0-9]|2[0-3]):[0-5][0-9]$/, {
    message: "Time must be in HH:MM format",
  })
  @IsOptional()
  cleanupTime?: string;

  @ApiProperty({
    description: "Maximum number of backups to keep (null for unlimited)",
    example: 100,
    required: false,
  })
  @IsInt()
  @Min(1)
  @IsOptional()
  maximumBackupsToKeep?: number | null;

  @ApiProperty({
    description:
      "Maximum total size of all backups in bytes (null for unlimited, max 10485760 = 10MB)",
    example: 10485760,
    maximum: 10485760,
    required: false,
  })
  @IsInt()
  @Min(1)
  @Max(10485760)
  @IsOptional()
  maximumTotalSize?: number | null;
}

export class BackupSettingsResponseDto {
  @ApiProperty({ description: "Settings ID" })
  @Expose()
  id: string;

  @ApiProperty({ description: "Number of days to retain backups" })
  @Expose()
  retentionDays: number;

  @ApiProperty({ description: "Auto cleanup enabled" })
  @Expose()
  autoCleanupEnabled: boolean;

  @ApiProperty({ description: "Cleanup time (HH:MM)" })
  @Expose()
  cleanupTime: string;

  @ApiProperty({ description: "Maximum backups to keep" })
  @Expose()
  maximumBackupsToKeep: number | null;

  @ApiProperty({ description: "Maximum total size in bytes" })
  @Expose()
  maximumTotalSize: number | null;

  @ApiProperty({ description: "Created at timestamp" })
  @Expose()
  createdAt: Date;

  @ApiProperty({ description: "Updated at timestamp" })
  @Expose()
  updatedAt: Date;
}
