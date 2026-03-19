import { Injectable, Logger } from '@nestjs/common';
import { ProductService } from '../inventory/services/product.service';
import { PurchaseOrderService } from '../purchasing/services/purchase-order.service';
import { CustomerService } from '../sales/services/customer.service';
import { SalesOrderService } from '../sales/services/sales-order.service';
import { GlobalSearchResponseDto } from './dto/global-search-response.dto';
import { GlobalSearchResultDto } from './dto/global-search-result.dto';

const STATIC_PAGES: Array<{
  label: string;
  keywords: string[];
  route: string;
}> = [
  { label: 'Dashboard', keywords: ['home', 'overview'], route: '/dashboard' },
  { label: 'Customers', keywords: ['clients', 'buyers'], route: '/customers' },
  {
    label: 'Products',
    keywords: ['items', 'inventory', 'catalogue'],
    route: '/inventory/products',
  },
  { label: 'Sales Orders', keywords: ['orders', 'so'], route: '/sales/orders' },
  {
    label: 'Purchase Orders',
    keywords: ['purchasing', 'po', 'procurement'],
    route: '/purchasing/orders',
  },
  { label: 'Invoices', keywords: ['billing'], route: '/sales/invoices' },
  { label: 'Payments', keywords: ['receipts'], route: '/sales/payments' },
  { label: 'Suppliers', keywords: ['vendors'], route: '/purchasing/suppliers' },
  {
    label: 'Stock Adjustments',
    keywords: ['adjustment', 'inventory'],
    route: '/inventory/adjustments',
  },
  {
    label: 'Categories',
    keywords: ['product categories'],
    route: '/inventory/categories',
  },
  { label: 'Price Lists', keywords: ['pricing'], route: '/price-lists' },
  {
    label: 'Journal Entries',
    keywords: ['accounting', 'ledger'],
    route: '/accounting/journal-entries',
  },
  {
    label: 'Chart of Accounts',
    keywords: ['accounts', 'coa'],
    route: '/accounting/chart-of-accounts',
  },
  {
    label: 'Fiscal Periods',
    keywords: ['financial periods'],
    route: '/accounting/fiscal-periods',
  },
  {
    label: 'User Management',
    keywords: ['users', 'roles'],
    route: '/settings/users',
  },
  {
    label: 'Settings',
    keywords: ['configuration', 'preferences'],
    route: '/settings',
  },
  { label: 'Audit Logs', keywords: ['activity', 'history'], route: '/audit-logs' },
];

@Injectable()
export class SearchService {
  private readonly logger = new Logger(SearchService.name);

  constructor(
    private readonly customerService: CustomerService,
    private readonly productService: ProductService,
    private readonly salesOrderService: SalesOrderService,
    private readonly purchaseOrderService: PurchaseOrderService,
  ) {}

  async search(query: string, user: any): Promise<GlobalSearchResponseDto> {
    const trimmed = query?.trim() ?? '';
    if (trimmed.length < 2) {
      return { query, results: [] };
    }

    const [pages, customers, products, salesOrders, purchaseOrders] =
      await Promise.all([
        this.safeSearch('pages', async () => this.searchPages(trimmed)),
        this.safeSearch('customers', () =>
          this.customerService.searchGlobal(trimmed, user),
        ),
        this.safeSearch('products', () =>
          this.productService.searchGlobal(trimmed, user),
        ),
        this.safeSearch('salesOrders', () =>
          this.salesOrderService.searchGlobal(trimmed, user),
        ),
        this.safeSearch('purchaseOrders', () =>
          this.purchaseOrderService.searchGlobal(trimmed, user),
        ),
      ]);

    const results = [
      ...pages,
      ...customers,
      ...products,
      ...salesOrders,
      ...purchaseOrders,
    ]
      .sort((a, b) => (b.score ?? 0) - (a.score ?? 0))
      .slice(0, 20);

    return { query, results };
  }

  private async safeSearch(
    source: string,
    fn: () => Promise<GlobalSearchResultDto[]>,
  ): Promise<GlobalSearchResultDto[]> {
    try {
      return await fn();
    } catch (error) {
      this.logger.error(
        `Search source "${source}" failed: ${(error as Error).message}`,
      );
      return [];
    }
  }

  private searchPages(query: string): GlobalSearchResultDto[] {
    const lowerQuery = query.toLowerCase();

    return STATIC_PAGES.filter(
      (page) =>
        page.label.toLowerCase().includes(lowerQuery) ||
        page.keywords.some((keyword) => keyword.toLowerCase().includes(lowerQuery)),
    ).map((page) => {
      const lowerLabel = page.label.toLowerCase();
      let score = 30;

      if (lowerLabel === lowerQuery) {
        score = 100;
      } else if (lowerLabel.startsWith(lowerQuery)) {
        score = 40;
      }

      return {
        type: 'page',
        label: page.label,
        description: 'Navigation',
        route: page.route,
        score,
      };
    });
  }
}
