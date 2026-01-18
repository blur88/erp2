import {
  Injectable,
  NotFoundException,
  Logger,
  InternalServerErrorException,
} from '@nestjs/common';
import { InjectRepository } from '@nestjs/typeorm';
import { Repository } from 'typeorm';
import { CompanySettings } from '../../database/entities/company-settings.entity';
import { PriceCostingSettings } from '../../database/entities/price-costing-settings.entity';
import { DocumentNumberSettings } from '../../database/entities/document-number-settings.entity';
import { SalesOrder } from '../../database/entities/sales-order.entity';
import { Invoice } from '../../database/entities/invoice.entity';
import { Payment } from '../../database/entities/payment.entity';
import { PurchaseOrder } from '../../database/entities/purchase-order.entity';
import { GoodsReceivedNote } from '../../database/entities/goods-received-note.entity';
import { VendorPayment } from '../../database/entities/vendor-payment.entity';
import { StockAdjustment } from '../../database/entities/stock-adjustment.entity';
import {
  UpdateCompanySettingsDto,
  CompanySettingsResponseDto,
  UpdatePriceCostingSettingsDto,
  PriceCostingSettingsResponseDto,
  UpdateDocumentNumberSettingsDto,
  DocumentNumberSettingsResponseDto,
} from './dto';
import { plainToInstance } from 'class-transformer';
import * as fs from 'fs';
import * as path from 'path';

/**
 * Settings Service
 * Handles company settings operations
 * Note: Only one company settings record should exist (singleton pattern)
 */
@Injectable()
export class SettingsService {
  private readonly logger = new Logger(SettingsService.name);

  constructor(
    @InjectRepository(CompanySettings)
    private companySettingsRepository: Repository<CompanySettings>,
    @InjectRepository(PriceCostingSettings)
    private priceCostingSettingsRepository: Repository<PriceCostingSettings>,
    @InjectRepository(DocumentNumberSettings)
    private documentNumberSettingsRepository: Repository<DocumentNumberSettings>,
    @InjectRepository(SalesOrder)
    private salesOrderRepository: Repository<SalesOrder>,
    @InjectRepository(Invoice)
    private invoiceRepository: Repository<Invoice>,
    @InjectRepository(Payment)
    private paymentRepository: Repository<Payment>,
    @InjectRepository(PurchaseOrder)
    private purchaseOrderRepository: Repository<PurchaseOrder>,
    @InjectRepository(GoodsReceivedNote)
    private goodsReceivedNoteRepository: Repository<GoodsReceivedNote>,
    @InjectRepository(VendorPayment)
    private vendorPaymentRepository: Repository<VendorPayment>,
    @InjectRepository(StockAdjustment)
    private stockAdjustmentRepository: Repository<StockAdjustment>,
  ) {}

  /**
   * Get company settings (creates default if not exists)
   */
  async getCompanySettings(): Promise<CompanySettingsResponseDto> {
    try {
      let settings = await this.companySettingsRepository.findOne({
        where: { isActive: true },
      });

      // Create default settings if none exist
      if (!settings) {
        settings = await this.createDefaultSettings();
      }

      return this.mapToResponseDto(settings);
    } catch (error) {
      this.logger.error(
        `Failed to get company settings: ${error.message}`,
        error.stack,
      );
      throw new InternalServerErrorException('Failed to retrieve company settings');
    }
  }

  /**
   * Update company settings
   */
  async updateCompanySettings(
    updateDto: UpdateCompanySettingsDto,
    updatedBy = 'system',
  ): Promise<CompanySettingsResponseDto> {
    try {
      let settings = await this.companySettingsRepository.findOne({
        where: { isActive: true },
      });

      if (!settings) {
        // Create new settings if none exist
        settings = this.companySettingsRepository.create({
          ...updateDto,
          isActive: true,
        });
      } else {
        // Update existing settings
        Object.assign(settings, updateDto);
      }

      const savedSettings = await this.companySettingsRepository.save(settings);

      this.logger.log(
        `Company settings updated by ${updatedBy}`,
      );

      return this.mapToResponseDto(savedSettings);
    } catch (error) {
      this.logger.error(
        `Failed to update company settings: ${error.message}`,
        error.stack,
      );
      throw new InternalServerErrorException('Failed to update company settings');
    }
  }

  /**
   * Update company logo URL
   */
  async updateLogoUrl(
    logoUrl: string,
    updatedBy = 'system',
  ): Promise<CompanySettingsResponseDto> {
    try {
      let settings = await this.companySettingsRepository.findOne({
        where: { isActive: true },
      });

      if (!settings) {
        throw new NotFoundException('Company settings not found');
      }

      // Delete old logo file if it exists
      if (settings.logoUrl) {
        this.deleteLogoFile(settings.logoUrl);
      }

      settings.logoUrl = logoUrl;
      const savedSettings = await this.companySettingsRepository.save(settings);

      this.logger.log(
        `Company logo updated by ${updatedBy}`,
      );

      return this.mapToResponseDto(savedSettings);
    } catch (error) {
      this.logger.error(
        `Failed to update company logo: ${error.message}`,
        error.stack,
      );
      throw error;
    }
  }

  /**
   * Delete company logo
   */
  async deleteLogoUrl(
    updatedBy = 'system',
  ): Promise<CompanySettingsResponseDto> {
    try {
      let settings = await this.companySettingsRepository.findOne({
        where: { isActive: true },
      });

      if (!settings) {
        throw new NotFoundException('Company settings not found');
      }

      // Delete the logo file if it exists
      if (settings.logoUrl) {
        this.deleteLogoFile(settings.logoUrl);
      }

      settings.logoUrl = null;
      const savedSettings = await this.companySettingsRepository.save(settings);

      this.logger.log(
        `Company logo deleted by ${updatedBy}`,
      );

      return this.mapToResponseDto(savedSettings);
    } catch (error) {
      this.logger.error(
        `Failed to delete company logo: ${error.message}`,
        error.stack,
      );
      throw error;
    }
  }

  /**
   * Create default company settings
   */
  private async createDefaultSettings(): Promise<CompanySettings> {
    const defaultSettings = this.companySettingsRepository.create({
      name: 'Your Company Name',
      address: '123 Main Street',
      city: 'City',
      state: '',
      postalCode: '',
      country: 'Country',
      phone: '',
      email: '',
      website: '',
      miscInfo: '',
      logoUrl: null,
      isActive: true,
    });

    const savedSettings = await this.companySettingsRepository.save(defaultSettings);
    this.logger.log('Default company settings created');

    return savedSettings;
  }

  /**
   * Delete logo file from filesystem
   */
  private deleteLogoFile(logoUrl: string): void {
    try {
      // Extract the file path from the URL
      // logoUrl format: /uploads/logos/logo-123456789.png
      const filePath = path.join(process.cwd(), logoUrl.replace(/^\//, ''));

      // Check if file exists before attempting to delete
      if (fs.existsSync(filePath)) {
        fs.unlinkSync(filePath);
        this.logger.log(`Deleted logo file: ${filePath}`);
      } else {
        this.logger.warn(`Logo file not found: ${filePath}`);
      }
    } catch (error) {
      this.logger.error(
        `Failed to delete logo file: ${error.message}`,
        error.stack,
      );
      // Don't throw error - continue even if file deletion fails
    }
  }

  /**
   * Map entity to response DTO
   */
  private mapToResponseDto(settings: CompanySettings): CompanySettingsResponseDto {
    return plainToInstance(CompanySettingsResponseDto, settings, {
      excludeExtraneousValues: true,
    });
  }

  /**
   * Get price and costing settings (creates default if not exists)
   */
  async getPriceCostingSettings(): Promise<PriceCostingSettingsResponseDto> {
    try {
      let settings = await this.priceCostingSettingsRepository.findOne({
        where: { isActive: true },
      });

      // Create default settings if none exist
      if (!settings) {
        settings = await this.createDefaultPriceCostingSettings();
      }

      return this.mapToPriceCostingResponseDto(settings);
    } catch (error) {
      this.logger.error(
        `Failed to get price and costing settings: ${error.message}`,
        error.stack,
      );
      throw new InternalServerErrorException('Failed to retrieve price and costing settings');
    }
  }

  /**
   * Update price and costing settings
   */
  async updatePriceCostingSettings(
    updateDto: UpdatePriceCostingSettingsDto,
    updatedBy = 'system',
  ): Promise<PriceCostingSettingsResponseDto> {
    try {
      let settings = await this.priceCostingSettingsRepository.findOne({
        where: { isActive: true },
      });

      if (!settings) {
        // Create new settings if none exist
        settings = this.priceCostingSettingsRepository.create({
          ...updateDto,
          isActive: true,
        });
      } else {
        // Update existing settings
        Object.assign(settings, updateDto);
      }

      const savedSettings = await this.priceCostingSettingsRepository.save(settings);

      this.logger.log(
        `Price and costing settings updated by ${updatedBy}`,
      );

      return this.mapToPriceCostingResponseDto(savedSettings);
    } catch (error) {
      this.logger.error(
        `Failed to update price and costing settings: ${error.message}`,
        error.stack,
      );
      throw new InternalServerErrorException('Failed to update price and costing settings');
    }
  }

  /**
   * Create default price and costing settings
   */
  private async createDefaultPriceCostingSettings(): Promise<PriceCostingSettings> {
    const defaultSettings = this.priceCostingSettingsRepository.create({
      currency: 'USD',
      costingMethod: 'AVERAGE',
      isActive: true,
    });

    const savedSettings = await this.priceCostingSettingsRepository.save(defaultSettings);
    this.logger.log('Default price and costing settings created');

    return savedSettings;
  }

  /**
   * Map entity to price costing response DTO
   */
  private mapToPriceCostingResponseDto(settings: PriceCostingSettings): PriceCostingSettingsResponseDto {
    return plainToInstance(PriceCostingSettingsResponseDto, settings, {
      excludeExtraneousValues: true,
    });
  }

  /**
   * Get default currency
   */
  async getDefaultCurrency(): Promise<string> {
    try {
      const settings = await this.priceCostingSettingsRepository.findOne({
        where: { isActive: true },
      });

      return settings?.currency || 'USD';
    } catch (error) {
      this.logger.error(
        `Failed to get default currency: ${error.message}`,
        error.stack,
      );
      return 'USD';
    }
  }

  /**
   * Get document number settings (creates default if not exists)
   */
  async getDocumentNumberSettings(): Promise<DocumentNumberSettingsResponseDto> {
    try {
      let settings = await this.documentNumberSettingsRepository.findOne({
        where: { isActive: true },
      });

      let isNewSettings = false;
      // Create default settings if none exist
      if (!settings) {
        settings = await this.createDefaultDocumentNumberSettings();
        isNewSettings = true;
      }

      // If this is newly created settings, sync with database
      if (isNewSettings) {
        this.logger.log('Syncing new document number settings with existing database records');
        try {
          await this.syncDocumentNumbersWithDatabase();
          // Reload settings after sync
          settings = await this.documentNumberSettingsRepository.findOne({
            where: { isActive: true },
          });
        } catch (syncError) {
          this.logger.error(
            `Failed to sync document numbers: ${syncError.message}`,
            syncError.stack,
          );
          // Continue even if sync fails, settings are still usable
        }
      }

      return this.mapToDocumentNumberResponseDto(settings);
    } catch (error) {
      this.logger.error(
        `Failed to get document number settings: ${error.message}`,
        error.stack,
      );
      throw new InternalServerErrorException('Failed to retrieve document number settings');
    }
  }

  /**
   * Update document number settings
   */
  async updateDocumentNumberSettings(
    updateDto: UpdateDocumentNumberSettingsDto,
    updatedBy = 'system',
  ): Promise<DocumentNumberSettingsResponseDto> {
    try {
      let settings = await this.documentNumberSettingsRepository.findOne({
        where: { isActive: true },
      });

      if (!settings) {
        // Create new settings if none exist
        settings = this.documentNumberSettingsRepository.create({
          configurations: updateDto.configurations,
          isActive: true,
        });
      } else {
        // Update existing settings
        settings.configurations = updateDto.configurations;
      }

      const savedSettings = await this.documentNumberSettingsRepository.save(settings);

      this.logger.log(
        `Document number settings updated by ${updatedBy}`,
      );

      return this.mapToDocumentNumberResponseDto(savedSettings);
    } catch (error) {
      this.logger.error(
        `Failed to update document number settings: ${error.message}`,
        error.stack,
      );
      throw new InternalServerErrorException('Failed to update document number settings');
    }
  }

  /**
   * Generate next document number for a specific document type
   */
  async generateDocumentNumber(documentName: string): Promise<string> {
    try {
      const settings = await this.documentNumberSettingsRepository.findOne({
        where: { isActive: true },
      });

      if (!settings || !settings.configurations) {
        throw new NotFoundException('Document number settings not found');
      }

      // Find the configuration for this document type
      const config = settings.configurations.find(
        (c: any) => c.documentName === documentName,
      );

      if (!config) {
        throw new NotFoundException(`Configuration for ${documentName} not found`);
      }

      // Generate the document number
      const paddedNumber = String(config.nextNumber).padStart(config.numberFormat.length, '0');
      const documentNumber = `${config.prefix}-${paddedNumber}`;

      // Increment the next number
      const updatedConfigs = settings.configurations.map((c: any) => {
        if (c.documentName === documentName) {
          return { ...c, nextNumber: c.nextNumber + 1 };
        }
        return c;
      });

      settings.configurations = updatedConfigs;
      await this.documentNumberSettingsRepository.save(settings);

      return documentNumber;
    } catch (error) {
      this.logger.error(
        `Failed to generate document number: ${error.message}`,
        error.stack,
      );
      throw error;
    }
  }

  /**
   * Preview document number without incrementing
   */
  async previewDocumentNumber(documentName: string): Promise<string> {
    try {
      const settings = await this.documentNumberSettingsRepository.findOne({
        where: { isActive: true },
      });

      if (!settings || !settings.configurations) {
        return 'N/A';
      }

      const config = settings.configurations.find(
        (c: any) => c.documentName === documentName,
      );

      if (!config) {
        return 'N/A';
      }

      const paddedNumber = String(config.nextNumber).padStart(config.numberFormat.length, '0');
      return `${config.prefix}-${paddedNumber}`;
    } catch (error) {
      this.logger.error(
        `Failed to preview document number: ${error.message}`,
        error.stack,
      );
      return 'N/A';
    }
  }

  /**
   * Create default document number settings
   */
  private async createDefaultDocumentNumberSettings(): Promise<DocumentNumberSettings> {
    const defaultSettings = this.documentNumberSettingsRepository.create({
      configurations: [
        { documentName: 'Sales Orders', prefix: 'SO', numberFormat: '000001', nextNumber: 1 },
        { documentName: 'Invoices', prefix: 'INV', numberFormat: '000001', nextNumber: 1 },
        { documentName: 'Payments', prefix: 'PAY', numberFormat: '000001', nextNumber: 1 },
        { documentName: 'Purchase Orders', prefix: 'PO', numberFormat: '000001', nextNumber: 1 },
        { documentName: 'Goods Received', prefix: 'GRN', numberFormat: '000001', nextNumber: 1 },
        { documentName: 'Vendor Payments', prefix: 'VP', numberFormat: '000001', nextNumber: 1 },
        { documentName: 'Stock Adjustment', prefix: 'SA', numberFormat: '000001', nextNumber: 1 },
      ],
      isActive: true,
    });

    const savedSettings = await this.documentNumberSettingsRepository.save(defaultSettings);
    this.logger.log('Default document number settings created');

    return savedSettings;
  }

  /**
   * Map entity to document number response DTO
   */
  private mapToDocumentNumberResponseDto(settings: DocumentNumberSettings): DocumentNumberSettingsResponseDto {
    return plainToInstance(DocumentNumberSettingsResponseDto, settings, {
      excludeExtraneousValues: true,
    });
  }

  /**
   * Sync document number settings with existing database records
   * This ensures nextNumber starts from the correct value to avoid conflicts
   */
  async syncDocumentNumbersWithDatabase(): Promise<void> {
    try {
      let settings = await this.documentNumberSettingsRepository.findOne({
        where: { isActive: true },
      });

      if (!settings) {
        this.logger.warn('Document number settings not found, creating defaults');
        settings = await this.createDefaultDocumentNumberSettings();
      }

      const updatedConfigs = await Promise.all(
        settings.configurations.map(async (config: any) => {
          let maxNumber = 0;

          try {
            switch (config.documentName) {
              case 'Sales Orders': {
                const result = await this.salesOrderRepository
                  .createQueryBuilder('so')
                  .select('so.orderNumber')
                  .where("so.orderNumber LIKE :prefix", { prefix: `${config.prefix}-%` })
                  .orderBy('so.orderNumber', 'DESC')
                  .limit(1)
                  .getOne();

                if (result?.orderNumber) {
                  const numPart = result.orderNumber.split('-')[1];
                  maxNumber = parseInt(numPart, 10) || 0;
                }
                break;
              }

              case 'Invoices': {
                const result = await this.invoiceRepository
                  .createQueryBuilder('inv')
                  .select('inv.invoiceNumber')
                  .where("inv.invoiceNumber LIKE :prefix", { prefix: `${config.prefix}-%` })
                  .orderBy('inv.invoiceNumber', 'DESC')
                  .limit(1)
                  .getOne();

                if (result?.invoiceNumber) {
                  const numPart = result.invoiceNumber.split('-')[1];
                  maxNumber = parseInt(numPart, 10) || 0;
                }
                break;
              }

              case 'Payments': {
                const result = await this.paymentRepository
                  .createQueryBuilder('pay')
                  .select('pay.paymentNumber')
                  .where("pay.paymentNumber LIKE :prefix", { prefix: `${config.prefix}-%` })
                  .orderBy('pay.paymentNumber', 'DESC')
                  .limit(1)
                  .getOne();

                if (result?.paymentNumber) {
                  const numPart = result.paymentNumber.split('-')[1];
                  maxNumber = parseInt(numPart, 10) || 0;
                }
                break;
              }

              case 'Purchase Orders': {
                const result = await this.purchaseOrderRepository
                  .createQueryBuilder('po')
                  .select('po.orderNumber')
                  .where("po.orderNumber LIKE :prefix", { prefix: `${config.prefix}-%` })
                  .orderBy('po.orderNumber', 'DESC')
                  .limit(1)
                  .getOne();

                if (result?.orderNumber) {
                  const numPart = result.orderNumber.split('-')[1];
                  maxNumber = parseInt(numPart, 10) || 0;
                }
                break;
              }

              case 'Goods Received': {
                const result = await this.goodsReceivedNoteRepository
                  .createQueryBuilder('grn')
                  .select('grn.grnNumber')
                  .where("grn.grnNumber LIKE :prefix", { prefix: `${config.prefix}-%` })
                  .orderBy('grn.grnNumber', 'DESC')
                  .limit(1)
                  .getOne();

                if (result?.grnNumber) {
                  const numPart = result.grnNumber.split('-')[1];
                  maxNumber = parseInt(numPart, 10) || 0;
                }
                break;
              }

              case 'Vendor Payments': {
                const result = await this.vendorPaymentRepository
                  .createQueryBuilder('vp')
                  .select('vp.paymentNumber')
                  .where("vp.paymentNumber LIKE :prefix", { prefix: `${config.prefix}-%` })
                  .orderBy('vp.paymentNumber', 'DESC')
                  .limit(1)
                  .getOne();

                if (result?.paymentNumber) {
                  const numPart = result.paymentNumber.split('-')[1];
                  maxNumber = parseInt(numPart, 10) || 0;
                }
                break;
              }

              case 'Stock Adjustment': {
                const result = await this.stockAdjustmentRepository
                  .createQueryBuilder('sa')
                  .select('sa.adjustmentNumber')
                  .where("sa.adjustmentNumber LIKE :prefix", { prefix: `${config.prefix}-%` })
                  .orderBy('sa.adjustmentNumber', 'DESC')
                  .limit(1)
                  .getOne();

                if (result?.adjustmentNumber) {
                  const numPart = result.adjustmentNumber.split('-')[1];
                  maxNumber = parseInt(numPart, 10) || 0;
                }
                break;
              }

              default:
                this.logger.warn(`Unknown document type: ${config.documentName}`);
            }

            // Update nextNumber to be max + 1
            const nextNumber = maxNumber + 1;

            this.logger.log(
              `${config.documentName}: Found max number ${maxNumber}, setting nextNumber to ${nextNumber}`
            );

            return {
              ...config,
              nextNumber: nextNumber,
            };
          } catch (error) {
            this.logger.error(
              `Failed to sync ${config.documentName}: ${error.message}`,
              error.stack,
            );
            // Keep original config if sync fails
            return config;
          }
        }),
      );

      // Save updated settings
      settings.configurations = updatedConfigs;
      await this.documentNumberSettingsRepository.save(settings);

      this.logger.log('Document number settings synchronized with database');
    } catch (error) {
      this.logger.error(
        `Failed to sync document numbers with database: ${error.message}`,
        error.stack,
      );
      throw new InternalServerErrorException('Failed to sync document number settings');
    }
  }
}
