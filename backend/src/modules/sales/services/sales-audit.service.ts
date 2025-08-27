import { Injectable } from '@nestjs/common';
import { InjectRepository } from '@nestjs/typeorm';
import { Repository } from 'typeorm';
import { AuditLog } from '../../../common/audit/audit-log.entity';

export enum SalesAuditAction {
  // Customer actions
  CUSTOMER_CREATED = 'customer_created',
  CUSTOMER_UPDATED = 'customer_updated',
  CUSTOMER_ACTIVATED = 'customer_activated',
  CUSTOMER_DEACTIVATED = 'customer_deactivated',
  CUSTOMER_SUSPENDED = 'customer_suspended',
  CUSTOMER_CREDIT_LIMIT_UPDATED = 'customer_credit_limit_updated',
  
  // Sales order actions
  SALES_ORDER_CREATED = 'sales_order_created',
  SALES_ORDER_UPDATED = 'sales_order_updated',
  SALES_ORDER_CONFIRMED = 'sales_order_confirmed',
  SALES_ORDER_SHIPPED = 'sales_order_shipped',
  SALES_ORDER_DELIVERED = 'sales_order_delivered',
  SALES_ORDER_COMPLETED = 'sales_order_completed',
  SALES_ORDER_CANCELLED = 'sales_order_cancelled',
  
  // Invoice actions
  INVOICE_CREATED = 'invoice_created',
  INVOICE_UPDATED = 'invoice_updated',
  INVOICE_SENT = 'invoice_sent',
  INVOICE_PAYMENT_ALLOCATED = 'invoice_payment_allocated',
  INVOICE_VOIDED = 'invoice_voided',
  INVOICE_CREDIT_NOTE_CREATED = 'invoice_credit_note_created',
  
  // Payment actions
  PAYMENT_RECORDED = 'payment_recorded',
  PAYMENT_COMPLETED = 'payment_completed',
  PAYMENT_FAILED = 'payment_failed',
  PAYMENT_CANCELLED = 'payment_cancelled',
  PAYMENT_REFUNDED = 'payment_refunded',
  
  // Quotation actions
  QUOTATION_CREATED = 'quotation_created',
  QUOTATION_UPDATED = 'quotation_updated',
  QUOTATION_SENT = 'quotation_sent',
  QUOTATION_ACCEPTED = 'quotation_accepted',
  QUOTATION_REJECTED = 'quotation_rejected',
  QUOTATION_CONVERTED = 'quotation_converted',
  
  // Credit management actions
  CREDIT_CHECK_PERFORMED = 'credit_check_performed',
  CREDIT_INCREASE_REQUESTED = 'credit_increase_requested',
  CREDIT_INCREASE_APPROVED = 'credit_increase_approved',
  CREDIT_INCREASE_REJECTED = 'credit_increase_rejected',
  CREDIT_HOLD_PLACED = 'credit_hold_placed',
  CREDIT_HOLD_RELEASED = 'credit_hold_released',
}

export interface SalesAuditData {
  action: SalesAuditAction;
  entityType: 'customer' | 'sales_order' | 'invoice' | 'payment' | 'quotation' | 'credit';
  entityId: string;
  userId?: string;
  details?: Record<string, any>;
  oldValues?: Record<string, any>;
  newValues?: Record<string, any>;
  metadata?: Record<string, any>;
}

@Injectable()
export class SalesAuditService {
  constructor(
    @InjectRepository(AuditLog)
    private readonly auditLogRepository: Repository<AuditLog>,
  ) {}

  async logAction(auditData: SalesAuditData): Promise<AuditLog> {
    const auditLog = this.auditLogRepository.create({
      action: auditData.action,
      entityType: auditData.entityType,
      entityId: auditData.entityId,
      userId: auditData.userId,
      details: auditData.details,
      oldValues: auditData.oldValues,
      newValues: auditData.newValues,
      metadata: {
        ...auditData.metadata,
        module: 'sales',
        timestamp: new Date().toISOString(),
      },
      ipAddress: '0.0.0.0', // This would be passed from the request context
      userAgent: 'ERP-System', // This would be passed from the request context
    });

    return this.auditLogRepository.save(auditLog);
  }

  // Customer audit methods
  async logCustomerCreated(customerId: string, customerData: any, userId?: string): Promise<AuditLog> {
    return this.logAction({
      action: SalesAuditAction.CUSTOMER_CREATED,
      entityType: 'customer',
      entityId: customerId,
      userId,
      newValues: customerData,
      details: {
        customerCode: customerData.customerCode,
        name: customerData.name,
        type: customerData.type,
      },
    });
  }

  async logCustomerUpdated(
    customerId: string, 
    oldValues: any, 
    newValues: any, 
    userId?: string,
  ): Promise<AuditLog> {
    return this.logAction({
      action: SalesAuditAction.CUSTOMER_UPDATED,
      entityType: 'customer',
      entityId: customerId,
      userId,
      oldValues,
      newValues,
      details: {
        updatedFields: Object.keys(newValues),
      },
    });
  }

  async logCustomerStatusChange(
    customerId: string, 
    action: SalesAuditAction,
    oldStatus: string,
    newStatus: string,
    userId?: string,
    reason?: string,
  ): Promise<AuditLog> {
    return this.logAction({
      action,
      entityType: 'customer',
      entityId: customerId,
      userId,
      oldValues: { status: oldStatus },
      newValues: { status: newStatus },
      details: {
        reason,
        statusChange: `${oldStatus} → ${newStatus}`,
      },
    });
  }

  async logCreditLimitUpdate(
    customerId: string,
    oldLimit: number,
    newLimit: number,
    userId?: string,
    reason?: string,
  ): Promise<AuditLog> {
    return this.logAction({
      action: SalesAuditAction.CUSTOMER_CREDIT_LIMIT_UPDATED,
      entityType: 'customer',
      entityId: customerId,
      userId,
      oldValues: { creditLimit: oldLimit },
      newValues: { creditLimit: newLimit },
      details: {
        reason,
        changeAmount: newLimit - oldLimit,
        changePercentage: oldLimit > 0 ? ((newLimit - oldLimit) / oldLimit) * 100 : 0,
      },
    });
  }

  // Sales order audit methods
  async logSalesOrderCreated(
    orderId: string, 
    orderData: any, 
    userId?: string,
  ): Promise<AuditLog> {
    return this.logAction({
      action: SalesAuditAction.SALES_ORDER_CREATED,
      entityType: 'sales_order',
      entityId: orderId,
      userId,
      newValues: orderData,
      details: {
        orderNumber: orderData.orderNumber,
        customerId: orderData.customerId,
        totalAmount: orderData.totalAmount,
        itemsCount: orderData.items?.length || 0,
      },
    });
  }

  async logSalesOrderStatusChange(
    orderId: string,
    action: SalesAuditAction,
    oldStatus: string,
    newStatus: string,
    userId?: string,
    additionalData?: any,
  ): Promise<AuditLog> {
    return this.logAction({
      action,
      entityType: 'sales_order',
      entityId: orderId,
      userId,
      oldValues: { status: oldStatus },
      newValues: { status: newStatus },
      details: {
        statusChange: `${oldStatus} → ${newStatus}`,
        ...additionalData,
      },
    });
  }

  // Invoice audit methods
  async logInvoiceCreated(
    invoiceId: string,
    invoiceData: any,
    userId?: string,
  ): Promise<AuditLog> {
    return this.logAction({
      action: SalesAuditAction.INVOICE_CREATED,
      entityType: 'invoice',
      entityId: invoiceId,
      userId,
      newValues: invoiceData,
      details: {
        invoiceNumber: invoiceData.invoiceNumber,
        customerId: invoiceData.customerId,
        totalAmount: invoiceData.totalAmount,
        type: invoiceData.type,
      },
    });
  }

  async logInvoicePaymentAllocated(
    invoiceId: string,
    paymentId: string,
    amount: number,
    userId?: string,
  ): Promise<AuditLog> {
    return this.logAction({
      action: SalesAuditAction.INVOICE_PAYMENT_ALLOCATED,
      entityType: 'invoice',
      entityId: invoiceId,
      userId,
      details: {
        paymentId,
        allocatedAmount: amount,
      },
    });
  }

  async logInvoiceVoided(
    invoiceId: string,
    reason: string,
    userId?: string,
  ): Promise<AuditLog> {
    return this.logAction({
      action: SalesAuditAction.INVOICE_VOIDED,
      entityType: 'invoice',
      entityId: invoiceId,
      userId,
      details: {
        reason,
        voidedAt: new Date().toISOString(),
      },
    });
  }

  // Payment audit methods
  async logPaymentRecorded(
    paymentId: string,
    paymentData: any,
    userId?: string,
  ): Promise<AuditLog> {
    return this.logAction({
      action: SalesAuditAction.PAYMENT_RECORDED,
      entityType: 'payment',
      entityId: paymentId,
      userId,
      newValues: paymentData,
      details: {
        paymentNumber: paymentData.paymentNumber,
        customerId: paymentData.customerId,
        invoiceId: paymentData.invoiceId,
        amount: paymentData.amount,
        paymentMethod: paymentData.paymentMethod,
      },
    });
  }

  async logPaymentStatusChange(
    paymentId: string,
    action: SalesAuditAction,
    oldStatus: string,
    newStatus: string,
    userId?: string,
    reason?: string,
  ): Promise<AuditLog> {
    return this.logAction({
      action,
      entityType: 'payment',
      entityId: paymentId,
      userId,
      oldValues: { status: oldStatus },
      newValues: { status: newStatus },
      details: {
        statusChange: `${oldStatus} → ${newStatus}`,
        reason,
      },
    });
  }

  async logPaymentRefunded(
    paymentId: string,
    originalPaymentId: string,
    refundAmount: number,
    userId?: string,
    reason?: string,
  ): Promise<AuditLog> {
    return this.logAction({
      action: SalesAuditAction.PAYMENT_REFUNDED,
      entityType: 'payment',
      entityId: paymentId,
      userId,
      details: {
        originalPaymentId,
        refundAmount,
        reason,
      },
    });
  }

  // Quotation audit methods
  async logQuotationCreated(
    quotationId: string,
    quotationData: any,
    userId?: string,
  ): Promise<AuditLog> {
    return this.logAction({
      action: SalesAuditAction.QUOTATION_CREATED,
      entityType: 'quotation',
      entityId: quotationId,
      userId,
      newValues: quotationData,
      details: {
        quotationNumber: quotationData.quotationNumber,
        customerId: quotationData.customerId,
        totalAmount: quotationData.totalAmount,
        validUntil: quotationData.validUntil,
      },
    });
  }

  async logQuotationStatusChange(
    quotationId: string,
    action: SalesAuditAction,
    oldStatus: string,
    newStatus: string,
    userId?: string,
    additionalData?: any,
  ): Promise<AuditLog> {
    return this.logAction({
      action,
      entityType: 'quotation',
      entityId: quotationId,
      userId,
      oldValues: { status: oldStatus },
      newValues: { status: newStatus },
      details: {
        statusChange: `${oldStatus} → ${newStatus}`,
        ...additionalData,
      },
    });
  }

  async logQuotationConverted(
    quotationId: string,
    salesOrderId: string,
    userId?: string,
  ): Promise<AuditLog> {
    return this.logAction({
      action: SalesAuditAction.QUOTATION_CONVERTED,
      entityType: 'quotation',
      entityId: quotationId,
      userId,
      details: {
        salesOrderId,
        convertedAt: new Date().toISOString(),
      },
    });
  }

  // Credit management audit methods
  async logCreditCheck(
    customerId: string,
    amount: number,
    approved: boolean,
    availableCredit: number,
    userId?: string,
  ): Promise<AuditLog> {
    return this.logAction({
      action: SalesAuditAction.CREDIT_CHECK_PERFORMED,
      entityType: 'credit',
      entityId: customerId,
      userId,
      details: {
        requestedAmount: amount,
        approved,
        availableCredit,
        checkResult: approved ? 'APPROVED' : 'DENIED',
      },
    });
  }

  async logCreditIncreaseRequest(
    customerId: string,
    requestId: string,
    currentLimit: number,
    requestedLimit: number,
    userId?: string,
    reason?: string,
  ): Promise<AuditLog> {
    return this.logAction({
      action: SalesAuditAction.CREDIT_INCREASE_REQUESTED,
      entityType: 'credit',
      entityId: customerId,
      userId,
      details: {
        requestId,
        currentLimit,
        requestedLimit,
        increaseAmount: requestedLimit - currentLimit,
        reason,
      },
    });
  }

  async logCreditIncreaseDecision(
    customerId: string,
    requestId: string,
    action: SalesAuditAction,
    decision: 'approved' | 'rejected',
    userId?: string,
    comments?: string,
  ): Promise<AuditLog> {
    return this.logAction({
      action,
      entityType: 'credit',
      entityId: customerId,
      userId,
      details: {
        requestId,
        decision,
        comments,
        decidedAt: new Date().toISOString(),
      },
    });
  }

  async logCreditHoldAction(
    customerId: string,
    holdId: string,
    action: SalesAuditAction,
    amount: number,
    userId?: string,
    reason?: string,
  ): Promise<AuditLog> {
    return this.logAction({
      action,
      entityType: 'credit',
      entityId: customerId,
      userId,
      details: {
        holdId,
        amount,
        reason,
        actionType: action === SalesAuditAction.CREDIT_HOLD_PLACED ? 'HOLD_PLACED' : 'HOLD_RELEASED',
      },
    });
  }

  // Query methods for audit history
  async getEntityAuditHistory(
    entityType: string,
    entityId: string,
    limit: number = 50,
  ): Promise<AuditLog[]> {
    return this.auditLogRepository.find({
      where: { entityType, entityId },
      order: { createdAt: 'DESC' },
      take: limit,
    });
  }

  async getUserAuditHistory(
    userId: string,
    limit: number = 100,
  ): Promise<AuditLog[]> {
    return this.auditLogRepository.find({
      where: { 
        userId,
        metadata: { module: 'sales' } as any,
      },
      order: { createdAt: 'DESC' },
      take: limit,
    });
  }

  async getSalesAuditSummary(
    fromDate?: Date,
    toDate?: Date,
  ): Promise<{
    totalActions: number;
    actionsByType: Record<string, number>;
    actionsByUser: Record<string, number>;
    recentActions: AuditLog[];
  }> {
    let query = this.auditLogRepository
      .createQueryBuilder('audit')
      .where("JSON_EXTRACT(audit.metadata, '$.module') = :module", { module: 'sales' });

    if (fromDate) {
      query = query.andWhere('audit.createdAt >= :fromDate', { fromDate });
    }
    if (toDate) {
      query = query.andWhere('audit.createdAt <= :toDate', { toDate });
    }

    const [logs, totalActions] = await query
      .orderBy('audit.createdAt', 'DESC')
      .getManyAndCount();

    const actionsByType: Record<string, number> = {};
    const actionsByUser: Record<string, number> = {};

    logs.forEach(log => {
      actionsByType[log.action] = (actionsByType[log.action] || 0) + 1;
      if (log.userId) {
        actionsByUser[log.userId] = (actionsByUser[log.userId] || 0) + 1;
      }
    });

    return {
      totalActions,
      actionsByType,
      actionsByUser,
      recentActions: logs.slice(0, 20),
    };
  }
}