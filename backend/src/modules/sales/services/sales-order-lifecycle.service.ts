import {
  BadRequestException,
  ConflictException,
  Injectable,
  NotFoundException,
} from '@nestjs/common';
import { InjectRepository } from '@nestjs/typeorm';
import { DataSource, EntityManager, Repository } from 'typeorm';
import { SalesOrder, SalesOrderPaymentStatus, SalesOrderStatus } from '../../../database/entities/sales-order.entity';
import { AuditLogService } from '../../audit-logs/services';
import { lockRowForUpdate } from '../../../common/db/tx-helpers';

@Injectable()
export class SalesOrderLifecycleService {
  constructor(
    @InjectRepository(SalesOrder)
    private readonly salesOrderRepository: Repository<SalesOrder>,
    private readonly auditLogService: AuditLogService,
    private readonly dataSource: DataSource,
  ) {}

  async assertEditAllowed(id: string): Promise<void> {
    const order = await this.salesOrderRepository.findOne({ where: { id } });
    if (!order) throw new NotFoundException('Sales order not found');
    SalesOrderLifecycleService.assertStatusEditable(order.status);
  }

  /**
   * Pure editable-band guard, reusable on an already-loaded (e.g. lock-held) row.
   * Editable while still in the active band (DRAFT or fully-paid READY), regardless of
   * payment. FULFILLED / CANCELLED are locked. Throwing here keeps a single source of
   * truth for the rule and its messages so callers can re-assert inside a transaction.
   */
  static assertStatusEditable(status: SalesOrderStatus): void {
    const editable = status === SalesOrderStatus.DRAFT || status === SalesOrderStatus.READY;
    if (!editable) {
      throw new BadRequestException(
        `Cannot edit sales order in ${status} status. ${
          status === SalesOrderStatus.FULFILLED ? 'Unfulfill the order first.' : 'Uncancel the order first.'
        }`,
      );
    }
  }

  async cancel(id: string, userId?: string, username?: string): Promise<SalesOrder> {
    const saved = await this.dataSource.transaction(async (manager: EntityManager) => {
      const order = await lockRowForUpdate(manager, SalesOrder, id, {
        notFoundMessage: 'Sales order not found',
      });

      if (order.status === SalesOrderStatus.FULFILLED) {
        throw new ConflictException('Cannot cancel a fulfilled order. Unfulfill it first.');
      }
      if (order.status === SalesOrderStatus.CANCELLED) {
        throw new ConflictException('Order is already cancelled.');
      }
      if (order.paymentStatus !== SalesOrderPaymentStatus.UNPAID) {
        throw new ConflictException('Cannot cancel an order with recorded payments. Refund all payments first.');
      }

      await manager.getRepository(SalesOrder).update(id, { status: SalesOrderStatus.CANCELLED });
      order.status = SalesOrderStatus.CANCELLED;
      return order;
    });

    await this.auditLogService.log('UPDATE', 'SalesOrder', `Cancelled sales order: ${saved.orderNumber}`, {
      entityId: id,
      userId: userId || 'system',
      username,
      oldValues: { status: SalesOrderStatus.DRAFT },
      newValues: { status: SalesOrderStatus.CANCELLED },
    });

    return saved;
  }

  async uncancel(id: string, userId?: string, username?: string): Promise<SalesOrder> {
    const saved = await this.dataSource.transaction(async (manager: EntityManager) => {
      const order = await lockRowForUpdate(manager, SalesOrder, id, {
        notFoundMessage: 'Sales order not found',
      });

      if (order.status !== SalesOrderStatus.CANCELLED) {
        throw new ConflictException('Order is not cancelled.');
      }

      await manager.getRepository(SalesOrder).update(id, { status: SalesOrderStatus.DRAFT });
      order.status = SalesOrderStatus.DRAFT;
      return order;
    });

    await this.auditLogService.log('UPDATE', 'SalesOrder', `Uncancelled sales order: ${saved.orderNumber}`, {
      entityId: id,
      userId: userId || 'system',
      username,
      oldValues: { status: SalesOrderStatus.CANCELLED },
      newValues: { status: SalesOrderStatus.DRAFT },
    });

    return saved;
  }
}
