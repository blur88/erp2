import { Controller, Get, Query } from '@nestjs/common';
import { ApiTags, ApiOperation, ApiQuery, ApiResponse } from '@nestjs/swagger';
import { PurchasingAnalyticsService } from '../services/purchasing-analytics.service';

@ApiTags('Purchasing Analytics')
@Controller('purchasing/analytics')
export class PurchasingAnalyticsController {
  constructor(
    private readonly purchasingAnalyticsService: PurchasingAnalyticsService,
  ) {}

  @Get('purchase-order-summary')
  @ApiOperation({
    summary:
      'Get purchase order summary report - shows PO-level summary with totals',
  })
  @ApiQuery({
    name: 'dateFrom',
    required: false,
    description: 'Start date for order date (YYYY-MM-DD)',
  })
  @ApiQuery({
    name: 'dateTo',
    required: false,
    description: 'End date for order date (YYYY-MM-DD)',
  })
  @ApiQuery({
    name: 'supplierId',
    required: false,
    description: 'Filter by supplier ID',
  })
  @ApiQuery({
    name: 'categoryId',
    required: false,
    description: 'Filter by category ID',
  })
  @ApiQuery({
    name: 'productIds',
    required: false,
    type: [String],
    description: 'Filter by product IDs',
  })
  @ApiQuery({
    name: 'status',
    required: false,
    description: 'Filter by status (received/pending)',
  })
  @ApiQuery({
    name: 'paymentStatus',
    required: false,
    description: 'Filter by payment status (unpaid/partial/paid)',
  })
  @ApiResponse({
    status: 200,
    description: 'Purchase order summary report retrieved successfully',
  })
  async getPurchaseOrderSummary(
    @Query('dateFrom') dateFrom?: string,
    @Query('dateTo') dateTo?: string,
    @Query('supplierId') supplierId?: string,
    @Query('categoryId') categoryId?: string,
    @Query('productIds') productIds?: string | string[],
    @Query('status') status?: string,
    @Query('paymentStatus') paymentStatus?: string,
  ) {
    return this.purchasingAnalyticsService.getPurchaseOrderSummary({
      dateFrom: dateFrom ? new Date(dateFrom) : undefined,
      dateTo: dateTo ? new Date(dateTo) : undefined,
      supplierId,
      categoryId,
      productIds: Array.isArray(productIds)
        ? productIds
        : productIds
          ? [productIds]
          : undefined,
      status,
      paymentStatus,
    });
  }

  @Get('purchase-order-details')
  @ApiOperation({
    summary:
      'Get purchase order details report - shows line-item details with product information',
  })
  @ApiQuery({
    name: 'dateFrom',
    required: false,
    description: 'Start date for order date (YYYY-MM-DD)',
  })
  @ApiQuery({
    name: 'dateTo',
    required: false,
    description: 'End date for order date (YYYY-MM-DD)',
  })
  @ApiQuery({
    name: 'supplierId',
    required: false,
    description: 'Filter by supplier ID',
  })
  @ApiQuery({
    name: 'categoryId',
    required: false,
    description: 'Filter by category ID',
  })
  @ApiQuery({
    name: 'productIds',
    required: false,
    type: [String],
    description: 'Filter by product IDs',
  })
  @ApiQuery({
    name: 'status',
    required: false,
    description: 'Filter by status (received/pending)',
  })
  @ApiQuery({
    name: 'paymentStatus',
    required: false,
    description: 'Filter by payment status (unpaid/partial/paid)',
  })
  @ApiResponse({
    status: 200,
    description: 'Purchase order details report retrieved successfully',
  })
  async getPurchaseOrderDetails(
    @Query('dateFrom') dateFrom?: string,
    @Query('dateTo') dateTo?: string,
    @Query('supplierId') supplierId?: string,
    @Query('categoryId') categoryId?: string,
    @Query('productIds') productIds?: string | string[],
    @Query('status') status?: string,
    @Query('paymentStatus') paymentStatus?: string,
  ) {
    return this.purchasingAnalyticsService.getPurchaseOrderDetails({
      dateFrom: dateFrom ? new Date(dateFrom) : undefined,
      dateTo: dateTo ? new Date(dateTo) : undefined,
      supplierId,
      categoryId,
      productIds: Array.isArray(productIds)
        ? productIds
        : productIds
          ? [productIds]
          : undefined,
      status,
      paymentStatus,
    });
  }

  @Get('vendor-payment-details')
  @ApiOperation({
    summary:
      'Get vendor payment details report - shows individual vendor payment transactions',
  })
  @ApiQuery({
    name: 'dateFrom',
    required: false,
    description: 'Start date for payment date (YYYY-MM-DD)',
  })
  @ApiQuery({
    name: 'dateTo',
    required: false,
    description: 'End date for payment date (YYYY-MM-DD)',
  })
  @ApiQuery({
    name: 'supplierId',
    required: false,
    description: 'Filter by supplier ID',
  })
  @ApiQuery({
    name: 'status',
    required: false,
    description: 'Filter by payment status (pending/completed/cancelled)',
  })
  @ApiResponse({
    status: 200,
    description: 'Vendor payment details report retrieved successfully',
  })
  async getVendorPaymentDetails(
    @Query('dateFrom') dateFrom?: string,
    @Query('dateTo') dateTo?: string,
    @Query('supplierId') supplierId?: string,
    @Query('status') status?: string,
  ) {
    return this.purchasingAnalyticsService.getVendorPaymentDetails({
      dateFrom: dateFrom ? new Date(dateFrom) : undefined,
      dateTo: dateTo ? new Date(dateTo) : undefined,
      supplierId,
      status,
    });
  }

  @Get('vendor-product-list')
  @ApiOperation({
    summary:
      'Get vendor product list report - shows product-level details for vendor purchases',
  })
  @ApiQuery({
    name: 'dateFrom',
    required: false,
    description: 'Start date for order date (YYYY-MM-DD)',
  })
  @ApiQuery({
    name: 'dateTo',
    required: false,
    description: 'End date for order date (YYYY-MM-DD)',
  })
  @ApiQuery({
    name: 'supplierId',
    required: false,
    description: 'Filter by supplier ID',
  })
  @ApiQuery({
    name: 'productIds',
    required: false,
    type: [String],
    description: 'Filter by product IDs',
  })
  @ApiQuery({
    name: 'status',
    required: false,
    description: 'Filter by inventory status (received/pending)',
  })
  @ApiQuery({
    name: 'paymentStatus',
    required: false,
    description: 'Filter by payment status (unpaid/partial/paid)',
  })
  @ApiResponse({
    status: 200,
    description: 'Vendor product list report retrieved successfully',
  })
  async getVendorProductList(
    @Query('dateFrom') dateFrom?: string,
    @Query('dateTo') dateTo?: string,
    @Query('supplierId') supplierId?: string,
    @Query('productIds') productIds?: string | string[],
    @Query('status') status?: string,
    @Query('paymentStatus') paymentStatus?: string,
  ) {
    return this.purchasingAnalyticsService.getVendorProductList({
      dateFrom: dateFrom ? new Date(dateFrom) : undefined,
      dateTo: dateTo ? new Date(dateTo) : undefined,
      supplierId,
      productIds: Array.isArray(productIds)
        ? productIds
        : productIds
          ? [productIds]
          : undefined,
      status,
      paymentStatus,
    });
  }
}
