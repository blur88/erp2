import { BasePlugin } from '../core/base-plugin';
import { 
  Plugin, 
  Hook, 
  ApiEndpoint, 
  ConfigSchema, 
  DefaultConfig,
  UIComponent,
  Dependency 
} from '../decorators/plugin.decorator';
import { PluginType } from '../../../database/entities/plugin.entity';

/**
 * Inventory Alerts Plugin
 * 
 * Demonstrates a business module plugin that:
 * - Monitors inventory levels and sends alerts when stock is low
 * - Provides configuration for alert thresholds
 * - Exposes API endpoints for alert management
 * - Hooks into inventory events
 * - Provides UI components for alert dashboard
 */
@Plugin({
  identifier: 'inventory-alerts',
  name: 'Inventory Alerts',
  version: '1.2.0',
  description: 'Monitor inventory levels and send alerts when stock runs low',
  author: 'ERP System Team',
  license: 'MIT',
  type: PluginType.BUSINESS,
  tags: ['inventory', 'alerts', 'notifications', 'monitoring'],
})
@ConfigSchema({
  lowStockThreshold: {
    type: 'number',
    required: true,
    default: 10,
    description: 'Minimum stock level before triggering low stock alert',
    validation: {
      min: 1,
      max: 1000,
    },
  },
  criticalStockThreshold: {
    type: 'number',
    required: true,
    default: 5,
    description: 'Critical stock level threshold',
    validation: {
      min: 0,
      max: 50,
    },
  },
  enableEmailAlerts: {
    type: 'boolean',
    default: true,
    description: 'Send email notifications for stock alerts',
  },
  enableSmsAlerts: {
    type: 'boolean',
    default: false,
    description: 'Send SMS notifications for critical stock alerts',
  },
  alertRecipients: {
    type: 'array',
    default: [],
    description: 'List of email addresses to receive alerts',
  },
  alertFrequency: {
    type: 'string',
    default: 'daily',
    description: 'How often to send recurring alerts',
    validation: {
      enum: ['immediate', 'hourly', 'daily', 'weekly'],
    },
  },
  businessHoursOnly: {
    type: 'boolean',
    default: false,
    description: 'Only send alerts during business hours',
  },
  businessHours: {
    type: 'object',
    default: { start: '09:00', end: '17:00' },
    description: 'Business hours configuration',
  },
})
@DefaultConfig({
  lowStockThreshold: 10,
  criticalStockThreshold: 5,
  enableEmailAlerts: true,
  enableSmsAlerts: false,
  alertRecipients: ['warehouse@company.com', 'manager@company.com'],
  alertFrequency: 'daily',
  businessHoursOnly: false,
  businessHours: { start: '09:00', end: '17:00' },
})
@Dependency('notification-service', '^1.0.0', { type: 'plugin', required: false })
export class InventoryAlertsPlugin extends BasePlugin {
  private alertHistory: Map<string, Date> = new Map();
  private monitoringInterval: NodeJS.Timeout | null = null;

  protected async onStart(): Promise<void> {
    this.logger.log('Starting Inventory Alerts Plugin');
    
    const lowThreshold = this.getConfig('lowStockThreshold', 10);
    const criticalThreshold = this.getConfig('criticalStockThreshold', 5);
    
    this.logger.log(`Alert thresholds: Low=${lowThreshold}, Critical=${criticalThreshold}`);
    
    // Start monitoring inventory levels
    await this.startInventoryMonitoring();
    
    // Initialize alert history cleanup
    this.scheduleHistoryCleanup();
  }

  protected async onStop(): Promise<void> {
    this.logger.log('Stopping Inventory Alerts Plugin');
    
    if (this.monitoringInterval) {
      clearInterval(this.monitoringInterval);
      this.monitoringInterval = null;
    }
  }

  /**
   * Hook into inventory stock movements to check levels in real-time
   */
  @Hook('inventory.stock.updated', 100)
  async onStockUpdated(data: {
    productId: string;
    productName: string;
    currentStock: number;
    previousStock: number;
    locationId?: string;
    reason?: string;
  }): Promise<void> {
    this.logger.debug(`Stock updated for product ${data.productId}: ${data.previousStock} -> ${data.currentStock}`);
    
    await this.checkStockLevels({
      productId: data.productId,
      productName: data.productName,
      currentStock: data.currentStock,
      locationId: data.locationId,
    });
  }

  /**
   * Hook into product creation to set up monitoring
   */
  @Hook('inventory.product.created', 50)
  async onProductCreated(data: {
    productId: string;
    productName: string;
    initialStock: number;
  }): Promise<void> {
    this.logger.debug(`New product created: ${data.productName} (${data.productId})`);
    
    if (data.initialStock > 0) {
      await this.checkStockLevels({
        productId: data.productId,
        productName: data.productName,
        currentStock: data.initialStock,
      });
    }
  }

  /**
   * API endpoint to get current stock alerts
   */
  @ApiEndpoint('/inventory-alerts', 'GET', {
    permissions: ['inventory:read'],
  })
  async getCurrentAlerts(): Promise<any> {
    try {
      const alerts = await this.generateCurrentAlerts();
      
      return {
        success: true,
        data: {
          alerts,
          summary: {
            total: alerts.length,
            low: alerts.filter(a => a.severity === 'low').length,
            critical: alerts.filter(a => a.severity === 'critical').length,
          },
          lastUpdated: new Date(),
        },
      };
    } catch (error) {
      this.logger.error('Failed to get current alerts:', error);
      return {
        success: false,
        error: error.message,
      };
    }
  }

  /**
   * API endpoint to get alert configuration
   */
  @ApiEndpoint('/inventory-alerts/config', 'GET', {
    permissions: ['inventory:alerts:read'],
  })
  async getAlertConfig(): Promise<any> {
    return {
      success: true,
      data: {
        lowStockThreshold: this.getConfig('lowStockThreshold'),
        criticalStockThreshold: this.getConfig('criticalStockThreshold'),
        enableEmailAlerts: this.getConfig('enableEmailAlerts'),
        enableSmsAlerts: this.getConfig('enableSmsAlerts'),
        alertFrequency: this.getConfig('alertFrequency'),
        businessHoursOnly: this.getConfig('businessHoursOnly'),
        businessHours: this.getConfig('businessHours'),
      },
    };
  }

  /**
   * API endpoint to test alert system
   */
  @ApiEndpoint('/inventory-alerts/test', 'POST', {
    permissions: ['inventory:alerts:admin'],
  })
  async testAlerts(data: { type?: 'email' | 'sms' | 'all' }): Promise<any> {
    try {
      const testType = data?.type || 'all';
      
      const testAlert = {
        productId: 'TEST-001',
        productName: 'Test Product',
        currentStock: 3,
        severity: 'critical' as const,
        threshold: this.getConfig('criticalStockThreshold', 5),
        message: 'This is a test alert from the Inventory Alerts plugin',
      };

      if (testType === 'email' || testType === 'all') {
        await this.sendEmailAlert([testAlert]);
      }

      if (testType === 'sms' || testType === 'all') {
        await this.sendSmsAlert([testAlert]);
      }

      return {
        success: true,
        message: `Test alert sent via ${testType}`,
        timestamp: new Date(),
      };

    } catch (error) {
      this.logger.error('Failed to send test alert:', error);
      return {
        success: false,
        error: error.message,
      };
    }
  }

  /**
   * UI component for alerts dashboard widget
   */
  @UIComponent('inventory-alerts-widget', 'widget', {
    permissions: ['inventory:read'],
    props: {
      title: 'Stock Alerts',
      refreshInterval: 300000, // 5 minutes
    },
  })
  getAlertsWidget(): any {
    return {
      component: 'InventoryAlertsWidget',
      data: async () => {
        const alerts = await this.generateCurrentAlerts();
        return {
          alerts: alerts.slice(0, 10), // Show top 10 alerts
          summary: {
            total: alerts.length,
            critical: alerts.filter(a => a.severity === 'critical').length,
          },
        };
      },
    };
  }

  /**
   * UI component for alerts management page
   */
  @UIComponent('inventory-alerts-page', 'page', {
    path: '/inventory/alerts',
    permissions: ['inventory:alerts:read'],
  })
  getAlertsPage(): any {
    return {
      component: 'InventoryAlertsPage',
      title: 'Inventory Alerts',
      breadcrumb: [
        { label: 'Inventory', path: '/inventory' },
        { label: 'Alerts', path: '/inventory/alerts' },
      ],
    };
  }

  // Private implementation methods

  private async startInventoryMonitoring(): Promise<void> {
    const frequency = this.getConfig('alertFrequency', 'daily');
    let intervalMs: number;

    switch (frequency) {
      case 'immediate':
        return; // Real-time monitoring via hooks only
      case 'hourly':
        intervalMs = 60 * 60 * 1000; // 1 hour
        break;
      case 'daily':
        intervalMs = 24 * 60 * 60 * 1000; // 24 hours
        break;
      case 'weekly':
        intervalMs = 7 * 24 * 60 * 60 * 1000; // 7 days
        break;
      default:
        intervalMs = 24 * 60 * 60 * 1000; // Default to daily
    }

    this.monitoringInterval = setInterval(async () => {
      try {
        await this.performFullInventoryCheck();
      } catch (error) {
        this.logger.error('Scheduled inventory check failed:', error);
      }
    }, intervalMs);

    this.logger.log(`Inventory monitoring started with ${frequency} frequency`);
  }

  private async performFullInventoryCheck(): Promise<void> {
    this.logger.debug('Performing full inventory check');

    try {
      // This would typically query the database for all products
      // For now, we'll simulate the check
      const lowStockProducts = await this.findLowStockProducts();
      
      if (lowStockProducts.length > 0) {
        const emailAlerts = lowStockProducts.filter(p => p.severity === 'low' || p.severity === 'critical');
        const smsAlerts = lowStockProducts.filter(p => p.severity === 'critical');

        if (this.getConfig('enableEmailAlerts', true) && emailAlerts.length > 0) {
          await this.sendEmailAlert(emailAlerts);
        }

        if (this.getConfig('enableSmsAlerts', false) && smsAlerts.length > 0) {
          await this.sendSmsAlert(smsAlerts);
        }
      }

    } catch (error) {
      this.logger.error('Full inventory check failed:', error);
    }
  }

  private async checkStockLevels(product: {
    productId: string;
    productName: string;
    currentStock: number;
    locationId?: string;
  }): Promise<void> {
    const lowThreshold = this.getConfig('lowStockThreshold', 10);
    const criticalThreshold = this.getConfig('criticalStockThreshold', 5);

    if (product.currentStock <= criticalThreshold) {
      await this.handleCriticalStockAlert(product, criticalThreshold);
    } else if (product.currentStock <= lowThreshold) {
      await this.handleLowStockAlert(product, lowThreshold);
    }
  }

  private async handleLowStockAlert(product: any, threshold: number): Promise<void> {
    const alertKey = `low_${product.productId}`;
    
    // Check if we've already sent an alert recently
    if (this.shouldSkipAlert(alertKey)) {
      return;
    }

    const alert = {
      ...product,
      severity: 'low' as const,
      threshold,
      message: `Low stock alert: ${product.productName} has only ${product.currentStock} units remaining (threshold: ${threshold})`,
    };

    this.logger.warn(`Low stock alert: ${product.productName} (${product.currentStock} units)`);

    if (this.getConfig('enableEmailAlerts', true)) {
      await this.sendEmailAlert([alert]);
    }

    this.recordAlert(alertKey);
  }

  private async handleCriticalStockAlert(product: any, threshold: number): Promise<void> {
    const alertKey = `critical_${product.productId}`;
    
    const alert = {
      ...product,
      severity: 'critical' as const,
      threshold,
      message: `CRITICAL: ${product.productName} is critically low with only ${product.currentStock} units remaining (threshold: ${threshold})`,
    };

    this.logger.error(`Critical stock alert: ${product.productName} (${product.currentStock} units)`);

    if (this.getConfig('enableEmailAlerts', true)) {
      await this.sendEmailAlert([alert]);
    }

    if (this.getConfig('enableSmsAlerts', false)) {
      await this.sendSmsAlert([alert]);
    }

    this.recordAlert(alertKey);
  }

  private async sendEmailAlert(alerts: any[]): Promise<void> {
    try {
      // Check business hours if required
      if (this.getConfig('businessHoursOnly', false) && !this.isBusinessHours()) {
        this.logger.debug('Skipping email alert - outside business hours');
        return;
      }

      const recipients = this.getConfig('alertRecipients', []);
      if (recipients.length === 0) {
        this.logger.warn('No alert recipients configured for email notifications');
        return;
      }

      // This would integrate with the notification service plugin or email service
      this.logger.log(`Sending email alert to ${recipients.length} recipients for ${alerts.length} products`);
      
      // Simulate email sending
      await new Promise(resolve => setTimeout(resolve, 100));
      
      this.logger.log('Email alerts sent successfully');

    } catch (error) {
      this.logger.error('Failed to send email alert:', error);
    }
  }

  private async sendSmsAlert(alerts: any[]): Promise<void> {
    try {
      // Check business hours if required (SMS might be more urgent)
      if (this.getConfig('businessHoursOnly', false) && !this.isBusinessHours()) {
        this.logger.debug('Skipping SMS alert - outside business hours');
        return;
      }

      // This would integrate with SMS service
      this.logger.log(`Sending SMS alert for ${alerts.length} critical stock items`);
      
      // Simulate SMS sending
      await new Promise(resolve => setTimeout(resolve, 200));
      
      this.logger.log('SMS alerts sent successfully');

    } catch (error) {
      this.logger.error('Failed to send SMS alert:', error);
    }
  }

  private async findLowStockProducts(): Promise<any[]> {
    // This would query the actual database
    // For demo purposes, return mock data
    return [
      {
        productId: 'PROD-001',
        productName: 'Widget A',
        currentStock: 3,
        severity: 'critical',
        threshold: this.getConfig('criticalStockThreshold', 5),
      },
      {
        productId: 'PROD-002', 
        productName: 'Widget B',
        currentStock: 8,
        severity: 'low',
        threshold: this.getConfig('lowStockThreshold', 10),
      },
    ];
  }

  private async generateCurrentAlerts(): Promise<any[]> {
    const alerts = await this.findLowStockProducts();
    return alerts.map(alert => ({
      ...alert,
      createdAt: new Date(),
      id: `alert_${alert.productId}_${Date.now()}`,
    }));
  }

  private shouldSkipAlert(alertKey: string): boolean {
    const lastAlert = this.alertHistory.get(alertKey);
    if (!lastAlert) {
      return false;
    }

    const frequency = this.getConfig('alertFrequency', 'daily');
    const now = new Date();
    const timeDiff = now.getTime() - lastAlert.getTime();

    switch (frequency) {
      case 'immediate':
        return false; // Never skip immediate alerts
      case 'hourly':
        return timeDiff < 60 * 60 * 1000; // 1 hour
      case 'daily':
        return timeDiff < 24 * 60 * 60 * 1000; // 24 hours
      case 'weekly':
        return timeDiff < 7 * 24 * 60 * 60 * 1000; // 7 days
      default:
        return timeDiff < 24 * 60 * 60 * 1000; // Default to daily
    }
  }

  private recordAlert(alertKey: string): void {
    this.alertHistory.set(alertKey, new Date());
  }

  private isBusinessHours(): boolean {
    const businessHours = this.getConfig('businessHours', { start: '09:00', end: '17:00' });
    const now = new Date();
    const currentTime = now.getHours() + ':' + now.getMinutes().toString().padStart(2, '0');
    
    return currentTime >= businessHours.start && currentTime <= businessHours.end;
  }

  private scheduleHistoryCleanup(): void {
    // Clean up alert history every 24 hours
    setInterval(() => {
      const now = new Date();
      const oneDayAgo = now.getTime() - 24 * 60 * 60 * 1000;
      
      for (const [key, date] of this.alertHistory.entries()) {
        if (date.getTime() < oneDayAgo) {
          this.alertHistory.delete(key);
        }
      }
      
      this.logger.debug(`Alert history cleanup completed. Entries remaining: ${this.alertHistory.size}`);
    }, 24 * 60 * 60 * 1000); // 24 hours
  }

  protected async onHealthCheck(): Promise<Partial<any>> {
    const alertsCount = (await this.generateCurrentAlerts()).length;
    const isMonitoring = this.monitoringInterval !== null;

    return {
      status: isMonitoring ? 'healthy' : 'degraded',
      message: isMonitoring 
        ? `Monitoring active, ${alertsCount} current alerts`
        : 'Monitoring not active',
      details: {
        activeAlerts: alertsCount,
        monitoringActive: isMonitoring,
        alertHistorySize: this.alertHistory.size,
        configuration: {
          lowThreshold: this.getConfig('lowStockThreshold'),
          criticalThreshold: this.getConfig('criticalStockThreshold'),
          emailEnabled: this.getConfig('enableEmailAlerts'),
          smsEnabled: this.getConfig('enableSmsAlerts'),
        },
      },
    };
  }
}

export default InventoryAlertsPlugin;