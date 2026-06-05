import {
  Controller,
  Get,
  Put,
  Body,
  Post,
  UseInterceptors,
  UploadedFile,
} from "@nestjs/common";
import { FileInterceptor } from "@nestjs/platform-express";
import {
  ApiTags,
  ApiOperation,
  ApiResponse,
  ApiConsumes,
  ApiBody,
} from "@nestjs/swagger";
import { diskStorage } from "multer";
import { extname } from "path";
import { PrintSettingsService } from "./print-settings.service";
import { UpdatePrintSettingsDto } from "./dto/update-print-settings.dto";
import { PrintSettingsResponseDto } from "./dto/print-settings-response.dto";

@ApiTags("print-settings")
@Controller("print-settings")
export class PrintSettingsController {
  constructor(private readonly printSettingsService: PrintSettingsService) {}

  @Get()
  @ApiOperation({ summary: "Get print settings" })
  @ApiResponse({
    status: 200,
    description: "Print settings retrieved successfully",
    type: PrintSettingsResponseDto,
  })
  async getSettings(): Promise<PrintSettingsResponseDto> {
    return this.printSettingsService.getSettings();
  }

  @Put()
  @ApiOperation({ summary: "Update print settings" })
  @ApiResponse({
    status: 200,
    description: "Print settings updated successfully",
    type: PrintSettingsResponseDto,
  })
  async updateSettings(
    @Body() updateDto: UpdatePrintSettingsDto,
  ): Promise<PrintSettingsResponseDto> {
    return this.printSettingsService.updateSettings(updateDto);
  }

  @Post("import-from-company")
  @ApiOperation({ summary: "Import settings from company settings" })
  @ApiResponse({
    status: 200,
    description: "Settings imported successfully",
    type: PrintSettingsResponseDto,
  })
  async importFromCompany(
    @Body() companySettings: any,
  ): Promise<PrintSettingsResponseDto> {
    return this.printSettingsService.importFromCompanySettings(companySettings);
  }

  @Post("upload-logo")
  @ApiOperation({ summary: "Upload company logo" })
  @ApiConsumes("multipart/form-data")
  @ApiBody({
    schema: {
      type: "object",
      properties: {
        file: {
          type: "string",
          format: "binary",
        },
      },
    },
  })
  @UseInterceptors(
    FileInterceptor("file", {
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
        if (!file.originalname.match(/\.(jpg|jpeg|png|gif)$/)) {
          return callback(new Error("Only image files are allowed!"), false);
        }
        callback(null, true);
      },
      limits: {
        fileSize: 5 * 1024 * 1024, // 5MB
      },
    }),
  )
  async uploadLogo(@UploadedFile() file: Express.Multer.File) {
    return {
      message: "Logo uploaded successfully",
      logoUrl: `/uploads/logos/${file.filename}`,
    };
  }
}
