import {
  Controller,
  Get,
  Put,
  Body,
  Post,
  Delete,
  UseInterceptors,
  UploadedFile,
  ValidationPipe,
  HttpCode,
  HttpStatus,
  Logger,
  BadRequestException,
} from "@nestjs/common";
import {
  ApiTags,
  ApiOperation,
  ApiResponse,
  ApiBadRequestResponse,
  ApiConsumes,
  ApiBody,
} from "@nestjs/swagger";
import { FileInterceptor } from "@nestjs/platform-express";
import { diskStorage } from "multer";
import { extname } from "path";
import { SettingsService } from "./settings.service";
import {
  UpdateCompanySettingsDto,
  CompanySettingsResponseDto,
  UpdateRegionalSettingsDto,
  RegionalSettingsResponseDto,
  UpdateDocumentNumberSettingsDto,
  DocumentNumberSettingsResponseDto,
  GenerateDocumentNumberDto,
  GenerateDocumentNumberResponseDto,
} from "./dto";

/**
 * Settings Controller
 * Handles company settings operations
 */
@ApiTags("Settings")
@Controller("settings")
export class SettingsController {
  private readonly logger = new Logger(SettingsController.name);

  constructor(private readonly settingsService: SettingsService) {}

  /**
   * Get company settings
   */
  @Get("company")
  @ApiOperation({
    summary: "Get company settings",
    description: "Retrieve current company settings",
  })
  @ApiResponse({
    status: 200,
    description: "Company settings retrieved successfully",
    type: CompanySettingsResponseDto,
  })
  async getCompanySettings(): Promise<CompanySettingsResponseDto> {
    try {
      this.logger.log("Fetching company settings");
      return await this.settingsService.getCompanySettings();
    } catch (error) {
      this.logger.error(
        `Failed to get company settings: ${error.message}`,
        error.stack,
      );
      throw error;
    }
  }

  /**
   * Update company settings
   */
  @Put("company")
  @HttpCode(HttpStatus.OK)
  @ApiOperation({
    summary: "Update company settings",
    description: "Update company settings information",
  })
  @ApiResponse({
    status: 200,
    description: "Company settings updated successfully",
    type: CompanySettingsResponseDto,
  })
  @ApiBadRequestResponse({ description: "Invalid input data" })
  async updateCompanySettings(
    @Body(ValidationPipe) updateDto: UpdateCompanySettingsDto,
  ): Promise<CompanySettingsResponseDto> {
    try {
      this.logger.log("Updating company settings");
      return await this.settingsService.updateCompanySettings(
        updateDto,
        "system",
      );
    } catch (error) {
      this.logger.error(
        `Failed to update company settings: ${error.message}`,
        error.stack,
      );
      throw error;
    }
  }

  /**
   * Upload company logo
   */
  @Post("company/logo")
  @UseInterceptors(
    FileInterceptor("logo", {
      storage: diskStorage({
        destination: "./uploads/logos",
        filename: (req, file, callback) => {
          const uniqueSuffix =
            Date.now() + "-" + Math.round(Math.random() * 1e9);
          const ext = extname(file.originalname);
          callback(null, `logo-${uniqueSuffix}${ext}`);
        },
      }),
      fileFilter: (req, file, callback) => {
        if (!file.originalname.match(/\.(jpg|jpeg|png|gif|webp)$/i)) {
          return callback(
            new BadRequestException(
              "Only image files are allowed (jpg, jpeg, png, gif, webp)",
            ),
            false,
          );
        }
        callback(null, true);
      },
      limits: {
        fileSize: 5 * 1024 * 1024, // 5MB limit
      },
    }),
  )
  @ApiConsumes("multipart/form-data")
  @ApiOperation({
    summary: "Upload company logo",
    description: "Upload company logo image (max 5MB, jpg/jpeg/png/gif/webp)",
  })
  @ApiBody({
    schema: {
      type: "object",
      properties: {
        logo: {
          type: "string",
          format: "binary",
        },
      },
    },
  })
  @ApiResponse({
    status: 201,
    description: "Logo uploaded successfully",
    type: CompanySettingsResponseDto,
  })
  @ApiBadRequestResponse({ description: "Invalid file type or size" })
  async uploadLogo(
    @UploadedFile() file: Express.Multer.File,
  ): Promise<CompanySettingsResponseDto> {
    try {
      if (!file) {
        throw new BadRequestException("No file uploaded");
      }

      this.logger.log(`Uploading company logo: ${file.filename}`);
      const logoUrl = `/uploads/logos/${file.filename}`;
      return await this.settingsService.updateLogoUrl(logoUrl, "system");
    } catch (error) {
      this.logger.error(`Failed to upload logo: ${error.message}`, error.stack);
      throw error;
    }
  }

  /**
   * Delete company logo
   */
  @Delete("company/logo")
  @HttpCode(HttpStatus.OK)
  @ApiOperation({
    summary: "Delete company logo",
    description: "Remove company logo",
  })
  @ApiResponse({
    status: 200,
    description: "Logo deleted successfully",
    type: CompanySettingsResponseDto,
  })
  async deleteLogo(): Promise<CompanySettingsResponseDto> {
    try {
      this.logger.log("Deleting company logo");
      return await this.settingsService.deleteLogoUrl("system");
    } catch (error) {
      this.logger.error(`Failed to delete logo: ${error.message}`, error.stack);
      throw error;
    }
  }

  /**
   * Get regional settings
   */
  @Get("regional")
  @ApiOperation({
    summary: "Get regional settings",
    description: "Retrieve current regional settings",
  })
  @ApiResponse({
    status: 200,
    description: "Regional settings retrieved successfully",
    type: RegionalSettingsResponseDto,
  })
  async getRegionalSettings(): Promise<RegionalSettingsResponseDto> {
    try {
      this.logger.log("Fetching regional settings");
      return await this.settingsService.getRegionalSettings();
    } catch (error) {
      this.logger.error(
        `Failed to get regional settings: ${error.message}`,
        error.stack,
      );
      throw error;
    }
  }

  /**
   * Update regional settings
   */
  @Put("regional")
  @HttpCode(HttpStatus.OK)
  @ApiOperation({
    summary: "Update regional settings",
    description: "Update regional settings information",
  })
  @ApiResponse({
    status: 200,
    description: "Regional settings updated successfully",
    type: RegionalSettingsResponseDto,
  })
  @ApiBadRequestResponse({ description: "Invalid input data" })
  async updateRegionalSettings(
    @Body(ValidationPipe) updateDto: UpdateRegionalSettingsDto,
  ): Promise<RegionalSettingsResponseDto> {
    try {
      this.logger.log("Updating regional settings");
      return await this.settingsService.updateRegionalSettings(
        updateDto,
        "system",
      );
    } catch (error) {
      this.logger.error(
        `Failed to update regional settings: ${error.message}`,
        error.stack,
      );
      throw error;
    }
  }

  /**
   * Get default currency
   */
  @Get("default-currency")
  @ApiOperation({
    summary: "Get default currency",
    description: "Retrieve the default currency from settings",
  })
  @ApiResponse({
    status: 200,
    description: "Default currency retrieved successfully",
    schema: {
      type: "object",
      properties: {
        currency: { type: "string" },
      },
    },
  })
  async getDefaultCurrency(): Promise<{ currency: string }> {
    try {
      this.logger.log("Fetching default currency");
      const currency = await this.settingsService.getDefaultCurrency();
      return { currency };
    } catch (error) {
      this.logger.error(
        `Failed to get default currency: ${error.message}`,
        error.stack,
      );
      throw error;
    }
  }

  /**
   * Get document number settings
   */
  @Get("document-numbers")
  @ApiOperation({
    summary: "Get document number settings",
    description: "Retrieve current document number configurations",
  })
  @ApiResponse({
    status: 200,
    description: "Document number settings retrieved successfully",
    type: DocumentNumberSettingsResponseDto,
  })
  async getDocumentNumberSettings(): Promise<DocumentNumberSettingsResponseDto> {
    try {
      this.logger.log("Fetching document number settings");
      return await this.settingsService.getDocumentNumberSettings();
    } catch (error) {
      this.logger.error(
        `Failed to get document number settings: ${error.message}`,
        error.stack,
      );
      throw error;
    }
  }

  /**
   * Update document number settings
   */
  @Put("document-numbers")
  @HttpCode(HttpStatus.OK)
  @ApiOperation({
    summary: "Update document number settings",
    description: "Update document number configurations",
  })
  @ApiResponse({
    status: 200,
    description: "Document number settings updated successfully",
    type: DocumentNumberSettingsResponseDto,
  })
  @ApiBadRequestResponse({ description: "Invalid input data" })
  async updateDocumentNumberSettings(
    @Body(ValidationPipe) updateDto: UpdateDocumentNumberSettingsDto,
  ): Promise<DocumentNumberSettingsResponseDto> {
    try {
      this.logger.log("Updating document number settings");
      return await this.settingsService.updateDocumentNumberSettings(
        updateDto,
        "system",
      );
    } catch (error) {
      this.logger.error(
        `Failed to update document number settings: ${error.message}`,
        error.stack,
      );
      throw error;
    }
  }

  /**
   * Generate next document number
   */
  @Post("document-numbers/generate")
  @ApiOperation({
    summary: "Generate next document number",
    description:
      "Generate the next document number for a specific document type",
  })
  @ApiResponse({
    status: 201,
    description: "Document number generated successfully",
    type: GenerateDocumentNumberResponseDto,
  })
  @ApiBadRequestResponse({ description: "Invalid input data" })
  async generateDocumentNumber(
    @Body(ValidationPipe) dto: GenerateDocumentNumberDto,
  ): Promise<GenerateDocumentNumberResponseDto> {
    try {
      this.logger.log(`Generating document number for ${dto.documentName}`);
      const documentNumber = await this.settingsService.generateDocumentNumber(
        dto.documentName,
      );
      return {
        documentNumber,
        documentName: dto.documentName,
      };
    } catch (error) {
      this.logger.error(
        `Failed to generate document number: ${error.message}`,
        error.stack,
      );
      throw error;
    }
  }

  /**
   * Sync document number settings with database
   */
  @Post("document-numbers/sync")
  @HttpCode(HttpStatus.OK)
  @ApiOperation({
    summary: "Sync document numbers with database",
    description:
      "Synchronize document number settings with existing database records to prevent conflicts",
  })
  @ApiResponse({
    status: 200,
    description: "Document numbers synchronized successfully",
  })
  async syncDocumentNumbers(): Promise<{ message: string }> {
    try {
      this.logger.log("Syncing document numbers with database");
      await this.settingsService.syncDocumentNumbersWithDatabase();
      return { message: "Document numbers synchronized successfully" };
    } catch (error) {
      this.logger.error(
        `Failed to sync document numbers: ${error.message}`,
        error.stack,
      );
      throw error;
    }
  }
}
