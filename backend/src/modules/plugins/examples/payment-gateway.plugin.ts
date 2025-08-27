import { BasePlugin } from '../core/base-plugin';
import { 
  Plugin, 
  Hook, 
  ApiEndpoint, 
  ConfigSchema, 
  DefaultConfig,
  RequirePermission,
  RateLimit 
} from '../decorators/plugin.decorator';
import { PluginType } from '../../../database/entities/plugin.entity';

/**
 * Payment Gateway Integration Plugin
 * 
 * Demonstrates an integration plugin that:
 * - Integrates with external payment providers (Stripe, PayPal, etc.)
 * - Handles payment processing and webhooks
 * - Provides secure API endpoints for payment operations
 * - Hooks into order and invoice events
 * - Implements proper security and rate limiting
 */
@Plugin({
  identifier: 'payment-gateway',
  name: 'Payment Gateway Integration',
  version: '2.1.0',
  description: 'Integrate with external payment providers for secure payment processing',
  author: 'ERP Integration Team',
  license: 'Commercial',
  type: PluginType.INTEGRATION,
  tags: ['payment', 'integration', 'stripe', 'paypal', 'webhook'],
  homepage: 'https://erp-system.com/plugins/payment-gateway',
  repository: 'https://github.com/erp-system/payment-gateway-plugin',
})
@ConfigSchema({
  provider: {
    type: 'string',
    required: true,
    default: 'stripe',
    description: 'Payment provider to use',
    validation: {
      enum: ['stripe', 'paypal', 'square', 'braintree'],
    },
  },
  apiKey: {
    type: 'string',
    required: true,
    description: 'API key for the payment provider (encrypted)',
  },
  secretKey: {
    type: 'string',
    required: true,
    description: 'Secret key for the payment provider (encrypted)',
  },
  webhookSecret: {
    type: 'string',
    required: false,
    description: 'Webhook secret for validating incoming webhooks',
  },
  testMode: {
    type: 'boolean',
    default: true,
    description: 'Enable test mode for development',
  },
  currency: {
    type: 'string',
    default: 'USD',
    description: 'Default currency for payments',
    validation: {
      pattern: '^[A-Z]{3}$',
    },
  },
  minimumAmount: {
    type: 'number',
    default: 0.50,
    description: 'Minimum payment amount',
    validation: {
      min: 0.01,
      max: 1000,
    },
  },
  maximumAmount: {
    type: 'number',
    default: 10000,
    description: 'Maximum payment amount',
    validation: {
      min: 1,
      max: 1000000,
    },
  },
  enableRefunds: {
    type: 'boolean',
    default: true,
    description: 'Enable refund processing',
  },
  enableRecurring: {
    type: 'boolean',
    default: false,
    description: 'Enable recurring payment processing',
  },
  retryFailedPayments: {
    type: 'boolean',
    default: true,
    description: 'Automatically retry failed payments',
  },
  maxRetries: {
    type: 'number',
    default: 3,
    description: 'Maximum number of payment retries',
    validation: {
      min: 0,
      max: 10,
    },
  },
  notificationEmail: {
    type: 'string',
    required: false,
    description: 'Email for payment notifications',
    validation: {
      pattern: '^[^@]+@[^@]+\\.[^@]+$',
    },
  },
})
@DefaultConfig({
  provider: 'stripe',
  testMode: true,
  currency: 'USD',
  minimumAmount: 0.50,
  maximumAmount: 10000,
  enableRefunds: true,
  enableRecurring: false,
  retryFailedPayments: true,
  maxRetries: 3,
})
export class PaymentGatewayPlugin extends BasePlugin {
  private paymentProvider: any = null;
  private webhookHandlers: Map<string, Function> = new Map();

  protected async onStart(): Promise<void> {
    this.logger.log('Starting Payment Gateway Plugin');
    
    const provider = this.getConfig('provider', 'stripe');
    const testMode = this.getConfig('testMode', true);
    
    this.logger.log(`Initializing ${provider} payment provider (Test mode: ${testMode})`);
    
    await this.initializePaymentProvider();
    this.setupWebhookHandlers();
    
    this.logger.log('Payment Gateway Plugin started successfully');
  }

  protected async onStop(): Promise<void> {
    this.logger.log('Stopping Payment Gateway Plugin');
    
    if (this.paymentProvider) {
      // Clean up provider resources
      this.paymentProvider = null;
    }
    
    this.webhookHandlers.clear();
  }

  /**
   * Hook into order creation to set up payment intent
   */
  @Hook('sales.order.created', 100)
  async onOrderCreated(data: {
    orderId: string;
    customerId: string;
    totalAmount: number;
    currency?: string;
    items: any[];
  }): Promise<void> {
    try {
      this.logger.debug(`Order created: ${data.orderId}, Amount: ${data.totalAmount}`);
      
      // Create payment intent for the order
      const paymentIntent = await this.createPaymentIntent({
        orderId: data.orderId,
        customerId: data.customerId,
        amount: data.totalAmount,
        currency: data.currency || this.getConfig('currency', 'USD'),
        description: `Payment for order ${data.orderId}`,
      });

      this.logger.log(`Payment intent created for order ${data.orderId}: ${paymentIntent.id}`);
      
      // Emit event with payment intent details
      await this.context.eventEmitter.emitAsync('payment.intent.created', {
        orderId: data.orderId,
        paymentIntentId: paymentIntent.id,
        clientSecret: paymentIntent.clientSecret,
        amount: paymentIntent.amount,
        currency: paymentIntent.currency,
      });

    } catch (error) {
      this.logger.error(`Failed to create payment intent for order ${data.orderId}:`, error);
      
      // Emit payment error event
      await this.context.eventEmitter.emitAsync('payment.error', {
        orderId: data.orderId,
        error: error.message,
        type: 'intent_creation_failed',
      });
    }
  }

  /**
   * Hook into invoice finalization for payment processing
   */
  @Hook('sales.invoice.finalized', 90)
  async onInvoiceFinalized(data: {
    invoiceId: string;
    customerId: string;
    totalAmount: number;
    dueDate: Date;
    paymentTerms: string;
  }): Promise<void> {
    try {
      this.logger.debug(`Invoice finalized: ${data.invoiceId}, Amount: ${data.totalAmount}`);
      
      // Create payment link for the invoice
      const paymentLink = await this.createPaymentLink({
        invoiceId: data.invoiceId,
        customerId: data.customerId,
        amount: data.totalAmount,
        description: `Payment for invoice ${data.invoiceId}`,
        dueDate: data.dueDate,
      });

      this.logger.log(`Payment link created for invoice ${data.invoiceId}: ${paymentLink.url}`);
      
      // Emit event with payment link
      await this.context.eventEmitter.emitAsync('payment.link.created', {
        invoiceId: data.invoiceId,
        paymentLinkId: paymentLink.id,
        url: paymentLink.url,
        expiresAt: paymentLink.expiresAt,
      });

    } catch (error) {
      this.logger.error(`Failed to create payment link for invoice ${data.invoiceId}:`, error);
    }
  }

  /**
   * Process a payment
   */
  @ApiEndpoint('/payment-gateway/process', 'POST', {
    permissions: ['payment:process'],
    rateLimit: { windowMs: 60000, max: 10 }, // 10 requests per minute
  })
  @RequirePermission('payment:process')
  async processPayment(data: {
    paymentMethodId: string;
    amount: number;
    currency: string;
    orderId?: string;
    invoiceId?: string;
    customerId: string;
    description?: string;
  }): Promise<any> {
    try {
      this.checkReady();
      
      // Validate payment amount
      const minAmount = this.getConfig('minimumAmount', 0.50);
      const maxAmount = this.getConfig('maximumAmount', 10000);
      
      if (data.amount < minAmount || data.amount > maxAmount) {
        return {
          success: false,
          error: `Payment amount must be between ${minAmount} and ${maxAmount}`,
        };
      }

      this.logger.log(`Processing payment: ${data.amount} ${data.currency} for customer ${data.customerId}`);
      
      // Process payment with provider
      const paymentResult = await this.chargePaymentMethod({
        paymentMethodId: data.paymentMethodId,
        amount: data.amount,
        currency: data.currency,
        customerId: data.customerId,
        description: data.description,
        metadata: {
          orderId: data.orderId,
          invoiceId: data.invoiceId,
        },
      });

      if (paymentResult.success) {
        this.logger.log(`Payment processed successfully: ${paymentResult.transactionId}`);
        
        // Emit payment success event
        await this.context.eventEmitter.emitAsync('payment.success', {
          transactionId: paymentResult.transactionId,
          amount: data.amount,
          currency: data.currency,
          customerId: data.customerId,
          orderId: data.orderId,
          invoiceId: data.invoiceId,
          processedAt: new Date(),
        });
      }

      return {
        success: paymentResult.success,
        transactionId: paymentResult.transactionId,
        status: paymentResult.status,
        message: paymentResult.message,
        timestamp: new Date(),
      };

    } catch (error) {
      this.logger.error('Payment processing failed:', error);
      
      // Emit payment error event
      await this.context.eventEmitter.emitAsync('payment.error', {
        amount: data.amount,
        customerId: data.customerId,
        error: error.message,
        type: 'processing_failed',
      });

      return {
        success: false,
        error: error.message,
        timestamp: new Date(),
      };
    }
  }

  /**
   * Process a refund
   */
  @ApiEndpoint('/payment-gateway/refund', 'POST', {
    permissions: ['payment:refund'],
    rateLimit: { windowMs: 60000, max: 5 }, // 5 requests per minute
  })
  @RequirePermission('payment:refund')
  async processRefund(data: {
    transactionId: string;
    amount?: number; // Partial refund if specified
    reason?: string;
  }): Promise<any> {
    try {
      this.checkReady();
      
      const enableRefunds = this.getConfig('enableRefunds', true);
      if (!enableRefunds) {
        return {
          success: false,
          error: 'Refunds are not enabled',
        };
      }

      this.logger.log(`Processing refund for transaction: ${data.transactionId}`);
      
      const refundResult = await this.refundPayment({
        transactionId: data.transactionId,
        amount: data.amount,
        reason: data.reason,
      });

      if (refundResult.success) {
        this.logger.log(`Refund processed successfully: ${refundResult.refundId}`);
        
        // Emit refund success event
        await this.context.eventEmitter.emitAsync('payment.refund.success', {
          originalTransactionId: data.transactionId,
          refundId: refundResult.refundId,
          amount: refundResult.amount,
          reason: data.reason,
          processedAt: new Date(),
        });
      }

      return {
        success: refundResult.success,
        refundId: refundResult.refundId,
        amount: refundResult.amount,
        status: refundResult.status,
        message: refundResult.message,
        timestamp: new Date(),
      };

    } catch (error) {
      this.logger.error('Refund processing failed:', error);
      
      return {
        success: false,
        error: error.message,
        timestamp: new Date(),
      };
    }
  }

  /**
   * Get payment status
   */
  @ApiEndpoint('/payment-gateway/status/:transactionId', 'GET', {
    permissions: ['payment:read'],
  })
  async getPaymentStatus(params: { transactionId: string }): Promise<any> {
    try {
      this.checkReady();
      
      const status = await this.getPaymentDetails(params.transactionId);
      
      return {
        success: true,
        data: status,
      };

    } catch (error) {
      this.logger.error(`Failed to get payment status for ${params.transactionId}:`, error);
      
      return {
        success: false,
        error: error.message,
      };
    }
  }

  /**
   * Webhook endpoint for payment provider notifications
   */
  @ApiEndpoint('/payment-gateway/webhook', 'POST')
  @RateLimit(300000, 100) // 100 requests per 5 minutes
  async handleWebhook(data: any, headers: Record<string, string>): Promise<any> {
    try {
      // Verify webhook signature
      const isValid = await this.verifyWebhookSignature(data, headers);
      if (!isValid) {
        this.logger.warn('Invalid webhook signature received');
        return { status: 'invalid_signature' };
      }

      const eventType = data.type || data.event;
      this.logger.debug(`Received webhook: ${eventType}`);

      // Handle different webhook events
      const handler = this.webhookHandlers.get(eventType);
      if (handler) {
        await handler(data);
      } else {
        this.logger.debug(`No handler found for webhook event: ${eventType}`);
      }

      return { status: 'received' };

    } catch (error) {
      this.logger.error('Webhook processing failed:', error);
      return { status: 'error', error: error.message };
    }
  }

  /**
   * Get payment gateway configuration (public info only)
   */
  @ApiEndpoint('/payment-gateway/config', 'GET', {
    permissions: ['payment:read'],
  })
  async getPublicConfig(): Promise<any> {
    return {
      success: true,
      data: {
        provider: this.getConfig('provider'),
        currency: this.getConfig('currency'),
        minimumAmount: this.getConfig('minimumAmount'),
        maximumAmount: this.getConfig('maximumAmount'),
        testMode: this.getConfig('testMode'),
        enableRefunds: this.getConfig('enableRefunds'),
        enableRecurring: this.getConfig('enableRecurring'),
      },
    };
  }

  // Private implementation methods

  private async initializePaymentProvider(): Promise<void> {
    const provider = this.getConfig('provider', 'stripe');
    const apiKey = this.getConfig('apiKey');
    const testMode = this.getConfig('testMode', true);

    if (!apiKey) {
      throw new Error('Payment provider API key is required');
    }

    switch (provider) {
      case 'stripe':
        this.paymentProvider = await this.initializeStripe(apiKey, testMode);
        break;
      case 'paypal':
        this.paymentProvider = await this.initializePayPal(apiKey, testMode);
        break;
      case 'square':
        this.paymentProvider = await this.initializeSquare(apiKey, testMode);
        break;
      default:
        throw new Error(`Unsupported payment provider: ${provider}`);
    }

    this.logger.log(`${provider} payment provider initialized`);
  }

  private async initializeStripe(apiKey: string, testMode: boolean): Promise<any> {
    // Initialize Stripe SDK
    return {
      provider: 'stripe',
      testMode,
      // Mock Stripe client
      createPaymentIntent: async (params: any) => ({
        id: `pi_${Date.now()}`,
        clientSecret: `pi_${Date.now()}_secret`,
        amount: params.amount * 100, // Stripe uses cents
        currency: params.currency,
        status: 'requires_payment_method',
      }),
      charge: async (params: any) => ({
        id: `ch_${Date.now()}`,
        amount: params.amount * 100,
        currency: params.currency,
        status: 'succeeded',
      }),
      refund: async (params: any) => ({
        id: `re_${Date.now()}`,
        amount: params.amount * 100,
        status: 'succeeded',
      }),
    };
  }

  private async initializePayPal(apiKey: string, testMode: boolean): Promise<any> {
    // Initialize PayPal SDK
    return {
      provider: 'paypal',
      testMode,
      // Mock PayPal client
    };
  }

  private async initializeSquare(apiKey: string, testMode: boolean): Promise<any> {
    // Initialize Square SDK
    return {
      provider: 'square',
      testMode,
      // Mock Square client
    };
  }

  private setupWebhookHandlers(): void {
    // Stripe webhook handlers
    this.webhookHandlers.set('payment_intent.succeeded', async (data: any) => {
      await this.handlePaymentSucceeded(data);
    });

    this.webhookHandlers.set('payment_intent.payment_failed', async (data: any) => {
      await this.handlePaymentFailed(data);
    });

    this.webhookHandlers.set('charge.dispute.created', async (data: any) => {
      await this.handleChargebackCreated(data);
    });

    // PayPal webhook handlers
    this.webhookHandlers.set('PAYMENT.CAPTURE.COMPLETED', async (data: any) => {
      await this.handlePaymentSucceeded(data);
    });
  }

  private async createPaymentIntent(params: {
    orderId: string;
    customerId: string;
    amount: number;
    currency: string;
    description: string;
  }): Promise<any> {
    if (!this.paymentProvider) {
      throw new Error('Payment provider not initialized');
    }

    return await this.paymentProvider.createPaymentIntent({
      amount: params.amount,
      currency: params.currency,
      customer: params.customerId,
      description: params.description,
      metadata: {
        orderId: params.orderId,
      },
    });
  }

  private async createPaymentLink(params: {
    invoiceId: string;
    customerId: string;
    amount: number;
    description: string;
    dueDate: Date;
  }): Promise<any> {
    // Create payment link (mock implementation)
    return {
      id: `plink_${Date.now()}`,
      url: `https://checkout.example.com/pay/${params.invoiceId}`,
      expiresAt: params.dueDate,
    };
  }

  private async chargePaymentMethod(params: {
    paymentMethodId: string;
    amount: number;
    currency: string;
    customerId: string;
    description?: string;
    metadata?: any;
  }): Promise<any> {
    if (!this.paymentProvider) {
      throw new Error('Payment provider not initialized');
    }

    try {
      const result = await this.paymentProvider.charge({
        paymentMethod: params.paymentMethodId,
        amount: params.amount,
        currency: params.currency,
        customer: params.customerId,
        description: params.description,
        metadata: params.metadata,
      });

      return {
        success: true,
        transactionId: result.id,
        status: result.status,
        message: 'Payment processed successfully',
      };

    } catch (error) {
      this.logger.error('Payment charge failed:', error);
      return {
        success: false,
        error: error.message,
        status: 'failed',
      };
    }
  }

  private async refundPayment(params: {
    transactionId: string;
    amount?: number;
    reason?: string;
  }): Promise<any> {
    if (!this.paymentProvider) {
      throw new Error('Payment provider not initialized');
    }

    try {
      const result = await this.paymentProvider.refund({
        charge: params.transactionId,
        amount: params.amount ? params.amount * 100 : undefined, // Partial refund
        reason: params.reason,
      });

      return {
        success: true,
        refundId: result.id,
        amount: result.amount / 100,
        status: result.status,
        message: 'Refund processed successfully',
      };

    } catch (error) {
      this.logger.error('Refund failed:', error);
      return {
        success: false,
        error: error.message,
        status: 'failed',
      };
    }
  }

  private async getPaymentDetails(transactionId: string): Promise<any> {
    // Mock payment details
    return {
      transactionId,
      status: 'succeeded',
      amount: 99.99,
      currency: 'USD',
      createdAt: new Date(),
      paymentMethod: {
        type: 'card',
        last4: '4242',
        brand: 'visa',
      },
    };
  }

  private async verifyWebhookSignature(data: any, headers: Record<string, string>): Promise<boolean> {
    const webhookSecret = this.getConfig('webhookSecret');
    if (!webhookSecret) {
      this.logger.warn('No webhook secret configured - skipping signature verification');
      return true; // Allow in development
    }

    // Implement actual signature verification based on provider
    // This is a mock implementation
    return true;
  }

  private async handlePaymentSucceeded(data: any): Promise<void> {
    this.logger.log(`Payment succeeded: ${data.id}`);
    
    await this.context.eventEmitter.emitAsync('payment.webhook.success', {
      transactionId: data.id,
      amount: data.amount / 100,
      currency: data.currency,
      timestamp: new Date(),
    });
  }

  private async handlePaymentFailed(data: any): Promise<void> {
    this.logger.warn(`Payment failed: ${data.id}`);
    
    await this.context.eventEmitter.emitAsync('payment.webhook.failed', {
      transactionId: data.id,
      error: data.last_payment_error?.message,
      timestamp: new Date(),
    });

    // Retry logic if enabled
    const retryEnabled = this.getConfig('retryFailedPayments', true);
    if (retryEnabled) {
      await this.schedulePaymentRetry(data.id);
    }
  }

  private async handleChargebackCreated(data: any): Promise<void> {
    this.logger.error(`Chargeback created: ${data.id}`);
    
    await this.context.eventEmitter.emitAsync('payment.chargeback.created', {
      chargeId: data.charge,
      disputeId: data.id,
      amount: data.amount / 100,
      reason: data.reason,
      timestamp: new Date(),
    });

    // Send notification email if configured
    const notificationEmail = this.getConfig('notificationEmail');
    if (notificationEmail) {
      // Send chargeback notification
      this.logger.log(`Chargeback notification sent to: ${notificationEmail}`);
    }
  }

  private async schedulePaymentRetry(transactionId: string): Promise<void> {
    const maxRetries = this.getConfig('maxRetries', 3);
    // Implementation would schedule retry attempts
    this.logger.log(`Scheduling payment retry for: ${transactionId} (max retries: ${maxRetries})`);
  }

  protected async onHealthCheck(): Promise<Partial<any>> {
    const isProviderReady = this.paymentProvider !== null;
    const provider = this.getConfig('provider', 'stripe');
    const testMode = this.getConfig('testMode', true);

    return {
      status: isProviderReady ? 'healthy' : 'unhealthy',
      message: isProviderReady 
        ? `${provider} payment provider ready`
        : 'Payment provider not initialized',
      details: {
        provider,
        testMode,
        providerReady: isProviderReady,
        webhookHandlers: this.webhookHandlers.size,
        configuration: {
          currency: this.getConfig('currency'),
          refundsEnabled: this.getConfig('enableRefunds'),
          recurringEnabled: this.getConfig('enableRecurring'),
          retryEnabled: this.getConfig('retryFailedPayments'),
        },
      },
    };
  }
}

export default PaymentGatewayPlugin;