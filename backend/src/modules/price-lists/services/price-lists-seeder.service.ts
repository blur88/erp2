import { Injectable, Logger, OnModuleInit } from '@nestjs/common';
import { InjectDataSource } from '@nestjs/typeorm';
import { DataSource, EntityManager, IsNull } from 'typeorm';
import { PriceList } from '@/database/entities';
import { PriceListDefaultService, PRICE_LIST_LOCK_KEY } from './price-list-default.service';

// The canonical seeded row. Named "Retail" rather than "Default Price List"
// because CreateProductPage composes its field label as `${name} Price`, which
// turned the latter into "Default Price List Price".
//
// The constant names keep the DEFAULT_ prefix: they identify the row the seeder
// creates and reconciles against, which is a separate concept from its
// user-facing name. Nothing outside this file hardcodes these values.
export const DEFAULT_PRICE_LIST_CODE = 'RETAIL';
export const DEFAULT_PRICE_LIST_NAME = 'Retail';
export const DEFAULT_PRICE_LIST_DESCRIPTION = 'Standard price list for regular sales';

// Data-access surface. Production adapter wraps a TypeORM EntityManager; the
// unit test supplies a fake with the same methods.
export interface PriceListsSeederManager {
  acquireLock(key: number): Promise<void>;
  findActiveDefault(): Promise<PriceList | null>;
  findOldestActive(): Promise<PriceList | null>;
  findByCodeWithDeleted(code: string): Promise<PriceList | null>;
  reactivate(id: string): Promise<void>;
  insertPriceList(row: Record<string, any>): Promise<PriceList>;
  assignDefault(id: string): Promise<PriceList>;
}

export interface PriceListsSeederDb {
  transaction(body: (m: PriceListsSeederManager) => Promise<void>): Promise<void>;
}

/**
 * Guarantees AT LEAST ONE ACTIVE default price list (#968).
 *
 * Without this, a fresh installation has no price list at all: the user cannot
 * enter a selling price on a product (the Create Product form renders one price
 * field per active price list) and GET /price-lists/default returns 404.
 *
 * Runs on every boot, so a database that later loses its active default
 * self-heals. Branch 1 of runCore makes repeat boots a no-op.
 *
 * The partial unique index added by
 * AddSingleDefaultPriceListConstraint1785600000000 guarantees AT MOST ONE.
 * Together: exactly one.
 */
@Injectable()
export class PriceListsSeederService implements OnModuleInit {
  private readonly logger = new Logger(PriceListsSeederService.name);

  constructor(
    @InjectDataSource() private readonly source: DataSource | PriceListsSeederDb,
    // Optional so the unit test can construct this with only a fake db; the
    // fake manager supplies its own assignDefault and never reaches the real
    // one. In the app it is always provided (price-lists.module.ts), so the `!`
    // in the adapter is safe — but note this defers a missing registration from
    // a startup DI error to a runtime TypeError on first boot.
    private readonly defaults?: PriceListDefaultService,
  ) {}

  async onModuleInit(): Promise<void> {
    await this.seed();
  }

  async seed(): Promise<void> {
    try {
      await this.runInTransaction(async (m) => {
        // Serialise concurrent boots (multiple replicas) so only one writes.
        await m.acquireLock(PRICE_LIST_LOCK_KEY);
        await this.runCore(m);
      });
    } catch (err) {
      this.logger.error(
        `Default price list bootstrap failed: ${(err as Error).message}`,
        (err as Error).stack,
      );
      throw err;
    }
  }

  private runInTransaction(
    body: (m: PriceListsSeederManager) => Promise<void>,
  ): Promise<void> {
    if (this.source instanceof DataSource) {
      return this.source.transaction(async (em) => body(this.adapter(em)));
    }
    return (this.source as PriceListsSeederDb).transaction(body);
  }

  private adapter(em: EntityManager): PriceListsSeederManager {
    return {
      acquireLock: async (key) => {
        await em.query('SELECT pg_advisory_xact_lock($1)', [key]);
      },
      findActiveDefault: () =>
        em.findOne(PriceList, {
          where: { isDefault: true, isActive: true, deletedAt: IsNull() },
        }),
      // Deterministic: oldest createdAt, then lowest id as a stable tie-breaker.
      findOldestActive: () =>
        em.findOne(PriceList, {
          where: { isActive: true, deletedAt: IsNull() },
          order: { createdAt: 'ASC', id: 'ASC' } as any,
        }),
      // withDeleted: a soft-deleted row still occupies the unique code (the
      // constraint on `code` is unconditional, unlike the partial index on
      // isDefault), so treating it as absent would make the insert fail.
      findByCodeWithDeleted: () =>
        em.findOne(PriceList, { where: { code: DEFAULT_PRICE_LIST_CODE }, withDeleted: true } as any),
      // Clears isDefault as well as deletedAt, and sets isActive. A
      // soft-deleted row may carry a STALE isDefault = true: it sat outside the
      // partial index precisely because it was deleted. Clearing deletedAt alone
      // would drag that stale flag back into the governed set, and if any other
      // live row is already default the UPDATE violates
      // UQ_price_lists_single_default before assignDefault ever runs. Reachable
      // whenever an INACTIVE live default exists (branch 1 passes it over,
      // branch 2 finds no active list) at the same time as a soft-deleted
      // canonically-coded row.
      //
      // Demoting here is safe: assignDefault promotes this exact row two lines
      // later, so the row ends up default either way.
      reactivate: async (id) => {
        await em.update(PriceList, id, {
          isActive: true,
          deletedAt: null,
          isDefault: false,
        } as any);
      },
      insertPriceList: async (row) =>
        em.save(PriceList, em.create(PriceList, row as any) as any),
      assignDefault: (id) => this.defaults!.assignDefault(em, id),
    };
  }

  private async runCore(m: PriceListsSeederManager): Promise<void> {
    // Branch 1: already correct. Return before any write.
    if (await m.findActiveDefault()) {
      return;
    }

    // Branch 2: usable lists exist — promote rather than create. An inactive,
    // non-deleted default is demoted by assignDefault's unset step. A
    // soft-deleted one is not: it sits outside the governed set.
    const oldest = await m.findOldestActive();
    if (oldest) {
      await m.assignDefault(oldest.id);
      this.logger.log(
        `Promoted price list "${oldest.code}" to default: no active default existed.`,
      );
      return;
    }

    // Branch 3a: the canonical code is taken (possibly by a soft-deleted row).
    // Restore it rather than inserting, which is non-destructive and avoids the
    // unique-code collision. Reachable only when no active list exists, so this
    // can never resurrect a deleted list while a usable one is present.
    const squatter = await m.findByCodeWithDeleted(DEFAULT_PRICE_LIST_CODE);
    if (squatter) {
      await m.reactivate(squatter.id);
      await m.assignDefault(squatter.id);
      this.logger.log(
        `Restored existing "${DEFAULT_PRICE_LIST_CODE}" price list and made it the default.`,
      );
      return;
    }

    // Branch 3b: nothing usable. Create the canonical row.
    //
    // isDefault is deliberately absent: promotion goes through assignDefault so
    // the invariant has exactly one implementation. No price items are created —
    // the user enters each product's price on the Create Product form.
    const created = await m.insertPriceList({
      code: DEFAULT_PRICE_LIST_CODE,
      name: DEFAULT_PRICE_LIST_NAME,
      description: DEFAULT_PRICE_LIST_DESCRIPTION,
      isActive: true,
      priority: 0,
    });

    await m.assignDefault(created.id);
    this.logger.log(`Seeded "${DEFAULT_PRICE_LIST_NAME}" as the default price list.`);
  }
}
