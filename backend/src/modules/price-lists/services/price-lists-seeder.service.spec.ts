import {
  PriceListsSeederService,
  PriceListsSeederManager,
  PriceListsSeederDb,
  DEFAULT_PRICE_LIST_CODE,
  DEFAULT_PRICE_LIST_NAME,
  DEFAULT_PRICE_LIST_DESCRIPTION,
} from './price-lists-seeder.service';

class FakeManager implements PriceListsSeederManager {
  locks: number[] = [];
  inserted: Array<Record<string, any>> = [];
  restored: string[] = [];
  assigned: string[] = [];
  order: string[] = [];

  constructor(
    private state: {
      activeDefault?: any;
      oldestActive?: any;
      byCode?: any;
    } = {},
  ) {}

  async acquireLock(key: number): Promise<void> {
    this.locks.push(key);
  }
  async findActiveDefault() {
    return this.state.activeDefault ?? null;
  }
  async findOldestActive() {
    return this.state.oldestActive ?? null;
  }
  async findByCodeWithDeleted() {
    return this.state.byCode ?? null;
  }
  async reactivate(id: string) {
    this.restored.push(id);
    this.order.push(`reactivate:${id}`);
  }
  async insertPriceList(row: Record<string, any>) {
    this.inserted.push(row);
    this.order.push('insert');
    return { id: 'new-id', ...row } as any;
  }
  async assignDefault(id: string) {
    this.assigned.push(id);
    this.order.push(`assign:${id}`);
    return { id } as any;
  }
}

class FakeDb implements PriceListsSeederDb {
  constructor(public manager: FakeManager) {}
  async transaction(body: (m: PriceListsSeederManager) => Promise<void>) {
    await body(this.manager);
  }
}

const seed = async (state: any = {}) => {
  const manager = new FakeManager(state);
  await new PriceListsSeederService(new FakeDb(manager) as any).seed();
  return manager;
};

describe('PriceListsSeederService', () => {
  it('acquires the advisory lock', async () => {
    const m = await seed();
    expect(m.locks).toContain(891893);
  });

  describe('branch 1: an active default already exists', () => {
    it('changes nothing', async () => {
      const m = await seed({ activeDefault: { id: 'existing' } });

      expect(m.inserted).toHaveLength(0);
      expect(m.restored).toHaveLength(0);
      expect(m.assigned).toHaveLength(0);
    });

    it('is a no-op when run repeatedly', async () => {
      const manager = new FakeManager({ activeDefault: { id: 'existing' } });
      const db = new FakeDb(manager) as any;
      const service = new PriceListsSeederService(db);

      await service.seed();
      await service.seed();

      expect(manager.locks).toEqual([891893, 891893]);
      expect(manager.order).toEqual([]);
      expect(manager.inserted).toHaveLength(0);
      expect(manager.assigned).toHaveLength(0);
    });
  });

  describe('branch 2: active lists exist but none is default', () => {
    it('promotes the oldest active list', async () => {
      const m = await seed({ oldestActive: { id: 'oldest' } });

      expect(m.assigned).toEqual(['oldest']);
      expect(m.inserted).toHaveLength(0);
      expect(m.restored).toHaveLength(0);
    });
  });

  describe('branch 3a: no active list, but the DEFAULT code is taken', () => {
    it('restores and promotes the existing row instead of inserting', async () => {
      const m = await seed({
        byCode: { id: 'squatter', code: DEFAULT_PRICE_LIST_CODE },
      });

      expect(m.restored).toEqual(['squatter']);
      expect(m.assigned).toEqual(['squatter']);
      expect(m.inserted).toHaveLength(0);
    });

    it('restores a soft-deleted row rather than colliding on the unique code', async () => {
      const m = await seed({
        byCode: {
          id: 'squatter',
          code: DEFAULT_PRICE_LIST_CODE,
          deletedAt: new Date(),
          isActive: false,
        },
      });

      expect(m.restored).toEqual(['squatter']);
      expect(m.inserted).toHaveLength(0);
    });

    it('reactivates before promoting, so the row is live when assignDefault runs', async () => {
      const m = await seed({
        byCode: {
          id: 'squatter',
          code: DEFAULT_PRICE_LIST_CODE,
          deletedAt: new Date(),
          isActive: false,
          isDefault: true,
        },
      });

      expect(m.order).toEqual(['reactivate:squatter', 'assign:squatter']);
    });
  });

  describe('branch 3b: empty table', () => {
    it('inserts the canonical default and promotes it', async () => {
      const m = await seed();

      expect(m.inserted).toHaveLength(1);
      const row = m.inserted[0];
      expect(row.code).toBe(DEFAULT_PRICE_LIST_CODE);
      expect(row.name).toBe(DEFAULT_PRICE_LIST_NAME);
      expect(row.description).toBe(DEFAULT_PRICE_LIST_DESCRIPTION);
      expect(row.isActive).toBe(true);
      expect(row.priority).toBe(0);
      expect(row.effectiveFrom ?? null).toBeNull();
      expect(row.effectiveTo ?? null).toBeNull();
      expect(m.assigned).toEqual(['new-id']);
    });

    it('creates no price items', async () => {
      const m = await seed();
      expect(m.inserted[0].items).toBeUndefined();
    });

    it('does not set isDefault directly — promotion goes through assignDefault', async () => {
      const m = await seed();
      expect(m.inserted[0].isDefault).toBeUndefined();
    });
  });
});
