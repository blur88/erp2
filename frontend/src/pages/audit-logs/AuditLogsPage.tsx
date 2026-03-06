import React, { useEffect, useState } from 'react'
import {
  Box, Typography, Tabs, Tab, Stack,
} from '@mui/material'
import { History as AuditIcon } from '@mui/icons-material'
import { useAppDispatch, useAppSelector } from '@/hooks/useRedux'
import {
  setPage,
  setLimit,
  setActiveTab,
} from '@/store/slices/auditLogSlice'
import { useGetAuditLogsQuery, useGetAuditLogStatisticsQuery } from '@/store/api/auditLogApi'
import { TYPOGRAPHY_STYLES } from '@/constants/typography'
import FilterSidebar from './components/FilterSidebar'
import LogsTab from './components/LogsTab'
import AnalyticsTab from './components/AnalyticsTab'
import ExportButton from './components/ExportButton'
import { priceListApi } from '@/services/priceListApi'

const AuditLogsPage: React.FC = () => {
  const dispatch = useAppDispatch()
  const { pagination, filters, activeTab, sidebarCollapsed } = useAppSelector((state) => state.auditLogs)
  const {
    data: logsResponse,
    isLoading: isLogsLoading,
    error: logsError,
  } = useGetAuditLogsQuery({
    page: pagination.page,
    limit: pagination.limit,
    ...filters,
    sortBy: 'createdAt',
    sortOrder: 'DESC',
  })
  const { data: statistics, isLoading: isStatisticsLoading } = useGetAuditLogStatisticsQuery({
    startDate: filters.startDate,
    endDate: filters.endDate,
  })
  const auditLogs = logsResponse?.data ?? []
  const loading = isLogsLoading || isStatisticsLoading
  const error = logsError ? 'Failed to fetch audit logs' : null
  const [priceListNameById, setPriceListNameById] = useState<Record<string, string>>({})

  useEffect(() => {
    const loadPriceLists = async () => {
      try {
        const response = await priceListApi.getPriceLists({
          page: 1,
          sortBy: 'name',
          sortOrder: 'asc',
        })
        const data = response.data ?? []
        const map: Record<string, string> = {}
        data.forEach((pl) => {
          map[pl.id] = pl.name
        })
        setPriceListNameById(map)
      } catch (error) {
        // Ignore lookup failures; audit logs can still render with raw IDs.
        console.error('Failed to load price list names for audit logs:', error)
      }
    }

    loadPriceLists()
  }, [])

  useEffect(() => {
    const extractPriceListIds = (value: unknown, result: Set<string>) => {
      if (!value) return
      if (Array.isArray(value)) {
        value.forEach((item) => extractPriceListIds(item, result))
        return
      }
      if (typeof value !== 'object') return

      const record = value as Record<string, unknown>
      Object.entries(record).forEach(([key, val]) => {
        if (key === 'priceListId' && typeof val === 'string') {
          result.add(val)
          return
        }
        extractPriceListIds(val, result)
      })
    }

    const resolveMissingPriceListNames = async () => {
      const idsInLogs = new Set<string>()
      auditLogs.forEach((log) => {
        extractPriceListIds(log.oldValues, idsInLogs)
        extractPriceListIds(log.newValues, idsInLogs)
      })

      const missingIds = Array.from(idsInLogs).filter((id) => !priceListNameById[id])
      if (missingIds.length === 0) return

      const entries = await Promise.all(
        missingIds.map(async (id): Promise<[string, string]> => {
          try {
            const priceList = await priceListApi.getPriceList(id)
            return [id, priceList.name]
          } catch {
            // Cache fallback to avoid repeating failed lookups.
            return [id, id]
          }
        }),
      )

      setPriceListNameById((prev) => {
        const next = { ...prev }
        entries.forEach(([id, name]) => {
          next[id] = name
        })
        return next
      })
    }

    resolveMissingPriceListNames()
  }, [auditLogs, priceListNameById])

  const handleApply = () => {
    dispatch(setPage(1))
    // effects above will re-run due to state changes
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
            priceListNameById={priceListNameById}
            total={logsResponse?.meta?.total ?? 0}
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
