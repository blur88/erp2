import React, { useEffect } from 'react'
import {
  Box, Typography, Tabs, Tab, Stack,
} from '@mui/material'
import { History as AuditIcon } from '@mui/icons-material'
import { useAppDispatch, useAppSelector } from '@/hooks/useRedux'
import {
  fetchAuditLogs,
  fetchAuditLogStatistics,
  setPage,
  setLimit,
  setActiveTab,
} from '@/store/slices/auditLogSlice'
import { TYPOGRAPHY_STYLES } from '@/constants/typography'
import FilterSidebar from './components/FilterSidebar'
import LogsTab from './components/LogsTab'
import AnalyticsTab from './components/AnalyticsTab'
import ExportButton from './components/ExportButton'

const AuditLogsPage: React.FC = () => {
  const dispatch = useAppDispatch()
  const {
    auditLogs, statistics, loading, error,
    pagination, filters, activeTab, sidebarCollapsed,
  } = useAppSelector((state) => state.auditLogs)

  const fetchLogs = () => {
    dispatch(fetchAuditLogs({
      page: pagination.page,
      limit: pagination.limit,
      ...filters,
      sortBy: 'createdAt',
      sortOrder: 'DESC',
    }))
  }

  const fetchStats = () => {
    dispatch(fetchAuditLogStatistics({
      startDate: filters.startDate,
      endDate: filters.endDate,
    }))
  }

  useEffect(() => {
    fetchLogs()
  }, [pagination.page, pagination.limit])

  useEffect(() => {
    fetchStats()
  }, [filters.startDate, filters.endDate])

  const handleApply = () => {
    dispatch(setPage(1))
    fetchLogs()
    fetchStats()
  }

  const handlePageChange = (page: number) => {
    dispatch(setPage(page))
  }

  const handleLimitChange = (limit: number) => {
    dispatch(setLimit(limit))
    dispatch(setPage(1))
  }

  const entityTypes = statistics?.byEntityType.map((e) => e.entityType) ?? []

  return (
    <Box sx={{ display: 'flex', height: '100%', gap: 2, p: 3 }}>
      {/* Sidebar */}
      <Box sx={{ flexShrink: 0, width: sidebarCollapsed ? 48 : 260, transition: 'width 0.2s' }}>
        <FilterSidebar entityTypes={entityTypes} onApply={handleApply} />
      </Box>

      {/* Main content */}
      <Box sx={{ flex: 1, minWidth: 0, display: 'flex', flexDirection: 'column', gap: 2 }}>
        {/* Header */}
        <Stack direction="row" justifyContent="space-between" alignItems="center">
          <Box>
            <Typography
              variant={TYPOGRAPHY_STYLES.pageHeader.variant}
              sx={{ fontWeight: TYPOGRAPHY_STYLES.pageHeader.fontWeight, display: 'flex', alignItems: 'center', gap: 1 }}
            >
              <AuditIcon sx={{ fontSize: TYPOGRAPHY_STYLES.pageHeader.icon.fontSize, color: TYPOGRAPHY_STYLES.pageHeader.icon.color }} />
              Audit Logs
            </Typography>
            <Typography variant="body2" color="text.secondary">
              View all system changes and user activities
            </Typography>
          </Box>
          <ExportButton logs={auditLogs} disabled={loading} />
        </Stack>

        {/* Tabs */}
        <Tabs
          value={activeTab}
          onChange={(_e, val) => dispatch(setActiveTab(val))}
          sx={{ borderBottom: 1, borderColor: 'divider' }}
        >
          <Tab label="Logs" value="logs" />
          <Tab label="Analytics" value="analytics" />
        </Tabs>

        {/* Tab content */}
        {activeTab === 'logs' && (
          <LogsTab
            logs={auditLogs}
            loading={loading}
            error={error}
            total={pagination.total}
            page={pagination.page}
            limit={pagination.limit}
            onPageChange={handlePageChange}
            onLimitChange={handleLimitChange}
          />
        )}
        {activeTab === 'analytics' && (
          <AnalyticsTab statistics={statistics} loading={loading} />
        )}
      </Box>
    </Box>
  )
}

export default AuditLogsPage
