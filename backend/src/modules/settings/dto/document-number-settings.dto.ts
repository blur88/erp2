import { IsString, IsInt, IsArray, ValidateNested, Min } from 'class-validator';
import { ApiProperty } from '@nestjs/swagger';
import { Type, Expose } from 'class-transformer';

export class DocumentNumberConfigDto {
  @ApiProperty({ example: 'Sales Orders', description: 'Document name' })
  @IsString()
  @Expose()
  documentName: string;

  @ApiProperty({ example: 'SO', description: 'Document prefix' })
  @IsString()
  @Expose()
  prefix: string;

  @ApiProperty({ example: '000001', description: 'Number format pattern' })
  @IsString()
  @Expose()
  numberFormat: string;

  @ApiProperty({ example: 1, description: 'Next document number' })
  @IsInt()
  @Min(1)
  @Expose()
  nextNumber: number;
}

export class UpdateDocumentNumberSettingsDto {
  @ApiProperty({ type: [DocumentNumberConfigDto], description: 'Document number configurations' })
  @IsArray()
  @ValidateNested({ each: true })
  @Type(() => DocumentNumberConfigDto)
  configurations: DocumentNumberConfigDto[];
}

export class DocumentNumberSettingsResponseDto {
  @ApiProperty()
  @Expose()
  id: string;

  @ApiProperty({ type: [DocumentNumberConfigDto] })
  @Expose()
  configurations: DocumentNumberConfigDto[];

  @ApiProperty()
  @Expose()
  createdAt: Date;

  @ApiProperty()
  @Expose()
  updatedAt: Date;
}

export class GenerateDocumentNumberDto {
  @ApiProperty({
    example: 'Sales Orders',
    description: 'Document name to generate number for',
  })
  @IsString()
  documentName: string;
}

export class GenerateDocumentNumberResponseDto {
  @ApiProperty({ example: 'SO-000001' })
  documentNumber: string;

  @ApiProperty({ example: 'Sales Orders' })
  documentName: string;
}
