import { Injectable } from '@nestjs/common';
import { 
  DashboardDataRequest, 
  DashboardDataResponse, 
  DashboardWidget, 
  KPIDefinition,
  DashboardAlert 
} from '../interfaces/dashboard-interfaces';

import { SalesService } from '../../sales/services/sales-service';
import { InventoryService } from '../../inventory/services/inventory-service';
import { FinancialService } from '../../financial/services/financial-service';
import { PurchasingService } from '../../purchasing/services/purchasing-service';

@Injectable()
export class DashboardService {
  constructor(
    private salesService: SalesService,
    private inventoryService: InventoryService,
    private financialService: FinancialService,
    private purchasingService: PurchasingService
  ) {}

  // Aggregate data from multiple services
  async getDashboardData(request: DashboardDataRequest): Promise<DashboardDataResponse> {
    const widgetData: DashboardDataResponse['widgets'] = {};

    // Parallel data fetching for performance
    const dataPromises = (request.widgetIds || []).map(async (widgetId) => {
      switch (true) {
        case widgetId.startsWith('sales_'):
          widgetData[widgetId] = await this.getSalesWidgetData(widgetId, request);
          break;
        case widgetId.startsWith('inventory_'):
          widgetData[widgetId] = await this.getInventoryWidgetData(widgetId, request);
          break;
        case widgetId.startsWith('financial_'):
          widgetData[widgetId] = await this.getFinancialWidgetData(widgetId, request);
          break;
        case widgetId.startsWith('purchasing_'):
          widgetData[widgetId] = await this.getPurchasingWidgetData(widgetId, request);
          break;
        default:
          throw new Error(`Unsupported widget: ${widgetId}`);
      }
    });

    await Promise.all(dataPromises);

    return {
      widgets: widgetData,
      metadata: {
        lastUpdated: new Date(),
        refreshInterval: 300 // 5 minutes
      }
    };
  }

  // Widget-specific data retrieval methods
  private async getSalesWidgetData(widgetId: string, request: DashboardDataRequest) {
    switch (widgetId) {
      case 'sales_revenue_trend':
        return this.salesService.getRevenueTrend(request.dateRange);
      case 'sales_pipeline':
        return this.salesService.getSalesPipeline(request.filters);
      default:
        throw new Error(`Unknown sales widget: ${widgetId}`);
    }
  }

  private async getInventoryWidgetData(widgetId: string, request: DashboardDataRequest) {
    switch (widgetId) {
      case 'inventory_stock_levels':
        return this.inventoryService.getCurrentStockLevels(request.filters);
      case 'inventory_turnover':
        return this.inventoryService.getInventoryTurnoverRatio(request.dateRange);
      default:
        throw new Error(`Unknown inventory widget: ${widgetId}`);
    }
  }

  private async getFinancialWidgetData(widgetId: string, request: DashboardDataRequest) {
    switch (widgetId) {
      case 'financial_cash_flow':
        return this.financialService.getCashFlowStatement(request.dateRange);
      case 'financial_profit_margins':
        return this.financialService.getProfitMargins(request.dateRange);
      default:
        throw new Error(`Unknown financial widget: ${widgetId}`);
    }
  }

  private async getPurchasingWidgetData(widgetId: string, request: DashboardDataRequest) {
    switch (widgetId) {
      case 'purchasing_spend_analysis':
        return this.purchasingService.getSpendAnalysis(request.dateRange);
      case 'purchasing_supplier_performance':
        return this.purchasingService.getSupplierPerformance(request.filters);
      default:
        throw new Error(`Unknown purchasing widget: ${widgetId}`);
    }
  }

  // KPI Calculation Methods
  async calculateKPIs(category: string, dateRange?: { start: Date; end: Date }): Promise<KPIDefinition[]> {
    switch (category) {
      case 'sales':
        return this.salesService.getSalesKPIs(dateRange);
      case 'inventory':
        return this.inventoryService.getInventoryKPIs(dateRange);
      case 'financial':
        return this.financialService.getFinancialKPIs(dateRange);
      case 'purchasing':
        return this.purchasingService.getPurchasingKPIs(dateRange);
      default:
        throw new Error(`Unsupported KPI category: ${category}`);
    }
  }

  // Alert Generation
  async generateAlerts(dateRange?: { start: Date; end: Date }): Promise<DashboardAlert[]> {
    const alerts: DashboardAlert[] = [];

    const kpiCategories = ['sales', 'inventory', 'financial', 'purchasing'];
    
    for (const category of kpiCategories) {
      const kpis = await this.calculateKPIs(category, dateRange);
      
      kpis.forEach(kpi => {
        if (kpi.alertThresholds) {
          // Logic to generate alerts based on KPI thresholds
          // This is a simplified example
          const kpiValue = kpi.calculation({});
          
          if (kpiValue <= kpi.alertThresholds.warning) {
            alerts.push({
              id: `alert_${kpi.id}`,
              type: 'threshold',
              severity: kpiValue <= kpi.alertThresholds.critical ? 'critical' : 'medium',
              message: `KPI ${kpi.name} is below expected threshold`,
              relatedWidgetId: `${category}_widget`,
              timestamp: new Date()
            });
          }
        }
      });
    }

    return alerts;
  }
}