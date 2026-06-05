import { Controller, Get, Query, Res } from '@nestjs/common';
import { Response } from 'express';
import { ApiTags, ApiOperation, ApiQuery, ApiResponse } from '@nestjs/swagger';
import { PurchasingAnalyticsService } from '../services/purchasing-analytics.service';
import { ExportService } from '../../../common/services/export.service';
import { normalizeIds, toDate, sendExcel } from '../../../common/utils/export-controller.util';
import {
  PurchasingAnalyticsQueryDto,
  PurchasingAnalyticsResponseDto,
} from '../dto/purchasing-analytics.dto';

@ApiTags('Purchasing Analytics')
@Controller('purchasing/analytics')
export class PurchasingAnalyticsController {
  constructor(
    private readonly purchasingAnalyticsService: PurchasingAnalyticsService,
    private readonly exportService: ExportService,
  ) {}

  @Get('dashboard')
  @ApiOperation({ summary: 'Get purchasing analytics for the overview dashboard' })
  @ApiResponse({ status: 200, type: PurchasingAnalyticsResponseDto })
  async getDashboardAnalytics(
    @Query() query: PurchasingAnalyticsQueryDto,
  ): Promise<PurchasingAnalyticsResponseDto> {
    return this.purchasingAnalyticsService.getPurchasingAnalytics(query);
  }

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

  @Get('purchase-order-summary/export')
  @ApiOperation({ summary: 'Export purchase order summary to Excel' })
  async exportPurchaseOrderSummary(
    @Query('dateFrom') dateFrom: string | undefined,
    @Query('dateTo') dateTo: string | undefined,
    @Query('supplierId') supplierId: string | undefined,
    @Query('categoryId') categoryId: string | undefined,
    @Query('productIds') productIds: string | string[] | undefined,
    @Query('status') status: string | undefined,
    @Query('paymentStatus') paymentStatus: string | undefined,
    @Res() res: Response,
  ): Promise<void> {
    const { data } = await this.purchasingAnalyticsService.getPurchaseOrderSummary({
      dateFrom: toDate(dateFrom),
      dateTo: toDate(dateTo),
      supplierId,
      categoryId,
      productIds: normalizeIds(productIds),
      status,
      paymentStatus,
    });
    const columns = [
      { key: 'supplierName', header: 'Supplier', type: 'string' as const, width: 25 },
      { key: 'orderNumber', header: 'Order #', type: 'string' as const, width: 15 },
      { key: 'orderDate', header: 'Date', type: 'date' as const, width: 12 },
      { key: 'status', header: 'Status', type: 'string' as const, width: 12 },
      { key: 'paymentStatus', header: 'Payment', type: 'string' as const, width: 12 },
      { key: 'totalAmount', header: 'Total', type: 'currency' as const, width: 15 },
      { key: 'paidAmount', header: 'Paid', type: 'currency' as const, width: 15 },
      { key: 'balance', header: 'Balance', type: 'currency' as const, width: 15 },
      { key: 'shippingAmount', header: 'Shipping', type: 'currency' as const, width: 15 },
    ];
    const buffer = await this.exportService.exportGrouped(
      'Purchase Order Summary',
      columns,
      data as any[],
      {
        groupKey: 'supplierName',
        groupLabel: 'Supplier',
        subtotalColumns: ['totalAmount', 'paidAmount', 'balance', 'shippingAmount'],
      },
    );
    sendExcel(res, buffer, 'purchase-order-summary');
  }

  @Get('purchase-order-status/export')
  @ApiOperation({ summary: 'Export purchase order status report to Excel' })
  async exportPurchaseOrderStatus(
    @Query('dateFrom') dateFrom: string | undefined,
    @Query('dateTo') dateTo: string | undefined,
    @Query('supplierId') supplierId: string | undefined,
    @Query('categoryId') categoryId: string | undefined,
    @Query('productIds') productIds: string | string[] | undefined,
    @Query('status') status: string | undefined,
    @Query('paymentStatus') paymentStatus: string | undefined,
    @Res() res: Response,
  ): Promise<void> {
    const { data } = await this.purchasingAnalyticsService.getPurchaseOrderDetails({
      dateFrom: toDate(dateFrom),
      dateTo: toDate(dateTo),
      supplierId,
      categoryId,
      productIds: normalizeIds(productIds),
      status,
      paymentStatus,
    });
    const columns = [
      { key: 'supplierName', header: 'Supplier', type: 'string' as const, width: 25 },
      { key: 'orderNumber', header: 'Order #', type: 'string' as const, width: 15 },
      { key: 'orderDate', header: 'Date', type: 'date' as const, width: 12 },
      { key: 'productName', header: 'Product', type: 'string' as const, width: 30 },
      { key: 'status', header: 'Status', type: 'string' as const, width: 12 },
      { key: 'paymentStatus', header: 'Payment', type: 'string' as const, width: 12 },
      { key: 'quantity', header: 'Qty', type: 'number' as const, width: 10 },
      { key: 'receivedQuantity', header: 'Received', type: 'number' as const, width: 10 },
      { key: 'remainingQuantity', header: 'Remaining', type: 'number' as const, width: 10 },
      { key: 'unitPrice', header: 'Unit Price', type: 'currency' as const, width: 15 },
      { key: 'totalAmount', header: 'Total', type: 'currency' as const, width: 15 },
    ];
    const buffer = await this.exportService.exportGrouped(
      'Purchase Order Status',
      columns,
      data as any[],
      {
        groupKey: 'supplierName',
        groupLabel: 'Supplier',
        subtotalColumns: ['totalAmount'],
      },
    );
    sendExcel(res, buffer, 'purchase-order-status');
  }

  @Get('purchase-order-details/export')
  @ApiOperation({ summary: 'Export purchase order details to Excel' })
  async exportPurchaseOrderDetails(
    @Query('dateFrom') dateFrom: string | undefined,
    @Query('dateTo') dateTo: string | undefined,
    @Query('supplierId') supplierId: string | undefined,
    @Query('categoryId') categoryId: string | undefined,
    @Query('productIds') productIds: string | string[] | undefined,
    @Query('status') status: string | undefined,
    @Query('paymentStatus') paymentStatus: string | undefined,
    @Res() res: Response,
  ): Promise<void> {
    const { data } = await this.purchasingAnalyticsService.getPurchaseOrderDetails({
      dateFrom: toDate(dateFrom),
      dateTo: toDate(dateTo),
      supplierId,
      categoryId,
      productIds: normalizeIds(productIds),
      status,
      paymentStatus,
    });
    const columns = [
      { key: 'supplierName', header: 'Supplier', type: 'string' as const, width: 25 },
      { key: 'orderNumber', header: 'Order #', type: 'string' as const, width: 15 },
      { key: 'orderDate', header: 'Date', type: 'date' as const, width: 12 },
      { key: 'productName', header: 'Product', type: 'string' as const, width: 30 },
      { key: 'categoryName', header: 'Category', type: 'string' as const, width: 18 },
      { key: 'quantity', header: 'Qty', type: 'number' as const, width: 10 },
      { key: 'receivedQuantity', header: 'Received', type: 'number' as const, width: 12 },
      { key: 'remainingQuantity', header: 'Remaining', type: 'number' as const, width: 12 },
      { key: 'unitPrice', header: 'Unit Price', type: 'currency' as const, width: 15 },
      { key: 'discountAmount', header: 'Discount', type: 'currency' as const, width: 15 },
      { key: 'totalAmount', header: 'Total', type: 'currency' as const, width: 15 },
      { key: 'status', header: 'Status', type: 'string' as const, width: 12 },
      { key: 'paymentStatus', header: 'Payment', type: 'string' as const, width: 12 },
    ];
    const buffer = await this.exportService.exportGrouped(
      'Purchase Order Details',
      columns,
      data as any[],
      {
        groupKey: 'supplierName',
        groupLabel: 'Supplier',
        subtotalColumns: ['quantity', 'receivedQuantity', 'remainingQuantity', 'discountAmount', 'totalAmount'],
      },
    );
    sendExcel(res, buffer, 'purchase-order-details');
  }

  @Get('vendor-payment-details/export')
  @ApiOperation({ summary: 'Export vendor payment details to Excel' })
  async exportVendorPaymentDetails(
    @Query('dateFrom') dateFrom: string | undefined,
    @Query('dateTo') dateTo: string | undefined,
    @Query('supplierId') supplierId: string | undefined,
    @Query('status') status: string | undefined,
    @Res() res: Response,
  ): Promise<void> {
    const { data } = await this.purchasingAnalyticsService.getVendorPaymentDetails({
      dateFrom: toDate(dateFrom),
      dateTo: toDate(dateTo),
      supplierId,
      status,
    });
    const columns = [
      { key: 'supplierName', header: 'Supplier', type: 'string' as const, width: 25 },
      { key: 'paymentNumber', header: 'Payment #', type: 'string' as const, width: 16 },
      { key: 'paymentDate', header: 'Date', type: 'date' as const, width: 12 },
      { key: 'orderNumber', header: 'Order #', type: 'string' as const, width: 15 },
      { key: 'grnNumber', header: 'GRN #', type: 'string' as const, width: 15 },
      { key: 'paymentAmount', header: 'Amount', type: 'currency' as const, width: 15 },
      { key: 'paymentMethodId', header: 'Method', type: 'string' as const, width: 14 },
      { key: 'referenceNumber', header: 'Reference', type: 'string' as const, width: 18 },
      { key: 'status', header: 'Status', type: 'string' as const, width: 12 },
    ];
    const buffer = await this.exportService.exportGrouped(
      'Vendor Payment Details',
      columns,
      data as any[],
      {
        groupKey: 'supplierName',
        groupLabel: 'Supplier',
        subtotalColumns: ['paymentAmount'],
      },
    );
    sendExcel(res, buffer, 'vendor-payment-details');
  }

  @Get('vendor-product-list/export')
  @ApiOperation({ summary: 'Export vendor product list to Excel' })
  async exportVendorProductList(
    @Query('dateFrom') dateFrom: string | undefined,
    @Query('dateTo') dateTo: string | undefined,
    @Query('supplierId') supplierId: string | undefined,
    @Query('categoryId') categoryId: string | undefined,
    @Query('productIds') productIds: string | string[] | undefined,
    @Query('status') status: string | undefined,
    @Query('paymentStatus') paymentStatus: string | undefined,
    @Res() res: Response,
  ): Promise<void> {
    const { data } = await this.purchasingAnalyticsService.getVendorProductList({
      dateFrom: toDate(dateFrom),
      dateTo: toDate(dateTo),
      supplierId,
      categoryId,
      productIds: normalizeIds(productIds),
      status,
      paymentStatus,
    });
    const columns = [
      { key: 'supplierName', header: 'Supplier', type: 'string' as const, width: 25 },
      { key: 'productName', header: 'Product', type: 'string' as const, width: 30 },
      { key: 'categoryName', header: 'Category', type: 'string' as const, width: 18 },
      { key: 'orderNumber', header: 'Order #', type: 'string' as const, width: 15 },
      { key: 'orderDate', header: 'Date', type: 'date' as const, width: 12 },
      { key: 'quantity', header: 'Qty', type: 'number' as const, width: 10 },
      { key: 'receivedQuantity', header: 'Received', type: 'number' as const, width: 12 },
      { key: 'unitPrice', header: 'Unit Price', type: 'currency' as const, width: 15 },
      { key: 'totalAmount', header: 'Total', type: 'currency' as const, width: 15 },
      { key: 'status', header: 'Status', type: 'string' as const, width: 12 },
      { key: 'paymentStatus', header: 'Payment', type: 'string' as const, width: 12 },
    ];
    const buffer = await this.exportService.exportGrouped(
      'Vendor Product List',
      columns,
      data as any[],
      {
        groupKey: 'supplierName',
        groupLabel: 'Supplier',
        subtotalColumns: ['quantity', 'receivedQuantity', 'totalAmount'],
      },
    );
    sendExcel(res, buffer, 'vendor-product-list');
  }

}
