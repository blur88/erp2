import {
  Injectable,
  NotFoundException,
  Logger,
  InternalServerErrorException,
} from '@nestjs/common';
import { InjectRepository } from '@nestjs/typeorm';
import { Repository } from 'typeorm';
import { CompanySettings } from '../../database/entities/company-settings.entity';
import {
  UpdateCompanySettingsDto,
  CompanySettingsResponseDto,
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
}
