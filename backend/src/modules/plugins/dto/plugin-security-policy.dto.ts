import { ApiProperty } from '@nestjs/swagger';
import { IsObject, IsOptional, IsString } from 'class-validator';
import { IPluginSecurityPolicy } from '../interfaces/plugin-security.interface';

export class PluginSecurityPolicyDto {
  @ApiProperty({
    description: 'Security policy configuration',
    example: {
      securityLevel: 'medium',
      allowDatabaseRead: true,
      allowDatabaseWrite: false,
      allowExternalApi: false,
      enableSandbox: true,
      allowedPaths: ['/tmp/plugins'],
      allowedDomains: [],
    },
  })
  @IsObject()
  policy: IPluginSecurityPolicy;

  @ApiProperty({
    description: 'Reason for policy change',
    required: false,
  })
  @IsOptional()
  @IsString()
  reason?: string;

  @ApiProperty({
    description: 'Apply policy to plugin dependencies as well',
    default: false,
    required: false,
  })
  @IsOptional()
  applyToDependencies?: boolean = false;
}