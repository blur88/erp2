import {
  Injectable,
  NotFoundException,
  Logger,
  InternalServerErrorException,
} from '@nestjs/common';
import { InjectRepository } from '@nestjs/typeorm';
import { DataSource, EntityManager, Repository } from 'typeorm';
import { CompanySettings } from '../../database/entities/company-settings.entity';
import { RegionalSettings } from '../../database/entities/regional-settings.entity';
import { DocumentNumberSetting } from '../../database/entities/document-number-settings.entity';
import { SalesOrder } from '../../database/entities/sales-order.entity';
import { Payment } from '../../database/entities/payment.entity';
import { PurchaseOrder } from '../../database/entities/purchase-order.entity';
import { VendorPayment } from '../../database/entities/vendor-payment.entity';
import { StockAdjustment } from '../../database/entities/stock-adjustment.entity';
import {
  UpdateCompanySettingsDto,
  CompanySettingsResponseDto,
  UpdateRegionalSettingsDto,
  RegionalSettingsResponseDto,
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
    @InjectRepository(RegionalSettings)
    private regionalSettingsRepository: Repository<RegionalSettings>,
    @InjectRepository(DocumentNumberSetting)
    private documentNumberSettingRepository: Repository<DocumentNumberSetting>,
    @InjectRepository(SalesOrder)
    private salesOrderRepository: Repository<SalesOrder>,
    @InjectRepository(Payment)
    private paymentRepository: Repository<Payment>,
    @InjectRepository(PurchaseOrder)
    private purchaseOrderRepository: Repository<PurchaseOrder>,
    @InjectRepository(VendorPayment)
    private vendorPaymentRepository: Repository<VendorPayment>,
    @InjectRepository(StockAdjustment)
    private stockAdjustmentRepository: Repository<StockAdjustment>,
    private readonly dataSource: DataSource,
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
      this.logger.error(`Failed to get company settings: ${error.message}`, error.stack);
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

      this.logger.log(`Company settings updated by ${updatedBy}`);

      return this.mapToResponseDto(savedSettings);
    } catch (error) {
      this.logger.error(`Failed to update company settings: ${error.message}`, error.stack);
      throw new InternalServerErrorException('Failed to update company settings');
    }
  }

  /**
   * Update company logo URL
   */
  async updateLogoUrl(logoUrl: string, updatedBy = 'system'): Promise<CompanySettingsResponseDto> {
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

      this.logger.log(`Company logo updated by ${updatedBy}`);

      return this.mapToResponseDto(savedSettings);
    } catch (error) {
      this.logger.error(`Failed to update company logo: ${error.message}`, error.stack);
      throw error;
    }
  }

  /**
   * Delete company logo
   */
  async deleteLogoUrl(updatedBy = 'system'): Promise<CompanySettingsResponseDto> {
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

      this.logger.log(`Company logo deleted by ${updatedBy}`);

      return this.mapToResponseDto(savedSettings);
    } catch (error) {
      this.logger.error(`Failed to delete company logo: ${error.message}`, error.stack);
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
      this.logger.error(`Failed to delete logo file: ${error.message}`, error.stack);
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
  async getRegionalSettings(): Promise<RegionalSettingsResponseDto> {
    try {
      let settings = await this.regionalSettingsRepository.findOne({
        where: { isActive: true },
      });

      // Create default settings if none exist
      if (!settings) {
        settings = await this.createDefaultRegionalSettings();
      }

      return this.mapToRegionalSettingsResponseDto(settings);
    } catch (error) {
      this.logger.error(`Failed to get price and costing settings: ${error.message}`, error.stack);
      throw new InternalServerErrorException('Failed to retrieve price and costing settings');
    }
  }

  /**
   * Update price and costing settings
   */
  async updateRegionalSettings(
    updateDto: UpdateRegionalSettingsDto,
    updatedBy = 'system',
  ): Promise<RegionalSettingsResponseDto> {
    try {
      let settings = await this.regionalSettingsRepository.findOne({
        where: { isActive: true },
      });

      if (!settings) {
        // Create new settings if none exist
        settings = this.regionalSettingsRepository.create({
          ...updateDto,
          isActive: true,
        });
      } else {
        // Update existing settings
        Object.assign(settings, updateDto);
      }

      const savedSettings = await this.regionalSettingsRepository.save(settings);

      this.logger.log(`Price and costing settings updated by ${updatedBy}`);

      return this.mapToRegionalSettingsResponseDto(savedSettings);
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
  private async createDefaultRegionalSettings(): Promise<RegionalSettings> {
    const defaultSettings = this.regionalSettingsRepository.create({
      currency: 'USD',
      costingMethod: 'AVERAGE',
      isActive: true,
    });

    const savedSettings = await this.regionalSettingsRepository.save(defaultSettings);
    this.logger.log('Default price and costing settings created');

    return savedSettings;
  }

  /**
   * Map entity to price costing response DTO
   */
  private mapToRegionalSettingsResponseDto(
    settings: RegionalSettings,
  ): RegionalSettingsResponseDto {
    return plainToInstance(RegionalSettingsResponseDto, settings, {
      excludeExtraneousValues: true,
    });
  }

  /**
   * Get default currency
   */
  async getDefaultCurrency(): Promise<string> {
    try {
      const settings = await this.regionalSettingsRepository.findOne({
        where: { isActive: true },
      });

      return settings?.currency || 'USD';
    } catch (error) {
      this.logger.error(`Failed to get default currency: ${error.message}`, error.stack);
      return 'USD';
    }
  }

  /**
   * Get document number settings (creates default if not exists)
   */
  async getDocumentNumberSettings(): Promise<DocumentNumberSettingsResponseDto> {
    try {
      let rows = await this.documentNumberSettingRepository.find({
        order: { documentName: 'ASC' },
      });

      if (!rows.length) {
        await this.createDefaultDocumentNumberSettings();
        rows = await this.documentNumberSettingRepository.find({
          order: { documentName: 'ASC' },
        });
      }

      return { configurations: rows };
    } catch (error) {
      this.logger.error(`Failed to get document number settings: ${error.message}`, error.stack);
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
      for (const cfg of updateDto.configurations) {
        await this.documentNumberSettingRepository.update(
          { documentName: cfg.documentName },
          { prefix: cfg.prefix, nextNumber: cfg.nextNumber },
        );
      }
      this.logger.log(`Document number settings updated by ${updatedBy}`);
      return this.getDocumentNumberSettings();
    } catch (error) {
      this.logger.error(`Failed to update document number settings: ${error.message}`, error.stack);
      throw new InternalServerErrorException('Failed to update document number settings');
    }
  }

  /**
   * Generate next document number for a specific document type
   */
  async generateDocumentNumber(documentName: string, manager?: EntityManager): Promise<string> {
    const run = async (m: EntityManager): Promise<string> => {
      const rows = await m.query(
        `SELECT * FROM document_number_settings WHERE "documentName" = $1 FOR UPDATE`,
        [documentName],
      );

      if (!rows.length) {
        throw new NotFoundException(`Document number config for '${documentName}' not found`);
      }

      const row = rows[0];
      const currentYY = new Date().getFullYear() % 100;

      if (row.lastResetYear !== currentYY) {
        row.nextNumber = 1;
        row.lastResetYear = currentYY;
      }

      const yy = String(currentYY).padStart(2, '0');
      const seq = String(row.nextNumber).padStart(row.paddingDigits, '0');
      const documentNumber = `${row.prefix}-${yy}-${seq}`;

      await m.query(
        `UPDATE document_number_settings SET "nextNumber" = $1, "lastResetYear" = $2 WHERE "documentName" = $3`,
        [row.nextNumber + 1, row.lastResetYear, documentName],
      );

      return documentNumber;
    };
    // Caller-supplied manager: reuse its transaction (no nesting). Otherwise open our own.
    return manager ? run(manager) : this.dataSource.transaction(run);
  }

  /**
   * Preview document number without incrementing
   */
  async previewDocumentNumber(documentName: string): Promise<string> {
    try {
      const row = await this.documentNumberSettingRepository.findOne({
        where: { documentName },
      });

      if (!row) return 'N/A';

      const currentYY = new Date().getFullYear() % 100;
      const nextNum = row.lastResetYear !== currentYY ? 1 : row.nextNumber;
      const yy = String(currentYY).padStart(2, '0');
      const seq = String(nextNum).padStart(row.paddingDigits, '0');
      return `${row.prefix}-${yy}-${seq}`;
    } catch {
      return 'N/A';
    }
  }

  /**
   * Create default document number settings
   */
  private async createDefaultDocumentNumberSettings(): Promise<void> {
    const currentYY = new Date().getFullYear() % 100;
    const defaults = [
      { documentName: 'Sales Orders', prefix: 'SO' },
      { documentName: 'Payments', prefix: 'PAY' },
      { documentName: 'Purchase Orders', prefix: 'PO' },
      { documentName: 'Goods Received', prefix: 'GRN' },
      { documentName: 'Vendor Payments', prefix: 'VP' },
      { documentName: 'Stock Adjustment', prefix: 'SA' },
    ];

    for (const d of defaults) {
      const exists = await this.documentNumberSettingRepository.findOne({
        where: { documentName: d.documentName },
      });
      if (!exists) {
        await this.documentNumberSettingRepository.save(
          this.documentNumberSettingRepository.create({
            ...d,
            paddingDigits: 3,
            nextNumber: 1,
            lastResetYear: currentYY,
          }),
        );
      }
    }
    this.logger.log('Default document number settings created');
  }

  /**
   * Sync document number settings with existing database records
   * This ensures nextNumber starts from the correct value to avoid conflicts
   */
  async syncDocumentNumbersWithDatabase(): Promise<void> {
    try {
      let rows = await this.documentNumberSettingRepository.find();
      if (!rows.length) {
        await this.createDefaultDocumentNumberSettings();
        rows = await this.documentNumberSettingRepository.find();
      }

      const currentYY = new Date().getFullYear() % 100;
      const pattern = (prefix: string) => `${prefix}-${String(currentYY).padStart(2, '0')}-%`;

      for (const row of rows) {
        let maxNumber = 0;
        try {
          switch (row.documentName) {
            case 'Sales Orders': {
              const r = await this.salesOrderRepository
                .createQueryBuilder('so')
                .select('so.orderNumber')
                .where('so.orderNumber LIKE :p', { p: pattern(row.prefix) })
                .orderBy('so.orderNumber', 'DESC')
                .limit(1)
                .getOne();
              if (r?.orderNumber) maxNumber = parseInt(r.orderNumber.split('-')[2], 10) || 0;
              break;
            }
            case 'Payments': {
              const r = await this.paymentRepository
                .createQueryBuilder('pay')
                .select('pay.paymentNumber')
                .where('pay.paymentNumber LIKE :p', { p: pattern(row.prefix) })
                .orderBy('pay.paymentNumber', 'DESC')
                .limit(1)
                .getOne();
              if (r?.paymentNumber) maxNumber = parseInt(r.paymentNumber.split('-')[2], 10) || 0;
              break;
            }
            case 'Purchase Orders': {
              const r = await this.purchaseOrderRepository
                .createQueryBuilder('po')
                .select('po.orderNumber')
                .where('po.orderNumber LIKE :p', { p: pattern(row.prefix) })
                .orderBy('po.orderNumber', 'DESC')
                .limit(1)
                .getOne();
              if (r?.orderNumber) maxNumber = parseInt(r.orderNumber.split('-')[2], 10) || 0;
              break;
            }
            case 'Vendor Payments': {
              const r = await this.vendorPaymentRepository
                .createQueryBuilder('vp')
                .select('vp.paymentNumber')
                .where('vp.paymentNumber LIKE :p', { p: pattern(row.prefix) })
                .orderBy('vp.paymentNumber', 'DESC')
                .limit(1)
                .getOne();
              if (r?.paymentNumber) maxNumber = parseInt(r.paymentNumber.split('-')[2], 10) || 0;
              break;
            }
            case 'Stock Adjustment': {
              const r = await this.stockAdjustmentRepository
                .createQueryBuilder('sa')
                .select('sa.adjustmentNumber')
                .where('sa.adjustmentNumber LIKE :p', {
                  p: pattern(row.prefix),
                })
                .orderBy('sa.adjustmentNumber', 'DESC')
                .limit(1)
                .getOne();
              if (r?.adjustmentNumber) {
                maxNumber = parseInt(r.adjustmentNumber.split('-')[2], 10) || 0;
              }
              break;
            }

            default:
              this.logger.warn(`Unknown document type in sync: ${row.documentName}`);
          }

          await this.documentNumberSettingRepository.update(
            { documentName: row.documentName },
            { nextNumber: maxNumber + 1, lastResetYear: currentYY },
          );
          this.logger.log(`${row.documentName}: synced nextNumber to ${maxNumber + 1}`);
        } catch (err) {
          this.logger.error(`Failed to sync ${row.documentName}: ${err.message}`, err.stack);
        }
      }

      this.logger.log('Document number settings synchronized with database');
    } catch (error) {
      this.logger.error(`Failed to sync document numbers: ${error.message}`, error.stack);
      throw new InternalServerErrorException('Failed to sync document numbers');
    }
  }
}
