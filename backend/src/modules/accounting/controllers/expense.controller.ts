import { Controller, Get, Post, Patch, Body, Param, Query } from '@nestjs/common';
import { Auth } from '../../auth/decorators/auth.decorator';
import { CurrentUser } from '../../auth/decorators/current-user.decorator';
import { ExpenseService } from '../services/expense.service';
import { ExpensePaymentService } from '../services/expense-payment.service';
import { CreateExpenseDto, UpdateExpenseDto, PayExpenseDto, RefundExpenseDto, ListExpensesQueryDto } from '../dto/expense.dto';

@Auth()
@Controller('accounting/expenses')
export class ExpenseController {
  constructor(
    private readonly service: ExpenseService,
    private readonly paymentService: ExpensePaymentService,
  ) {}

  @Get()
  async list(@Query() query: ListExpensesQueryDto) {
    return this.service.list(query);
  }

  @Get(':id')
  async findOne(@Param('id') id: string) {
    return this.service.findOne(id);
  }

  @Post()
  async create(
    @Body() dto: CreateExpenseDto,
    @CurrentUser('userId') userId: string,
    @CurrentUser('username') username: string,
  ) {
    return this.service.create(dto, userId, username);
  }

  @Patch(':id')
  async update(
    @Param('id') id: string,
    @Body() dto: UpdateExpenseDto,
    @CurrentUser('userId') userId: string,
    @CurrentUser('username') username: string,
  ) {
    return this.service.update(id, dto, userId, username);
  }

  @Post(':id/cancel')
  async cancel(
    @Param('id') id: string,
    @CurrentUser('userId') userId: string,
    @CurrentUser('username') username: string,
  ) {
    return this.service.cancel(id, userId, username);
  }

  @Post(':id/pay')
  async pay(
    @Param('id') id: string,
    @Body() dto: PayExpenseDto,
    @CurrentUser('userId') userId: string,
    @CurrentUser('username') username: string,
  ) {
    return this.paymentService.pay(id, dto, userId, username);
  }

  @Post(':id/refund')
  async refund(
    @Param('id') id: string,
    @Body() dto: RefundExpenseDto,
    @CurrentUser('userId') userId: string,
    @CurrentUser('username') username: string,
  ) {
    return this.paymentService.refund(id, dto, userId, username);
  }
}
