import { Injectable, BadRequestException, NotFoundException } from '@nestjs/common';
import { EntityManager, IsNull } from 'typeorm';
import { PriceList } from '@/database/entities';

export const PRICE_LIST_LOCK_KEY = 891893;

@Injectable()
export class PriceListDefaultService {
  async acquireLock(manager: EntityManager): Promise<void> {
    await manager.query('SELECT pg_advisory_xact_lock($1)', [PRICE_LIST_LOCK_KEY]);
  }

  async assignDefault(manager: EntityManager, id: string): Promise<PriceList> {
    await this.acquireLock(manager);

    const target = await manager.findOne(PriceList, {
      where: { id, deletedAt: IsNull() },
    });

    if (!target) {
      throw new NotFoundException(`Price list with ID ${id} not found`);
    }

    if (!target.isActive) {
      throw new BadRequestException(
        'An inactive price list cannot be made default',
      );
    }

    if (target.isDefault) {
      return target;
    }

    await manager.update(
      PriceList,
      { isDefault: true, deletedAt: IsNull() },
      { isDefault: false },
    );

    target.isDefault = true;

    return manager.save(PriceList, target);
  }
}
