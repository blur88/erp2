import React, { useEffect } from 'react'
import { useLocation, useNavigate } from 'react-router-dom'
import {
  Box,
  List,
  ListItem,
  ListItemButton,
  ListItemIcon,
  ListItemText,
  Divider,
  Typography,
  Collapse,
  Badge,
  IconButton,
  Tooltip,
  Popper,
  Fade,
  Paper,
} from '@mui/material'
import {
  Dashboard as DashboardIcon,
  Inventory as InventoryIcon,
  PointOfSale as SalesIcon,
  Assignment as PurchasingIcon,
  Settings as SettingsIcon,
  ExpandMore,
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
  ChevronLeft,
  ChevronRight,
} from '@mui/icons-material'
import { useGetCompanySettingsQuery } from '@/store/api/settingsApi'

interface SidebarProps {
  onItemClick?: () => void
  collapsed?: boolean
  onToggleCollapse?: () => void
}

interface MenuSection {
  id: string
  title: string
  items: MenuItem[]
}

interface MenuItem {
  id: string
  title: string
  icon: React.ReactNode
  path?: string
  badge?: number | string
  group?: string
  children?: MenuItem[]
}

const SIDEBAR_COLORS = {
  bg: '#0D0D0D',
  activeBg: '#1F2937',
  hoverBg: '#1E1E1E',
  text: '#9CA3AF',
  activeText: '#FFFFFF',
  hoverText: '#CBD5E1',
  activeIcon: '#3B82F6',
  icon: '#6B7280',
  sectionLabel: '#6B7280',
  border: '#1F2937',
  accentBar: '#42a5f5',
} as const

const menuSections: MenuSection[] = [
  {
    id: 'primary',
    title: 'Primary',
    items: [
      {
        id: 'dashboard',
        title: 'Dashboard',
        icon: <DashboardIcon />,
        path: '/dashboard',
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
          },
          {
            id: 'customers',
            title: 'Customers',
            icon: <CustomersIcon />,
            path: '/sales/customers',
          },
          {
            id: 'orders',
            title: 'Sales Orders',
            icon: <OrdersIcon />,
            path: '/sales/orders',
          },
          {
            id: 'invoices',
            title: 'Invoices',
            icon: <InvoiceIcon />,
            path: '/sales/invoices',
          },
          {
            id: 'payments',
            title: 'Payments',
            icon: <PaymentsIcon />,
            path: '/sales/payments',
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
          },
          {
            id: 'suppliers',
            title: 'Suppliers',
            icon: <SuppliersIcon />,
            path: '/purchasing/suppliers',
          },
          {
            id: 'purchase-orders',
            title: 'Purchase Orders',
            icon: <PurchaseOrderIcon />,
            path: '/purchasing/orders',
          },
          {
            id: 'grn',
            title: 'Goods Received',
            icon: <GRNIcon />,
            path: '/purchasing/goods-received',
          },
          {
            id: 'vendor-payments',
            title: 'Vendor Payments',
            icon: <VendorPaymentsIcon />,
            path: '/purchasing/vendor-payments',
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
          },
          {
            id: 'products',
            title: 'Products',
            icon: <ProductIcon />,
            path: '/inventory/products',
          },
          {
            id: 'categories',
            title: 'Categories',
            icon: <CategoryIcon />,
            path: '/inventory/categories',
          },
          {
            id: 'stock-adjustments',
            title: 'Stock Adjustments',
            icon: <StockAdjustmentIcon />,
            path: '/inventory/stock-adjustments',
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
          },
          {
            id: 'chart-of-accounts',
            title: 'Chart of Accounts',
            icon: <AccountTreeIcon />,
            path: '/accounting/chart-of-accounts',
          },
          {
            id: 'journal-entries',
            title: 'Journal Entries',
            icon: <DescriptionIcon />,
            path: '/accounting/journal-entries',
          },
          {
            id: 'bank-reconciliation',
            title: 'Bank Reconciliation',
            icon: <AccountBalanceOutlinedIcon />,
            path: '/accounting/bank-reconciliations',
          },
          {
            id: 'expenses',
            title: 'Expenses',
            icon: <OrdersIcon />,
            path: '/accounting/expenses',
          },
          {
            id: 'fund-transfers',
            title: 'Fund Transfers',
            icon: <SwapHorizIcon />,
            path: '/accounting/fund-transfers',
          },
          {
            id: 'settlements',
            title: 'Settlements',
            icon: <AccountBalanceWalletIcon />,
            path: '/accounting/settlements',
          },
          {
            id: 'owner-equity',
            title: "Owner's Equity",
            icon: <AccountBalanceWalletIcon />,
            path: '/accounting/owner-equity',
          },
          {
            id: 'fiscal-periods',
            title: 'Fiscal Periods',
            icon: <DateRangeIcon />,
            path: '/accounting/fiscal-periods',
          },
          {
            id: 'account-mappings',
            title: 'Account Mappings',
            icon: <SettingsIcon />,
            path: '/accounting/account-mappings',
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
        children: [
          {
            id: 'sales-by-product-summary',
            title: 'Product Summary',
            icon: <SummaryIcon />,
            group: 'Sales',
            path: '/reports/sales/product-summary',
          },
          {
            id: 'sales-by-product-details',
            title: 'Product Details',
            icon: <DetailIcon />,
            group: 'Sales',
            path: '/reports/sales/product-details',
          },
          {
            id: 'sales-order-summary',
            title: 'Order Summary',
            icon: <OrdersIcon />,
            group: 'Sales',
            path: '/reports/sales/order-summary',
          },
          {
            id: 'sales-order-profit-report',
            title: 'Order Profit',
            icon: <ProfitIcon />,
            group: 'Sales',
            path: '/reports/sales/order-profit',
          },
          {
            id: 'customer-payment-summary',
            title: 'Payment Summary',
            icon: <PaymentSummaryIcon />,
            group: 'Sales',
            path: '/reports/sales/customer-payment-summary',
          },
          {
            id: 'customer-payment-by-order',
            title: 'Payment by Order',
            icon: <PaymentOrderIcon />,
            group: 'Sales',
            path: '/reports/sales/payment-by-order',
          },
          {
            id: 'customer-payment-details',
            title: 'Payment Details',
            icon: <PaymentDetailIcon />,
            group: 'Sales',
            path: '/reports/sales/payment-details',
          },
          {
            id: 'customer-order-history',
            title: 'Order History',
            icon: <HistoryIcon />,
            group: 'Sales',
            path: '/reports/sales/order-history',
          },
          {
            id: 'product-customer-report',
            title: 'Product Customers',
            icon: <CustomerProductIcon />,
            group: 'Sales',
            path: '/reports/sales/product-customer',
          },
          {
            id: 'purchase-order-summary',
            title: 'Order Summary',
            icon: <SummaryIcon />,
            group: 'Purchasing',
            path: '/reports/purchasing/order-summary',
          },
          {
            id: 'purchase-order-details',
            title: 'Order Details',
            icon: <DetailIcon />,
            group: 'Purchasing',
            path: '/reports/purchasing/order-details',
          },
          {
            id: 'purchase-order-status',
            title: 'Order Status',
            icon: <OrdersIcon />,
            group: 'Purchasing',
            path: '/reports/purchasing/order-status',
          },
          {
            id: 'vendor-payment-details',
            title: 'Payment Details',
            icon: <PaymentDetailIcon />,
            group: 'Purchasing',
            path: '/reports/purchasing/payment-details',
          },
          {
            id: 'vendor-purchase-list',
            title: 'Vendor Products',
            icon: <SuppliersIcon />,
            group: 'Purchasing',
            path: '/reports/purchasing/vendor-purchase-list',
          },
          {
            id: 'inventory-summary',
            title: 'Inventory Summary',
            icon: <InventorySummaryIcon />,
            group: 'Inventory',
            path: '/reports/inventory/summary',
          },
          {
            id: 'historical-inventory',
            title: 'Historical Inventory',
            icon: <HistoricalInventoryIcon />,
            group: 'Inventory',
            path: '/reports/inventory/historical',
          },
          {
            id: 'inventory-movement-summary',
            title: 'Movement Summary',
            icon: <MovementSummaryIcon />,
            group: 'Inventory',
            path: '/reports/inventory/movement-summary',
          },
          {
            id: 'product-price-list',
            title: 'Product Price List',
            icon: <PriceListIcon />,
            group: 'Inventory',
            path: '/reports/inventory/price-list',
          },
          {
            id: 'product-cost-report',
            title: 'Product Cost Report',
            icon: <CostReportIcon />,
            group: 'Inventory',
            path: '/reports/inventory/product-cost',
          },
          {
            id: 'trial-balance',
            title: 'Trial Balance',
            icon: <AccountBalanceIcon />,
            group: 'Accounting',
            path: '/accounting/reports/trial-balance',
          },
          {
            id: 'balance-sheet',
            title: 'Balance Sheet',
            icon: <ReceiptLongIcon />,
            group: 'Accounting',
            path: '/accounting/reports/balance-sheet',
          },
          {
            id: 'profit-loss',
            title: 'Profit & Loss',
            icon: <ShowChartIcon />,
            group: 'Accounting',
            path: '/accounting/reports/profit-loss',
          },
          {
            id: 'general-ledger',
            title: 'General Ledger',
            icon: <MenuBookIcon />,
            group: 'Accounting',
            path: '/accounting/reports/general-ledger',
          },
          {
            id: 'account-activity',
            title: 'Account Activity',
            icon: <TimelineIcon />,
            group: 'Accounting',
            path: '/accounting/reports/account-activity',
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
          },
          {
            id: 'price-costing-settings',
            title: 'Inventory Costing',
            icon: <PriceCostingIcon />,
            group: 'Business',
            path: '/settings/price-costing',
          },
          {
            id: 'regional-settings',
            title: 'Regional',
            icon: <RegionalIcon />,
            group: 'Business',
            path: '/settings/regional',
          },
          {
            id: 'price-lists',
            title: 'Price Lists',
            icon: <PriceTagIcon />,
            group: 'Business',
            path: '/settings/price-lists',
          },
          {
            id: 'payment-methods',
            title: 'Payment Methods',
            icon: <PaymentsIcon />,
            group: 'Business',
            path: '/settings/payment-methods',
          },
          {
            id: 'print-settings',
            title: 'Print Settings',
            icon: <PrintIcon />,
            group: 'Business',
            path: '/settings/print',
          },
          {
            id: 'document-numbers',
            title: 'Document Numbers',
            icon: <DocumentNumberIcon />,
            group: 'Business',
            path: '/settings/document-numbers',
          },
          {
            id: 'users',
            title: 'Users',
            icon: <PeopleIcon />,
            group: 'Access',
            path: '/settings/users',
          },
          {
            id: 'roles',
            title: 'Roles & Permissions',
            icon: <SecurityIcon />,
            group: 'Access',
            path: '/settings/roles',
          },
          {
            id: 'security',
            title: 'Security',
            icon: <LockIcon />,
            group: 'Access',
            path: '/settings/security',
          },
          {
            id: 'backup-restore',
            title: 'Backup & Restore',
            icon: <BackupIcon />,
            group: 'System',
            path: '/settings/backup',
          },
        ],
      },
      {
        id: 'audit-logs',
        title: 'Audit Logs',
        icon: <AuditIcon />,
        path: '/audit-logs',
      },
    ],
  },
]

const Sidebar: React.FC<SidebarProps> = ({
  onItemClick,
  collapsed = false,
  onToggleCollapse,
}) => {
  const location = useLocation()
  const navigate = useNavigate()
  const { data: company } = useGetCompanySettingsQuery()
  const [expandedItems, setExpandedItems] = React.useState<string[]>(() => {
    const stored = localStorage.getItem('sidebar-expanded')
    return stored ? JSON.parse(stored) : []
  })
  const [imageError, setImageError] = React.useState(false)

  useEffect(() => {
    const currentPath = location.pathname
    const parentItems: string[] = []

    const findParentItems = (items: MenuItem[], parents: string[] = []): void => {
      items.forEach(item => {
        if (item.path === currentPath) {
          parentItems.push(...parents)
        } else if (item.children) {
          findParentItems(item.children, [...parents, item.id])
        }
      })
    }

    menuSections.forEach(section => {
      findParentItems(section.items)
    })

    setExpandedItems(prev => {
      const isSame =
        prev.length === parentItems.length &&
        prev.every((id, index) => id === parentItems[index])

      if (isSame) {
        return prev
      }

      localStorage.setItem('sidebar-expanded', JSON.stringify(parentItems))
      return parentItems
    })
  }, [location.pathname])

  const getFilteredMenuSections = () => {
    return menuSections
  }

  const handleItemClick = (item: MenuItem) => {
    if (item.path) {
      navigate(item.path)
      onItemClick?.()
    } else if (item.children) {
      toggleExpanded(item.id)
    }
  }

  const toggleExpanded = (itemId: string) => {
    setExpandedItems(prev => {
      const newExpanded = prev.includes(itemId)
        ? prev.filter(id => id !== itemId)
        : [...prev, itemId]

      localStorage.setItem('sidebar-expanded', JSON.stringify(newExpanded))
      return newExpanded
    })
  }

  const isItemActive = (item: MenuItem): boolean => {
    if (item.path) {
      return location.pathname === item.path
    }
    if (item.children) {
      return item.children.some(child => isItemActive(child))
    }
    return false
  }

  const [flyoutItemId, setFlyoutItemId] = React.useState<string | null>(null)
  const [flyoutAnchorEl, setFlyoutAnchorEl] = React.useState<HTMLElement | null>(null)
  const [flyoutExpandedIds, setFlyoutExpandedIds] = React.useState<string[]>([])
  const [flyoutOpen, setFlyoutOpen] = React.useState(false)
  const openTimerRef = React.useRef<ReturnType<typeof setTimeout> | null>(null)
  const closeTimerRef = React.useRef<ReturnType<typeof setTimeout> | null>(null)
  const clearFlyoutStateTimerRef = React.useRef<ReturnType<typeof setTimeout> | null>(null)

  const clearOpenTimer = () => {
    if (openTimerRef.current) {
      clearTimeout(openTimerRef.current)
      openTimerRef.current = null
    }
  }

  const clearCloseTimer = () => {
    if (closeTimerRef.current) {
      clearTimeout(closeTimerRef.current)
      closeTimerRef.current = null
    }
  }

  const openFlyout = (itemId: string, anchorEl: HTMLElement) => {
    clearOpenTimer()
    clearCloseTimer()
    if (clearFlyoutStateTimerRef.current) {
      clearTimeout(clearFlyoutStateTimerRef.current)
      clearFlyoutStateTimerRef.current = null
    }

    const item = menuSections.flatMap(section => section.items).find(menuItem => menuItem.id === itemId)
    const autoExpanded: string[] = []

    if (item?.children) {
      item.children.forEach(child => {
        if (child.children && isItemActive(child)) {
          autoExpanded.push(child.id)
        }
      })
    }

    setFlyoutExpandedIds(autoExpanded)
    setFlyoutItemId(itemId)
    setFlyoutAnchorEl(anchorEl)
    setFlyoutOpen(true)
  }

  const closeFlyout = React.useCallback(() => {
    setFlyoutOpen(false)
    if (clearFlyoutStateTimerRef.current) {
      clearTimeout(clearFlyoutStateTimerRef.current)
    }
    clearFlyoutStateTimerRef.current = setTimeout(() => {
      setFlyoutItemId(null)
      setFlyoutAnchorEl(null)
      setFlyoutExpandedIds([])
      clearFlyoutStateTimerRef.current = null
    }, 80)
  }, [])

  const startCloseFlyout = () => {
    clearCloseTimer()
    closeTimerRef.current = setTimeout(closeFlyout, 150)
  }

  const handleRailMouseEnter = (item: MenuItem, el: HTMLElement) => {
    clearOpenTimer()
    clearCloseTimer()
    openTimerRef.current = setTimeout(() => openFlyout(item.id, el), 80)
  }

  const handleRailMouseLeave = () => {
    clearOpenTimer()
    startCloseFlyout()
  }

  const handleFlyoutMouseEnter = () => {
    clearCloseTimer()
  }

  const handleFlyoutMouseLeave = () => {
    startCloseFlyout()
  }

  // eslint-disable-next-line react-hooks/exhaustive-deps
  React.useEffect(() => {
    setFlyoutOpen(false)
    setFlyoutItemId(null)
    setFlyoutAnchorEl(null)
    setFlyoutExpandedIds([])
    if (openTimerRef.current) clearTimeout(openTimerRef.current)
    if (closeTimerRef.current) clearTimeout(closeTimerRef.current)
    if (clearFlyoutStateTimerRef.current) clearTimeout(clearFlyoutStateTimerRef.current)
  }, [location.pathname])

  React.useEffect(() => {
    return () => {
      if (openTimerRef.current) clearTimeout(openTimerRef.current)
      if (closeTimerRef.current) clearTimeout(closeTimerRef.current)
      if (clearFlyoutStateTimerRef.current) clearTimeout(clearFlyoutStateTimerRef.current)
    }
  }, [])

  React.useEffect(() => {
    setImageError(false)
  }, [company?.logoUrl])

  React.useEffect(() => {
    const handleKeyDown = (e: KeyboardEvent) => {
      if (e.key === 'Escape' && flyoutItemId) {
        const trigger = document.getElementById(`rail-item-${flyoutItemId}`)
        closeFlyout()
        trigger?.focus()
      }
    }

    document.addEventListener('keydown', handleKeyDown)
    return () => document.removeEventListener('keydown', handleKeyDown)
  }, [flyoutItemId, closeFlyout])

  const renderFlyoutItem = (
    item: MenuItem,
    level: number = 0,
    isFirst = false
  ): React.ReactNode => {
    const isActive = isItemActive(item)
    const hasChildren = Boolean(item.children && item.children.length > 0)
    const isExpanded = flyoutExpandedIds.includes(item.id)

    return (
      <React.Fragment key={item.id}>
        <ListItemButton
          {...(isFirst ? { 'data-flyout-first': 'true' } : {})}
          onClick={() => {
            if (item.path) {
              navigate(item.path)
              onItemClick?.()
              closeFlyout()
            } else if (hasChildren) {
              setFlyoutExpandedIds(prev =>
                prev.includes(item.id)
                  ? prev.filter(id => id !== item.id)
                  : [...prev, item.id]
              )
            }
          }}
          aria-expanded={hasChildren ? isExpanded : undefined}
          sx={{
            pl: 1.5 + level * 2,
            pr: 1.5,
            py: 0,
            height: 40,
            borderRadius: 2,
            mx: 0.5,
            mb: 0.25,
            position: 'relative',
            transition: 'background-color 0.18s ease',
            // Leaf active: pill background + left accent bar
            ...(isActive && !hasChildren && {
              bgcolor: SIDEBAR_COLORS.activeBg,
              boxShadow: 'inset 0 0 0 1px rgba(255,255,255,0.03)',
              '&::before': {
                content: '""',
                position: 'absolute',
                left: 0,
                top: '50%',
                transform: 'translateY(-50%)',
                width: 3,
                height: '60%',
                borderRadius: '0 2px 2px 0',
                bgcolor: SIDEBAR_COLORS.accentBar,
              },
            }),
            // Parent active: brighten icon/text when a descendant is current route
            ...(isActive && hasChildren && {
              '& .MuiListItemIcon-root': { color: SIDEBAR_COLORS.activeText },
              '& .MuiListItemText-primary': { color: SIDEBAR_COLORS.activeText },
            }),
            '&:hover': { bgcolor: SIDEBAR_COLORS.hoverBg },
            ...(!isActive && {
              '&:hover .MuiListItemIcon-root': { color: SIDEBAR_COLORS.hoverText },
              '&:hover .MuiListItemText-primary': { color: SIDEBAR_COLORS.hoverText },
            }),
          }}
        >
          <ListItemIcon
            sx={{
              minWidth: 32,
              color: isActive ? SIDEBAR_COLORS.activeIcon : SIDEBAR_COLORS.icon,
              '& .MuiSvgIcon-root': { fontSize: '1.25rem' },
              transition: 'color 0.18s ease',
            }}
          >
            {item.icon}
          </ListItemIcon>
          <ListItemText
            primary={item.title}
            sx={{
              '& .MuiListItemText-primary': {
                fontSize: '0.8125rem',
                fontWeight: isActive && !hasChildren ? 600 : 400,
                color: isActive ? SIDEBAR_COLORS.activeText : SIDEBAR_COLORS.text,
                transition: 'color 0.18s ease',
              },
            }}
          />
          {hasChildren && (
            <Box
              component="span"
              sx={{
                color: SIDEBAR_COLORS.icon,
                display: 'flex',
                alignItems: 'center',
                transition: 'transform 0.2s',
                transform: isExpanded ? 'rotate(180deg)' : 'none',
              }}
            >
              <ExpandMore sx={{ fontSize: '1rem' }} />
            </Box>
          )}
        </ListItemButton>

        {hasChildren && (
          <Collapse in={isExpanded} timeout={200} unmountOnExit>
            <List component="div" disablePadding>
              {item.children?.map((child, idx, arr) => (
                <React.Fragment key={child.id}>
                  {child.group && (idx === 0 || child.group !== arr[idx - 1].group)
                    ? renderGroupLabel(child.group)
                    : null}
                  {renderFlyoutItem(child, level + 1)}
                </React.Fragment>
              ))}
            </List>
          </Collapse>
        )}
      </React.Fragment>
    )
  }

  const renderGroupLabel = (label: string) => (
    <Typography
      key={`group-${label}`}
      variant="caption"
      sx={{
        display: 'block',
        px: 2,
        pt: 1.5,
        pb: 0.5,
        color: SIDEBAR_COLORS.sectionLabel,
        fontWeight: 600,
        fontSize: '0.6875rem',
        textTransform: 'uppercase',
        letterSpacing: '0.08em',
      }}
    >
      {label}
    </Typography>
  )

  const renderMenuItem = (item: MenuItem, level: number = 0) => {
    const isActive = isItemActive(item)
    const isExpanded = expandedItems.includes(item.id)
    const hasChildren = Boolean(item.children && item.children.length > 0)

    const activeLeafSx =
      isActive && !hasChildren
        ? {
            bgcolor: SIDEBAR_COLORS.activeBg,
            boxShadow: 'inset 0 0 0 1px rgba(255,255,255,0.03)',
            '&::before': {
              content: '""',
              position: 'absolute',
              left: 0,
              top: '50%',
              transform: 'translateY(-50%)',
              width: 3,
              height: '60%',
              borderRadius: '0 2px 2px 0',
              bgcolor: SIDEBAR_COLORS.accentBar,
            },
          }
        : {}

    const activeParentSx =
      isActive && hasChildren
        ? {
            '& .MuiListItemIcon-root': { color: SIDEBAR_COLORS.activeText },
            '& .MuiListItemText-primary': { color: SIDEBAR_COLORS.activeText },
          }
        : {}

    if (collapsed && hasChildren) {
      return (
        <React.Fragment key={item.id}>
          <ListItem disablePadding>
            <ListItemButton
              id={`rail-item-${item.id}`}
              aria-label={item.title}
              onMouseEnter={e => handleRailMouseEnter(item, e.currentTarget)}
              onMouseLeave={handleRailMouseLeave}
              onClick={e => openFlyout(item.id, e.currentTarget)}
              onKeyDown={e => {
                if (e.key === 'Enter' || e.key === ' ') {
                  e.preventDefault()
                  openFlyout(item.id, e.currentTarget)
                  setTimeout(() => {
                    const first = document.querySelector<HTMLElement>('[data-flyout-first="true"]')
                    first?.focus()
                  }, 0)
                }
              }}
              aria-haspopup="menu"
              aria-expanded={flyoutItemId === item.id}
              sx={{
                pl: 0,
                py: 0,
                height: 44,
                borderRadius: 1,
                mx: 0.5,
                mb: 0.5,
                justifyContent: 'center',
                position: 'relative',
                transition: 'background-color 0.18s ease',
                ...activeParentSx,
                '&:hover': { bgcolor: SIDEBAR_COLORS.hoverBg },
                ...(!isActive && {
                  '&:hover .MuiListItemIcon-root': { color: SIDEBAR_COLORS.hoverText },
                }),
                '&.Mui-selected': { bgcolor: 'transparent' },
              }}
            >
              <ListItemIcon
                sx={{
                  minWidth: 0,
                  color: isActive ? SIDEBAR_COLORS.activeIcon : SIDEBAR_COLORS.icon,
                  justifyContent: 'center',
                  '& .MuiSvgIcon-root': { fontSize: '1.25rem' },
                  transition: 'color 0.18s ease',
                }}
              >
                {item.icon}
              </ListItemIcon>
            </ListItemButton>
          </ListItem>
        </React.Fragment>
      )
    }

    if (collapsed && !hasChildren) {
      return (
        <React.Fragment key={item.id}>
          <ListItem disablePadding>
            <Tooltip title={item.title} placement="right" enterDelay={400} enterNextDelay={200}>
              <ListItemButton
                onClick={() => handleItemClick(item)}
                sx={{
                  pl: 0,
                  py: 0,
                  height: 44,
                  borderRadius: 1,
                  mx: 0.5,
                  mb: 0.5,
                  justifyContent: 'center',
                  position: 'relative',
                  transition: 'background-color 0.18s ease',
                  ...activeLeafSx,
                  '&:hover': { bgcolor: SIDEBAR_COLORS.hoverBg },
                  ...(!isActive && {
                    '&:hover .MuiListItemIcon-root': { color: SIDEBAR_COLORS.hoverText },
                  }),
                  '&.Mui-selected': { bgcolor: 'transparent' },
                }}
              >
                <ListItemIcon
                  sx={{
                    minWidth: 0,
                    color: isActive ? SIDEBAR_COLORS.activeIcon : SIDEBAR_COLORS.icon,
                    justifyContent: 'center',
                    '& .MuiSvgIcon-root': { fontSize: '1.25rem' },
                    transition: 'color 0.18s ease',
                  }}
                >
                  {item.icon}
                </ListItemIcon>
              </ListItemButton>
            </Tooltip>
          </ListItem>
        </React.Fragment>
      )
    }

    return (
      <React.Fragment key={item.id}>
        <ListItem disablePadding>
          <ListItemButton
            onClick={() => handleItemClick(item)}
            aria-expanded={hasChildren ? isExpanded : undefined}
            // No aria-haspopup for inline accordion (children appear in-document, not in a popup)
            sx={{
              pl: 2 + level * 2,
              py: 0,
              height: 44,
              borderRadius: 2,
              mx: 1,
              mb: 0.5,
              position: 'relative',
              transition: 'background-color 0.18s ease',
              ...activeLeafSx,
              ...activeParentSx,
              '&:hover': { bgcolor: SIDEBAR_COLORS.hoverBg },
              ...(!isActive && {
                '&:hover .MuiListItemIcon-root': { color: SIDEBAR_COLORS.hoverText },
                '&:hover .MuiListItemText-primary': { color: SIDEBAR_COLORS.hoverText },
              }),
              '&.Mui-selected': { bgcolor: 'transparent' },
            }}
          >
            <ListItemIcon
              sx={{
                minWidth: 40,
                color: isActive ? SIDEBAR_COLORS.activeIcon : SIDEBAR_COLORS.icon,
                '& .MuiSvgIcon-root': { fontSize: '1.25rem' },
                transition: 'color 0.18s ease',
              }}
            >
              {item.icon}
            </ListItemIcon>
            <ListItemText
              primary={item.title}
              sx={{
                '& .MuiListItemText-primary': {
                  fontSize: '0.875rem',
                  fontWeight: isActive && !hasChildren ? 600 : 400,
                  color: isActive ? SIDEBAR_COLORS.activeText : SIDEBAR_COLORS.text,
                  transition: 'color 0.18s ease',
                },
              }}
            />
            {item.badge && (
              <Badge
                badgeContent={item.badge}
                color="error"
                sx={{ '& .MuiBadge-badge': { right: 16, fontSize: '0.75rem' } }}
              />
            )}
            {hasChildren && (
              <Box
                component="span"
                sx={{
                  color: SIDEBAR_COLORS.icon,
                  display: 'flex',
                  alignItems: 'center',
                  transition: 'transform 0.2s',
                  transform: isExpanded ? 'rotate(180deg)' : 'none',
                }}
              >
                <ExpandMore fontSize="small" />
              </Box>
            )}
          </ListItemButton>
        </ListItem>

        <Collapse in={isExpanded} timeout={200} unmountOnExit>
          <List component="div" disablePadding>
            {item.children?.map((child, idx, arr) => (
              <React.Fragment key={child.id}>
                {child.group && (idx === 0 || child.group !== arr[idx - 1].group)
                  ? renderGroupLabel(child.group)
                  : null}
                {renderMenuItem(child, level + 1)}
              </React.Fragment>
            ))}
          </List>
        </Collapse>
      </React.Fragment>
    )
  }

  return (
    <Box
      data-testid="sidebar-root"
      sx={{ height: '100%', display: 'flex', flexDirection: 'column', bgcolor: SIDEBAR_COLORS.bg }}
    >
      <Box
        sx={{
          px: collapsed ? 0 : 2,
          py: 1.5,
          display: 'flex',
          alignItems: 'center',
          justifyContent: collapsed ? 'center' : 'space-between',
          borderBottom: `1px solid ${SIDEBAR_COLORS.border}`,
          minHeight: 56,
        }}
      >
        <Box sx={{ display: 'flex', alignItems: 'center', gap: collapsed ? 0 : 1.5 }}>
            <Box
              sx={{
                width: 36,
                height: 36,
                borderRadius: 1,
                flexShrink: 0,
                display: 'flex',
                alignItems: 'center',
                justifyContent: 'center',
                overflow: 'hidden',
                ...(company?.logoUrl && !imageError
                  ? { bgcolor: 'rgba(255,255,255,0.04)' }
                  : {
                      bgcolor: 'primary.main',
                      color: 'white',
                      fontWeight: 'bold',
                      fontSize: '0.875rem',
                    }),
              }}
            >
              {company?.logoUrl && !imageError ? (
                <img
                  src={company.logoUrl}
                  alt={company.name ?? 'Company logo'}
                  onError={() => setImageError(true)}
                  style={{ width: '100%', height: '100%', objectFit: 'contain' }}
                />
              ) : (
                'ERP'
              )}
            </Box>
            {!collapsed && (
              <Box sx={{ minWidth: 0 }}>
                <Typography
                  variant="h6"
                  sx={{
                    fontWeight: 600,
                    color: SIDEBAR_COLORS.activeText,
                    whiteSpace: 'nowrap',
                    lineHeight: 1.2,
                  }}
                >
                  ERP System
                </Typography>
                {company?.name && (
                  <Typography
                    variant="caption"
                    noWrap
                    sx={{ color: SIDEBAR_COLORS.text, display: 'block', lineHeight: 1.2 }}
                  >
                    {company.name}
                  </Typography>
                )}
              </Box>
            )}
          </Box>

        {onToggleCollapse && (
          <IconButton
            onClick={onToggleCollapse}
            aria-label={collapsed ? 'expand sidebar' : 'collapse sidebar'}
            size="small"
            sx={{
              display: { xs: 'none', lg: 'flex' },
              color: SIDEBAR_COLORS.icon,
              width: 28,
              height: 28,
              '&:hover': { bgcolor: SIDEBAR_COLORS.hoverBg },
              flexShrink: 0,
            }}
          >
            {collapsed ? <ChevronRight fontSize="small" /> : <ChevronLeft fontSize="small" />}
          </IconButton>
        )}
      </Box>

      <Box sx={{ flexGrow: 1, overflow: 'auto', py: 1 }}>
        {getFilteredMenuSections().map((section, index) => (
          <React.Fragment key={section.id}>
            {index > 0 && section.id === 'administration' && (
              <Divider
                sx={{
                  my: collapsed ? 1 : 0.5,
                  borderColor: SIDEBAR_COLORS.border,
                  display: collapsed && section.id !== 'administration' ? 'none' : 'block',
                }}
              />
            )}

            {!collapsed && (
                <Typography
                  variant="overline"
                  sx={{
                    px: 3,
                    pt: 2,
                    pb: 1,
                    display: 'block',
                    color: SIDEBAR_COLORS.sectionLabel,
                    fontWeight: 600,
                  fontSize: '0.75rem',
                }}
              >
                {section.title}
              </Typography>
            )}

            {collapsed && index > 0 && section.id === 'administration' && (
              <Box sx={{ pt: 1 }} />
            )}

            <List sx={{ px: 0 }}>
              {section.items.map(item => renderMenuItem(item))}
            </List>
          </React.Fragment>
        ))}
      </Box>

      {/* Popper gated only on flyoutItemId (not flyoutAnchorEl) so it stays mounted
          during the 80ms exit fade. flyoutAnchorEl provides the anchor position;
          flyoutOpen drives the Fade animation. Both are cleared after animation completes. */}
      {collapsed && flyoutItemId && (() => {
        const flyoutItem = menuSections
          .flatMap(section => section.items)
          .find(item => item.id === flyoutItemId)

        if (!flyoutItem?.children) return null

        return (
          <Popper
            open={Boolean(flyoutItemId)}
            anchorEl={flyoutAnchorEl}
            placement="right-start"
            keepMounted={false}
            modifiers={[{ name: 'offset', options: { offset: [0, 8] } }]}
            style={{ zIndex: 1400 }}
          >
            <Fade in={flyoutOpen} timeout={{ enter: 120, exit: 80 }}>
              <Paper
                id={`flyout-panel-${flyoutItemId}`}
                onMouseEnter={handleFlyoutMouseEnter}
                onMouseLeave={handleFlyoutMouseLeave}
                sx={{
                  bgcolor: SIDEBAR_COLORS.hoverBg,
                  minWidth: 200,
                  maxWidth: 240,
                  py: 1,
                  borderRadius: 1,
                  boxShadow: '0 4px 20px rgba(0,0,0,0.4)',
                  '@keyframes flyoutEnter': {
                    from: { transform: 'translateX(-4px)' },
                    to: { transform: 'translateX(0)' },
                  },
                  animation: 'flyoutEnter 0.12s ease-out',
                }}
              >
                <List disablePadding>
                  {flyoutItem.children.map((child, idx, arr) => (
                    <React.Fragment key={child.id}>
                      {child.group && (idx === 0 || child.group !== arr[idx - 1].group)
                        ? renderGroupLabel(child.group)
                        : null}
                      {renderFlyoutItem(child, 0, idx === 0)}
                    </React.Fragment>
                  ))}
                </List>
              </Paper>
            </Fade>
          </Popper>
        )
      })()}
    </Box>
  )
}

export default Sidebar
