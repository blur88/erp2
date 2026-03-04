import { IsString, IsInt, IsArray, ValidateNested, Min, Max } from 'class-validator';
import { ApiProperty } from '@nestjs/swagger';
import { Type, Expose } from 'class-transformer';

export class DocumentNumberConfigDto {
  @ApiProperty({ example: 'Sales Orders' })
  @IsString()
  @Expose()
  documentName: string;

  @ApiProperty({ example: 'SO' })
  @IsString()
  @Expose()
  prefix: string;

  @ApiProperty({ example: 3, description: 'Minimum digits for sequence padding' })
  @IsInt()
  @Min(1)
  @Max(10)
  @Expose()
  paddingDigits: number;

  @ApiProperty({ example: 1 })
  @IsInt()
  @Min(1)
  @Expose()
  nextNumber: number;

  @ApiProperty({ example: 26, description: 'Last 2-digit year when sequence was reset' })
  @IsInt()
  @Expose()
  lastResetYear: number;
}

export class UpdateDocumentNumberSettingsDto {
  @ApiProperty({ type: [DocumentNumberConfigDto] })
  @IsArray()
  @ValidateNested({ each: true })
  @Type(() => DocumentNumberConfigDto)
  configurations: DocumentNumberConfigDto[];
}

export class DocumentNumberSettingsResponseDto {
  @ApiProperty({ type: [DocumentNumberConfigDto] })
  @Expose()
  configurations: DocumentNumberConfigDto[];
}

export class GenerateDocumentNumberDto {
  @ApiProperty({ example: 'Sales Orders' })
  @IsString()
  documentName: string;
}

export class GenerateDocumentNumberResponseDto {
  @ApiProperty({ example: 'SO-26-001' })
  documentNumber: string;

  @ApiProperty({ example: 'Sales Orders' })
  documentName: string;
}
