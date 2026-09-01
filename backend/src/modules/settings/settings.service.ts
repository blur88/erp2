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
import { PurchaseOrder } from '../../database/entities/purchase-order.entity';
import { StockAdjustment } from '../../database/entities/stock-adjustment.entity';
import { Expense } from '../accounting/entities/expense.entity';
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
    @InjectRepository(PurchaseOrder)
    private purchaseOrderRepository: Repository<PurchaseOrder>,
    @InjectRepository(StockAdjustment)
    private stockAdjustmentRepository: Repository<StockAdjustment>,
    @InjectRepository(Expense)
    private expenseRepository: Repository<Expense>,
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
  /**
   * Seed placeholder company settings on first read.
   *
   * `registrationNumber` gets a placeholder like the other fields, but the
   * VALUE is chosen to be self-evidently not a real number. Unlike 'Your
   * Company Name', a plausible-looking registration number would be dangerous:
   * the Form B tax view prints it as N1a, so a stand-in that resembles a real
   * SSM number (e.g. '000000000000') could reach a filed return unnoticed.
   * 'Your Registration Number' cannot be mistaken for one.
   *
   * It is still a placeholder, not a value: Form B treats it as unset (see
   * PLACEHOLDER_REGISTRATION_NUMBER in form-b.service.ts) and keeps raising
   * MISSING_BUSINESS_IDENTITY until a real number is entered at
   * /settings/company. Keep the two strings in step.
   */
  private async createDefaultSettings(): Promise<CompanySettings> {
    const defaultSettings = this.companySettingsRepository.create({
      name: 'Your Company Name',
      registrationNumber: 'Your Registration Number',
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

  // Highest current-year JE-<yy>-NNN sequence already in journal_entry, plus one
  // (1 when none / table absent). Mirrors AccountingSeederService's collision-safe
  // heal so both owners of the 'Journal Entries' row agree (#901). The regex bounds
  // the segment to 1-9 digits so the ::int cast can never overflow or fail.
  private async nextJournalEntrySequence(currentYY: number): Promise<number> {
    try {
      const yy = String(currentYY).padStart(2, '0');
      const rows = await this.dataSource.query(
        `SELECT COALESCE(MAX((split_part("journalNo", '-', 3))::int), 0) + 1 AS next
           FROM journal_entry
          WHERE "journalNo" ~ ('^JE-' || $1 || '-[0-9]{1,9}$')`,
        [yy],
      );
      return Number(rows[0]?.next ?? 1);
    } catch (err) {
      // Only tolerate a missing journal_entry table (accounting module absent) —
      // no JEs exist there, so 1 is correct. Any other error (SQL regression,
      // transient DB fault) must NOT be masked: swallowing it here could seed the
      // JE row at 1 while journal entries exist and re-arm the #901 collision.
      if ((err as { code?: string })?.code === '42P01') return 1; // undefined_table
      throw err;
    }
  }

  /**
   * Source tables for document types whose sequence can be reconciled from the
   * rows they issued. SQL identifiers cannot be parameterized, so table and
   * column are restricted to this mapping and never derived from a DB value —
   * only `prefix` and `yy` are bound as parameters in maxDocumentSequence().
   */
  private static readonly RECONCILABLE_DOCUMENTS: Readonly<
    Record<string, { readonly table: string; readonly column: string }>
  > = {
    'Sales Orders': { table: 'sales_orders', column: 'orderNumber' },
    'Purchase Orders': { table: 'purchase_orders', column: 'orderNumber' },
    'Stock Adjustment': { table: 'stock_adjustments', column: 'adjustmentNumber' },
    Expenses: { table: 'expenses', column: 'expenseNumber' },
    'Owner Equity': { table: 'owner_equity_documents', column: 'referenceNumber' },
  };

  /**
   * Highest current-year sequence already issued for a document type, or 0.
   *
   * Numeric, not lexical: at paddingDigits 3 the generator emits SO-26-999,
   * which sorts ABOVE SO-26-1000 as text, so an
   * `ORDER BY "orderNumber" DESC LIMIT 1` reads 999 once a type passes three
   * digits, and the next issued number collides with the row already at 1000
   * (issue #1075 — same class of failure as #901). Mirrors the shape of
   * nextJournalEntrySequence(); the regex bounds the segment to 1-9 digits so
   * the ::int cast can never overflow.
   */
  private async maxDocumentSequence(
    documentName: string,
    prefix: string,
    currentYY: number,
  ): Promise<number> {
    const source = SettingsService.RECONCILABLE_DOCUMENTS[documentName];
    if (!source) {
      throw new Error(`No reconciliation source table for document type '${documentName}'`);
    }
    const rows = await this.dataSource.query(
      `SELECT COALESCE(MAX((split_part("${source.column}", '-', 3))::int), 0) AS max
         FROM ${source.table}
        WHERE "${source.column}" ~ ('^' || $1 || '-' || $2 || '-[0-9]{1,9}$')`,
      [prefix, String(currentYY).padStart(2, '0')],
    );
    return Number(rows[0]?.max ?? 0);
  }

  /**
   * Create default document number settings
   */
  private async createDefaultDocumentNumberSettings(): Promise<void> {
    const currentYY = new Date().getFullYear() % 100;
    const defaults = [
      { documentName: 'Sales Orders', prefix: 'SO' },
      { documentName: 'Purchase Orders', prefix: 'PO' },
      { documentName: 'Stock Adjustment', prefix: 'SA' },
      // Accounting v1 posts journal entries via this row; keep it in sync with
      // migration 1772100000000 and AccountingSeederService (issue #901). Its
      // nextNumber is derived collision-safe below, not the literal 1 above.
      { documentName: 'Journal Entries', prefix: 'JE' },
      { documentName: 'Expenses', prefix: 'EXP' },
      { documentName: 'Owner Equity', prefix: 'EQ' },
    ];

    for (const d of defaults) {
      const exists = await this.documentNumberSettingRepository.findOne({
        where: { documentName: d.documentName },
      });
      if (!exists) {
        // Journal Entries must start past any already-issued number or the next
        // post collides with journal_entry.journalNo's UNIQUE constraint (#901).
        // Other types have no rows yet on this path, so 1 is correct for them.
        const nextNumber =
          d.documentName === 'Journal Entries'
            ? await this.nextJournalEntrySequence(currentYY)
            : 1;
        await this.documentNumberSettingRepository.save(
          this.documentNumberSettingRepository.create({
            ...d,
            paddingDigits: 3,
            nextNumber,
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

      for (const row of rows) {
        try {
          if (!SettingsService.RECONCILABLE_DOCUMENTS[row.documentName]) {
            // Document types this sync can't compute a max for (Journal Entries,
            // Invoices, Settlements — their sequences live in other modules'
            // tables). Do NOT reset their nextNumber to 1: that would collide
            // with already-issued numbers on the next post (issue #901, where
            // AccountingSeederService owns the Journal Entries sequence).
            this.logger.warn(`Skipping sync for document type '${row.documentName}': no source-table max available, leaving nextNumber unchanged.`);
            continue;
          }

          const maxNumber = await this.maxDocumentSequence(
            row.documentName,
            row.prefix,
            currentYY,
          );

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
