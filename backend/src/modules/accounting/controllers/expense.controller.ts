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
import { ExpenseService } from '../services/expense.service';
import {
  CreateExpenseDto,
  UpdateExpenseDto,
  QueryExpenseDto,
  BulkExpenseDto,
} from '../dto/expense.dto';

@Controller('accounting/expenses')
@Auth()
export class ExpenseController {
  constructor(private readonly expenseService: ExpenseService) {}

  @Get()
  findAll(@Query() query: QueryExpenseDto) {
    return this.expenseService.findAll(query);
  }

  @Get(':id')
  findOne(@Param('id', ParseUUIDPipe) id: string) {
    return this.expenseService.findOne(id);
  }

  @Post()
  @Auth(UserRole.ADMIN, UserRole.MANAGER)
  create(@Body() dto: CreateExpenseDto) {
    return this.expenseService.create(dto);
  }

  @Patch(':id')
  @Auth(UserRole.ADMIN, UserRole.MANAGER)
  update(@Param('id', ParseUUIDPipe) id: string, @Body() dto: UpdateExpenseDto) {
    return this.expenseService.update(id, dto);
  }

  @Delete(':id')
  @Auth(UserRole.ADMIN)
  remove(@Param('id', ParseUUIDPipe) id: string) {
    return this.expenseService.remove(id);
  }

  @Post(':id/post')
  @Auth(UserRole.ADMIN, UserRole.MANAGER)
  post(@Param('id', ParseUUIDPipe) id: string) {
    return this.expenseService.post(id);
  }

  @Post('bulk-post')
  @Auth(UserRole.ADMIN, UserRole.MANAGER)
  bulkPost(@Body() dto: BulkExpenseDto) {
    return this.expenseService.bulkPost(dto);
  }

  @Post('bulk-delete')
  @Auth(UserRole.ADMIN)
  bulkDelete(@Body() dto: BulkExpenseDto) {
    return this.expenseService.bulkDelete(dto);
  }
}
