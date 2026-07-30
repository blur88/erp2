import { Injectable, BadRequestException, NotFoundException } from '@nestjs/common';
import { EntityManager, IsNull } from 'typeorm';
import { PriceList } from '@/database/entities';

// Distinct from UsersSeederService (891892) and AccountingSeederService
// (891891) so the three advisory locks can never block each other on boot.
export const PRICE_LIST_LOCK_KEY = 891893;

/**
 * The single runtime implementation of "exactly one active default price list"
 * (#968).
 *
 * Every caller supplies its own EntityManager so the lock and the writes it
 * protects share one transaction. Passing a repository here instead would put
 * them on different connections and silently void the invariant.
 *
 * The one-time duplicate repair in
 * AddSingleDefaultPriceListConstraint1785600000000 is the deliberate exception
 * to "ownership changes only here" — it repairs state predating the invariant.
 */
@Injectable()
export class PriceListDefaultService {
  /**
   * Serialises every transaction that changes default ownership or guards a
   * mutation on isDefault.
   *
   * Without this the partial unique index degrades from a serialiser into a
   * source of 500s: two concurrent transfers would be resolved by one of them
   * failing on a constraint violation rather than queueing.
   */
  async acquireLock(manager: EntityManager): Promise<void> {
    await manager.query('SELECT pg_advisory_xact_lock($1)', [PRICE_LIST_LOCK_KEY]);
  }

  /**
   * Makes `id` the one active default. Validates before writing, so an invalid
   * transfer performs no I/O rather than relying on rollback.
   */
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

    // Already correct: no writes, no index churn, idempotent.
    if (target.isDefault) {
      return target;
    }

    // Unset BEFORE set. With UQ_price_lists_single_default in place the reverse
    // order raises a constraint violation.
    //
    // deletedAt: IsNull() matters — a soft-deleted row can still carry
    // isDefault = true, and the invariant does not govern those rows.
    await manager.update(
      PriceList,
      { isDefault: true, deletedAt: IsNull() },
      { isDefault: false },
    );

    target.isDefault = true;

    return manager.save(PriceList, target);
  }
}
