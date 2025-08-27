import { Injectable } from '@nestjs/common';
import { BaseReportService } from './base-report.service';
import { 
  ReportConfig, 
  ReportGenerationOptions, 
  ReportDataAggregationResult,
  ReportCategory 
} from '../interfaces/report-types.interface';
import { SalesRepository } from '../../sales/repositories/sales.repository';
import { ProductRepository } from '../../inventory/repositories/product.repository';
import { CustomerRepository } from '../../crm/repositories/customer.repository';

@Injectable()
export class SalesReportService extends BaseReportService {
  constructor(
    private readonly salesRepo: SalesRepository,
    private readonly productRepo: ProductRepository,
    private readonly customerRepo: CustomerRepository
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

    // Prepare base query with filters
    const query = this.prepareSalesQuery(options);

    // Fetch sales data
    const salesData = await this.salesRepo.findWithAggregation(query);

    // Enrich data with product and customer details
    const enrichedData = await this.enrichSalesData(salesData);

    return {
      totalRecords: salesData.length,
      data: enrichedData,
      aggregations: this.calculateSalesAggregations(enrichedData),
      metadata: {
        reportType: 'Sales Performance',
        generatedAt: new Date()
      }
    };
  }

  /**
   * Prepare sales query based on report options
   */
  private prepareSalesQuery(options: ReportGenerationOptions): any {
    const query: any = {};

    // Apply date range filter
    if (options.filters?.dateRange) {
      query.date = {
        $gte: options.filters.dateRange.start,
        $lte: options.filters.dateRange.end
      };
    }

    // Apply additional filters
    if (options.filters?.productId) query.productId = options.filters.productId;
    if (options.filters?.customerId) query.customerId = options.filters.customerId;

    // Apply sorting
    const sort: any = {};
    if (options.sortBy) {
      sort[options.sortBy] = options.sortOrder === 'desc' ? -1 : 1;
    }

    return { query, sort };
  }

  /**
   * Enrich sales data with product and customer details
   */
  private async enrichSalesData(salesData: any[]): Promise<any[]> {
    const enrichedData = await Promise.all(salesData.map(async (sale) => {
      const product = await this.productRepo.findById(sale.productId);
      const customer = await this.customerRepo.findById(sale.customerId);

      return {
        ...sale,
        productName: product?.name,
        customerName: customer?.name,
        productCategory: product?.category
      };
    }));

    return enrichedData;
  }

  /**
   * Calculate sales aggregations
   */
  private calculateSalesAggregations(salesData: any[]): Record<string, any> {
    return {
      totalRevenue: salesData.reduce((sum, sale) => sum + sale.totalAmount, 0),
      averageOrderValue: salesData.reduce((sum, sale) => sum + sale.totalAmount, 0) / salesData.length,
      topSellingProducts: this.getTopSellingProducts(salesData),
      salesByCategory: this.getSalesByCategory(salesData)
    };
  }

  /**
   * Get top selling products
   */
  private getTopSellingProducts(salesData: any[]): any[] {
    const productSales = salesData.reduce((acc, sale) => {
      acc[sale.productName] = (acc[sale.productName] || 0) + sale.quantity;
      return acc;
    }, {});

    return Object.entries(productSales)
      .sort((a: any, b: any) => b[1] - a[1])
      .slice(0, 10)
      .map(([productName, quantity]) => ({ productName, quantity }));
  }

  /**
   * Get sales by product category
   */
  private getSalesByCategory(salesData: any[]): any[] {
    const categorySales = salesData.reduce((acc, sale) => {
      acc[sale.productCategory] = (acc[sale.productCategory] || 0) + sale.totalAmount;
      return acc;
    }, {});

    return Object.entries(categorySales)
      .map(([category, revenue]) => ({ category, revenue }))
      .sort((a: any, b: any) => b.revenue - a.revenue);
  }
}