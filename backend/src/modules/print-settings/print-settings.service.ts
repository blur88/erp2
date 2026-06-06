import { Injectable, NotFoundException } from '@nestjs/common';
import { InjectRepository } from '@nestjs/typeorm';
import { Repository } from 'typeorm';
import { PrintSettings } from '../../database/entities/print-settings.entity';
import { UpdatePrintSettingsDto } from './dto/update-print-settings.dto';
import { PrintSettingsResponseDto } from './dto/print-settings-response.dto';

@Injectable()
export class PrintSettingsService {
  constructor(
    @InjectRepository(PrintSettings)
    private readonly printSettingsRepository: Repository<PrintSettings>,
  ) {}

  /**
   * Get print settings (creates default if not exists)
   */
  async getSettings(): Promise<PrintSettingsResponseDto> {
    let settings = await this.printSettingsRepository.findOne({
      where: {},
      order: { createdAt: 'ASC' },
    });

    // Create default settings if none exist
    if (!settings) {
      settings = this.printSettingsRepository.create({
        companyName: '',
        address: '',
        city: '',
        state: '',
        postalCode: '',
        country: '',
        phone: '',
        email: '',
        website: '',
        miscInfo: '',
        salesPerPageFooter: '',
        salesEndOfDocFooter: '',
        purchasingPerPageFooter: '',
        purchasingEndOfDocFooter: '',
        inventoryPerPageFooter: '',
        inventoryEndOfDocFooter: '',
        reportPerPageFooter: '',
        reportEndOfDocFooter: '',
        salesOrderTemplate: this.getDefaultTemplate('Sales Order'),
        paymentReceiptTemplate: this.getDefaultTemplate('Payment Receipt'),
        purchaseOrderTemplate: this.getDefaultTemplate('Purchase Order'),
        grnTemplate: this.getDefaultTemplate('Goods Received Note'),
        vendorPaymentTemplate: this.getDefaultTemplate('Vendor Payment'),
      });
      settings = await this.printSettingsRepository.save(settings);
    }

    return PrintSettingsResponseDto.fromEntity(settings);
  }

  /**
   * Update print settings
   */
  async updateSettings(updateDto: UpdatePrintSettingsDto): Promise<PrintSettingsResponseDto> {
    let settings = await this.printSettingsRepository.findOne({
      where: {},
      order: { createdAt: 'ASC' },
    });

    if (!settings) {
      // Create new settings
      settings = this.printSettingsRepository.create({
        ...updateDto,
      });
    } else {
      // Update existing settings
      Object.assign(settings, updateDto);
    }

    settings = await this.printSettingsRepository.save(settings);
    return PrintSettingsResponseDto.fromEntity(settings);
  }

  /**
   * Import settings from company settings
   */
  async importFromCompanySettings(companySettings: any): Promise<PrintSettingsResponseDto> {
    let settings = await this.printSettingsRepository.findOne({
      where: {},
      order: { createdAt: 'ASC' },
    });

    const importData = {
      companyName: companySettings.name || '',
      address: companySettings.address || '',
      city: companySettings.city || '',
      state: companySettings.state || '',
      postalCode: companySettings.postalCode || '',
      country: companySettings.country || '',
      phone: companySettings.phone || '',
      email: companySettings.email || '',
      website: companySettings.website || '',
      miscInfo: companySettings.miscInfo || '',
      logoUrl: companySettings.logoUrl || null,
    };

    if (!settings) {
      settings = this.printSettingsRepository.create({
        ...importData,
      });
    } else {
      Object.assign(settings, importData);
    }

    settings = await this.printSettingsRepository.save(settings);
    return PrintSettingsResponseDto.fromEntity(settings);
  }

  /**
   * Get default template structure
   */
  private getDefaultTemplate(title: string): object {
    return {
      title,
      showLogo: true,
      showCompanyInfo: true,
      showDocumentNumber: true,
      showDate: true,
      showItemTable: true,
      showSubtotal: true,
      showTax: true,
      showTotal: true,
      showNotes: true,
      fontSize: 12,
      fontFamily: 'Arial',
      margins: {
        top: 20,
        right: 20,
        bottom: 20,
        left: 20,
      },
    };
  }
}
