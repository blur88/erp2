import { IsOptional, IsString, IsObject } from 'class-validator';
import { ApiProperty } from '@nestjs/swagger';

export class UpdatePrintSettingsDto {
  // Common Header Settings
  @ApiProperty({ description: 'Logo URL', required: false })
  @IsOptional()
  @IsString()
  logoUrl?: string;

  @ApiProperty({ description: 'Company name', required: false })
  @IsOptional()
  @IsString()
  companyName?: string;

  @ApiProperty({ description: 'Company address', required: false })
  @IsOptional()
  @IsString()
  address?: string;

  @ApiProperty({ description: 'City', required: false })
  @IsOptional()
  @IsString()
  city?: string;

  @ApiProperty({ description: 'State/Province', required: false })
  @IsOptional()
  @IsString()
  state?: string;

  @ApiProperty({ description: 'Postal code', required: false })
  @IsOptional()
  @IsString()
  postalCode?: string;

  @ApiProperty({ description: 'Country', required: false })
  @IsOptional()
  @IsString()
  country?: string;

  @ApiProperty({ description: 'Phone number', required: false })
  @IsOptional()
  @IsString()
  phone?: string;

  @ApiProperty({ description: 'Email address', required: false })
  @IsOptional()
  @IsString()
  email?: string;

  @ApiProperty({ description: 'Website URL', required: false })
  @IsOptional()
  @IsString()
  website?: string;

  @ApiProperty({ description: 'Miscellaneous info', required: false })
  @IsOptional()
  @IsString()
  miscInfo?: string;

  // Sales Document Footer
  @ApiProperty({ description: 'Sales per-page footer', required: false })
  @IsOptional()
  @IsString()
  salesPerPageFooter?: string;

  @ApiProperty({ description: 'Sales end of document footer', required: false })
  @IsOptional()
  @IsString()
  salesEndOfDocFooter?: string;

  // Purchasing Document Footer
  @ApiProperty({ description: 'Purchasing per-page footer', required: false })
  @IsOptional()
  @IsString()
  purchasingPerPageFooter?: string;

  @ApiProperty({ description: 'Purchasing end of document footer', required: false })
  @IsOptional()
  @IsString()
  purchasingEndOfDocFooter?: string;

  // Inventory Document Footer
  @ApiProperty({ description: 'Inventory per-page footer', required: false })
  @IsOptional()
  @IsString()
  inventoryPerPageFooter?: string;

  @ApiProperty({ description: 'Inventory end of document footer', required: false })
  @IsOptional()
  @IsString()
  inventoryEndOfDocFooter?: string;

  // Report Document Footer
  @ApiProperty({ description: 'Report per-page footer', required: false })
  @IsOptional()
  @IsString()
  reportPerPageFooter?: string;

  @ApiProperty({ description: 'Report end of document footer', required: false })
  @IsOptional()
  @IsString()
  reportEndOfDocFooter?: string;

  // Template Settings
  @ApiProperty({ description: 'Sales order template configuration', required: false })
  @IsOptional()
  @IsObject()
  salesOrderTemplate?: object;

  @ApiProperty({ description: 'Payment receipt template configuration', required: false })
  @IsOptional()
  @IsObject()
  paymentReceiptTemplate?: object;

  @ApiProperty({ description: 'Purchase order template configuration', required: false })
  @IsOptional()
  @IsObject()
  purchaseOrderTemplate?: object;

  @ApiProperty({ description: 'GRN template configuration', required: false })
  @IsOptional()
  @IsObject()
  grnTemplate?: object;

  @ApiProperty({ description: 'Vendor payment template configuration', required: false })
  @IsOptional()
  @IsObject()
  vendorPaymentTemplate?: object;
}
