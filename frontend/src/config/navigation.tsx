import type { ReactNode } from 'react';
import {
  Dashboard as DashboardIcon,
  Inventory as InventoryIcon,
  PointOfSale as SalesIcon,
  Assignment as PurchasingIcon,
  Settings as SettingsIcon,
  Category as CategoryIcon,
  ShoppingCart as ProductIcon,
  People as CustomersIcon,
  Receipt as OrdersIcon,
  ReceiptLong as InvoiceIcon,
  Payment as PaymentsIcon,
  Business as SuppliersIcon,
  LocalShipping as GRNIcon,
  BusinessCenter as CompanyIcon,
  Description as PurchaseOrderIcon,
  AccountBalance as VendorPaymentsIcon,
  SwapVert as StockAdjustmentIcon,
  SwapHoriz as SwapHorizIcon,
  PriceChange as PriceCostingIcon,
  Summarize as SummaryIcon,
  ListAlt as DetailIcon,
  TrendingUp as ProfitIcon,
  AccountBalanceWallet as PaymentSummaryIcon,
  AccountBalanceWallet as AccountBalanceWalletIcon,
  ReceiptLongOutlined as PaymentOrderIcon,
  MonetizationOn as PaymentDetailIcon,
  History as HistoryIcon,
  PersonSearch as CustomerProductIcon,
  Inventory2 as InventorySummaryIcon,
  Timeline as HistoricalInventoryIcon,
  CompareArrows as MovementSummaryIcon,
  AttachMoney as PriceListIcon,
  TrendingDown as CostReportIcon,
  Print as PrintIcon,
  FormatListNumbered as DocumentNumberIcon,
  Backup as BackupIcon,
  ManageSearch as AuditIcon,
  People as PeopleIcon,
  Security as SecurityIcon,
  Lock as LockIcon,
  LocalOffer as PriceTagIcon,
  AccountBalance as AccountBalanceIcon,
  AccountBalanceOutlined as AccountBalanceOutlinedIcon,
  AccountTree as AccountTreeIcon,
  Description as DescriptionIcon,
  DateRange as DateRangeIcon,
  Assessment as AssessmentIcon,
  ShowChart as ShowChartIcon,
  ReceiptLong as ReceiptLongIcon,
  Timeline as TimelineIcon,
  MenuBook as MenuBookIcon,
  Language as RegionalIcon,
} from '@mui/icons-material';
import type { AuthUser } from '../store/slices/authSlice';

export type Role = AuthUser['role'];

const ALL_ROLES: Role[] = [
  'admin',
  'manager',
  'sales_staff',
  'inventory_staff',
  'procurement_staff',
];
const SALES_ROLES: Role[] = ['admin', 'manager', 'sales_staff'];
const PROCUREMENT_ROLES: Role[] = ['admin', 'manager', 'procurement_staff'];
const INVENTORY_ROLES: Role[] = ['admin', 'manager', 'inventory_staff'];
const FINANCE_ROLES: Role[] = ['admin', 'manager'];
const ADMIN_ONLY: Role[] = ['admin'];

export interface MenuItem {
  id: string;
  title: string;
  icon: ReactNode;
  path?: string;
  badge?: number | string;
  group?: string;
  children?: MenuItem[];
  flyoutMode?: 'category-first';
  roles?: Role[];
}

export interface MenuSection {
  id: string;
  title: string;
  items: MenuItem[];
}

export function filterMenuItems(items: MenuItem[], role: Role): MenuItem[] {
  return items
    .map((item) => {
      if (item.children?.length) {
        const children = filterMenuItems(item.children, role);
        return children.length > 0 ? { ...item, children } : null;
      }

      return item.roles?.includes(role) ? item : null;
    })
    .filter((item): item is MenuItem => item !== null);
}

export function getFilteredMenuSections(
  sections: MenuSection[],
  role: Role,
): MenuSection[] {
  return sections
    .map((section) => ({
      ...section,
      items: filterMenuItems(section.items, role),
    }))
    .filter((section) => section.items.length > 0);
}

export const menuSections: MenuSection[] = [
  {
    id: 'primary',
    title: 'Primary',
    items: [
      {
        id: 'dashboard',
        title: 'Dashboard',
        icon: <DashboardIcon />,
        path: '/dashboard',
        roles: ALL_ROLES,
      },
    ],
  },
  {
    id: 'operations',
    title: 'Operations',
    items: [
      {
        id: 'sales',
        title: 'Sales',
        icon: <SalesIcon />,
        children: [
          {
            id: 'sales-overview',
            title: 'Overview',
            icon: <SalesIcon />,
            path: '/sales',
            roles: SALES_ROLES,
          },
          {
            id: 'customers',
            title: 'Customers',
            icon: <CustomersIcon />,
            path: '/sales/customers',
            roles: SALES_ROLES,
          },
          {
            id: 'orders',
            title: 'Sales Orders',
            icon: <OrdersIcon />,
            path: '/sales/orders',
            roles: SALES_ROLES,
          },
          {
            id: 'invoices',
            title: 'Invoices',
            icon: <InvoiceIcon />,
            path: '/sales/invoices',
            roles: SALES_ROLES,
          },
          {
            id: 'payments',
            title: 'Payments',
            icon: <PaymentsIcon />,
            path: '/sales/payments',
            roles: SALES_ROLES,
          },
        ],
      },
      {
        id: 'purchasing',
        title: 'Purchasing',
        icon: <PurchasingIcon />,
        children: [
          {
            id: 'purchasing-overview',
            title: 'Overview',
            icon: <PurchasingIcon />,
            path: '/purchasing',
            roles: PROCUREMENT_ROLES,
          },
          {
            id: 'suppliers',
            title: 'Suppliers',
            icon: <SuppliersIcon />,
            path: '/purchasing/suppliers',
            roles: PROCUREMENT_ROLES,
          },
          {
            id: 'purchase-orders',
            title: 'Purchase Orders',
            icon: <PurchaseOrderIcon />,
            path: '/purchasing/orders',
            roles: PROCUREMENT_ROLES,
          },
          {
            id: 'grn',
            title: 'Goods Received',
            icon: <GRNIcon />,
            path: '/purchasing/goods-received',
            roles: PROCUREMENT_ROLES,
          },
          {
            id: 'vendor-payments',
            title: 'Vendor Payments',
            icon: <VendorPaymentsIcon />,
            path: '/purchasing/vendor-payments',
            roles: PROCUREMENT_ROLES,
          },
        ],
      },
      {
        id: 'inventory',
        title: 'Inventory',
        icon: <InventoryIcon />,
        children: [
          {
            id: 'inventory-overview',
            title: 'Overview',
            icon: <InventoryIcon />,
            path: '/inventory',
            roles: INVENTORY_ROLES,
          },
          {
            id: 'products',
            title: 'Products',
            icon: <ProductIcon />,
            path: '/inventory/products',
            roles: INVENTORY_ROLES,
          },
          {
            id: 'categories',
            title: 'Categories',
            icon: <CategoryIcon />,
            path: '/inventory/categories',
            roles: INVENTORY_ROLES,
          },
          {
            id: 'stock-adjustments',
            title: 'Stock Adjustments',
            icon: <StockAdjustmentIcon />,
            path: '/inventory/stock-adjustments',
            roles: INVENTORY_ROLES,
          },
        ],
      },
    ],
  },
  {
    id: 'finance',
    title: 'Finance',
    items: [
      {
        id: 'accounting',
        title: 'Accounting',
        icon: <AccountBalanceIcon />,
        children: [
          {
            id: 'accounting-dashboard',
            title: 'Dashboard',
            icon: <DashboardIcon />,
            path: '/accounting/dashboard',
            roles: FINANCE_ROLES,
          },
          {
            id: 'chart-of-accounts',
            title: 'Chart of Accounts',
            icon: <AccountTreeIcon />,
            path: '/accounting/chart-of-accounts',
            roles: FINANCE_ROLES,
          },
          {
            id: 'journal-entries',
            title: 'Journal Entries',
            icon: <DescriptionIcon />,
            path: '/accounting/journal-entries',
            roles: FINANCE_ROLES,
          },
          {
            id: 'bank-reconciliation',
            title: 'Bank Reconciliation',
            icon: <AccountBalanceOutlinedIcon />,
            path: '/accounting/bank-reconciliations',
            roles: FINANCE_ROLES,
          },
          {
            id: 'expenses',
            title: 'Expenses',
            icon: <OrdersIcon />,
            path: '/accounting/expenses',
            roles: FINANCE_ROLES,
          },
          {
            id: 'fund-transfers',
            title: 'Fund Transfers',
            icon: <SwapHorizIcon />,
            path: '/accounting/fund-transfers',
            roles: FINANCE_ROLES,
          },
          {
            id: 'settlements',
            title: 'Settlements',
            icon: <AccountBalanceWalletIcon />,
            path: '/accounting/settlements',
            roles: FINANCE_ROLES,
          },
          {
            id: 'owner-equity',
            title: "Owner's Equity",
            icon: <AccountBalanceWalletIcon />,
            path: '/accounting/owner-equity',
            roles: FINANCE_ROLES,
          },
          {
            id: 'fiscal-periods',
            title: 'Fiscal Periods',
            icon: <DateRangeIcon />,
            path: '/accounting/fiscal-periods',
            roles: ADMIN_ONLY,
          },
          {
            id: 'account-mappings',
            title: 'Account Mappings',
            icon: <SettingsIcon />,
            path: '/accounting/account-mappings',
            roles: ADMIN_ONLY,
          },
        ],
      },
    ],
  },
  {
    id: 'insights',
    title: 'Insights',
    items: [
      {
        id: 'reports',
        title: 'Reports',
        icon: <AssessmentIcon />,
        flyoutMode: 'category-first',
        children: [
          {
            id: 'sales-by-product-summary',
            title: 'Product Summary',
            icon: <SummaryIcon />,
            group: 'Sales',
            path: '/reports/sales/product-summary',
            roles: SALES_ROLES,
          },
          {
            id: 'sales-by-product-details',
            title: 'Product Details',
            icon: <DetailIcon />,
            group: 'Sales',
            path: '/reports/sales/product-details',
            roles: SALES_ROLES,
          },
          {
            id: 'sales-order-summary',
            title: 'Order Summary',
            icon: <OrdersIcon />,
            group: 'Sales',
            path: '/reports/sales/order-summary',
            roles: SALES_ROLES,
          },
          {
            id: 'sales-order-profit-report',
            title: 'Order Profit',
            icon: <ProfitIcon />,
            group: 'Sales',
            path: '/reports/sales/order-profit',
            roles: SALES_ROLES,
          },
          {
            id: 'customer-payment-summary',
            title: 'Payment Summary',
            icon: <PaymentSummaryIcon />,
            group: 'Sales',
            path: '/reports/sales/customer-payment-summary',
            roles: SALES_ROLES,
          },
          {
            id: 'customer-payment-by-order',
            title: 'Payment by Order',
            icon: <PaymentOrderIcon />,
            group: 'Sales',
            path: '/reports/sales/payment-by-order',
            roles: SALES_ROLES,
          },
          {
            id: 'customer-payment-details',
            title: 'Payment Details',
            icon: <PaymentDetailIcon />,
            group: 'Sales',
            path: '/reports/sales/payment-details',
            roles: SALES_ROLES,
          },
          {
            id: 'customer-order-history',
            title: 'Order History',
            icon: <HistoryIcon />,
            group: 'Sales',
            path: '/reports/sales/order-history',
            roles: SALES_ROLES,
          },
          {
            id: 'product-customer-report',
            title: 'Product Customers',
            icon: <CustomerProductIcon />,
            group: 'Sales',
            path: '/reports/sales/product-customer',
            roles: SALES_ROLES,
          },
          {
            id: 'purchase-order-summary',
            title: 'Order Summary',
            icon: <SummaryIcon />,
            group: 'Purchasing',
            path: '/reports/purchasing/order-summary',
            roles: PROCUREMENT_ROLES,
          },
          {
            id: 'purchase-order-details',
            title: 'Order Details',
            icon: <DetailIcon />,
            group: 'Purchasing',
            path: '/reports/purchasing/order-details',
            roles: PROCUREMENT_ROLES,
          },
          {
            id: 'purchase-order-status',
            title: 'Order Status',
            icon: <OrdersIcon />,
            group: 'Purchasing',
            path: '/reports/purchasing/order-status',
            roles: PROCUREMENT_ROLES,
          },
          {
            id: 'vendor-payment-details',
            title: 'Payment Details',
            icon: <PaymentDetailIcon />,
            group: 'Purchasing',
            path: '/reports/purchasing/payment-details',
            roles: PROCUREMENT_ROLES,
          },
          {
            id: 'vendor-purchase-list',
            title: 'Vendor Products',
            icon: <SuppliersIcon />,
            group: 'Purchasing',
            path: '/reports/purchasing/vendor-purchase-list',
            roles: PROCUREMENT_ROLES,
          },
          {
            id: 'inventory-summary',
            title: 'Inventory Summary',
            icon: <InventorySummaryIcon />,
            group: 'Inventory',
            path: '/reports/inventory/summary',
            roles: INVENTORY_ROLES,
          },
          {
            id: 'historical-inventory',
            title: 'Historical Inventory',
            icon: <HistoricalInventoryIcon />,
            group: 'Inventory',
            path: '/reports/inventory/historical',
            roles: INVENTORY_ROLES,
          },
          {
            id: 'inventory-movement-summary',
            title: 'Movement Summary',
            icon: <MovementSummaryIcon />,
            group: 'Inventory',
            path: '/reports/inventory/movement-summary',
            roles: INVENTORY_ROLES,
          },
          {
            id: 'product-price-list',
            title: 'Product Price List',
            icon: <PriceListIcon />,
            group: 'Inventory',
            path: '/reports/inventory/price-list',
            roles: INVENTORY_ROLES,
          },
          {
            id: 'product-cost-report',
            title: 'Product Cost Report',
            icon: <CostReportIcon />,
            group: 'Inventory',
            path: '/reports/inventory/product-cost',
            roles: INVENTORY_ROLES,
          },
          {
            id: 'trial-balance',
            title: 'Trial Balance',
            icon: <AccountBalanceIcon />,
            group: 'Accounting',
            path: '/accounting/reports/trial-balance',
            roles: FINANCE_ROLES,
          },
          {
            id: 'balance-sheet',
            title: 'Balance Sheet',
            icon: <ReceiptLongIcon />,
            group: 'Accounting',
            path: '/accounting/reports/balance-sheet',
            roles: FINANCE_ROLES,
          },
          {
            id: 'profit-loss',
            title: 'Profit & Loss',
            icon: <ShowChartIcon />,
            group: 'Accounting',
            path: '/accounting/reports/profit-loss',
            roles: FINANCE_ROLES,
          },
          {
            id: 'general-ledger',
            title: 'General Ledger',
            icon: <MenuBookIcon />,
            group: 'Accounting',
            path: '/accounting/reports/general-ledger',
            roles: FINANCE_ROLES,
          },
          {
            id: 'account-activity',
            title: 'Account Activity',
            icon: <TimelineIcon />,
            group: 'Accounting',
            path: '/accounting/reports/account-activity',
            roles: FINANCE_ROLES,
          },
        ],
      },
    ],
  },
  {
    id: 'administration',
    title: 'Administration',
    items: [
      {
        id: 'settings',
        title: 'Settings',
        icon: <SettingsIcon />,
        children: [
          {
            id: 'company-settings',
            title: 'Company',
            icon: <CompanyIcon />,
            group: 'Business',
            path: '/settings/company',
            roles: ADMIN_ONLY,
          },
          {
            id: 'inventory-costing-settings',
            title: 'Inventory Costing',
            icon: <PriceCostingIcon />,
            group: 'Business',
            path: '/settings/inventory-costing',
            roles: ADMIN_ONLY,
          },
          {
            id: 'regional-settings',
            title: 'Regional',
            icon: <RegionalIcon />,
            group: 'Business',
            path: '/settings/regional',
            roles: ADMIN_ONLY,
          },
          {
            id: 'price-lists',
            title: 'Price Lists',
            icon: <PriceTagIcon />,
            group: 'Business',
            path: '/settings/price-lists',
            roles: ADMIN_ONLY,
          },
          {
            id: 'payment-methods',
            title: 'Payment Methods',
            icon: <PaymentsIcon />,
            group: 'Business',
            path: '/settings/payment-methods',
            roles: ADMIN_ONLY,
          },
          {
            id: 'print-settings',
            title: 'Print Settings',
            icon: <PrintIcon />,
            group: 'Business',
            path: '/settings/print',
            roles: ADMIN_ONLY,
          },
          {
            id: 'document-numbers',
            title: 'Document Numbers',
            icon: <DocumentNumberIcon />,
            group: 'Business',
            path: '/settings/document-numbers',
            roles: ADMIN_ONLY,
          },
          {
            id: 'users',
            title: 'Users',
            icon: <PeopleIcon />,
            group: 'Access',
            path: '/settings/users',
            roles: ADMIN_ONLY,
          },
          {
            id: 'roles',
            title: 'Roles & Permissions',
            icon: <SecurityIcon />,
            group: 'Access',
            path: '/settings/roles',
            roles: ADMIN_ONLY,
          },
          {
            id: 'security',
            title: 'Security',
            icon: <LockIcon />,
            group: 'Access',
            path: '/settings/security',
            roles: ADMIN_ONLY,
          },
          {
            id: 'backup-restore',
            title: 'Backup & Restore',
            icon: <BackupIcon />,
            group: 'System',
            path: '/settings/backup',
            roles: ADMIN_ONLY,
          },
        ],
      },
      {
        id: 'audit-logs',
        title: 'Audit Logs',
        icon: <AuditIcon />,
        path: '/audit-logs',
        roles: ADMIN_ONLY,
      },
    ],
  },
];
