import { Injectable } from '@nestjs/common';
import { InjectRepository } from '@nestjs/typeorm';
import { Repository, Between } from 'typeorm';
import { BaseReportService } from './base-report.service';
import {
  ReportConfig,
  ReportGenerationOptions,
  ReportDataAggregationResult,
  ReportCategory
} from '../interfaces/report-types.interface';
import { SalesOrder } from '../../../database/entities/sales-order.entity';
import { Invoice } from '../../../database/entities/invoice.entity';
import { Payment } from '../../../database/entities/payment.entity';

@Injectable()
export class SalesReportService extends BaseReportService {
  constructor(
    @InjectRepository(SalesOrder)
    private readonly salesOrderRepo: Repository<SalesOrder>,
    @InjectRepository(Invoice)
    private readonly invoiceRepo: Repository<Invoice>,
    @InjectRepository(Payment)
    private readonly paymentRepo: Repository<Payment>
  ) {
    super();
  }

  /**
   * Aggregate sales report data
   */
  protected async aggregateReportData(
    reportConfig: ReportConfig,
    options: ReportGenerationOptions
  ): Promise<ReportDataAggregationResult> {
    // Validate report category
    if (reportConfig.category !== ReportCategory.SALES) {
      throw new Error('Invalid report category for sales report');
    }

    // Build query with date range filter
    const whereConditions: any = { isActive: true };

    if (reportConfig.timeRange) {
      whereConditions.orderDate = Between(
        reportConfig.timeRange.start,
        reportConfig.timeRange.end
      );
    }

    // Fetch sales orders with relations
    const salesOrders = await this.salesOrderRepo.find({
      where: whereConditions,
      relations: ['customer', 'items', 'items.product'],
      order: {
        orderDate: 'DESC'
      }
    });

    // Fetch invoices for revenue calculation
    const invoices = await this.invoiceRepo.find({
      where: { isActive: true },
      relations: ['salesOrder', 'salesOrder.customer']
    });

    // Fetch payments for payment analysis
    const payments = await this.paymentRepo.find({
      where: { isActive: true },
      relations: ['invoice', 'invoice.salesOrder']
    });

    // Calculate aggregations
    const totalRevenue = invoices.reduce((sum, inv) => sum + Number(inv.totalAmount), 0);
    const totalPaid = payments.reduce((sum, pay) => sum + Number(pay.amount), 0);
    const orderCount = salesOrders.length;
    const averageOrderValue = orderCount > 0 ? totalRevenue / orderCount : 0;

    // Get top customers by revenue
    const customerRevenue: Record<string, any> = {};
    invoices.forEach(invoice => {
      const customerId = invoice.salesOrder?.customer?.id;
      const customerName = invoice.salesOrder?.customer?.name || 'Unknown';
      if (customerId) {
        if (!customerRevenue[customerId]) {
          customerRevenue[customerId] = { name: customerName, revenue: 0, orders: 0 };
        }
        customerRevenue[customerId].revenue += Number(invoice.totalAmount);
        customerRevenue[customerId].orders += 1;
      }
    });

    const topCustomers = Object.values(customerRevenue)
      .sort((a: any, b: any) => b.revenue - a.revenue)
      .slice(0, 10);

    // Get order status breakdown
    const statusBreakdown: Record<string, number> = {};
    salesOrders.forEach(order => {
      statusBreakdown[order.status] = (statusBreakdown[order.status] || 0) + 1;
    });

    return {
      totalRecords: salesOrders.length,
      data: salesOrders.map(order => ({
        id: order.id,
        orderNumber: order.orderNumber,
        orderDate: order.orderDate,
        customer: order.customer?.name,
        status: order.status,
        totalAmount: order.totalAmount,
        itemCount: order.items?.length || 0
      })),
      aggregations: {
        totalRevenue,
        totalPaid,
        totalOutstanding: totalRevenue - totalPaid,
        orderCount,
        averageOrderValue,
        topCustomers,
        statusBreakdown
      },
      metadata: {
        reportType: 'Sales Performance',
        generatedAt: new Date(),
        dateRange: reportConfig.timeRange
      }
    };
  }
}