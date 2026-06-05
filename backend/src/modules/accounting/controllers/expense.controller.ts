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
import { CurrentUser } from '../../auth/decorators/current-user.decorator';
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

  @Post()
  @Auth(UserRole.ADMIN, UserRole.MANAGER)
  create(
    @Body() dto: CreateExpenseDto,
    @CurrentUser('userId') currentUserId: string,
    @CurrentUser('username') currentUsername: string,
  ) {
    return this.expenseService.create(dto, currentUserId, currentUsername);
  }

  @Post('bulk-post')
  @Auth(UserRole.ADMIN, UserRole.MANAGER)
  bulkPost(
    @Body() dto: BulkExpenseDto,
    @CurrentUser('userId') currentUserId: string,
    @CurrentUser('username') currentUsername: string,
  ) {
    return this.expenseService.bulkPost(dto, currentUserId, currentUsername);
  }

  @Post('bulk-delete')
  @Auth(UserRole.ADMIN)
  bulkDelete(
    @Body() dto: BulkExpenseDto,
    @CurrentUser('userId') currentUserId: string,
    @CurrentUser('username') currentUsername: string,
  ) {
    return this.expenseService.bulkDelete(dto, currentUserId, currentUsername);
  }

  @Get('deleted')
  getDeleted() {
    return this.expenseService.getDeleted();
  }

  @Delete('bulk-permanent')
  @Auth(UserRole.ADMIN)
  bulkPermanentDelete(
    @Body() dto: BulkExpenseDto,
    @CurrentUser('userId') currentUserId: string,
    @CurrentUser('username') currentUsername: string,
  ) {
    return this.expenseService.bulkPermanentDelete(dto, currentUserId, currentUsername);
  }

  @Post('bulk-restore')
  @Auth(UserRole.ADMIN)
  bulkRestore(
    @Body() dto: BulkExpenseDto,
    @CurrentUser('userId') currentUserId: string,
    @CurrentUser('username') currentUsername: string,
  ) {
    return this.expenseService.bulkRestore(dto, currentUserId, currentUsername);
  }

  @Get(':id')
  findOne(@Param('id', ParseUUIDPipe) id: string) {
    return this.expenseService.findOne(id);
  }

  @Patch(':id')
  @Auth(UserRole.ADMIN, UserRole.MANAGER)
  update(
    @Param('id', ParseUUIDPipe) id: string,
    @Body() dto: UpdateExpenseDto,
    @CurrentUser('userId') currentUserId: string,
    @CurrentUser('username') currentUsername: string,
  ) {
    return this.expenseService.update(id, dto, currentUserId, currentUsername);
  }

  @Delete(':id')
  @Auth(UserRole.ADMIN)
  remove(
    @Param('id', ParseUUIDPipe) id: string,
    @CurrentUser('userId') currentUserId: string,
    @CurrentUser('username') currentUsername: string,
  ) {
    return this.expenseService.remove(id, currentUserId, currentUsername);
  }

  @Post(':id/post')
  @Auth(UserRole.ADMIN, UserRole.MANAGER)
  post(
    @Param('id', ParseUUIDPipe) id: string,
    @CurrentUser('userId') currentUserId: string,
    @CurrentUser('username') currentUsername: string,
  ) {
    return this.expenseService.post(id, currentUserId, currentUsername);
  }

  @Post(':id/restore')
  @Auth(UserRole.ADMIN)
  restore(
    @Param('id', ParseUUIDPipe) id: string,
    @CurrentUser('userId') currentUserId: string,
    @CurrentUser('username') currentUsername: string,
  ) {
    return this.expenseService.restore(id, currentUserId, currentUsername);
  }

  @Post(':id/unpost')
  @Auth(UserRole.ADMIN)
  unpost(
    @Param('id', ParseUUIDPipe) id: string,
    @CurrentUser('userId') currentUserId: string,
    @CurrentUser('username') currentUsername: string,
  ) {
    return this.expenseService.unpost(id, currentUserId, currentUsername);
  }

  @Delete(':id/permanent')
  @Auth(UserRole.ADMIN)
  permanentDelete(
    @Param('id', ParseUUIDPipe) id: string,
    @CurrentUser('userId') currentUserId: string,
    @CurrentUser('username') currentUsername: string,
  ) {
    return this.expenseService.permanentDelete(id, currentUserId, currentUsername);
  }
}
