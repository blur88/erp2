import { Injectable, Logger, OnModuleInit } from '@nestjs/common';
import { InjectDataSource } from '@nestjs/typeorm';
import { DataSource, EntityManager, IsNull } from 'typeorm';
import { PriceList } from '@/database/entities';
import { PriceListDefaultService, PRICE_LIST_LOCK_KEY } from './price-list-default.service';

export const DEFAULT_PRICE_LIST_CODE = 'DEFAULT';
export const DEFAULT_PRICE_LIST_NAME = 'Default Price List';
export const DEFAULT_PRICE_LIST_DESCRIPTION = 'Standard price list for regular sales';

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

@Injectable()
export class PriceListsSeederService implements OnModuleInit {
  private readonly logger = new Logger(PriceListsSeederService.name);

  constructor(
    @InjectDataSource() private readonly source: DataSource | PriceListsSeederDb,
    private readonly defaults?: PriceListDefaultService,
  ) {}

  async onModuleInit(): Promise<void> {
    await this.seed();
  }

  async seed(): Promise<void> {
    try {
      await this.runInTransaction(async (m) => {
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
      findOldestActive: () =>
        em.findOne(PriceList, {
          where: { isActive: true, deletedAt: IsNull() },
          order: { createdAt: 'ASC', id: 'ASC' } as any,
        }),
      findByCodeWithDeleted: () =>
        em.findOne(PriceList, { where: { code: DEFAULT_PRICE_LIST_CODE }, withDeleted: true } as any),
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
    if (await m.findActiveDefault()) {
      return;
    }

    const oldest = await m.findOldestActive();
    if (oldest) {
      await m.assignDefault(oldest.id);
      this.logger.log(
        `Promoted price list "${oldest.code}" to default: no active default existed.`,
      );
      return;
    }

    const squatter = await m.findByCodeWithDeleted(DEFAULT_PRICE_LIST_CODE);
    if (squatter) {
      await m.reactivate(squatter.id);
      await m.assignDefault(squatter.id);
      this.logger.log(
        `Restored existing "${DEFAULT_PRICE_LIST_CODE}" price list and made it the default.`,
      );
      return;
    }

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
