import { Test, TestingModule } from '@nestjs/testing';
import { SearchService } from './search.service';
import { CustomerService } from '../sales/services/customer.service';
import { ProductService } from '../inventory/services/product.service';
import { SalesOrderService } from '../sales/services/sales-order.service';
import { PurchaseOrderService } from '../purchasing/services/purchase-order.service';
import { GlobalSearchResultDto } from './dto/global-search-result.dto';
import { UserRole } from '../../database/entities/user.entity';

describe('SearchService', () => {
  let service: SearchService;
  let customerService: jest.Mocked<Pick<CustomerService, 'searchGlobal'>>;
  let productService: jest.Mocked<Pick<ProductService, 'searchGlobal'>>;
  let salesOrderService: jest.Mocked<Pick<SalesOrderService, 'searchGlobal'>>;
  let purchaseOrderService: jest.Mocked<Pick<PurchaseOrderService, 'searchGlobal'>>;

  const mockUser = { userId: 'u1', username: 'admin' } as any;

  const makeResult = (label: string, score: number): GlobalSearchResultDto => ({
    type: 'customer',
    id: 'id-1',
    label,
    route: '/customers/id-1',
    score,
  });

  beforeEach(async () => {
    const module: TestingModule = await Test.createTestingModule({
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
      ],
    }).compile();

    service = module.get(SearchService);
    customerService = module.get(CustomerService);
    productService = module.get(ProductService);
    salesOrderService = module.get(SalesOrderService);
    purchaseOrderService = module.get(PurchaseOrderService);
  });

  it('fans out to all four sources in parallel', async () => {
    await service.search('abc', mockUser);

    expect(customerService.searchGlobal).toHaveBeenCalledWith('abc', mockUser);
    expect(productService.searchGlobal).toHaveBeenCalledWith('abc', mockUser);
    expect(salesOrderService.searchGlobal).toHaveBeenCalledWith('abc', mockUser);
    expect(purchaseOrderService.searchGlobal).toHaveBeenCalledWith('abc', mockUser);
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
    (customerService.searchGlobal as jest.Mock).mockResolvedValue([
      makeResult('Low', 50),
    ]);
    (productService.searchGlobal as jest.Mock).mockResolvedValue([
      makeResult('High', 100),
    ]);

    const result = await service.search('test', mockUser);

    expect(result.results[0].score).toBe(100);
    expect(result.results[1].score).toBe(50);
  });

  it('breaks score ties with case-insensitive label ascending order', async () => {
    (customerService.searchGlobal as jest.Mock).mockResolvedValue([
      { type: 'customer', id: 'a', label: 'Zebra Corp', route: '/customers/a', score: 80 },
      { type: 'customer', id: 'b', label: 'apple inc', route: '/customers/b', score: 80 },
      { type: 'customer', id: 'c', label: 'Mango Ltd', route: '/customers/c', score: 80 },
    ]);

    const result = await service.search('corp', mockUser);

    expect(result.results.map((r) => r.label)).toEqual([
      'apple inc',
      'Mango Ltd',
      'Zebra Corp',
    ]);
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
    (customerService.searchGlobal as jest.Mock).mockRejectedValue(
      new Error('DB error'),
    );
    (productService.searchGlobal as jest.Mock).mockResolvedValue([
      makeResult('Widget', 80),
    ]);

    const result = await service.search('wi', mockUser);

    expect(result.results).toHaveLength(1);
    expect(result.results[0].label).toBe('Widget');
  });

  describe('searchPages scoring', () => {
    it('scores an exact page label match as SCORE_PAGE_EXACT + BOOST_PAGE (92)', async () => {
      // "Dashboard" is an exact match for query "dashboard"
      const result = await service.search('dashboard', { role: UserRole.ADMIN } as any);
      const dashPage = result.results.find((r) => r.route === '/dashboard');
      expect(dashPage?.score).toBe(92); // SCORE_PAGE_EXACT(90) + BOOST_PAGE(2)
    });

    it('scores a page starts-with match as SCORE_PAGE_STARTSWITH + BOOST_PAGE (77)', async () => {
      // "Invoices" starts with "inv"
      const result = await service.search('inv', { role: UserRole.ADMIN } as any);
      const invoicesPage = result.results.find((r) => r.route === '/sales/invoices');
      expect(invoicesPage?.score).toBe(77); // SCORE_PAGE_STARTSWITH(75) + BOOST_PAGE(2)
    });

    it('scores a keyword-only match as SCORE_PAGE_KEYWORD + BOOST_PAGE (52)', async () => {
      // "Customers" has keyword "clients" — searching "clients" is a keyword match, not label match
      const result = await service.search('clients', { role: UserRole.ADMIN } as any);
      const customersPage = result.results.find((r) => r.route === '/sales/customers');
      expect(customersPage?.score).toBe(52); // SCORE_PAGE_KEYWORD(50) + BOOST_PAGE(2)
    });
  });

  describe('searchPages role filtering', () => {
    it('returns Dashboard for all roles', async () => {
      for (const role of Object.values(UserRole)) {
        const user = { role } as any;
        const result = await service.search('dashboard', user);
        const dashboardResult = result.results.find(
          (r) => r.route === '/dashboard',
        );
        expect(dashboardResult).toBeDefined();
      }
    });

    it('returns Audit Logs page only for admin', async () => {
      const adminResult = await service.search(
        'audit',
        { role: UserRole.ADMIN } as any,
      );
      expect(
        adminResult.results.find((r) => r.route === '/audit-logs'),
      ).toBeDefined();

      for (const role of [
        UserRole.MANAGER,
        UserRole.SALES_STAFF,
        UserRole.INVENTORY_STAFF,
        UserRole.PROCUREMENT_STAFF,
      ]) {
        const result = await service.search('audit', { role } as any);
        expect(
          result.results.find((r) => r.route === '/audit-logs'),
        ).toBeUndefined();
      }
    });

    it('returns Customers page only for sales roles', async () => {
      for (const role of [
        UserRole.ADMIN,
        UserRole.MANAGER,
        UserRole.SALES_STAFF,
      ]) {
        const result = await service.search('customer', { role } as any);
        expect(
          result.results.find((r) => r.route === '/sales/customers'),
        ).toBeDefined();
      }

      for (const role of [
        UserRole.INVENTORY_STAFF,
        UserRole.PROCUREMENT_STAFF,
      ]) {
        const result = await service.search('customer', { role } as any);
        expect(
          result.results.find((r) => r.route === '/sales/customers'),
        ).toBeUndefined();
      }
    });

    it('returns Journal Entries page only for finance roles', async () => {
      for (const role of [UserRole.ADMIN, UserRole.MANAGER]) {
        const result = await service.search('journal', { role } as any);
        expect(
          result.results.find(
            (r) => r.route === '/accounting/journal-entries',
          ),
        ).toBeDefined();
      }

      for (const role of [
        UserRole.SALES_STAFF,
        UserRole.INVENTORY_STAFF,
        UserRole.PROCUREMENT_STAFF,
      ]) {
        const result = await service.search('journal', { role } as any);
        expect(
          result.results.find(
            (r) => r.route === '/accounting/journal-entries',
          ),
        ).toBeUndefined();
      }
    });
  });
});
