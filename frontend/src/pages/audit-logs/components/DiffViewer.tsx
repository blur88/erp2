import React from 'react'
import { Table, TableBody, TableCell, TableHead, TableRow, Typography } from '@mui/material'

interface DiffViewerProps {
  oldValues?: Record<string, unknown> | null
  newValues?: Record<string, unknown> | null
}

function formatValue(val: unknown): string {
  if (val === null || val === undefined) return '—'
  if (typeof val === 'object') return JSON.stringify(val, null, 2)
  return String(val)
}

const DiffViewer: React.FC<DiffViewerProps> = ({ oldValues, newValues }) => {
  // Single-side: CREATE (newValues only) or DELETE (oldValues only)
  if (!oldValues && newValues) {
    return (
      <Table size="small">
        <TableHead>
          <TableRow>
            <TableCell><strong>Field</strong></TableCell>
            <TableCell sx={{ bgcolor: 'success.light' }}><strong>Value</strong></TableCell>
          </TableRow>
        </TableHead>
        <TableBody>
          {Object.entries(newValues).map(([key, val]) => (
            <TableRow key={key}>
              <TableCell sx={{ fontFamily: 'monospace', fontSize: '0.8rem' }}>{key}</TableCell>
              <TableCell sx={{ bgcolor: 'success.light', fontFamily: 'monospace', fontSize: '0.8rem', whiteSpace: 'pre-wrap', wordBreak: 'break-all' }}>
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
      <Table size="small">
        <TableHead>
          <TableRow>
            <TableCell><strong>Field</strong></TableCell>
            <TableCell sx={{ bgcolor: 'error.light' }}><strong>Value</strong></TableCell>
          </TableRow>
        </TableHead>
        <TableBody>
          {Object.entries(oldValues).map(([key, val]) => (
            <TableRow key={key}>
              <TableCell sx={{ fontFamily: 'monospace', fontSize: '0.8rem' }}>{key}</TableCell>
              <TableCell sx={{ bgcolor: 'error.light', fontFamily: 'monospace', fontSize: '0.8rem', whiteSpace: 'pre-wrap', wordBreak: 'break-all' }}>
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
    <Table size="small">
      <TableHead>
        <TableRow>
          <TableCell><strong>Field</strong></TableCell>
          <TableCell sx={{ bgcolor: 'error.light' }}><strong>Old Value</strong></TableCell>
          <TableCell sx={{ bgcolor: 'success.light' }}><strong>New Value</strong></TableCell>
        </TableRow>
      </TableHead>
      <TableBody>
        {allKeys.map((key) => {
          const oldVal = oldValues[key]
          const newVal = newValues[key]
          const changed = JSON.stringify(oldVal) !== JSON.stringify(newVal)
          return (
            <TableRow key={key} sx={{ opacity: changed ? 1 : 0.45 }}>
              <TableCell sx={{ fontFamily: 'monospace', fontSize: '0.8rem' }}>{key}</TableCell>
              <TableCell sx={{ bgcolor: changed ? 'error.light' : undefined, fontFamily: 'monospace', fontSize: '0.8rem', whiteSpace: 'pre-wrap', wordBreak: 'break-all' }}>
                {formatValue(oldVal)}
              </TableCell>
              <TableCell sx={{ bgcolor: changed ? 'success.light' : undefined, fontFamily: 'monospace', fontSize: '0.8rem', whiteSpace: 'pre-wrap', wordBreak: 'break-all' }}>
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
