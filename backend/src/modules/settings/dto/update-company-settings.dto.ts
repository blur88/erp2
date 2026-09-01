import { ApiProperty } from '@nestjs/swagger';
import {
  IsString,
  IsOptional,
  IsEmail,
  IsUrl,
  MaxLength,
  ValidateIf,
} from 'class-validator';

export class UpdateCompanySettingsDto {
  @ApiProperty({
    description: 'Company name',
    example: 'Acme Corporation',
  })
  @IsString()
  @MaxLength(255)
  name: string;

  @ApiProperty({
    description: 'Business registration number (SSM)',
    example: '201901234567',
    required: false,
  })
  @IsOptional()
  @IsString()
  @MaxLength(50)
  registrationNumber?: string;

  @ApiProperty({
    description: 'Company street address',
    example: '123 Main Street',
  })
  @IsString()
  address: string;

  @ApiProperty({
    description: 'City',
    example: 'New York',
  })
  @IsString()
  @MaxLength(100)
  city: string;

  @ApiProperty({
    description: 'State or province',
    example: 'NY',
    required: false,
  })
  @IsOptional()
  @IsString()
  @MaxLength(100)
  state?: string;

  @ApiProperty({
    description: 'Postal code',
    example: '10001',
    required: false,
  })
  @IsOptional()
  @IsString()
  @MaxLength(20)
  postalCode?: string;

  @ApiProperty({
    description: 'Country',
    example: 'United States',
  })
  @IsString()
  @MaxLength(100)
  country: string;

  @ApiProperty({
    description: 'Contact phone number',
    example: '+1-555-0123',
    required: false,
  })
  @IsOptional()
  @IsString()
  @MaxLength(50)
  phone?: string;

  @ApiProperty({
    description: 'Contact email address',
    example: 'contact@acme.com',
    required: false,
  })
  @IsOptional()
  @ValidateIf((o) => o.email !== '' && o.email !== null)
  @IsEmail()
  @MaxLength(255)
  email?: string;

  @ApiProperty({
    description: 'Company website URL',
    example: 'https://www.acme.com',
    required: false,
  })
  @IsOptional()
  @ValidateIf((o) => o.website !== '' && o.website !== null)
  @IsUrl()
  @MaxLength(255)
  website?: string;

  @ApiProperty({
    description: 'Miscellaneous information (tax ID, registration numbers, etc.)',
    example: 'Tax ID: 12-3456789',
    required: false,
  })
  @IsOptional()
  @IsString()
  miscInfo?: string;
}
