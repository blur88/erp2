import React from 'react'
import { Table, TableBody, TableCell, TableHead, TableRow, Typography } from '@mui/material'
import { alpha, type Theme } from '@mui/material/styles'

interface DiffViewerProps {
  oldValues?: Record<string, unknown> | null
  newValues?: Record<string, unknown> | null
}

function formatValue(val: unknown): string {
  if (val === null || val === undefined) return '—'
  if (typeof val === 'object') return JSON.stringify(val, null, 2)
  return String(val)
}

function toneBackground(theme: Theme, tone: 'success' | 'error'): string {
  if (tone === 'success') {
    return theme.palette.mode === 'dark'
      ? alpha(theme.palette.success.main, 0.22)
      : theme.palette.success.light
  }

  return theme.palette.mode === 'dark'
    ? alpha(theme.palette.error.main, 0.22)
    : theme.palette.error.light
}

const DiffViewer: React.FC<DiffViewerProps> = ({ oldValues, newValues }) => {
  // Single-side: CREATE (newValues only) or DELETE (oldValues only)
  if (!oldValues && newValues) {
    return (
      <Table size="small" sx={{ tableLayout: 'fixed', width: '100%' }}>
        <colgroup>
          <col style={{ width: '35%' }} />
          <col style={{ width: '65%' }} />
        </colgroup>
        <TableHead>
          <TableRow>
            <TableCell><strong>Field</strong></TableCell>
            <TableCell sx={(theme) => ({ bgcolor: toneBackground(theme, 'success') })}><strong>Value</strong></TableCell>
          </TableRow>
        </TableHead>
        <TableBody>
          {Object.entries(newValues).map(([key, val]) => (
            <TableRow key={key}>
              <TableCell sx={{ fontSize: '0.8rem' }}>{key}</TableCell>
              <TableCell sx={(theme) => ({ bgcolor: toneBackground(theme, 'success'), fontSize: '0.8rem', whiteSpace: 'pre-wrap', wordBreak: 'break-all' })}>
                {formatValue(val)}
              </TableCell>
            </TableRow>
          ))}
        </TableBody>
      </Table>
    )
  }

  if (oldValues && !newValues) {
    return (
      <Table size="small" sx={{ tableLayout: 'fixed', width: '100%' }}>
        <colgroup>
          <col style={{ width: '35%' }} />
          <col style={{ width: '65%' }} />
        </colgroup>
        <TableHead>
          <TableRow>
            <TableCell><strong>Field</strong></TableCell>
            <TableCell sx={(theme) => ({ bgcolor: toneBackground(theme, 'error') })}><strong>Value</strong></TableCell>
          </TableRow>
        </TableHead>
        <TableBody>
          {Object.entries(oldValues).map(([key, val]) => (
            <TableRow key={key}>
              <TableCell sx={{ fontSize: '0.8rem' }}>{key}</TableCell>
              <TableCell sx={(theme) => ({ bgcolor: toneBackground(theme, 'error'), fontSize: '0.8rem', whiteSpace: 'pre-wrap', wordBreak: 'break-all' })}>
                {formatValue(val)}
              </TableCell>
            </TableRow>
          ))}
        </TableBody>
      </Table>
    )
  }

  if (!oldValues && !newValues) {
    return <Typography variant="body2" color="text.secondary">No value changes recorded.</Typography>
  }

  // Both sides: show diff
  const allKeys = Array.from(new Set([...Object.keys(oldValues), ...Object.keys(newValues)]))

  return (
    <Table size="small" sx={{ tableLayout: 'fixed', width: '100%' }}>
      <colgroup>
        <col style={{ width: '35%' }} />
        <col style={{ width: '32.5%' }} />
        <col style={{ width: '32.5%' }} />
      </colgroup>
      <TableHead>
        <TableRow>
          <TableCell><strong>Field</strong></TableCell>
          <TableCell sx={(theme) => ({ bgcolor: toneBackground(theme, 'error') })}><strong>Old Value</strong></TableCell>
          <TableCell sx={(theme) => ({ bgcolor: toneBackground(theme, 'success') })}><strong>New Value</strong></TableCell>
        </TableRow>
      </TableHead>
      <TableBody>
        {allKeys.map((key) => {
          const oldVal = oldValues[key]
          const newVal = newValues[key]
          const changed = JSON.stringify(oldVal) !== JSON.stringify(newVal)
          return (
            <TableRow key={key} sx={{ opacity: changed ? 1 : 0.45 }}>
              <TableCell sx={{ fontSize: '0.8rem' }}>{key}</TableCell>
              <TableCell sx={(theme) => ({ bgcolor: changed ? toneBackground(theme, 'error') : undefined, fontSize: '0.8rem', whiteSpace: 'pre-wrap', wordBreak: 'break-all' })}>
                {formatValue(oldVal)}
              </TableCell>
              <TableCell sx={(theme) => ({ bgcolor: changed ? toneBackground(theme, 'success') : undefined, fontSize: '0.8rem', whiteSpace: 'pre-wrap', wordBreak: 'break-all' })}>
                {formatValue(newVal)}
              </TableCell>
            </TableRow>
          )
        })}
      </TableBody>
    </Table>
  )
}

export default DiffViewer
