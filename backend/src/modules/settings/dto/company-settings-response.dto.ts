import { ApiProperty } from '@nestjs/swagger';
import { Exclude, Expose } from 'class-transformer';

@Exclude()
export class CompanySettingsResponseDto {
  @Expose()
  @ApiProperty({ description: 'Company settings ID' })
  id: string;

  @Expose()
  @ApiProperty({ description: 'Company name' })
  name: string;

  @Expose()
  @ApiProperty({ description: 'Business registration number (SSM)', required: false })
  registrationNumber?: string;

  @Expose()
  @ApiProperty({ description: 'Company street address' })
  address: string;

  @Expose()
  @ApiProperty({ description: 'City' })
  city: string;

  @Expose()
  @ApiProperty({ description: 'State or province', required: false })
  state?: string;

  @Expose()
  @ApiProperty({ description: 'Postal code', required: false })
  postalCode?: string;

  @Expose()
  @ApiProperty({ description: 'Country' })
  country: string;

  @Expose()
  @ApiProperty({ description: 'Contact phone number', required: false })
  phone?: string;

  @Expose()
  @ApiProperty({ description: 'Contact email address', required: false })
  email?: string;

  @Expose()
  @ApiProperty({ description: 'Company website URL', required: false })
  website?: string;

  @Expose()
  @ApiProperty({ description: 'Miscellaneous information', required: false })
  miscInfo?: string;

  @Expose()
  @ApiProperty({ description: 'Company logo URL', required: false })
  logoUrl?: string;

  @Expose()
  @ApiProperty({ description: 'Created at timestamp' })
  createdAt: Date;

  @Expose()
  @ApiProperty({ description: 'Updated at timestamp' })
  updatedAt: Date;
}
