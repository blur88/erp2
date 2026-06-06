import React, { useState } from 'react'
import {
  TableRow, TableCell, Chip, Box, Typography, Collapse,
  IconButton, Link, Divider, Stack,
} from '@mui/material'
import { default as KeyboardArrowDown } from '@mui/icons-material/KeyboardArrowDown'
import { default as KeyboardArrowRight } from '@mui/icons-material/KeyboardArrowRight'
import { default as OpenInNew } from '@mui/icons-material/OpenInNew'
import { format } from 'date-fns'
import { useNavigate } from 'react-router-dom'
import type { AuditLog } from '@/types'
import DiffViewer from './DiffViewer'

interface LogRowProps {
  log: AuditLog
  priceListNameById: Record<string, string>
}

function getActionColor(action: string): 'default' | 'primary' | 'secondary' | 'error' | 'info' | 'success' | 'warning' {
  switch (action) {
    case 'CREATE': return 'success'
    case 'UPDATE': return 'info'
    case 'DELETE': case 'BULK_DELETE': return 'error'
    case 'RESTORE': case 'BULK_RESTORE': return 'warning'
    case 'EXPORT': case 'IMPORT': return 'primary'
    default: return 'default'
  }
}

function getEntityLink(entityType: string, entityId?: string | null): string | null {
  const id = entityId
  const map: Record<string, string> = {
    Product: id ? `/inventory/products/${id}/edit` : '/inventory/products',
    Category: '/inventory/categories',
    StockAdjustment: id ? `/inventory/stock-adjustments/${id}/edit` : '/inventory/stock-adjustments',
    Customer: '/sales/customers',
    Order: id ? `/sales/orders/${id}/edit` : '/sales/orders',
    SalesOrder: id ? `/sales/orders/${id}/edit` : '/sales/orders',
    Supplier: '/purchasing/suppliers',
    PurchaseOrder: id ? `/purchasing/orders/${id}/edit` : '/purchasing/orders',
    Account: '/accounting/chart-of-accounts',
    JournalEntry: id ? `/accounting/journal-entries/${id}` : '/accounting/journal-entries',
    FiscalPeriod: '/accounting/fiscal-periods',
    AccountMapping: '/accounting/account-mappings',
    BankReconciliation: '/accounting/bank-reconciliations',
    Settlement: '/accounting/settlements',
    OwnerEquity: '/accounting/owner-equity',
    Expense: '/accounting/expenses',
  }
  return map[entityType] ?? null
}

function parseUserAgent(ua?: string | null): string {
  if (!ua) return 'Unknown'
  const browsers = [
    [/Chrome\/(\S+)/, 'Chrome'],
    [/Firefox\/(\S+)/, 'Firefox'],
    [/Safari\/(\S+)/, 'Safari'],
    [/Edge\/(\S+)/, 'Edge'],
  ] as [RegExp, string][]
  const os = [
    [/Windows NT/, 'Windows'],
    [/Mac OS X/, 'macOS'],
    [/Linux/, 'Linux'],
    [/Android/, 'Android'],
    [/iPhone|iPad/, 'iOS'],
  ] as [RegExp, string][]

  const browser = browsers.find(([re]) => re.test(ua))
  const operatingSystem = os.find(([re]) => re.test(ua))
  const parts = [browser?.[1], operatingSystem?.[1]].filter(Boolean)
  return parts.length ? parts.join(' / ') : 'Unknown'
}

const LogRow: React.FC<LogRowProps> = ({ log, priceListNameById }) => {
  const [expanded, setExpanded] = useState(false)
  const navigate = useNavigate()
  const entityLink = getEntityLink(log.entityType, log.entityId)
  const hasDiff = log.oldValues || log.newValues

  return (
    <>
      <TableRow
        hover
        onClick={() => setExpanded((v) => !v)}
        sx={{ cursor: 'pointer', '& > *': { borderBottom: expanded ? 'none' : undefined } }}
      >
        <TableCell sx={{ width: 32, p: 0.5 }}>
          <IconButton size="small">
            {expanded ? <KeyboardArrowDown /> : <KeyboardArrowRight />}
          </IconButton>
        </TableCell>
        <TableCell sx={{ whiteSpace: 'nowrap' }}>
          {format(new Date(log.createdAt), 'MMM dd, yyyy HH:mm:ss')}
        </TableCell>
        <TableCell>
          <Chip label={log.action} color={getActionColor(log.action)} size="small" />
        </TableCell>
        <TableCell>{log.entityType}</TableCell>
        <TableCell>
          <Typography variant="body2">{log.username || log.userId}</Typography>
        </TableCell>
        <TableCell sx={{ maxWidth: 360 }}>
          <Typography variant="body2" noWrap>{log.description}</Typography>
        </TableCell>
      </TableRow>
      {/* Expanded detail row */}
      <TableRow>
        <TableCell colSpan={6} sx={{ p: 0, border: expanded ? undefined : 'none' }}>
          <Collapse in={expanded} unmountOnExit>
            <Box sx={{ p: 2, bgcolor: 'background.default' }}>
              {/* Metadata strip */}
              <Stack
                direction="row"
                spacing={3}
                sx={{
                  flexWrap: "wrap",
                  mb: 2
                }}>
                {log.ipAddress && (
                  <Typography variant="caption" sx={{
                    color: "text.secondary"
                  }}>
                    IP: <strong>{log.ipAddress}</strong>
                  </Typography>
                )}
                {log.userAgent && (
                  <Typography variant="caption" sx={{
                    color: "text.secondary"
                  }}>
                    Browser: <strong>{parseUserAgent(log.userAgent)}</strong>
                  </Typography>
                )}
                {log.entityId && (
                  <Typography variant="caption" sx={{
                    color: "text.secondary"
                  }}>
                    Entity ID: {log.entityId}
                  </Typography>
                )}
                {entityLink && (
                  <Link
                    component="button"
                    variant="caption"
                    sx={{ display: 'flex', alignItems: 'center', gap: 0.5 }}
                    onClick={(e) => { e.stopPropagation(); navigate(entityLink) }}
                  >
                    Go to {log.entityType} <OpenInNew sx={{ fontSize: 12 }} />
                  </Link>
                )}
              </Stack>

              <Divider sx={{ mb: 2 }} />

              {/* Diff viewer */}
              {hasDiff ? (
                <DiffViewer
                  oldValues={log.oldValues as any}
                  newValues={log.newValues as any}
                  priceListNameById={priceListNameById}
                />
              ) : (
                <Typography variant="body2" sx={{
                  color: "text.secondary"
                }}>{log.description}</Typography>
              )}

              {/* Metadata */}
              {log.metadata && (
                <Box sx={{ mt: 2 }}>
                  <Typography
                    variant="caption"
                    sx={{
                      color: "text.secondary",
                      fontWeight: 600
                    }}>
                    Metadata
                  </Typography>
                  <Box sx={{ fontSize: '0.75rem', mt: 0.5, overflow: 'auto', whiteSpace: 'pre-wrap', wordBreak: 'break-word' }}>
                    {JSON.stringify(log.metadata, null, 2)}
                  </Box>
                </Box>
              )}
            </Box>
          </Collapse>
        </TableCell>
      </TableRow>
    </>
  );
}

export default LogRow
