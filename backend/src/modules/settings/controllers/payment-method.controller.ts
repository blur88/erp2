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
import { Auth } from '../../auth/decorators/auth.decorator';
import { UserRole } from '../../../database/entities/user.entity';
import { PaymentMethodService } from '../services/payment-method.service';
import {
  CreatePaymentMethodDto,
  UpdatePaymentMethodDto,
  QueryPaymentMethodsDto,
  PaymentMethodResponseDto,
  PaymentMethodListResponseDto,
} from '../dto/payment-method.dto';

@ApiTags('Payment Methods')
@Controller('settings/payment-methods')
@Auth()
export class PaymentMethodController {
  constructor(private readonly paymentMethodService: PaymentMethodService) {}

  @Get()
  @ApiOperation({ summary: 'Get all payment methods' })
  @ApiResponse({ status: 200, type: PaymentMethodListResponseDto })
  async findAll(@Query() query: QueryPaymentMethodsDto): Promise<PaymentMethodListResponseDto> {
    return this.paymentMethodService.findAll(query);
  }

  @Get('active')
  @ApiOperation({ summary: 'Get all active payment methods (for dropdowns)' })
  @ApiResponse({ status: 200, type: [PaymentMethodResponseDto] })
  async getActiveList(
    @Query('forPurchases') forPurchasesRaw?: string,
  ): Promise<PaymentMethodResponseDto[]> {
    const forPurchases = forPurchasesRaw === 'true' ? true : undefined;
    return this.paymentMethodService.getActiveList(forPurchases);
  }

  @Get('deleted')
  @Auth(UserRole.ADMIN, UserRole.MANAGER)
  @ApiOperation({ summary: 'Get soft-deleted payment methods' })
  @ApiResponse({ status: 200, type: [PaymentMethodResponseDto] })
  async getDeletedList(): Promise<PaymentMethodResponseDto[]> {
    return this.paymentMethodService.getDeletedList();
  }

  @Get(':id')
  @ApiOperation({ summary: 'Get payment method by ID' })
  @ApiParam({ name: 'id', description: 'Payment method ID' })
  @ApiResponse({ status: 200, type: PaymentMethodResponseDto })
  async findOne(@Param('id') id: string): Promise<PaymentMethodResponseDto> {
    return this.paymentMethodService.findOne(id);
  }

  @Post()
  @Auth(UserRole.ADMIN, UserRole.MANAGER)
  @ApiOperation({ summary: 'Create a new payment method' })
  @ApiResponse({ status: 201, type: PaymentMethodResponseDto })
  async create(@Body() dto: CreatePaymentMethodDto): Promise<PaymentMethodResponseDto> {
    return this.paymentMethodService.create(dto);
  }

  @Patch(':id')
  @Auth(UserRole.ADMIN, UserRole.MANAGER)
  @ApiOperation({ summary: 'Update a payment method' })
  @ApiParam({ name: 'id', description: 'Payment method ID' })
  @ApiResponse({ status: 200, type: PaymentMethodResponseDto })
  async update(
    @Param('id') id: string,
    @Body() dto: UpdatePaymentMethodDto,
  ): Promise<PaymentMethodResponseDto> {
    return this.paymentMethodService.update(id, dto);
  }

  @Delete(':id')
  @Auth(UserRole.ADMIN)
  @HttpCode(HttpStatus.NO_CONTENT)
  @ApiOperation({ summary: 'Delete a payment method' })
  @ApiParam({ name: 'id', description: 'Payment method ID' })
  async remove(@Param('id') id: string): Promise<void> {
    return this.paymentMethodService.remove(id);
  }

  @Post(':id/restore')
  @Auth(UserRole.ADMIN)
  @HttpCode(HttpStatus.NO_CONTENT)
  @ApiOperation({ summary: 'Restore a soft-deleted payment method' })
  @ApiParam({ name: 'id', description: 'Payment method ID' })
  async restore(@Param('id') id: string): Promise<void> {
    return this.paymentMethodService.restore(id);
  }

  @Delete(':id/permanent')
  @Auth(UserRole.ADMIN)
  @HttpCode(HttpStatus.NO_CONTENT)
  @ApiOperation({
    summary:
      'Permanently delete a soft-deleted payment method (blocked when referenced by payments)',
  })
  @ApiParam({ name: 'id', description: 'Payment method ID' })
  async permanentDelete(@Param('id') id: string): Promise<void> {
    return this.paymentMethodService.permanentDelete(id);
  }
}
