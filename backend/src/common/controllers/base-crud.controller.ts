import {
  Body,
  Delete,
  Get,
  HttpCode,
  HttpStatus,
  Param,
  ParseUUIDPipe,
  Post,
  Put,
  Query,
} from '@nestjs/common';
import { ApiBody, ApiOperation, ApiParam } from '@nestjs/swagger';

import { BaseEntity } from '../../database/entities/base.entity';
import { CurrentUser } from '../../modules/auth/decorators/current-user.decorator';
import { BaseCrudService } from '../services/base-crud.service';

export abstract class BaseCrudController<
  T extends BaseEntity,
  CreateDto,
  UpdateDto,
  QueryDto extends {
    search?: string;
    isActive?: boolean;
    sortBy?: string;
    sortOrder?: 'ASC' | 'DESC';
  },
> {
  constructor(
    protected readonly service: BaseCrudService<T, CreateDto, UpdateDto, QueryDto>,
  ) {}

  @Get()
  @ApiOperation({ summary: 'Get all (with filters)' })
  async findAll(@Query() query: QueryDto) {
    return this.service.findAll(query);
  }

  @Get('deleted')
  @ApiOperation({ summary: 'Get soft-deleted records' })
  async findDeleted(@Query() query: QueryDto) {
    return this.service.findDeleted(query);
  }

  @Get(':id')
  @ApiOperation({ summary: 'Get by ID' })
  @ApiParam({ name: 'id', type: 'string' })
  async findOne(@Param('id', ParseUUIDPipe) id: string) {
    return this.service.findOne(id);
  }

  @Post()
  @ApiOperation({ summary: 'Create' })
  async create(
    @Body() dto: CreateDto,
    @CurrentUser('userId') userId: string,
    @CurrentUser('username') username: string,
  ) {
    return this.service.create(dto, userId, username);
  }

  @Put(':id')
  @ApiOperation({ summary: 'Update' })
  @ApiParam({ name: 'id', type: 'string' })
  async update(
    @Param('id', ParseUUIDPipe) id: string,
    @Body() dto: UpdateDto,
    @CurrentUser('userId') userId: string,
    @CurrentUser('username') username: string,
  ) {
    return this.service.update(id, dto, userId, username);
  }

  @Delete(':id')
  @HttpCode(HttpStatus.NO_CONTENT)
  @ApiOperation({ summary: 'Soft delete' })
  @ApiParam({ name: 'id', type: 'string' })
  async softDelete(
    @Param('id', ParseUUIDPipe) id: string,
    @CurrentUser('userId') userId: string,
    @CurrentUser('username') username: string,
  ): Promise<void> {
    return this.service.softDelete(id, userId, username);
  }

  @Post(':id/restore')
  @ApiOperation({ summary: 'Restore soft-deleted record' })
  @ApiParam({ name: 'id', type: 'string' })
  async restore(
    @Param('id', ParseUUIDPipe) id: string,
    @CurrentUser('userId') userId: string,
    @CurrentUser('username') username: string,
  ) {
    return this.service.restore(id, userId, username);
  }

  @Post('bulk-restore')
  @ApiOperation({ summary: 'Bulk restore soft-deleted records' })
  @ApiBody({
    schema: {
      type: 'object',
      properties: {
        ids: {
          type: 'array',
          items: { type: 'string' },
        },
      },
    },
  })
  async bulkRestore(
    @Body() body: { ids: string[] },
    @CurrentUser('userId') userId: string,
    @CurrentUser('username') username: string,
  ) {
    return this.service.bulkRestore(body.ids, userId, username);
  }

  @Post('bulk-permanent-delete')
  @ApiOperation({ summary: 'Bulk permanent delete' })
  @ApiBody({
    schema: {
      type: 'object',
      properties: {
        ids: {
          type: 'array',
          items: { type: 'string' },
        },
      },
    },
  })
  async bulkPermanentDelete(
    @Body() body: { ids: string[] },
    @CurrentUser('userId') userId: string,
    @CurrentUser('username') username: string,
  ) {
    return this.service.bulkPermanentDelete(body.ids, userId, username);
  }

  @Delete(':id/permanent')
  @HttpCode(HttpStatus.NO_CONTENT)
  @ApiOperation({ summary: 'Permanently delete' })
  @ApiParam({ name: 'id', type: 'string' })
  async permanentDelete(
    @Param('id', ParseUUIDPipe) id: string,
    @CurrentUser('userId') userId: string,
    @CurrentUser('username') username: string,
  ): Promise<void> {
    return this.service.permanentDelete(id, userId, username);
  }
}
