import React, { useEffect, useState } from 'react'
import { Link as RouterLink, useLocation, useMatches } from 'react-router-dom'
import {
  AppBar,
  Badge,
  Box,
  Breadcrumbs,
  IconButton,
  Link,
  Toolbar,
  Tooltip,
  Typography,
  useMediaQuery,
  useTheme,
} from '@mui/material'
import { default as KeyboardIcon } from '@mui/icons-material/Keyboard'
import { default as MenuIcon } from '@mui/icons-material/Menu'
import { default as NavigateNextIcon } from '@mui/icons-material/NavigateNext'
import { default as NotificationsIcon } from '@mui/icons-material/Notifications'
import { default as SearchIcon } from '@mui/icons-material/Search'

import { DRAWER_WIDTH_COLLAPSED, DRAWER_WIDTH_EXPANDED, TOPBAR_HEIGHT } from '@/constants/layout'
import { useAppSelector } from '@/hooks/useRedux'
import { selectUnreadCount } from '@/store/slices/notificationSlice'

import KeyboardShortcutsPanel from './KeyboardShortcutsPanel'
import NotificationPanel from './NotificationPanel'
import SearchModal from './SearchModal'
import SystemStatus from './SystemStatus'

const BREADCRUMB_MAP: Record<string, string> = {
  '/dashboard': 'Dashboard',
  '/inventory': 'Inventory',
  '/sales': 'Sales',
  '/purchasing': 'Purchasing',
  '/reports': 'Reports',
  '/settings': 'Settings',
  '/accounting': 'Accounting',
  '/audit-logs': 'Audit Logs',
  '/inventory/products': 'Products',
  '/inventory/products/create': 'Create Product',
  '/inventory/categories': 'Categories',
  '/inventory/stock-adjustments': 'Stock Adjustments',
  '/inventory/stock-adjustments/create': 'Create Stock Adjustment',
  '/sales/customers': 'Customers',
  '/sales/orders': 'Sales Orders',
  '/sales/orders/create': 'Create Sales Order',
  '/sales/invoices': 'Invoices',
  '/purchasing/suppliers': 'Suppliers',
  '/purchasing/orders': 'Purchase Orders',
  '/purchasing/orders/create': 'Create Purchase Order',
  '/reports/inventory': 'Inventory',
  '/reports/purchasing': 'Purchasing',
  '/reports/sales': 'Sales',
  '/reports/inventory/summary': 'Inventory Summary',
  '/reports/inventory/historical': 'Historical Inventory',
  '/reports/inventory/movement-summary': 'Inventory Movement Summary',
  '/reports/inventory/price-list': 'Product Price List',
  '/reports/inventory/product-cost': 'Product Cost Report',
  '/reports/purchasing/order-summary': 'Purchase Order Summary',
  '/reports/purchasing/order-status': 'Purchase Order Status',
  '/reports/purchasing/order-details': 'Purchase Order Details',
  '/reports/sales/product-summary': 'Sales by Product Summary',
  '/reports/sales/product-details': 'Sales by Product Details',
  '/reports/sales/order-summary': 'Sales Order Summary',
  '/reports/sales/order-profit': 'Sales Order Profit Report',
  '/reports/sales/customer-payment-summary': 'Customer Payment Summary',
  '/reports/sales/payment-by-order': 'Customer Payment by Order',
  '/reports/sales/payment-details': 'Customer Payment Details',
  '/reports/sales/order-history': 'Customer Order History',
  '/reports/sales/product-customer': 'Product Customer Report',
  '/settings/company': 'Company',
  '/settings/inventory-costing': 'Inventory Costing',
  '/settings/regional': 'Regional',
  '/settings/price-lists': 'Price Lists',
  '/settings/payment-methods': 'Payment Methods',
  '/settings/print': 'Print Settings',
  '/settings/document-numbers': 'Document Numbers',
  '/settings/users': 'Users',
  '/settings/roles': 'Roles & Permissions',
  '/settings/security': 'Security',
  '/settings/backup': 'Backup & Restore',
  '/accounting/dashboard': 'Dashboard',
  '/accounting/chart-of-accounts': 'Chart of Accounts',
  '/accounting/fiscal-periods': 'Fiscal Periods',
  '/accounting/journal-entries': 'Journal Entries',
  '/accounting/journal-entries/new': 'Create Journal Entry',
  '/accounting/account-mappings': 'Account Mappings',
  '/accounting/settlements': 'Settlements',
  '/accounting/owner-equity': "Owner's Equity",
  '/accounting/expenses': 'Expenses',
  '/accounting/fund-transfers': 'Fund Transfers',
  '/accounting/bank-reconciliations': 'Bank Reconciliation',
  '/accounting/bank-reconciliations/new': 'New Bank Reconciliation',
  '/accounting/reports': 'Reports',
  '/accounting/reports/trial-balance': 'Trial Balance',
  '/accounting/reports/balance-sheet': 'Balance Sheet',
  '/accounting/reports/profit-loss': 'Profit & Loss',
  '/accounting/reports/general-ledger': 'General Ledger',
  '/accounting/reports/account-activity': 'Account Activity',
}

const NAVIGABLE_PATHS = new Set([
  '/dashboard',
  '/inventory',
  '/sales',
  '/purchasing',
  '/audit-logs',
  '/inventory/products',
  '/inventory/categories',
  '/inventory/stock-adjustments',
  '/sales/customers',
  '/sales/orders',
  '/purchasing/suppliers',
  '/purchasing/orders',
  '/accounting/dashboard',
  '/accounting/chart-of-accounts',
  '/accounting/fiscal-periods',
  '/accounting/journal-entries',
  '/accounting/account-mappings',
  '/accounting/settlements',
  '/accounting/owner-equity',
  '/accounting/expenses',
  '/accounting/fund-transfers',
  '/accounting/bank-reconciliations',
  '/settings/company',
  '/settings/inventory-costing',
  '/settings/regional',
  '/settings/price-lists',
  '/settings/payment-methods',
  '/settings/print',
  '/settings/document-numbers',
  '/settings/users',
  '/settings/roles',
  '/settings/security',
  '/settings/backup',
])

type RouteHandle = { title?: string }
type MatchShape = { handle?: RouteHandle | null; params?: Record<string, string | undefined> }

interface BreadcrumbSegment {
  label: string
  path: string
  isNavigable: boolean
}

function buildBreadcrumbs(pathname: string, matches: MatchShape[], leafOverride?: string): BreadcrumbSegment[] {
  const leafMatch = [...matches].reverse().find(match => (match.handle as RouteHandle | undefined)?.title)
  const leafHandleTitle = (leafMatch?.handle as RouteHandle | undefined)?.title
  // Order-detail routes (/sales|purchasing/orders/:orderNumber/view) carry the
  // human order number in the URL param. Use it as a refresh-proof leaf label —
  // location.state.breadcrumbTitle is lost on reload. No decodeURIComponent:
  // react-router already decodes params (a second decode throws on values with %).
  const isOrderDetail = /^\/(sales|purchasing)\/orders\/[^/]+\/view$/.test(pathname)
  const leafParamTitle = isOrderDetail ? leafMatch?.params?.orderNumber : undefined
  const parts = pathname.split('/').filter(Boolean)
  const prefixes = parts.map((_, index) => `/${parts.slice(0, index + 1).join('/')}`)

  return prefixes.reduce<BreadcrumbSegment[]>((segments, prefix, index) => {
    const isLast = index === prefixes.length - 1
    const label = isLast
      ? (leafOverride ?? leafParamTitle ?? leafHandleTitle ?? BREADCRUMB_MAP[prefix])
      : BREADCRUMB_MAP[prefix]
    if (!label) return segments
    segments.push({ label, path: prefix, isNavigable: NAVIGABLE_PATHS.has(prefix) && !isLast })
    return segments
  }, [])
}

interface TopBarProps {
  collapsed: boolean
  onMobileMenuOpen: () => void
}

const TopBar: React.FC<TopBarProps> = ({ collapsed, onMobileMenuOpen }) => {
  const theme = useTheme()
  const isMobile = useMediaQuery(theme.breakpoints.down('lg'))
  const location = useLocation()
  const matches = useMatches() as MatchShape[]
  const unreadCount = useAppSelector(selectUnreadCount)

  const [notificationAnchorEl, setNotificationAnchorEl] = useState<HTMLElement | null>(null)
  const [systemStatusAnchorEl, setSystemStatusAnchorEl] = useState<HTMLElement | null>(null)
  const [searchOpen, setSearchOpen] = useState(false)
  const [shortcutsAnchorEl, setShortcutsAnchorEl] = useState<HTMLElement | null>(null)

  const sidebarWidth = collapsed ? DRAWER_WIDTH_COLLAPSED : DRAWER_WIDTH_EXPANDED
  const breadcrumbs = buildBreadcrumbs(location.pathname, matches, (location.state as any)?.breadcrumbTitle)
  const leafLabel = breadcrumbs[breadcrumbs.length - 1]?.label ?? ''

  useEffect(() => {
    const handleKeyDown = (event: KeyboardEvent) => {
      const target = event.target as HTMLElement | null
      const tag = target?.tagName?.toLowerCase()
      const editable = target?.isContentEditable

      if (tag === 'input' || tag === 'textarea' || editable) return

      if ((event.ctrlKey || event.metaKey) && event.key.toLowerCase() === 'k') {
        event.preventDefault()
        setSearchOpen(true)
        return
      }

      if (event.key === '?') {
        event.preventDefault()
        const btn = document.querySelector<HTMLElement>('[aria-label="Keyboard Shortcuts"]')
        setShortcutsAnchorEl(btn)
      }
    }

    window.addEventListener('keydown', handleKeyDown)
    return () => window.removeEventListener('keydown', handleKeyDown)
  }, [])

  return (
    <>
      <AppBar
        position="fixed"
        sx={{
          width: { lg: `calc(100% - ${sidebarWidth}px)` },
          ml: { lg: `${sidebarWidth}px` },
          bgcolor: theme.palette.background.paper,
          color: 'text.primary',
          boxShadow: 'none',
          boxSizing: 'border-box',
          height: TOPBAR_HEIGHT,
          minHeight: TOPBAR_HEIGHT,
          borderBottom: `1px solid ${theme.palette.divider}`,
          transition: 'width 0.22s ease, margin-left 0.22s ease',
        }}
      >
        <Toolbar sx={{ minHeight: `${TOPBAR_HEIGHT}px !important`, height: TOPBAR_HEIGHT, gap: 1 }}>
          {isMobile && (
            <IconButton
              color="inherit"
              aria-label="open drawer"
              edge="start"
              onClick={onMobileMenuOpen}
              sx={{ mr: 1 }}
            >
              <MenuIcon />
            </IconButton>
          )}

          <Box sx={{ flexGrow: 1, overflow: 'hidden', display: 'flex', alignItems: 'center', height: '100%' }}>
            {isMobile ? (
              <Typography noWrap variant="body2" sx={{ color: theme.palette.text.primary, fontWeight: 500 }}>
                {leafLabel}
              </Typography>
            ) : breadcrumbs.length > 0 ? (
              <Breadcrumbs
                separator={<NavigateNextIcon sx={{ fontSize: 14, color: theme.palette.text.secondary, mx: 0.5 }} />}
                aria-label="breadcrumb"
                sx={{
                  display: 'flex',
                  alignItems: 'center',
                  '& .MuiBreadcrumbs-ol': { flexWrap: 'nowrap' },
                  '& .MuiBreadcrumbs-separator': { mx: 0.75 },
                }}
              >
                {breadcrumbs.map((segment, index) => {
                  const isLast = index === breadcrumbs.length - 1
                  if (isLast) {
                    return (
                      <Typography key={segment.path} sx={{ fontSize: '13px', color: theme.palette.text.primary, fontWeight: 500, display: 'flex', alignItems: 'center', lineHeight: 1.4 }}>
                        {segment.label}
                      </Typography>
                    )
                  }
                  if (segment.isNavigable) {
                    return (
                      <Link key={segment.path} component={RouterLink} to={segment.path} underline="hover" sx={{ fontSize: '13px', fontWeight: 400, color: theme.palette.text.secondary, display: 'flex', alignItems: 'center', lineHeight: 1.4, transition: 'color 0.15s ease', '&:hover': { color: theme.palette.text.primary } }}>
                        {segment.label}
                      </Link>
                    )
                  }
                  return (
                    <Typography key={segment.path} sx={{ fontSize: '13px', fontWeight: 400, color: theme.palette.text.secondary, display: 'flex', alignItems: 'center', lineHeight: 1.4 }}>
                      {segment.label}
                    </Typography>
                  )
                })}
              </Breadcrumbs>
            ) : null}
          </Box>

          <Box sx={{ display: 'flex', alignItems: 'center', gap: 2, flexShrink: 0 }}>
            <Box
              role="button"
              aria-label="Open global search"
              onClick={() => setSearchOpen(true)}
              sx={{
                display: { xs: 'none', lg: 'flex' },
                alignItems: 'center',
                gap: 1,
                width: 220,
                px: 1.5,
                py: 0.75,
                bgcolor: theme.palette.divider,
                border: `1px solid ${theme.palette.divider}`,
                borderRadius: '8px',
                cursor: 'pointer',
                '&:hover': { borderColor: theme.palette.grey[700] },
              }}
            >
              <SearchIcon sx={{ fontSize: 16, color: theme.palette.text.secondary, flexShrink: 0 }} />
              <Typography sx={{ fontSize: '0.8125rem', color: theme.palette.text.secondary, flexGrow: 1 }}>
                Search...
              </Typography>
              <Box component="kbd" sx={{ bgcolor: theme.palette.background.default, border: `1px solid ${theme.palette.grey[700]}`, borderRadius: '4px', px: 0.75, py: 0.25, fontSize: '11px', color: theme.palette.text.secondary, flexShrink: 0 }}>
                Ctrl+K
              </Box>
            </Box>

            <SystemStatus
              anchorEl={systemStatusAnchorEl}
              onOpen={(e) => setSystemStatusAnchorEl(e.currentTarget)}
              onClose={() => setSystemStatusAnchorEl(null)}
            />

            <Tooltip title="Keyboard Shortcuts">
              <IconButton
                aria-label="Keyboard Shortcuts"
                onClick={(e) => setShortcutsAnchorEl(e.currentTarget)}
                sx={{
                  color: theme.palette.text.secondary,
                  '&:hover': { bgcolor: theme.palette.action.hover, borderRadius: '8px' },
                }}
              >
                <KeyboardIcon />
              </IconButton>
            </Tooltip>

            <Tooltip title="Notifications">
              <IconButton
                onClick={(event) => setNotificationAnchorEl(event.currentTarget)}
                sx={{
                  color: theme.palette.text.secondary,
                  '&:hover': { bgcolor: theme.palette.action.hover, borderRadius: '8px' },
                }}
              >
                <Badge badgeContent={unreadCount} color="error">
                  <NotificationsIcon />
                </Badge>
              </IconButton>
            </Tooltip>
          </Box>
        </Toolbar>
      </AppBar>

      <NotificationPanel
        anchorEl={notificationAnchorEl}
        onClose={() => setNotificationAnchorEl(null)}
      />
      <SearchModal open={searchOpen} onClose={() => setSearchOpen(false)} />
      <KeyboardShortcutsPanel anchorEl={shortcutsAnchorEl} onClose={() => setShortcutsAnchorEl(null)} />
    </>
  )
}

export default TopBar
