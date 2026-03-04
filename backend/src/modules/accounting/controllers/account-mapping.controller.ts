import {
  Controller,
  Get,
  Post,
  Patch,
  Delete,
  Body,
  Param,
  Query,
  HttpCode,
  HttpStatus,
} from '@nestjs/common';
import { ApiTags, ApiOperation, ApiResponse, ApiParam } from '@nestjs/swagger';
import { AccountMappingService } from '../services/account-mapping.service';
import { Auth } from '../../auth/decorators/auth.decorator';
import { CurrentUser } from '../../auth/decorators/current-user.decorator';
import { UserRole } from '../../../database/entities/user.entity';
import {
  CreateAccountMappingDto,
  UpdateAccountMappingDto,
  QueryAccountMappingsDto,
  AccountMappingResponseDto,
  AccountMappingListResponseDto,
  MappingValidationResponseDto,
} from '../dto/account-mapping.dto';

@ApiTags('Account Mappings')
@Controller('accounting/account-mappings')
@Auth()
export class AccountMappingController {
  constructor(
    private readonly accountMappingService: AccountMappingService,
  ) {}

  @Get()
  @ApiOperation({ summary: 'Get all account mappings' })
  @ApiResponse({
    status: 200,
    description: 'Returns paginated account mappings',
    type: AccountMappingListResponseDto,
  })
  async findAll(
    @Query() query: QueryAccountMappingsDto,
  ): Promise<AccountMappingListResponseDto> {
    return this.accountMappingService.findAll(query);
  }

  @Get('validate')
  @ApiOperation({ summary: 'Validate all required mappings are configured' })
  @ApiResponse({
    status: 200,
    description: 'Returns validation status and missing mappings',
    type: MappingValidationResponseDto,
  })
  async validate(): Promise<MappingValidationResponseDto> {
    return this.accountMappingService.validateMappings();
  }

  @Get(':id')
  @ApiOperation({ summary: 'Get account mapping by ID' })
  @ApiParam({ name: 'id', description: 'Mapping ID' })
  @ApiResponse({
    status: 200,
    description: 'Returns account mapping with account details',
    type: AccountMappingResponseDto,
  })
  @ApiResponse({ status: 404, description: 'Mapping not found' })
  async findOne(@Param('id') id: string): Promise<AccountMappingResponseDto> {
    return this.accountMappingService.findOne(id);
  }

  @Post()
  @Auth(UserRole.ADMIN)
  @ApiOperation({ summary: 'Create a new account mapping' })
  @ApiResponse({
    status: 201,
    description: 'Mapping created successfully',
    type: AccountMappingResponseDto,
  })
  @ApiResponse({ status: 404, description: 'Account not found or inactive' })
  @ApiResponse({ status: 409, description: 'Mapping type already exists' })
  async create(
    @Body() createDto: CreateAccountMappingDto,
    @CurrentUser('userId') currentUserId: string,
    @CurrentUser('username') currentUsername: string,
  ): Promise<AccountMappingResponseDto> {
    return this.accountMappingService.create(createDto, currentUserId, currentUsername);
  }

  @Patch(':id')
  @Auth(UserRole.ADMIN)
  @ApiOperation({ summary: 'Update an account mapping' })
  @ApiParam({ name: 'id', description: 'Mapping ID' })
  @ApiResponse({
    status: 200,
    description: 'Mapping updated successfully',
    type: AccountMappingResponseDto,
  })
  @ApiResponse({ status: 404, description: 'Mapping or account not found' })
  async update(
    @Param('id') id: string,
    @Body() updateDto: UpdateAccountMappingDto,
    @CurrentUser('userId') currentUserId: string,
    @CurrentUser('username') currentUsername: string,
  ): Promise<AccountMappingResponseDto> {
    return this.accountMappingService.update(id, updateDto, currentUserId, currentUsername);
  }

  @Delete(':id')
  @Auth(UserRole.ADMIN)
  @HttpCode(HttpStatus.NO_CONTENT)
  @ApiOperation({ summary: 'Delete an account mapping' })
  @ApiParam({ name: 'id', description: 'Mapping ID' })
  @ApiResponse({ status: 204, description: 'Mapping deleted successfully' })
  @ApiResponse({ status: 404, description: 'Mapping not found' })
  async remove(
    @Param('id') id: string,
    @CurrentUser('userId') currentUserId: string,
    @CurrentUser('username') currentUsername: string,
  ): Promise<void> {
    await this.accountMappingService.remove(id, currentUserId, currentUsername);
  }
}
