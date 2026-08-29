import type { ReactNode } from 'react';
import { default as DashboardIcon } from '@mui/icons-material/Dashboard';
import { default as InventoryIcon } from '@mui/icons-material/Inventory';
import { default as SalesIcon } from '@mui/icons-material/PointOfSale';
import { default as PurchasingIcon } from '@mui/icons-material/Assignment';
import { default as SettingsIcon } from '@mui/icons-material/Settings';
import { default as CategoryIcon } from '@mui/icons-material/Category';
import { default as ProductIcon } from '@mui/icons-material/ShoppingCart';
import { default as CustomersIcon } from '@mui/icons-material/People';
import { default as OrdersIcon } from '@mui/icons-material/Receipt';
import { default as PaymentsIcon } from '@mui/icons-material/Payment';
import { default as SuppliersIcon } from '@mui/icons-material/Business';
import { default as CompanyIcon } from '@mui/icons-material/BusinessCenter';
import { default as PurchaseOrderIcon } from '@mui/icons-material/Description';
import { default as StockAdjustmentIcon } from '@mui/icons-material/SwapVert';
import { default as SwapHorizIcon } from '@mui/icons-material/SwapHoriz';
import { default as PriceCostingIcon } from '@mui/icons-material/PriceChange';
import { default as AccountBalanceWalletIcon } from '@mui/icons-material/AccountBalanceWallet';
import { default as AccountTreeIcon } from '@mui/icons-material/AccountTree';
import { default as ReceiptLongIcon } from '@mui/icons-material/ReceiptLong';
import { default as MenuBookIcon } from '@mui/icons-material/MenuBook';
import { default as BalanceIcon } from '@mui/icons-material/Balance';
import { default as AssessmentIcon } from '@mui/icons-material/Assessment';
import { default as PrintIcon } from '@mui/icons-material/Print';
import { default as DocumentNumberIcon } from '@mui/icons-material/FormatListNumbered';
import { default as BackupIcon } from '@mui/icons-material/Backup';
import { default as MemoryIcon } from '@mui/icons-material/Memory';
import { default as AuditIcon } from '@mui/icons-material/ManageSearch';
import { default as PeopleIcon } from '@mui/icons-material/People';
import { default as SecurityIcon } from '@mui/icons-material/Security';
import { default as LockIcon } from '@mui/icons-material/Lock';
import { default as PriceTagIcon } from '@mui/icons-material/LocalOffer';
import { default as RegionalIcon } from '@mui/icons-material/Language';
import { default as StockLevelIcon } from '@mui/icons-material/WarningAmber';
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

export function getFilteredMenuSections(sections: MenuSection[], role: Role): MenuSection[] {
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
        icon: <AccountBalanceWalletIcon />,
        children: [
          {
            id: 'chart-of-accounts',
            title: 'Chart of Accounts',
            icon: <AccountTreeIcon />,
            path: '/accounting/chart-of-accounts',
            roles: ALL_ROLES,
          },
          {
            id: 'journal-entries',
            title: 'Journal Entries',
            icon: <ReceiptLongIcon />,
            path: '/accounting/journal-entries',
            roles: ALL_ROLES,
          },
          {
            id: 'expenses',
            title: 'Expenses',
            icon: <DocumentNumberIcon />,
            path: '/accounting/expenses',
            roles: ALL_ROLES,
          },
          {
            id: 'owner-equity',
            title: 'Owner Equity',
            icon: <AccountBalanceWalletIcon />,
            path: '/accounting/owner-equity',
            roles: ALL_ROLES,
          },
          {
            id: 'general-ledger',
            title: 'General Ledger',
            icon: <MenuBookIcon />,
            path: '/accounting/general-ledger',
            roles: ALL_ROLES,
          },
          {
            id: 'trial-balance',
            title: 'Trial Balance',
            icon: <BalanceIcon />,
            path: '/accounting/trial-balance',
            roles: ALL_ROLES,
          },
          {
            id: 'profit-and-loss',
            title: 'Profit & Loss',
            icon: <AssessmentIcon />,
            path: '/accounting/profit-and-loss',
            roles: ALL_ROLES,
          },
          {
            id: 'accounting-settings',
            title: 'Accounting Settings',
            icon: <SettingsIcon />,
            path: '/accounting/settings',
            roles: ALL_ROLES,
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
            id: 'stock-level-settings',
            title: 'Stock Levels',
            icon: <StockLevelIcon />,
            group: 'Business',
            path: '/settings/stock-levels',
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
          {
            id: 'redis-monitoring',
            title: 'Redis Monitoring',
            icon: <MemoryIcon />,
            group: 'System',
            path: '/settings/redis-monitoring',
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
