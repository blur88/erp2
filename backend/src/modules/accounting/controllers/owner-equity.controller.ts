import {
  Controller,
  Get,
  Post,
  Patch,
  Delete,
  Body,
  Param,
  Query,
  ParseUUIDPipe,
} from '@nestjs/common';
import { Auth } from '../../auth/decorators/auth.decorator';
import { UserRole } from '../../../database/entities/user.entity';
import { OwnerEquityService } from '../services/owner-equity.service';
import {
  CreateOwnerEquityDto,
  UpdateOwnerEquityDto,
  QueryOwnerEquityDto,
  BulkOwnerEquityDto,
} from '../dto/owner-equity.dto';

@Controller('accounting/owner-equity')
@Auth()
export class OwnerEquityController {
  constructor(private readonly ownerEquityService: OwnerEquityService) {}

  @Get()
  findAll(@Query() query: QueryOwnerEquityDto) {
    return this.ownerEquityService.findAll(query);
  }

  @Get(':id')
  findOne(@Param('id', ParseUUIDPipe) id: string) {
    return this.ownerEquityService.findOne(id);
  }

  @Post()
  @Auth(UserRole.ADMIN, UserRole.MANAGER)
  create(@Body() dto: CreateOwnerEquityDto) {
    return this.ownerEquityService.create(dto);
  }

  @Patch(':id')
  @Auth(UserRole.ADMIN, UserRole.MANAGER)
  update(@Param('id', ParseUUIDPipe) id: string, @Body() dto: UpdateOwnerEquityDto) {
    return this.ownerEquityService.update(id, dto);
  }

  @Delete(':id')
  @Auth(UserRole.ADMIN)
  remove(@Param('id', ParseUUIDPipe) id: string) {
    return this.ownerEquityService.remove(id);
  }

  @Post(':id/post')
  @Auth(UserRole.ADMIN, UserRole.MANAGER)
  post(@Param('id', ParseUUIDPipe) id: string) {
    return this.ownerEquityService.post(id);
  }

  @Post('bulk-post')
  @Auth(UserRole.ADMIN, UserRole.MANAGER)
  bulkPost(@Body() dto: BulkOwnerEquityDto) {
    return this.ownerEquityService.bulkPost(dto);
  }

  @Post('bulk-delete')
  @Auth(UserRole.ADMIN)
  bulkDelete(@Body() dto: BulkOwnerEquityDto) {
    return this.ownerEquityService.bulkDelete(dto);
  }
}
