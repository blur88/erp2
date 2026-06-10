import { Controller, Get, Param, ParseUUIDPipe } from '@nestjs/common';
import { ApiTags, ApiOperation, ApiParam, ApiResponse } from '@nestjs/swagger';

import { VendorPaymentService } from '../services/vendor-payment.service';

/**
 * Slim vendor-payment controller.
 *
 * Vendor payments are created/listed through the purchase-order endpoints
 * (`POST /purchasing/orders/:id/payments`, `GET /purchasing/orders/:id/payments`).
 * This controller exposes only a single read-by-id, which the accounting
 * journal-entry UI uses to resolve and navigate `vendor_payment`-sourced
 * journal entries. No list/create/delete surface is intentional.
 */
@ApiTags('Vendor Payments')
@Controller('purchasing/vendor-payments')
export class VendorPaymentController {
  constructor(private readonly vendorPaymentService: VendorPaymentService) {}

  @Get(':id')
  @ApiOperation({ summary: 'Get a vendor payment by ID' })
  @ApiParam({ name: 'id', description: 'Vendor payment ID', type: 'string' })
  @ApiResponse({ status: 200, description: 'Vendor payment retrieved successfully' })
  @ApiResponse({ status: 404, description: 'Vendor payment not found' })
  findOne(@Param('id', ParseUUIDPipe) id: string) {
    return this.vendorPaymentService.findOne(id);
  }
}
