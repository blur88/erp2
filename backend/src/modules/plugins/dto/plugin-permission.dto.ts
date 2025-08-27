import { ApiProperty } from '@nestjs/swagger';
import { IsObject, IsOptional, IsArray, IsString, IsBoolean } from 'class-validator';
import { IPluginPermissions } from '../interfaces/plugin.interface';

export class PluginPermissionDto {
  @ApiProperty({
    description: 'Plugin permissions object',
    example: {
      database: { read: true, write: false },
      api: { external: true },
      filesystem: { read: true, write: false },
    },
  })
  @IsObject()
  permissions: IPluginPermissions;

  @ApiProperty({
    description: 'Grant all requested permissions automatically',
    default: false,
    required: false,
  })
  @IsOptional()
  @IsBoolean()
  autoGrant?: boolean = false;

  @ApiProperty({
    description: 'Specific permissions to grant',
    type: [String],
    required: false,
  })
  @IsOptional()
  @IsArray()
  @IsString({ each: true })
  grantList?: string[];

  @ApiProperty({
    description: 'Specific permissions to deny',
    type: [String],
    required: false,
  })
  @IsOptional()
  @IsArray()
  @IsString({ each: true })
  denyList?: string[];

  @ApiProperty({
    description: 'Reason for permission change',
    required: false,
  })
  @IsOptional()
  @IsString()
  reason?: string;
}