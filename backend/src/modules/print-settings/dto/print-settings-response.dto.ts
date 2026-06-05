import { ApiProperty } from "@nestjs/swagger";
import { PrintSettings } from "../../../database/entities/print-settings.entity";

export class PrintSettingsResponseDto {
  @ApiProperty()
  id: string;

  @ApiProperty()
  logoUrl: string;

  @ApiProperty()
  companyName: string;

  @ApiProperty()
  address: string;

  @ApiProperty()
  city: string;

  @ApiProperty()
  state: string;

  @ApiProperty()
  postalCode: string;

  @ApiProperty()
  country: string;

  @ApiProperty()
  phone: string;

  @ApiProperty()
  email: string;

  @ApiProperty()
  website: string;

  @ApiProperty()
  miscInfo: string;

  @ApiProperty()
  salesPerPageFooter: string;

  @ApiProperty()
  salesEndOfDocFooter: string;

  @ApiProperty()
  purchasingPerPageFooter: string;

  @ApiProperty()
  purchasingEndOfDocFooter: string;

  @ApiProperty()
  inventoryPerPageFooter: string;

  @ApiProperty()
  inventoryEndOfDocFooter: string;

  @ApiProperty()
  reportPerPageFooter: string;

  @ApiProperty()
  reportEndOfDocFooter: string;

  @ApiProperty()
  salesOrderTemplate: object;

  @ApiProperty()
  paymentReceiptTemplate: object;

  @ApiProperty()
  purchaseOrderTemplate: object;

  @ApiProperty()
  grnTemplate: object;

  @ApiProperty()
  vendorPaymentTemplate: object;

  @ApiProperty()
  createdAt: Date;

  @ApiProperty()
  updatedAt: Date;

  static fromEntity(entity: PrintSettings): PrintSettingsResponseDto {
    const dto = new PrintSettingsResponseDto();
    dto.id = entity.id;
    dto.logoUrl = entity.logoUrl;
    dto.companyName = entity.companyName;
    dto.address = entity.address;
    dto.city = entity.city;
    dto.state = entity.state;
    dto.postalCode = entity.postalCode;
    dto.country = entity.country;
    dto.phone = entity.phone;
    dto.email = entity.email;
    dto.website = entity.website;
    dto.miscInfo = entity.miscInfo;
    dto.salesPerPageFooter = entity.salesPerPageFooter;
    dto.salesEndOfDocFooter = entity.salesEndOfDocFooter;
    dto.purchasingPerPageFooter = entity.purchasingPerPageFooter;
    dto.purchasingEndOfDocFooter = entity.purchasingEndOfDocFooter;
    dto.inventoryPerPageFooter = entity.inventoryPerPageFooter;
    dto.inventoryEndOfDocFooter = entity.inventoryEndOfDocFooter;
    dto.reportPerPageFooter = entity.reportPerPageFooter;
    dto.reportEndOfDocFooter = entity.reportEndOfDocFooter;
    dto.salesOrderTemplate = entity.salesOrderTemplate;
    dto.paymentReceiptTemplate = entity.paymentReceiptTemplate;
    dto.purchaseOrderTemplate = entity.purchaseOrderTemplate;
    dto.grnTemplate = entity.grnTemplate;
    dto.vendorPaymentTemplate = entity.vendorPaymentTemplate;
    dto.createdAt = entity.createdAt;
    dto.updatedAt = entity.updatedAt;
    return dto;
  }
}
