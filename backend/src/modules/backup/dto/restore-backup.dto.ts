import { ApiProperty } from '@nestjs/swagger';
import { IsBoolean, IsOptional, IsString } from 'class-validator';

export class RestoreBackupDto {
  @ApiProperty({
    description: 'Confirmation that user understands this will overwrite current data',
    default: false,
  })
  @IsBoolean()
  confirmed: boolean;

  @ApiProperty({
    description: 'User performing the restore',
    default: 'system',
  })
  @IsString()
  @IsOptional()
  restoredBy?: string = 'system';

  @ApiProperty({
    description: 'Optional note about the restore operation',
    required: false,
  })
  @IsString()
  @IsOptional()
  note?: string;
}
