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
} from '@mui/material'
import {
  Dashboard as DashboardIcon,
  Inventory as InventoryIcon,
  PointOfSale as SalesIcon,
  Assignment as PurchasingIcon,
  Settings as SettingsIcon,
  ExpandLess,
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
  PriceChange as PriceCostingIcon,
  Summarize as SummaryIcon,
  ListAlt as DetailIcon,
  TrendingUp as ProfitIcon,
  AccountBalanceWallet as PaymentSummaryIcon,
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
} from '@mui/icons-material'

interface SidebarProps {
  onItemClick?: () => void
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
  children?: MenuItem[]
}

const menuSections: MenuSection[] = [
  {
    id: 'main',
    title: 'Main',
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
    id: 'analytics',
    title: 'Analytics',
    items: [
      {
        id: 'sales-reports',
        title: 'Sales Reports',
        icon: <SalesIcon />,
        children: [
          {
            id: 'sales-by-product-summary',
            title: 'Sales by Product Summary',
            icon: <SummaryIcon />,
            path: '/reports/sales/product-summary',
          },
          {
            id: 'sales-by-product-details',
            title: 'Sales by Product Details',
            icon: <DetailIcon />,
            path: '/reports/sales/product-details',
          },
          {
            id: 'sales-order-summary',
            title: 'Sales Order Summary',
            icon: <OrdersIcon />,
            path: '/reports/sales/order-summary',
          },
          {
            id: 'sales-order-profit-report',
            title: 'Sales Order Profit Report',
            icon: <ProfitIcon />,
            path: '/reports/sales/order-profit',
          },
          {
            id: 'customer-payment-summary',
            title: 'Customer Payment Summary',
            icon: <PaymentSummaryIcon />,
            path: '/reports/sales/customer-payment-summary',
          },
          {
            id: 'customer-payment-by-order',
            title: 'Customer Payment by Order',
            icon: <PaymentOrderIcon />,
            path: '/reports/sales/payment-by-order',
          },
          {
            id: 'customer-payment-details',
            title: 'Customer Payment Details',
            icon: <PaymentDetailIcon />,
            path: '/reports/sales/payment-details',
          },
          {
            id: 'customer-order-history',
            title: 'Customer Order History',
            icon: <HistoryIcon />,
            path: '/reports/sales/order-history',
          },
          {
            id: 'product-customer-report',
            title: 'Product Customer Report',
            icon: <CustomerProductIcon />,
            path: '/reports/sales/product-customer',
          },
        ],
      },
      {
        id: 'purchasing-reports',
        title: 'Purchasing Reports',
        icon: <PurchasingIcon />,
        children: [
          {
            id: 'purchase-order-summary',
            title: 'Purchase Order Summary',
            icon: <SummaryIcon />,
            path: '/reports/purchasing/order-summary',
          },
          {
            id: 'purchase-order-details',
            title: 'Purchase Order Details',
            icon: <DetailIcon />,
            path: '/reports/purchasing/order-details',
          },
          {
            id: 'purchase-order-status',
            title: 'Purchase Order Status',
            icon: <OrdersIcon />,
            path: '/reports/purchasing/order-status',
          },
          {
            id: 'vendor-payment-details',
            title: 'Vendor Payment Details',
            icon: <PaymentDetailIcon />,
            path: '/reports/purchasing/payment-details',
          },
          {
            id: 'vendor-purchase-list',
            title: 'Vendor Product List',
            icon: <SuppliersIcon />,
            path: '/reports/purchasing/vendor-purchase-list',
          },
        ],
      },
      {
        id: 'inventory-reports',
        title: 'Inventory Reports',
        icon: <InventoryIcon />,
        children: [
          {
            id: 'inventory-summary',
            title: 'Inventory Summary',
            icon: <InventorySummaryIcon />,
            path: '/reports/inventory/summary',
          },
          {
            id: 'historical-inventory',
            title: 'Historical Inventory',
            icon: <HistoricalInventoryIcon />,
            path: '/reports/inventory/historical',
          },
          {
            id: 'inventory-movement-summary',
            title: 'Inventory Movement Summary',
            icon: <MovementSummaryIcon />,
            path: '/reports/inventory/movement-summary',
          },
          {
            id: 'product-price-list',
            title: 'Product Price List',
            icon: <PriceListIcon />,
            path: '/reports/inventory/price-list',
          },
          {
            id: 'product-cost-report',
            title: 'Product Cost Report',
            icon: <CostReportIcon />,
            path: '/reports/inventory/product-cost',
          },
        ],
      },
    ],
  },
  {
    id: 'system',
    title: 'System',
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
            path: '/settings/company',
          },
          {
            id: 'price-costing-settings',
            title: 'Price & Costing',
            icon: <PriceCostingIcon />,
            path: '/settings/price-costing',
          },
          {
            id: 'print-settings',
            title: 'Print Settings',
            icon: <PrintIcon />,
            path: '/settings/print',
          },
        ],
      },
    ],
  },
]

const Sidebar: React.FC<SidebarProps> = ({ onItemClick }) => {
  const location = useLocation()
  const navigate = useNavigate()
  const [expandedItems, setExpandedItems] = React.useState<string[]>(() => {
    // Initialize from localStorage
    const stored = localStorage.getItem('sidebar-expanded')
    return stored ? JSON.parse(stored) : []
  })

  // Auto-expand parent items based on current route
  useEffect(() => {
    const currentPath = location.pathname
    const parentItems: string[] = []

    // Find which parent menu item contains the current path
    menuSections.forEach(section => {
      section.items.forEach(item => {
        if (item.children) {
          const hasActivePath = item.children.some(child => child.path === currentPath)
          if (hasActivePath) {
            parentItems.push(item.id)
          }
        }
      })
    })

    // Only update if the parent has changed
    if (parentItems.length > 0) {
      const currentParent = parentItems[0]
      const isAlreadyExpanded = expandedItems.includes(currentParent)
      const hasOtherParentsExpanded = expandedItems.some(id => !parentItems.includes(id))

      // If navigating to a different parent, close others and open the new one
      if (!isAlreadyExpanded || hasOtherParentsExpanded) {
        setExpandedItems([currentParent])
        localStorage.setItem('sidebar-expanded', JSON.stringify([currentParent]))
      }
    }
  }, [location.pathname])

  // Show all modules - no filtering based on backend availability
  const getFilteredMenuSections = () => {
    return menuSections // Return all menu sections without filtering
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
        : [itemId] // Only keep the newly clicked item expanded

      // Save to localStorage
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

  const renderMenuItem = (item: MenuItem, level: number = 0) => {
    const isActive = isItemActive(item)
    const isExpanded = expandedItems.includes(item.id)
    const hasChildren = item.children && item.children.length > 0

    return (
      <React.Fragment key={item.id}>
        <ListItem disablePadding>
          <ListItemButton
            onClick={() => handleItemClick(item)}
            selected={isActive && !hasChildren}
            sx={{
              pl: 2 + level * 2,
              py: 1,
              borderRadius: 1,
              mx: 1,
              mb: 0.5,
              '&.Mui-selected': {
                bgcolor: 'primary.main',
                color: 'primary.contrastText',
                '& .MuiListItemIcon-root': {
                  color: 'inherit',
                },
                '&:hover': {
                  bgcolor: 'primary.dark',
                },
              },
              '&:hover': {
                bgcolor: 'action.hover',
              },
            }}
          >
            <ListItemIcon
              sx={{
                minWidth: 40,
                color: isActive && !hasChildren ? 'inherit' : 'text.secondary',
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
                },
              }}
            />
            {item.badge && (
              <Badge
                badgeContent={item.badge}
                color="error"
                sx={{
                  '& .MuiBadge-badge': {
                    right: 16,
                    fontSize: '0.75rem',
                  },
                }}
              />
            )}
            {hasChildren && (
              isExpanded ? <ExpandLess /> : <ExpandMore />
            )}
          </ListItemButton>
        </ListItem>

        {hasChildren && (
          <Collapse in={isExpanded} timeout="auto" unmountOnExit>
            <List component="div" disablePadding>
              {item.children!.map(child => renderMenuItem(child, level + 1))}
            </List>
          </Collapse>
        )}
      </React.Fragment>
    )
  }

  return (
    <Box sx={{ height: '100%', display: 'flex', flexDirection: 'column' }}>
      {/* Logo */}
      <Box
        sx={{
          p: 2,
          display: 'flex',
          alignItems: 'center',
          borderBottom: 1,
          borderColor: 'divider',
        }}
      >
        <Box
          sx={{
            width: 40,
            height: 40,
            borderRadius: 1,
            bgcolor: 'primary.main',
            display: 'flex',
            alignItems: 'center',
            justifyContent: 'center',
            color: 'white',
            fontWeight: 'bold',
            fontSize: '1.25rem',
            mr: 2,
          }}
        >
          ERP
        </Box>
        <Typography variant="h6" sx={{ fontWeight: 600 }}>
          ERP System
        </Typography>
      </Box>

      {/* Navigation */}
      <Box sx={{ flexGrow: 1, overflow: 'auto', py: 1 }}>
        {getFilteredMenuSections().map((section, index) => (
          <React.Fragment key={section.id}>
            {index > 0 && <Divider sx={{ my: 1 }} />}
            
            <Typography
              variant="overline"
              sx={{
                px: 3,
                py: 1,
                display: 'block',
                color: 'text.secondary',
                fontWeight: 600,
                fontSize: '0.75rem',
              }}
            >
              {section.title}
            </Typography>
            
            <List sx={{ px: 0 }}>
              {section.items.map(item => renderMenuItem(item))}
            </List>
          </React.Fragment>
        ))}
      </Box>

      {/* Footer */}
      <Box
        sx={{
          p: 2,
          borderTop: 1,
          borderColor: 'divider',
          bgcolor: 'background.default',
        }}
      >
        <Typography
          variant="caption"
          sx={{
            display: 'block',
            textAlign: 'center',
            color: 'text.secondary',
          }}
        >
          ERP System v1.0.0
        </Typography>
      </Box>
    </Box>
  )
}

export default Sidebar