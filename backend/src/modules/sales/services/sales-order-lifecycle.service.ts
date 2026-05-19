import {
  BadRequestException,
  ConflictException,
  Injectable,
  Logger,
} from '@nestjs/common';
import { InjectRepository } from '@nestjs/typeorm';
import { ILike, Repository } from 'typeorm';

import { BulkOperationUtil, BulkOperationResponse, ValidationUtil } from '../../../common/utils/validation.util';
import { Customer } from '../../../database/entities/customer.entity';
import { Invoice, InvoiceStatus } from '../../../database/entities/invoice.entity';
import { Payment } from '../../../database/entities/payment.entity';
import { SalesOrderItem } from '../../../database/entities/sales-order-item.entity';
import { SalesOrder } from '../../../database/entities/sales-order.entity';
import { StockMovementService } from '../../../modules/inventory/services/stock-movement.service';
import { AuditLogService } from '../../audit-logs/services';
import { InventoryIntegrationService } from './inventory-integration.service';
import { mapSalesOrderToResponseDto } from './sales-order.mapper';
import { SalesOrderResponseDto } from '../dto/sales-order.dto';

@Injectable()
export class SalesOrderLifecycleService {
  private readonly logger = new Logger(SalesOrderLifecycleService.name);

  constructor(
    @InjectRepository(SalesOrder)
    private readonly salesOrderRepository: Repository<SalesOrder>,
    @InjectRepository(SalesOrderItem)
    private readonly salesOrderItemRepository: Repository<SalesOrderItem>,
    @InjectRepository(Customer)
    private readonly customerRepository: Repository<Customer>,
    @InjectRepository(Invoice)
    private readonly invoiceRepository: Repository<Invoice>,
    private readonly inventoryIntegrationService: InventoryIntegrationService,
    private readonly stockMovementService: StockMovementService,
    private readonly auditLogService: AuditLogService,
  ) {}

  async assertItemsNotLocked(id: string): Promise<void> {
    const order = await this.salesOrderRepository.findOne({ where: { id } });
    if (!order) {
      throw new BadRequestException('Sales order not found');
    }

    if (Number(order.paidAmount || 0) > 0) {
      throw new BadRequestException(
        'Cannot edit sales order items that have been paid. Please unpay first.',
      );
    }

    if (order.isFulfilled) {
      throw new BadRequestException(
        'Cannot edit sales order items that have been fulfilled. Please unfulfill first.',
      );
    }
  }

  async syncChildHeaderFromSalesOrder(order: SalesOrder): Promise<void> {
    try {
      const invoices = await this.invoiceRepository.find({
        where: { salesOrderId: order.id },
      });

      for (const invoice of invoices) {
        if (invoice.status === InvoiceStatus.PAID || invoice.status === InvoiceStatus.PARTIAL_PAID) {
          continue;
        }

        invoice.customerId = order.customerId;
        invoice.notes = order.notes;
        await this.invoiceRepository.save(invoice);
      }
    } catch (error) {
      this.logger.error(
        `Failed to sync child headers for sales order ${order.orderNumber}: ${error.message}`,
      );
    }
  }

  async delete(
    id: string,
    userId: string | undefined,
    username: string | undefined,
    findPreviousOrder: (currentOrderNumber: string) => Promise<SalesOrderResponseDto | null>,
  ): Promise<{ deletedOrderNumber: string; previousOrder: SalesOrderResponseDto | null }> {
    const order = await this.salesOrderRepository.findOne({ where: { id } });
    if (!order) {
      throw new BadRequestException('Sales order not found');
    }

    if (order.isFulfilled) {
      throw new BadRequestException(
        'Cannot delete sales order that has been fulfilled. Please unfulfill first.',
      );
    }

    if (Number(order.paidAmount || 0) > 0) {
      throw new BadRequestException(
        'Cannot delete sales order that has been paid. Please unpay first.',
      );
    }

    const previousOrder = await findPreviousOrder(order.orderNumber);

    await this.inventoryIntegrationService.releaseReservation(id);

    try {
      const associatedInvoices = await this.invoiceRepository.find({
        where: { salesOrderId: id },
      });

      if (associatedInvoices.length > 0) {
        await this.invoiceRepository.softDelete(associatedInvoices.map((invoice) => invoice.id));

        for (const invoice of associatedInvoices) {
          await this.auditLogService.log('DELETE', 'Invoice', `Deleted invoice: ${invoice.invoiceNumber} (cascaded from sales order ${order.orderNumber})`, {
            entityId: invoice.id,
            userId: userId || 'system',
            username,
            oldValues: {
              invoiceNumber: invoice.invoiceNumber,
              salesOrderId: id,
              totalAmount: invoice.totalAmount,
            },
          });
        }
      }
    } catch (error) {
      this.logger.error(`Failed to auto-delete invoices for sales order ${order.orderNumber}: ${error.message}`);
    }

    try {
      const paymentRepository = this.salesOrderRepository.manager.getRepository(Payment);
      const associatedPayments = await paymentRepository.find({
        where: {
          customerId: order.customerId,
          notes: ILike(`%sales order ${order.orderNumber}%`),
        },
      });

      if (associatedPayments.length > 0) {
        await paymentRepository.softDelete(associatedPayments.map((payment) => payment.id));

        for (const payment of associatedPayments) {
          await this.auditLogService.log('DELETE', 'Payment', `Deleted payment: ${payment.paymentNumber} (cascaded from sales order ${order.orderNumber})`, {
            entityId: payment.id,
            userId: userId || 'system',
            username,
            oldValues: {
              paymentNumber: payment.paymentNumber,
              salesOrderId: id,
              amount: payment.amount,
            },
          });
        }
      }
    } catch (error) {
      this.logger.error(`Failed to auto-delete payments for sales order ${order.orderNumber}: ${error.message}`);
    }

    await this.salesOrderRepository.softDelete(id);

    await this.auditLogService.log('DELETE', 'SalesOrder', `Deleted sales order: ${order.orderNumber}`, {
      entityId: id,
      userId: userId || 'system',
      username,
      oldValues: {
        orderNumber: order.orderNumber,
        customerId: order.customerId,
        totalAmount: order.totalAmount,
      },
    });

    return {
      deletedOrderNumber: order.orderNumber,
      previousOrder,
    };
  }

  async restore(id: string, userId?: string, username?: string): Promise<SalesOrderResponseDto> {
    const order = await this.salesOrderRepository.findOne({
      where: { id },
      withDeleted: true,
      relations: { customer: true, items: { product: true } },
    });

    ValidationUtil.validateForRestore(order, 'Sales order', id);

    await this.salesOrderRepository.restore(id);

    try {
      const associatedInvoices = await this.invoiceRepository.find({
        where: { salesOrderId: id },
        withDeleted: true,
      });

      const softDeletedInvoices = associatedInvoices.filter((invoice) => invoice.deletedAt !== null);
      if (softDeletedInvoices.length > 0) {
        await this.invoiceRepository.restore(softDeletedInvoices.map((invoice) => invoice.id));

        for (const invoice of softDeletedInvoices) {
          await this.auditLogService.log('RESTORE', 'Invoice', `Restored invoice: ${invoice.invoiceNumber} (cascaded from sales order ${order.orderNumber})`, {
            entityId: invoice.id,
            userId: userId || 'system',
            username,
            newValues: {
              invoiceNumber: invoice.invoiceNumber,
              salesOrderId: id,
              totalAmount: invoice.totalAmount,
            },
          });
        }
      }
    } catch (error) {
      this.logger.error(`Failed to auto-restore invoices for sales order ${order.orderNumber}: ${error.message}`);
    }

    try {
      const paymentRepository = this.salesOrderRepository.manager.getRepository(Payment);
      const invoices = await this.invoiceRepository.find({
        where: { salesOrderId: id },
        withDeleted: true,
      });

      if (invoices.length > 0) {
        const invoiceIds = invoices.map((invoice) => invoice.id);
        const associatedPayments = await paymentRepository
          .createQueryBuilder('payment')
          .where('payment.invoiceId IN (:...invoiceIds)', { invoiceIds })
          .withDeleted()
          .getMany();

        const softDeletedPayments = associatedPayments.filter((payment) => payment.deletedAt !== null);
        if (softDeletedPayments.length > 0) {
          await paymentRepository.restore(softDeletedPayments.map((payment) => payment.id));

          for (const payment of softDeletedPayments) {
            await this.auditLogService.log('RESTORE', 'Payment', `Restored payment: ${payment.paymentNumber} (cascaded from sales order ${order.orderNumber})`, {
              entityId: payment.id,
              userId: userId || 'system',
              username,
              newValues: {
                paymentNumber: payment.paymentNumber,
                salesOrderId: id,
                amount: payment.amount,
              },
            });
          }
        }
      }
    } catch (error) {
      this.logger.error(`Failed to auto-restore payments for sales order ${order.orderNumber}: ${error.message}`);
    }

    const restoredOrder = await this.salesOrderRepository.findOne({
      where: { id },
      relations: { customer: true, items: { product: true } },
    });

    await this.auditLogService.log('RESTORE', 'SalesOrder', `Restored sales order: ${order.orderNumber}`, {
      entityId: id,
      userId: userId || 'system',
      username,
      newValues: {
        orderNumber: order.orderNumber,
        customerId: order.customerId,
        totalAmount: order.totalAmount,
      },
    });

    return mapSalesOrderToResponseDto(restoredOrder);
  }

  async bulkRestore(ids: string[], userId?: string, username?: string): Promise<BulkOperationResponse> {
    if (!ids || ids.length === 0) {
      return BulkOperationUtil.createResponse('restored', 'sales order', 0, []);
    }

    const failedItems = [];
    let successCount = 0;

    for (const id of ids) {
      try {
        await this.restore(id, userId, username);
        successCount++;
      } catch (error) {
        BulkOperationUtil.addFailure(failedItems, id, error.message, 'RESTORE_ERROR');
      }
    }

    return BulkOperationUtil.createResponse('restored', 'sales order', successCount, failedItems);
  }

  async permanentDelete(id: string, userId?: string, username?: string): Promise<void> {
    const order = await this.salesOrderRepository.findOne({
      where: { id },
      relations: { customer: true, items: true },
      withDeleted: true,
    });

    ValidationUtil.validateForPermanentDelete(order, 'Sales order', id);

    const isCompleted = order.isFulfilled;
    const invoices = await this.invoiceRepository.find({
      where: { salesOrderId: id },
      withDeleted: true,
    });
    const hasPayments = invoices.some((invoice) => Number(invoice.paidAmount) > 0);

    ValidationUtil.validateFinancialEntityDeletion('sales order', hasPayments, false, isCompleted);

    if (invoices.length > 0) {
      try {
        for (const invoice of invoices) {
          await this.auditLogService.log('PERMANENT_DELETE', 'Invoice', `Permanently deleted invoice: ${invoice.invoiceNumber} (cascaded from sales order ${order.orderNumber})`, {
            entityId: invoice.id,
            userId: userId || 'system',
            username,
            oldValues: {
              invoiceNumber: invoice.invoiceNumber,
              salesOrderId: id,
              totalAmount: invoice.totalAmount,
              paidAmount: invoice.paidAmount,
            },
          });
        }

        await this.invoiceRepository.delete(invoices.map((invoice) => invoice.id));
      } catch (error) {
        throw new ConflictException(
          'Failed to delete associated invoices. Cannot permanently delete sales order.',
        );
      }
    }

    if (Number(order.paidAmount) > 0 && order.customer) {
      const customer = order.customer;
      customer.totalSales = Math.max(0, Number(customer.totalSales) - Number(order.totalAmount));
      customer.totalOrders = Math.max(0, customer.totalOrders - 1);
      await this.customerRepository.save(customer);
    }

    try {
      await this.stockMovementService.deleteByReference('sales_order', id);
    } catch (error) {
      this.logger.error(`Failed to delete stock movements for sales order ${order.orderNumber}: ${error.message}`);
    }

    try {
      const paymentRepository = this.salesOrderRepository.manager.getRepository(Payment);
      const associatedPayments = await paymentRepository.find({
        where: {
          customerId: order.customerId,
          notes: ILike(`%sales order ${order.orderNumber}%`),
        },
        withDeleted: true,
      });

      if (associatedPayments.length > 0) {
        for (const payment of associatedPayments) {
          await this.auditLogService.log('PERMANENT_DELETE', 'Payment', `Permanently deleted payment: ${payment.paymentNumber} (cascaded from sales order ${order.orderNumber})`, {
            entityId: payment.id,
            userId: userId || 'system',
            username,
            oldValues: {
              paymentNumber: payment.paymentNumber,
              salesOrderId: id,
              amount: payment.amount,
            },
          });
        }

        await paymentRepository.delete(associatedPayments.map((payment) => payment.id));
      }
    } catch (error) {
      this.logger.error(`Failed to permanently delete payments for sales order ${order.orderNumber}: ${error.message}`);
    }

    await this.salesOrderItemRepository.delete({ salesOrderId: id });

    await this.auditLogService.log('PERMANENT_DELETE', 'SalesOrder', `Permanently deleted sales order: ${order.orderNumber}`, {
      entityId: id,
      userId: userId || 'system',
      username,
      oldValues: {
        orderNumber: order.orderNumber,
        customerId: order.customerId,
        customerName: order.customer?.name,
        totalAmount: order.totalAmount,
        paidAmount: order.paidAmount,
      },
    });

    await this.salesOrderRepository.delete(id);
  }

  async bulkPermanentDelete(
    orderIds: string[],
    userId?: string,
    username?: string,
  ): Promise<BulkOperationResponse> {
    if (!orderIds || orderIds.length === 0) {
      return BulkOperationUtil.createResponse('permanently deleted', 'sales order', 0, []);
    }

    const failedItems = [];
    let successCount = 0;

    for (const id of orderIds) {
      try {
        const order = await this.salesOrderRepository.findOne({
          where: { id },
          relations: { customer: true, items: true },
          withDeleted: true,
        });

        try {
          ValidationUtil.validateForPermanentDelete(order, 'Sales order', id);
        } catch (error) {
          BulkOperationUtil.addFailure(failedItems, id, error.message, 'VALIDATION_ERROR');
          continue;
        }

        const isCompleted = order.isFulfilled;
        const invoices = await this.invoiceRepository.find({
          where: { salesOrderId: id },
          withDeleted: true,
        });
        const hasPayments = invoices.some((invoice) => Number(invoice.paidAmount) > 0);

        try {
          ValidationUtil.validateFinancialEntityDeletion('sales order', hasPayments, false, isCompleted);
        } catch (error) {
          BulkOperationUtil.addFailure(failedItems, id, error.message, 'BUSINESS_RULE_ERROR');
          continue;
        }

        if (invoices.length > 0) {
          try {
            for (const invoice of invoices) {
              await this.auditLogService.log('PERMANENT_DELETE', 'Invoice', `Permanently deleted invoice: ${invoice.invoiceNumber} (cascaded from sales order ${order.orderNumber})`, {
                entityId: invoice.id,
                userId: userId || 'system',
                username,
                oldValues: {
                  invoiceNumber: invoice.invoiceNumber,
                  salesOrderId: id,
                  totalAmount: invoice.totalAmount,
                  paidAmount: invoice.paidAmount,
                },
              });
            }

            await this.invoiceRepository.delete(invoices.map((invoice) => invoice.id));
          } catch (error) {
            BulkOperationUtil.addFailure(
              failedItems,
              id,
              `Failed to delete associated invoices: ${error.message}`,
              'INVOICE_DELETE_ERROR',
            );
            continue;
          }
        }

        if (Number(order.paidAmount) > 0 && order.customer) {
          const customer = order.customer;
          customer.totalSales = Math.max(0, Number(customer.totalSales) - Number(order.totalAmount));
          customer.totalOrders = Math.max(0, customer.totalOrders - 1);
          await this.customerRepository.save(customer);
        }

        try {
          await this.stockMovementService.deleteByReference('sales_order', id);
        } catch (error) {
          this.logger.error(`Failed to delete stock movements for sales order ${order.orderNumber}: ${error.message}`);
        }

        try {
          const paymentRepository = this.salesOrderRepository.manager.getRepository(Payment);
          const associatedPayments = await paymentRepository.find({
            where: {
              customerId: order.customerId,
              notes: ILike(`%sales order ${order.orderNumber}%`),
            },
            withDeleted: true,
          });

          if (associatedPayments.length > 0) {
            for (const payment of associatedPayments) {
              await this.auditLogService.log('PERMANENT_DELETE', 'Payment', `Permanently deleted payment: ${payment.paymentNumber} (cascaded from sales order ${order.orderNumber})`, {
                entityId: payment.id,
                userId: userId || 'system',
                username,
                oldValues: {
                  paymentNumber: payment.paymentNumber,
                  salesOrderId: id,
                  amount: payment.amount,
                },
              });
            }

            await paymentRepository.delete(associatedPayments.map((payment) => payment.id));
          }
        } catch (error) {
          this.logger.error(`Failed to permanently delete payments for sales order ${order.orderNumber}: ${error.message}`);
        }

        await this.salesOrderItemRepository.delete({ salesOrderId: id });

        await this.auditLogService.log('PERMANENT_DELETE', 'SalesOrder', `Permanently deleted sales order: ${order.orderNumber}`, {
          entityId: id,
          userId: userId || 'system',
          username,
          oldValues: {
            orderNumber: order.orderNumber,
            totalAmount: order.totalAmount,
            customerId: order.customerId,
          },
        });

        await this.salesOrderRepository.delete(id);
        successCount++;
      } catch (error) {
        BulkOperationUtil.addFailure(failedItems, id, error.message, 'UNEXPECTED_ERROR');
      }
    }

    return BulkOperationUtil.createResponse(
      'permanently deleted',
      'sales order',
      successCount,
      failedItems,
    );
  }
}
