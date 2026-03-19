import { Test, TestingModule } from '@nestjs/testing';
import { SearchService } from './search.service';
import { CustomerService } from '../sales/services/customer.service';
import { ProductService } from '../inventory/services/product.service';
import { SalesOrderService } from '../sales/services/sales-order.service';
import { PurchaseOrderService } from '../purchasing/services/purchase-order.service';
import { GlobalSearchResultDto } from './dto/global-search-result.dto';

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
});
