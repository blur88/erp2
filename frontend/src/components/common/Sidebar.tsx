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
import { alpha, useTheme } from '@mui/material/styles'
import {
  ExpandMore,
  ChevronLeft,
  ChevronRight,
} from '@mui/icons-material'
import { useAppSelector } from '@/hooks/useRedux'
import { TOPBAR_HEIGHT } from '@/constants/layout'
import { useGetCompanySettingsQuery } from '@/store/api/settingsApi'
import { selectCurrentUser } from '@/store/slices/authSlice'
import {
  menuSections,
  getFilteredMenuSections,
  type MenuItem,
} from '@/config/navigation'
import SidebarFooter from './SidebarFooter'

interface SidebarProps {
  onItemClick?: () => void
  collapsed?: boolean
  onToggleCollapse?: () => void
}

const useSidebarColors = () => {
  const theme = useTheme()

  return {
    bg: theme.palette.background.sidebar,
    activeBg: alpha(theme.palette.primary.main, 0.13),
    hoverBg: theme.palette.action.hover,
    text: theme.palette.text.secondary,
    activeText: theme.palette.text.primary,
    hoverText: theme.palette.grey[300],
    activeIcon: theme.palette.primary.main,
    icon: theme.palette.text.secondary,
    sectionLabel: theme.palette.text.secondary,
    border: theme.palette.divider,
    accentBar: theme.palette.primary.main,
    outline: alpha(theme.palette.common.white, 0.03),
    flyoutShadow: alpha(theme.palette.common.black, 0.4),
  }
}

const Sidebar: React.FC<SidebarProps> = ({
  onItemClick,
  collapsed = false,
  onToggleCollapse,
}) => {
  const colors = useSidebarColors()
  const location = useLocation()
  const navigate = useNavigate()
  const user = useAppSelector(selectCurrentUser)
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

  const filteredSections = user
    ? getFilteredMenuSections(menuSections, user.role)
    : []

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
  const [flyoutExpandedGroup, setFlyoutExpandedGroup] = React.useState<string | null>(null)
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

    const item = filteredSections
      .flatMap(section => section.items)
      .find(menuItem => menuItem.id === itemId)
    const autoExpanded: string[] = []

    if (item?.children) {
      item.children.forEach(child => {
        if (child.children && isItemActive(child)) {
          autoExpanded.push(child.id)
        }
      })
    }

    setFlyoutExpandedIds(autoExpanded)
    if (item?.flyoutMode === 'category-first' && item.children) {
      const activeChild = item.children.find(child => isItemActive(child))
      setFlyoutExpandedGroup(activeChild?.group?.toLowerCase() ?? null)
    } else {
      setFlyoutExpandedGroup(null)
    }
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
      setFlyoutExpandedGroup(null)
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
    setFlyoutExpandedGroup(null)
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
            borderRadius: 1,
            mx: 1,
            mb: 0.25,
            position: 'relative',
            transform: 'translateX(0)',
            transition: 'background-color 0.18s ease, transform 0.18s ease',
            // Leaf active: pill background + left accent bar
            ...(isActive && !hasChildren && {
              bgcolor: colors.activeBg,
              boxShadow: `inset 0 0 0 1px ${colors.outline}`,
              transform: 'translateX(4px)',
              '&::before': {
                content: '""',
                position: 'absolute',
                left: 0,
                top: '50%',
                transform: 'translateY(-50%)',
                width: 3,
                height: '60%',
                borderRadius: '0 2px 2px 0',
                bgcolor: colors.accentBar,
              },
            }),
            // Parent active: brighten icon/text when a descendant is current route
            ...(isActive && hasChildren && {
              '& .MuiListItemIcon-root': { color: colors.activeText },
              '& .MuiListItemText-primary': { color: colors.activeText },
            }),
            '&:hover': { bgcolor: colors.hoverBg, transform: 'translateX(4px)' },
            ...(!isActive && {
              '&:hover .MuiListItemIcon-root': { color: colors.hoverText },
              '&:hover .MuiListItemText-primary': { color: colors.hoverText },
            }),
          }}
        >
          <ListItemIcon
            sx={{
              minWidth: 32,
              color: isActive ? colors.activeIcon : colors.icon,
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
                color: isActive ? colors.activeText : colors.text,
                transition: 'color 0.18s ease',
              },
            }}
          />
          {hasChildren && (
            <Box
              component="span"
              sx={{
                color: colors.icon,
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
        color: colors.sectionLabel,
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
            bgcolor: colors.activeBg,
            boxShadow: `inset 0 0 0 1px ${colors.outline}`,
            transform: 'translateX(4px)',
            '&::before': {
              content: '""',
              position: 'absolute',
              left: 0,
              top: '50%',
              transform: 'translateY(-50%)',
              width: 3,
              height: '60%',
              borderRadius: '0 2px 2px 0',
              bgcolor: colors.accentBar,
            },
          }
        : {}

    const activeParentSx =
      isActive && hasChildren
        ? {
            '& .MuiListItemIcon-root': { color: colors.activeText },
            '& .MuiListItemText-primary': { color: colors.activeText },
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
                '&:hover': { bgcolor: colors.hoverBg },
                ...(!isActive && {
                  '&:hover .MuiListItemIcon-root': { color: colors.hoverText },
                }),
                '&.Mui-selected': { bgcolor: 'transparent' },
              }}
            >
              <ListItemIcon
                sx={{
                  minWidth: 0,
                  color: isActive ? colors.activeIcon : colors.icon,
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
                  '&:hover': { bgcolor: colors.hoverBg },
                  ...(!isActive && {
                    '&:hover .MuiListItemIcon-root': { color: colors.hoverText },
                  }),
                  '&.Mui-selected': { bgcolor: 'transparent' },
                }}
              >
                <ListItemIcon
                  sx={{
                    minWidth: 0,
                    color: isActive ? colors.activeIcon : colors.icon,
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
              height: 40,
              borderRadius: 1,
              mx: 1,
              mb: 0.5,
              position: 'relative',
              transform: 'translateX(0)',
              transition: 'background-color 0.18s ease, transform 0.18s ease',
              ...activeLeafSx,
              ...activeParentSx,
              '&:hover': { bgcolor: colors.hoverBg, transform: 'translateX(4px)' },
              ...(!isActive && {
                '&:hover .MuiListItemIcon-root': { color: colors.hoverText },
                '&:hover .MuiListItemText-primary': { color: colors.hoverText },
              }),
              '&.Mui-selected': { bgcolor: 'transparent' },
            }}
          >
            <ListItemIcon
              sx={{
                minWidth: 40,
                color: isActive ? colors.activeIcon : colors.icon,
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
                  color: isActive ? colors.activeText : colors.text,
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
                  color: colors.icon,
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
      sx={{ height: '100%', display: 'flex', flexDirection: 'column', bgcolor: colors.bg }}
    >
      <Box
        sx={{
          px: collapsed ? 0 : 2,
          display: 'flex',
          alignItems: 'center',
          justifyContent: collapsed ? 'center' : 'space-between',
          boxSizing: 'border-box',
          height: TOPBAR_HEIGHT,
          minHeight: TOPBAR_HEIGHT,
          borderBottom: `1px solid ${colors.border}`,
          flexShrink: 0,
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
                  ? { bgcolor: colors.hoverBg }
                  : {
                      bgcolor: 'primary.main',
                      color: 'common.white',
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
                    color: colors.activeText,
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
                    sx={{ color: colors.text, display: 'block', lineHeight: 1.2 }}
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
              color: colors.icon,
              width: 28,
              height: 28,
              '&:hover': { bgcolor: colors.hoverBg },
              flexShrink: 0,
            }}
          >
            {collapsed ? <ChevronRight fontSize="small" /> : <ChevronLeft fontSize="small" />}
          </IconButton>
        )}
      </Box>

      <Box sx={{ flexGrow: 1, overflow: 'auto', py: 1 }}>
        {filteredSections.map((section, index) => (
          <React.Fragment key={section.id}>
            {index > 0 && section.id === 'administration' && (
              <Divider
                sx={{
                  my: collapsed ? 1 : 0.5,
                  borderColor: colors.border,
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
                    color: colors.sectionLabel,
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

      <SidebarFooter collapsed={Boolean(collapsed)} />

      {/* Popper gated only on flyoutItemId (not flyoutAnchorEl) so it stays mounted
          during the 80ms exit fade. flyoutAnchorEl provides the anchor position;
          flyoutOpen drives the Fade animation. Both are cleared after animation completes. */}
      {collapsed && flyoutItemId && (() => {
        const flyoutItem = filteredSections
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
                  bgcolor: 'background.paper',
                  minWidth: 240,
                  maxWidth: 280,
                  maxHeight: 'calc(100vh - 24px)',
                  overflowY: 'auto',
                  py: 1,
                  borderRadius: 1,
                  boxShadow: `0 4px 20px ${colors.flyoutShadow}`,
                  '@keyframes flyoutEnter': {
                    from: { transform: 'translateX(-4px)' },
                    to: { transform: 'translateX(0)' },
                  },
                  animation: 'flyoutEnter 0.12s ease-out',
                }}
              >
                {flyoutItem.flyoutMode === 'category-first'
                  ? (() => {
                      const groups: string[] = []

                      flyoutItem.children.forEach(child => {
                        if (child.group && !groups.includes(child.group)) {
                          groups.push(child.group)
                        }
                      })

                      return (
                        <List disablePadding>
                          {groups.map((group, groupIdx) => {
                            const slug = group.toLowerCase()
                            const groupChildren = flyoutItem.children?.filter(
                              child => child.group === group
                            ) ?? []
                            const isGroupActive = groupChildren.some(child => isItemActive(child))
                            const isExpanded = flyoutExpandedGroup === slug

                            return (
                              <React.Fragment key={group}>
                                <ListItemButton
                                  {...(groupIdx === 0 ? { 'data-flyout-first': 'true' } : {})}
                                  selected={isGroupActive}
                                  aria-expanded={isExpanded}
                                  onClick={() => {
                                    setFlyoutExpandedGroup(prev => (prev === slug ? null : slug))
                                  }}
                                  sx={{
                                    px: 2,
                                    py: 0.75,
                                    minHeight: 40,
                                    color: isGroupActive
                                      ? colors.activeText
                                      : colors.text,
                                    '&.Mui-selected': {
                                      bgcolor: colors.activeBg,
                                      color: colors.activeText,
                                    },
                                    '&.Mui-selected:hover': {
                                      bgcolor: colors.activeBg,
                                    },
                                    '&:hover': {
                                      bgcolor: colors.hoverBg,
                                    },
                                  }}
                                >
                                  <ListItemText
                                    primary={group}
                                    primaryTypographyProps={{
                                      variant: 'body2',
                                      fontWeight: isGroupActive ? 600 : 500,
                                    }}
                                  />
                                  <Box
                                    component="span"
                                    sx={{
                                      color: isGroupActive
                                        ? colors.activeText
                                        : colors.icon,
                                      display: 'flex',
                                      alignItems: 'center',
                                      transition: 'transform 0.2s',
                                      transform: isExpanded ? 'rotate(180deg)' : 'none',
                                    }}
                                  >
                                    <ExpandMore fontSize="small" />
                                  </Box>
                                </ListItemButton>

                                <Collapse in={isExpanded} timeout={200} unmountOnExit>
                                  <List component="div" disablePadding>
                                    {groupChildren.map(child => renderFlyoutItem(child, 1))}
                                  </List>
                                </Collapse>
                              </React.Fragment>
                            )
                          })}
                        </List>
                      )
                    })()
                  : (
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
                  )}
              </Paper>
            </Fade>
          </Popper>
        )
      })()}
    </Box>
  )
}

export default Sidebar
