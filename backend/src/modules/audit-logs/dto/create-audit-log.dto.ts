import { IsOptional, IsString, IsUUID, IsObject } from 'class-validator';
import { ApiProperty, ApiPropertyOptional } from '@nestjs/swagger';

export class CreateAuditLogDto {
  @ApiPropertyOptional({
    description: "User ID performing the action (defaults to 'system' if omitted)",
    example: 'system',
  })
  @IsOptional()
  @IsString()
  userId?: string;

  @ApiPropertyOptional({ description: 'Username for display', example: 'admin' })
  @IsOptional()
  @IsString()
  username?: string;

  @ApiProperty({ description: 'Action performed', example: 'CREATE' })
  @IsString()
  action: string;

  @ApiProperty({ description: 'Type of entity affected', example: 'Product' })
  @IsString()
  entityType: string;

  @ApiPropertyOptional({ description: 'ID of the affected entity', format: 'uuid' })
  @IsOptional()
  @IsUUID()
  entityId?: string;

  @ApiProperty({ description: 'Human-readable description', example: 'Created new product: Laptop' })
  @IsString()
  description: string;

  @ApiPropertyOptional({ description: 'Previous state of the entity' })
  @IsOptional()
  @IsObject()
  oldValues?: any;

  @ApiPropertyOptional({ description: 'New state of the entity' })
  @IsOptional()
  @IsObject()
  newValues?: any;

  @ApiPropertyOptional({ description: 'IP address of the user', example: '192.168.1.1' })
  @IsOptional()
  @IsString()
  ipAddress?: string;

  @ApiPropertyOptional({ description: 'User agent string' })
  @IsOptional()
  @IsString()
  userAgent?: string;

  @ApiPropertyOptional({ description: 'Additional metadata' })
  @IsOptional()
  @IsObject()
  metadata?: any;
}
