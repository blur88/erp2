import {
  Controller,
  Get,
  Post,
  Body,
  Patch,
  Param,
  Delete,
  Query,
  HttpCode,
  HttpStatus,
  ParseUUIDPipe,
} from '@nestjs/common';
import {
  ApiTags,
  ApiOperation,
  ApiResponse,
  ApiParam,
  ApiBody,
} from '@nestjs/swagger';
import { VendorPaymentService } from '../services/vendor-payment.service';
import {
  CreateVendorPaymentDto,
  UpdateVendorPaymentDto,
  QueryVendorPaymentsDto,
} from '../dto/vendor-payment.dto';

@ApiTags('Vendor Payments')
@Controller('purchasing/vendor-payments')
export class VendorPaymentController {
  constructor(private readonly vendorPaymentService: VendorPaymentService) {}

  @Post()
  @ApiOperation({ summary: 'Create a new vendor payment' })
  @ApiBody({ type: CreateVendorPaymentDto })
  @ApiResponse({
    status: 201,
    description: 'Vendor payment created successfully',
  })
  @ApiResponse({ status: 400, description: 'Invalid input data' })
  create(@Body() createVendorPaymentDto: CreateVendorPaymentDto) {
    return this.vendorPaymentService.create(createVendorPaymentDto);
  }

  @Get()
  @ApiOperation({ summary: 'Get all vendor payments with filters' })
  @ApiResponse({
    status: 200,
    description: 'Returns paginated vendor payments',
  })
  findAll(@Query() query: QueryVendorPaymentsDto) {
    return this.vendorPaymentService.findAll(query);
  }

  @Get(':id')
  @ApiOperation({ summary: 'Get a vendor payment by ID' })
  @ApiParam({ name: 'id', description: 'Vendor payment UUID' })
  @ApiResponse({
    status: 200,
    description: 'Returns the vendor payment',
  })
  @ApiResponse({ status: 404, description: 'Vendor payment not found' })
  findOne(@Param('id', ParseUUIDPipe) id: string) {
    return this.vendorPaymentService.findOne(id);
  }

  @Patch(':id')
  @ApiOperation({ summary: 'Update a vendor payment' })
  @ApiParam({ name: 'id', description: 'Vendor payment UUID' })
  @ApiBody({ type: UpdateVendorPaymentDto })
  @ApiResponse({
    status: 200,
    description: 'Vendor payment updated successfully',
  })
  @ApiResponse({ status: 404, description: 'Vendor payment not found' })
  update(
    @Param('id', ParseUUIDPipe) id: string,
    @Body() updateVendorPaymentDto: UpdateVendorPaymentDto,
  ) {
    return this.vendorPaymentService.update(id, updateVendorPaymentDto);
  }

  @Delete(':id')
  @HttpCode(HttpStatus.NO_CONTENT)
  @ApiOperation({ summary: 'Soft delete a vendor payment' })
  @ApiParam({ name: 'id', description: 'Vendor payment UUID' })
  @ApiResponse({
    status: 204,
    description: 'Vendor payment deleted successfully',
  })
  @ApiResponse({ status: 404, description: 'Vendor payment not found' })
  remove(@Param('id', ParseUUIDPipe) id: string) {
    return this.vendorPaymentService.remove(id);
  }
}
