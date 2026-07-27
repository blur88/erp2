import { Test, TestingModule } from '@nestjs/testing';
import { SearchService } from './search.service';
import { CustomerService } from '../sales/services/customer.service';
import { ProductService } from '../inventory/services/product.service';
import { SupplierService } from '../purchasing/services/supplier.service';
import { SalesOrderService } from '../sales/services/sales-order.service';
import { PurchaseOrderService } from '../purchasing/services/purchase-order.service';
import { SearchAnalyticsService } from './search-analytics.service';
import { GlobalSearchResultDto } from './dto/global-search-result.dto';
import { UserRole } from '../../database/entities/user.entity';
import { ACCOUNTING_ROLES } from './search.permissions';

describe('SearchService', () => {
  let module: TestingModule;
  let service: SearchService;
  let customerService: jest.Mocked<Pick<CustomerService, 'searchGlobal'>>;
  let productService: jest.Mocked<Pick<ProductService, 'searchGlobal'>>;
  let salesOrderService: jest.Mocked<Pick<SalesOrderService, 'searchGlobal'>>;
  let purchaseOrderService: jest.Mocked<Pick<PurchaseOrderService, 'searchGlobal'>>;
  let supplierService: jest.Mocked<Pick<SupplierService, 'searchGlobal'>>;
  let searchAnalyticsService: jest.Mocked<Pick<SearchAnalyticsService, 'logQuery'>>;

  const mockUser = { userId: 'u1', username: 'admin' } as any;

  const makeResult = (label: string, score: number): GlobalSearchResultDto => ({
    type: 'customer',
    id: 'id-1',
    label,
    route: '/customers/id-1',
    score,
  });

  beforeEach(async () => {
    module = await Test.createTestingModule({
      providers: [
        SearchService,
        {
          provide: CustomerService,
          useValue: { searchGlobal: jest.fn().mockResolvedValue([]) },
        },
        {
          provide: ProductService,
          useValue: { searchGlobal: jest.fn().mockResolvedValue([]) },
        },
        {
          provide: SalesOrderService,
          useValue: { searchGlobal: jest.fn().mockResolvedValue([]) },
        },
        {
          provide: PurchaseOrderService,
          useValue: { searchGlobal: jest.fn().mockResolvedValue([]) },
        },
        {
          provide: SupplierService,
          useValue: { searchGlobal: jest.fn().mockResolvedValue([]) },
        },
        {
          provide: SearchAnalyticsService,
          useValue: { logQuery: jest.fn() },
        },
      ],
    }).compile();

    service = module.get(SearchService);
    customerService = module.get(CustomerService);
    productService = module.get(ProductService);
    salesOrderService = module.get(SalesOrderService);
    purchaseOrderService = module.get(PurchaseOrderService);
    supplierService = module.get(SupplierService);
    searchAnalyticsService = module.get(SearchAnalyticsService);
  });

  it('fans out to all six entity sources in parallel', async () => {
    await service.search('abc', mockUser);

    expect(customerService.searchGlobal).toHaveBeenCalledWith('abc', mockUser);
    expect(productService.searchGlobal).toHaveBeenCalledWith('abc', mockUser);
    expect(salesOrderService.searchGlobal).toHaveBeenCalledWith('abc', mockUser);
    expect(purchaseOrderService.searchGlobal).toHaveBeenCalledWith('abc', mockUser);
    expect(supplierService.searchGlobal).toHaveBeenCalledWith('abc', mockUser);
  });

  it('returns early with empty results for queries shorter than 2 characters', async () => {
    const result = await service.search('a', mockUser);

    expect(result.results).toEqual([]);
    expect(customerService.searchGlobal).not.toHaveBeenCalled();
  });

  it('returns early with empty results for blank query', async () => {
    const result = await service.search('  ', mockUser);

    expect(result.results).toEqual([]);
  });

  it('sorts merged results by descending score', async () => {
    (customerService.searchGlobal as jest.Mock).mockResolvedValue([makeResult('Low', 50)]);
    (productService.searchGlobal as jest.Mock).mockResolvedValue([makeResult('High', 100)]);

    const result = await service.search('test', mockUser);

    expect(result.results[0].score).toBe(100);
    expect(result.results[1].score).toBe(50);
  });

  it('breaks score ties with case-insensitive label ascending order', async () => {
    (customerService.searchGlobal as jest.Mock).mockResolvedValue([
      {
        type: 'customer',
        id: 'a',
        label: 'Zebra Corp',
        route: '/customers/a',
        score: 80,
      },
      {
        type: 'customer',
        id: 'b',
        label: 'apple inc',
        route: '/customers/b',
        score: 80,
      },
      {
        type: 'customer',
        id: 'c',
        label: 'Mango Ltd',
        route: '/customers/c',
        score: 80,
      },
    ]);

    const result = await service.search('corp', mockUser);

    expect(result.results.map((r) => r.label)).toEqual(['apple inc', 'Mango Ltd', 'Zebra Corp']);
  });

  it('treats undefined score as 0 when sorting', async () => {
    const noScore: GlobalSearchResultDto = {
      type: 'page',
      label: 'Dashboard',
      route: '/dashboard',
    };
    const withScore = makeResult('ABC', 50);
    (customerService.searchGlobal as jest.Mock).mockResolvedValue([noScore]);
    (productService.searchGlobal as jest.Mock).mockResolvedValue([withScore]);

    const result = await service.search('dash', mockUser);

    expect(result.results[0].score).toBe(50);
  });

  it('caps results at 20', async () => {
    const many = Array.from({ length: 15 }, (_, i) => makeResult(`item-${i}`, 50));
    (customerService.searchGlobal as jest.Mock).mockResolvedValue(many);
    (productService.searchGlobal as jest.Mock).mockResolvedValue(many);

    const result = await service.search('item', mockUser);

    expect(result.results.length).toBeLessThanOrEqual(20);
  });

  it('returns partial results if one source fails', async () => {
    (customerService.searchGlobal as jest.Mock).mockRejectedValue(new Error('DB error'));
    (productService.searchGlobal as jest.Mock).mockResolvedValue([makeResult('Widget', 80)]);

    const result = await service.search('wi', mockUser);

    expect(result.results).toHaveLength(1);
    expect(result.results[0].label).toBe('Widget');
  });

  describe('searchPages scoring', () => {
    it('scores an exact page label match as SCORE_PAGE_EXACT + BOOST_PAGE (90)', async () => {
      // "Dashboard" is an exact match for query "dashboard"
      const result = await service.search('dashboard', {
        role: UserRole.ADMIN,
      } as any);
      const dashPage = result.results.find((r) => r.route === '/dashboard');
      expect(dashPage?.score).toBe(90); // SCORE_PAGE_EXACT(90) + BOOST_PAGE(0)
    });

    it('scores a page starts-with match as SCORE_PAGE_STARTSWITH + BOOST_PAGE (75)', async () => {
      // "Suppliers" starts with "sup"
      const result = await service.search('sup', {
        role: UserRole.ADMIN,
      } as any);
      const suppliersPage = result.results.find((r) => r.route === '/purchasing/suppliers');
      expect(suppliersPage?.score).toBe(75); // SCORE_PAGE_STARTSWITH(75) + BOOST_PAGE(0)
    });

    it('scores a keyword-only match as SCORE_PAGE_KEYWORD + BOOST_PAGE (50)', async () => {
      // "Customers" has keyword "clients" — searching "clients" is a keyword match, not label match
      const result = await service.search('clients', {
        role: UserRole.ADMIN,
      } as any);
      const customersPage = result.results.find((r) => r.route === '/sales/customers');
      expect(customersPage?.score).toBe(50); // SCORE_PAGE_KEYWORD(50) + BOOST_PAGE(0)
    });
  });

  describe('page descriptions (getPageCategory)', () => {
    it('returns "Dashboard" for /dashboard', async () => {
      const result = await service.search('dashboard', {
        role: UserRole.ADMIN,
      } as any);
      const page = result.results.find((r) => r.route === '/dashboard');
      expect(page?.description).toBe('Dashboard');
    });

    it('returns "Sales" for /sales routes', async () => {
      const result = await service.search('customers', {
        role: UserRole.ADMIN,
      } as any);
      const page = result.results.find((r) => r.route === '/sales/customers');
      expect(page?.description).toBe('Sales');
    });

    it('returns "Audit" for /audit-logs', async () => {
      const result = await service.search('audit', {
        role: UserRole.ADMIN,
      } as any);
      const page = result.results.find((r) => r.route === '/audit-logs');
      expect(page?.description).toBe('Audit');
    });

    it('routes Inventory Costing searches to /settings/inventory-costing', async () => {
      const result = await service.search('inventory costing', {
        role: UserRole.ADMIN,
      } as any);
      const page = result.results.find((r) => r.label === 'Inventory Costing');
      expect(page?.route).toBe('/settings/inventory-costing');
    });
  });

  describe('searchPages role filtering', () => {
    it('returns Dashboard for all roles', async () => {
      for (const role of Object.values(UserRole)) {
        const user = { role } as any;
        const result = await service.search('dashboard', user);
        const dashboardResult = result.results.find((r) => r.route === '/dashboard');
        expect(dashboardResult).toBeDefined();
      }
    });

    it('returns Audit Logs page only for admin', async () => {
      const adminResult = await service.search('audit', {
        role: UserRole.ADMIN,
      } as any);
      expect(adminResult.results.find((r) => r.route === '/audit-logs')).toBeDefined();

      for (const role of [
        UserRole.MANAGER,
        UserRole.SALES_STAFF,
        UserRole.INVENTORY_STAFF,
        UserRole.PROCUREMENT_STAFF,
      ]) {
        const result = await service.search('audit', { role } as any);
        expect(result.results.find((r) => r.route === '/audit-logs')).toBeUndefined();
      }
    });

    it('returns Customers page only for sales roles', async () => {
      for (const role of [UserRole.ADMIN, UserRole.MANAGER, UserRole.SALES_STAFF]) {
        const result = await service.search('customer', { role } as any);
        expect(result.results.find((r) => r.route === '/sales/customers')).toBeDefined();
      }

      for (const role of [UserRole.INVENTORY_STAFF, UserRole.PROCUREMENT_STAFF]) {
        const result = await service.search('customer', { role } as any);
        expect(result.results.find((r) => r.route === '/sales/customers')).toBeUndefined();
      }
    });

  });

  describe('dead route removal (issue #948)', () => {
    it.each([
      ['grn'],
      ['goods received'],
      ['receiving'],
    ])('search %s returns no /purchasing/goods-received result', async (query) => {
      const result = await service.search(query, { role: UserRole.ADMIN } as any);
      expect(
        result.results.some((r) => r.route === '/purchasing/goods-received'),
      ).toBe(false);
    });

    it.each([
      ['product summary'],
      ['order profit'],
      ['vendor payment'],
      ['historical inventory'],
      ['price list'],
    ])('search %s returns no /reports/* result', async (query) => {
      const result = await service.search(query, { role: UserRole.ADMIN } as any);
      expect(result.results.some((r) => r.route?.startsWith('/reports'))).toBe(false);
    });
  });

  describe('accounting pages', () => {
    const ACCOUNTING_PAGES: Array<[string, string, string]> = [
      ['chart of accounts', 'Chart of Accounts', '/accounting/chart-of-accounts'],
      ['journal entries', 'Journal Entries', '/accounting/journal-entries'],
      ['expenses', 'Expenses', '/accounting/expenses'],
      ['general ledger', 'General Ledger', '/accounting/general-ledger'],
      ['trial balance', 'Trial Balance', '/accounting/trial-balance'],
      ['accounting settings', 'Accounting Settings', '/accounting/settings'],
    ];

    const cases = ACCOUNTING_PAGES.flatMap(([query, label, route]) =>
      ACCOUNTING_ROLES.map((role) => [role, query, label, route] as const),
    );

    it.each(cases)(
      'role %s searching "%s" finds %s at its route, categorized Accounting',
      async (role, query, label, route) => {
        const result = await service.search(query, { role } as any);
        const page = result.results.find((r) => r.label === label);
        expect(page).toBeDefined();
        expect(page?.route).toBe(route);
        expect(page?.description).toBe('Accounting');
      },
    );

    // Other modules catch their own name via an overview entry; /accounting is
    // not a mounted route, so each page carries the module name instead.
    it('searching "accounting" finds every accounting page', async () => {
      const result = await service.search('accounting', {
        role: UserRole.ADMIN,
      } as any);
      const labels = result.results.map((r) => r.label);

      for (const [, label] of ACCOUNTING_PAGES) {
        expect(labels).toContain(label);
      }
    });

    // Matching is keyword.includes(query), so a singular query cannot match a
    // plural-only keyword.
    it.each([
      ['entry', 'Journal Entries'],
      ['ledgers', 'General Ledger'],
    ])('searching "%s" finds %s', async (query, label) => {
      const result = await service.search(query, {
        role: UserRole.ADMIN,
      } as any);
      expect(result.results.map((r) => r.label)).toContain(label);
    });

    // 'account' is a substring of the 'accounting' keyword, so this narrower
    // query matches all six pages — accepted deliberately, since every result
    // is relevant. Accounting Settings leads on SCORE_PAGE_STARTSWITH (its
    // label begins with "Account"); the rest tie on SCORE_PAGE_KEYWORD, so
    // only the top two positions are pinned.
    it('searching "account" returns every accounting page, settings first', async () => {
      const result = await service.search('account', {
        role: UserRole.ADMIN,
      } as any);
      const labels = result.results.map((r) => r.label);

      for (const [, label] of ACCOUNTING_PAGES) {
        expect(labels).toContain(label);
      }
      expect(labels[0]).toBe('Accounting Settings');
      expect(labels[1]).toBe('Chart of Accounts');
    });
  });

  describe('searchQueryId', () => {
    it('includes searchQueryId in the response', async () => {
      const result = await service.search('test', mockUser);

      expect(result.searchQueryId).toBeDefined();
      expect(typeof result.searchQueryId).toBe('string');
      expect(result.searchQueryId).toMatch(
        /^[0-9a-f]{8}-[0-9a-f]{4}-4[0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i,
      );
    });

    it('calls logQuery with correct params', async () => {
      await service.search('acme', mockUser);

      expect(searchAnalyticsService.logQuery).toHaveBeenCalledWith(
        expect.objectContaining({
          query: 'acme',
          userId: mockUser.userId,
          resultCount: expect.any(Number),
          executionTimeMs: expect.any(Number),
        }),
      );
    });

    it('returns searchQueryId even when logQuery throws', async () => {
      searchAnalyticsService.logQuery.mockImplementation(() => {
        throw new Error('unexpected');
      });

      const result = await service.search('test', mockUser);

      expect(result.searchQueryId).toBeDefined();
    });
  });
});
