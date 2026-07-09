import { Injectable, Logger } from '@nestjs/common';
import { v4 as uuidv4 } from 'uuid';
import { ProductService } from '../inventory/services/product.service';
import { PurchaseOrderService } from '../purchasing/services/purchase-order.service';
import { SupplierService } from '../purchasing/services/supplier.service';
import { VendorPaymentService } from '../purchasing/services/vendor-payment.service';
import { CustomerService } from '../sales/services/customer.service';
import { PaymentService } from '../sales/services/payment.service';
import { SalesOrderService } from '../sales/services/sales-order.service';
import { UserRole } from '../../database/entities/user.entity';
import { GlobalSearchResponseDto } from './dto/global-search-response.dto';
import { GlobalSearchResultDto } from './dto/global-search-result.dto';
import {
  ALL_ROLES,
  SALES_ROLES,
  PROCUREMENT_ROLES,
  INVENTORY_ROLES,
  ADMIN_ONLY,
} from './search.permissions';
import {
  SEARCH_RESPONSE_LIMIT,
  SCORE_PAGE_EXACT,
  SCORE_PAGE_STARTSWITH,
  SCORE_PAGE_KEYWORD,
  BOOST_PAGE,
} from './search.constants';
import { SearchAnalyticsService } from './search-analytics.service';

function getPageCategory(route: string): string {
  const r = route.toLowerCase().trim();
  if (r === '/dashboard') return 'Dashboard';
  if (r === '/reports' || r.startsWith('/reports/')) return 'Report';
  if (r === '/sales' || r.startsWith('/sales/')) return 'Sales';
  if (r === '/purchasing' || r.startsWith('/purchasing/')) return 'Purchasing';
  if (r === '/inventory' || r.startsWith('/inventory/')) return 'Inventory';
  if (r === '/settings' || r.startsWith('/settings/')) return 'Settings';
  if (r === '/audit-logs' || r.startsWith('/audit-logs/')) return 'Audit';
  return 'Page';
}

const STATIC_PAGES: Array<{
  label: string;
  keywords: string[];
  route: string;
  roles: UserRole[];
}> = [
  {
    label: 'Dashboard',
    keywords: ['home', 'overview'],
    route: '/dashboard',
    roles: ALL_ROLES,
  },
  {
    label: 'Sales',
    keywords: ['sales', 'overview'],
    route: '/sales',
    roles: SALES_ROLES,
  },
  {
    label: 'Customers',
    keywords: ['clients', 'buyers'],
    route: '/sales/customers',
    roles: SALES_ROLES,
  },
  {
    label: 'Sales Orders',
    keywords: ['orders', 'so'],
    route: '/sales/orders',
    roles: SALES_ROLES,
  },
  {
    label: 'Payments',
    keywords: ['receipts', 'payment'],
    route: '/sales/payments',
    roles: SALES_ROLES,
  },
  {
    label: 'Purchasing',
    keywords: ['purchasing', 'overview'],
    route: '/purchasing',
    roles: PROCUREMENT_ROLES,
  },
  {
    label: 'Suppliers',
    keywords: ['vendors', 'supplier'],
    route: '/purchasing/suppliers',
    roles: PROCUREMENT_ROLES,
  },
  {
    label: 'Purchase Orders',
    keywords: ['po', 'procurement', 'purchase order'],
    route: '/purchasing/orders',
    roles: PROCUREMENT_ROLES,
  },
  {
    label: 'Goods Received',
    keywords: ['grn', 'goods received', 'receiving'],
    route: '/purchasing/goods-received',
    roles: PROCUREMENT_ROLES,
  },
  {
    label: 'Vendor Payments',
    keywords: ['vendor payment', 'ap'],
    route: '/purchasing/vendor-payments',
    roles: PROCUREMENT_ROLES,
  },
  {
    label: 'Inventory',
    keywords: ['inventory', 'overview'],
    route: '/inventory',
    roles: INVENTORY_ROLES,
  },
  {
    label: 'Products',
    keywords: ['items', 'catalogue', 'sku'],
    route: '/inventory/products',
    roles: INVENTORY_ROLES,
  },
  {
    label: 'Categories',
    keywords: ['product categories'],
    route: '/inventory/categories',
    roles: INVENTORY_ROLES,
  },
  {
    label: 'Stock Adjustments',
    keywords: ['adjustment', 'stock', 'inventory'],
    route: '/inventory/stock-adjustments',
    roles: INVENTORY_ROLES,
  },

  {
    label: 'Product Summary Report',
    keywords: ['sales report', 'product summary'],
    route: '/reports/sales/product-summary',
    roles: SALES_ROLES,
  },
  {
    label: 'Product Details Report',
    keywords: ['sales report', 'product details'],
    route: '/reports/sales/product-details',
    roles: SALES_ROLES,
  },
  {
    label: 'Sales Order Summary',
    keywords: ['order summary', 'sales report'],
    route: '/reports/sales/order-summary',
    roles: SALES_ROLES,
  },
  {
    label: 'Order Profit Report',
    keywords: ['profit', 'order profit'],
    route: '/reports/sales/order-profit',
    roles: SALES_ROLES,
  },
  {
    label: 'Customer Payment Summary',
    keywords: ['payment summary', 'customer payment'],
    route: '/reports/sales/customer-payment-summary',
    roles: SALES_ROLES,
  },
  {
    label: 'Payment by Order',
    keywords: ['payment by order'],
    route: '/reports/sales/payment-by-order',
    roles: SALES_ROLES,
  },
  {
    label: 'Customer Payment Details',
    keywords: ['payment details', 'customer payment'],
    route: '/reports/sales/payment-details',
    roles: SALES_ROLES,
  },
  {
    label: 'Customer Order History',
    keywords: ['order history', 'customer history'],
    route: '/reports/sales/order-history',
    roles: SALES_ROLES,
  },
  {
    label: 'Product Customers Report',
    keywords: ['product customer', 'customer report'],
    route: '/reports/sales/product-customer',
    roles: SALES_ROLES,
  },
  {
    label: 'Purchase Order Summary',
    keywords: ['purchase report', 'order summary'],
    route: '/reports/purchasing/order-summary',
    roles: PROCUREMENT_ROLES,
  },
  {
    label: 'Purchase Order Details',
    keywords: ['purchase report', 'order details'],
    route: '/reports/purchasing/order-details',
    roles: PROCUREMENT_ROLES,
  },
  {
    label: 'Purchase Order Status',
    keywords: ['order status', 'purchase report'],
    route: '/reports/purchasing/order-status',
    roles: PROCUREMENT_ROLES,
  },
  {
    label: 'Vendor Payment Details',
    keywords: ['vendor payment', 'purchase report'],
    route: '/reports/purchasing/payment-details',
    roles: PROCUREMENT_ROLES,
  },
  {
    label: 'Vendor Products Report',
    keywords: ['vendor products', 'purchase report'],
    route: '/reports/purchasing/vendor-purchase-list',
    roles: PROCUREMENT_ROLES,
  },
  {
    label: 'Inventory Summary Report',
    keywords: ['inventory report', 'summary'],
    route: '/reports/inventory/summary',
    roles: INVENTORY_ROLES,
  },
  {
    label: 'Historical Inventory Report',
    keywords: ['historical inventory', 'inventory report'],
    route: '/reports/inventory/historical',
    roles: INVENTORY_ROLES,
  },
  {
    label: 'Inventory Movement Summary',
    keywords: ['movement', 'inventory report'],
    route: '/reports/inventory/movement-summary',
    roles: INVENTORY_ROLES,
  },
  {
    label: 'Product Price List Report',
    keywords: ['price list', 'inventory report'],
    route: '/reports/inventory/price-list',
    roles: INVENTORY_ROLES,
  },
  {
    label: 'Product Cost Report',
    keywords: ['product cost', 'inventory report'],
    route: '/reports/inventory/product-cost',
    roles: INVENTORY_ROLES,
  },

  {
    label: 'Company Settings',
    keywords: ['company', 'settings', 'configuration'],
    route: '/settings/company',
    roles: ADMIN_ONLY,
  },
  {
    label: 'Inventory Costing',
    keywords: ['costing', 'price costing', 'settings'],
    route: '/settings/inventory-costing',
    roles: ADMIN_ONLY,
  },
  {
    label: 'Regional Settings',
    keywords: ['regional', 'locale', 'settings'],
    route: '/settings/regional',
    roles: ADMIN_ONLY,
  },
  {
    label: 'Price Lists',
    keywords: ['price list', 'pricing', 'settings'],
    route: '/settings/price-lists',
    roles: ADMIN_ONLY,
  },
  {
    label: 'Payment Methods',
    keywords: ['payment method', 'settings'],
    route: '/settings/payment-methods',
    roles: ADMIN_ONLY,
  },
  {
    label: 'Print Settings',
    keywords: ['print', 'settings'],
    route: '/settings/print',
    roles: ADMIN_ONLY,
  },
  {
    label: 'Document Numbers',
    keywords: ['document number', 'numbering', 'settings'],
    route: '/settings/document-numbers',
    roles: ADMIN_ONLY,
  },
  {
    label: 'Users',
    keywords: ['users', 'user management', 'settings'],
    route: '/settings/users',
    roles: ADMIN_ONLY,
  },
  {
    label: 'Roles & Permissions',
    keywords: ['roles', 'permissions', 'access', 'settings'],
    route: '/settings/roles',
    roles: ADMIN_ONLY,
  },
  {
    label: 'Security',
    keywords: ['security', 'settings'],
    route: '/settings/security',
    roles: ADMIN_ONLY,
  },
  {
    label: 'Backup & Restore',
    keywords: ['backup', 'restore', 'settings'],
    route: '/settings/backup',
    roles: ADMIN_ONLY,
  },
  {
    label: 'Audit Logs',
    keywords: ['audit', 'activity', 'history'],
    route: '/audit-logs',
    roles: ADMIN_ONLY,
  },
];

@Injectable()
export class SearchService {
  private readonly logger = new Logger(SearchService.name);

  constructor(
    private readonly customerService: CustomerService,
    private readonly productService: ProductService,
    private readonly salesOrderService: SalesOrderService,
    private readonly purchaseOrderService: PurchaseOrderService,
    private readonly supplierService: SupplierService,
    private readonly paymentService: PaymentService,
    private readonly vendorPaymentService: VendorPaymentService,
    private readonly searchAnalyticsService: SearchAnalyticsService,
  ) {}

  async search(query: string, user: any): Promise<GlobalSearchResponseDto> {
    const trimmed = query?.trim() ?? '';
    if (trimmed.length < 2) {
      return { query, searchQueryId: uuidv4(), results: [] };
    }

    const searchQueryId = uuidv4();
    const startTime = Date.now();

    const [
      pages,
      customers,
      products,
      salesOrders,
      purchaseOrders,
      suppliers,
      customerPayments,
      vendorPayments,
    ] = await Promise.all([
      this.safeSearch('pages', () => Promise.resolve(this.searchPages(trimmed, user))),
      this.safeSearch('customers', () => this.customerService.searchGlobal(trimmed, user)),
      this.safeSearch('products', () => this.productService.searchGlobal(trimmed, user)),
      this.safeSearch('salesOrders', () => this.salesOrderService.searchGlobal(trimmed, user)),
      this.safeSearch('purchaseOrders', () =>
        this.purchaseOrderService.searchGlobal(trimmed, user),
      ),
      this.safeSearch('suppliers', () => this.supplierService.searchGlobal(trimmed, user)),
      this.safeSearch('customerPayments', () => this.paymentService.searchGlobal(trimmed, user)),
      this.safeSearch('vendorPayments', () =>
        this.vendorPaymentService.searchGlobal(trimmed, user),
      ),
    ]);
    const executionTimeMs = Date.now() - startTime;

    const results = [
      ...pages,
      ...customers,
      ...products,
      ...salesOrders,
      ...purchaseOrders,
      ...suppliers,
      ...customerPayments,
      ...vendorPayments,
    ]
      .sort((a, b) => {
        const scoreDiff = (b.score ?? 0) - (a.score ?? 0);
        if (scoreDiff !== 0) return scoreDiff;

        return (a.label ?? '').toLowerCase().localeCompare((b.label ?? '').toLowerCase());
      })
      .slice(0, SEARCH_RESPONSE_LIMIT);

    try {
      this.searchAnalyticsService.logQuery({
        id: searchQueryId,
        query: trimmed,
        userId: user.userId,
        resultCount: results.length,
        executionTimeMs,
      });
    } catch (error) {
      this.logger.error(`Search analytics logging failed: ${(error as Error).message}`);
    }

    return { query, searchQueryId, results };
  }

  private async safeSearch(
    source: string,
    fn: () => Promise<GlobalSearchResultDto[]>,
  ): Promise<GlobalSearchResultDto[]> {
    try {
      return await fn();
    } catch (error) {
      this.logger.error(`Search source "${source}" failed: ${(error as Error).message}`);
      return [];
    }
  }

  private searchPages(query: string, user: { role: UserRole }): GlobalSearchResultDto[] {
    const q = query.toLowerCase();
    const accessible = STATIC_PAGES.filter((page) => page.roles.includes(user.role));

    return accessible
      .filter(
        (page) =>
          page.label.toLowerCase().includes(q) ||
          page.keywords.some((keyword) => keyword.toLowerCase().includes(q)),
      )
      .map((page) => ({
        type: 'page',
        label: page.label,
        description: getPageCategory(page.route),
        route: page.route,
        score:
          page.label.toLowerCase() === q
            ? SCORE_PAGE_EXACT + BOOST_PAGE
            : page.label.toLowerCase().startsWith(q)
              ? SCORE_PAGE_STARTSWITH + BOOST_PAGE
              : SCORE_PAGE_KEYWORD + BOOST_PAGE,
      }));
  }
}
