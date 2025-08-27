import { ApiProperty } from '@nestjs/swagger';
import { IsOptional, IsBoolean, IsString, IsUrl, IsObject, ValidateNested } from 'class-validator';
import { Type, Transform } from 'class-transformer';

/**
 * DTO for plugin installation
 */
export class InstallPluginDto {
  @ApiProperty({
    description: 'Plugin source (file path, URL, or marketplace ID)',
    example: 'https://registry.example.com/plugin.zip',
    required: false,
  })
  @IsOptional()
  @IsString()
  source?: string;

  @ApiProperty({
    description: 'Force installation even if plugin exists',
    default: false,
    required: false,
  })
  @IsOptional()
  @IsBoolean()
  @Transform(({ value }) => value === 'true' || value === true)
  force?: boolean = false;

  @ApiProperty({
    description: 'Skip security validation during installation',
    default: false,
    required: false,
  })
  @IsOptional()
  @IsBoolean()
  @Transform(({ value }) => value === 'true' || value === true)
  skipValidation?: boolean = false;

  @ApiProperty({
    description: 'Installation options',
    required: false,
  })
  @IsOptional()
  @IsObject()
  options?: {
    createTables?: boolean;
    runMigrations?: boolean;
    activateAfterInstall?: boolean;
    configureDefaults?: boolean;
  };

  @ApiProperty({
    description: 'Plugin configuration to apply during installation',
    required: false,
  })
  @IsOptional()
  @IsObject()
  initialConfig?: Record<string, any>;
}

/**
 * DTO for plugin installation from marketplace
 */
export class InstallFromMarketplaceDto {
  @ApiProperty({
    description: 'Plugin ID from marketplace',
    example: 'acme-corp/inventory-plus',
  })
  @IsString()
  pluginId: string;

  @ApiProperty({
    description: 'Plugin version to install',
    example: '1.2.3',
    required: false,
  })
  @IsOptional()
  @IsString()
  version?: string;

  @ApiProperty({
    description: 'Marketplace registry URL',
    example: 'https://plugins.erp-system.com',
    required: false,
  })
  @IsOptional()
  @IsUrl()
  registryUrl?: string;

  @ApiProperty({
    description: 'Authentication token for private plugins',
    required: false,
  })
  @IsOptional()
  @IsString()
  authToken?: string;

  @ApiProperty({
    description: 'Installation options',
    required: false,
  })
  @IsOptional()
  @IsObject()
  options?: {
    includeDependencies?: boolean;
    resolveDependencies?: boolean;
    acceptLicense?: boolean;
  };
}

/**
 * DTO for bulk plugin installation
 */
export class BulkInstallPluginDto {
  @ApiProperty({
    description: 'List of plugins to install',
    type: [InstallFromMarketplaceDto],
  })
  @ValidateNested({ each: true })
  @Type(() => InstallFromMarketplaceDto)
  plugins: InstallFromMarketplaceDto[];

  @ApiProperty({
    description: 'Continue installation even if some plugins fail',
    default: true,
    required: false,
  })
  @IsOptional()
  @IsBoolean()
  continueOnError?: boolean = true;

  @ApiProperty({
    description: 'Installation order strategy',
    enum: ['sequential', 'parallel', 'dependency-first'],
    default: 'dependency-first',
    required: false,
  })
  @IsOptional()
  @IsString()
  installationOrder?: 'sequential' | 'parallel' | 'dependency-first' = 'dependency-first';

  @ApiProperty({
    description: 'Maximum concurrent installations when using parallel strategy',
    default: 3,
    required: false,
  })
  @IsOptional()
  maxConcurrent?: number = 3;
}