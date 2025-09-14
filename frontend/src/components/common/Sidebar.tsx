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
  ShoppingCart as PurchasingIcon,
  Assessment as ReportsIcon,
  Settings as SettingsIcon,
  ExpandLess,
  ExpandMore,
  Category as CategoryIcon,
  Inventory2 as ProductIcon,
  People as CustomersIcon,
  Receipt as OrdersIcon,
  ReceiptLong as InvoiceIcon,
  Payment as PaymentsIcon,
  Business as SuppliersIcon,
  LocalShipping as GRNIcon,
  Person as UsersIcon,
  Tune as SystemSettingsIcon,
} from '@mui/icons-material'
import { moduleApi } from '@/services/moduleApi'

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
        ],
      },
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
            title: 'Orders',
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
            icon: <OrdersIcon />,
            path: '/purchasing/orders',
          },
          {
            id: 'grn',
            title: 'Goods Received',
            icon: <GRNIcon />,
            path: '/purchasing/grn',
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
        id: 'reports',
        title: 'Reports',
        icon: <ReportsIcon />,
        path: '/reports',
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
            id: 'general-settings',
            title: 'General',
            icon: <SystemSettingsIcon />,
            path: '/settings',
          },
          {
            id: 'user-management',
            title: 'Users',
            icon: <UsersIcon />,
            path: '/settings/users',
          },
        ],
      },
    ],
  },
]

const Sidebar: React.FC<SidebarProps> = ({ onItemClick }) => {
  const location = useLocation()
  const navigate = useNavigate()
  const [expandedItems, setExpandedItems] = React.useState<string[]>(['inventory', 'sales', 'purchasing'])
  const [availableModules, setAvailableModules] = React.useState<string[]>([])
  const [backendAvailable, setBackendAvailable] = React.useState<boolean>(true)

  useEffect(() => {
    const checkModuleAvailability = async () => {
      try {
        // Only check modules info, skip health check for faster loading
        const modules = await moduleApi.getAvailableModules()
        setAvailableModules(modules)
        setBackendAvailable(modules.length > 0) // Assume healthy if modules are returned
      } catch (error) {
        console.error('Failed to check module availability:', error)
        setAvailableModules([])
        setBackendAvailable(false)
      }
    }

    // Small delay to ensure env-config.js is loaded
    const timer = setTimeout(checkModuleAvailability, 100)
    
    // Reduce frequency to 60 seconds to minimize API calls
    const interval = setInterval(checkModuleAvailability, 60000)
    return () => {
      clearTimeout(timer)
      clearInterval(interval)
    }
  }, [])

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
    setExpandedItems(prev => 
      prev.includes(itemId)
        ? prev.filter(id => id !== itemId)
        : [...prev, itemId]
    )
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
        <Box>
          <Typography variant="h6" sx={{ fontWeight: 600 }}>
            ERP System
          </Typography>
          {!backendAvailable && (
            <Typography variant="caption" sx={{ color: 'warning.main', display: 'block' }}>
              Backend Offline
            </Typography>
          )}
        </Box>
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