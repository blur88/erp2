import React, { useState } from 'react'
import {
  Button, Menu, MenuItem, CircularProgress,
} from '@mui/material'
import { GetApp, KeyboardArrowDown } from '@mui/icons-material'
import * as XLSX from 'xlsx'
import jsPDF from 'jspdf'
import autoTable from 'jspdf-autotable'
import { format } from 'date-fns'
import type { AuditLog } from '@/types'

interface ExportButtonProps {
  logs: AuditLog[]
  disabled?: boolean
}

const COLUMNS = ['Date', 'Action', 'Entity Type', 'Entity ID', 'User', 'Description', 'IP Address']

function toRows(logs: AuditLog[]) {
  return logs.map((log) => [
    format(new Date(log.createdAt), 'yyyy-MM-dd HH:mm:ss'),
    log.action,
    log.entityType,
    log.entityId ?? '',
    log.username || log.userId,
    log.description,
    log.ipAddress ?? '',
  ])
}

const ExportButton: React.FC<ExportButtonProps> = ({ logs, disabled }) => {
  const [anchorEl, setAnchorEl] = useState<null | HTMLElement>(null)
  const [exporting, setExporting] = useState(false)
  const open = Boolean(anchorEl)

  const handleOpen = (e: React.MouseEvent<HTMLButtonElement>) => setAnchorEl(e.currentTarget)
  const handleClose = () => setAnchorEl(null)

  const exportCSV = () => {
    handleClose()
    const rows = toRows(logs)
    const ws = XLSX.utils.aoa_to_sheet([COLUMNS, ...rows])
    const wb = XLSX.utils.book_new()
    XLSX.utils.book_append_sheet(wb, ws, 'Audit Logs')
    XLSX.writeFile(wb, `audit-logs-${format(new Date(), 'yyyy-MM-dd')}.csv`, { bookType: 'csv' })
  }

  const exportExcel = () => {
    handleClose()
    const rows = toRows(logs)
    const ws = XLSX.utils.aoa_to_sheet([COLUMNS, ...rows])
    const wb = XLSX.utils.book_new()
    XLSX.utils.book_append_sheet(wb, ws, 'Audit Logs')
    XLSX.writeFile(wb, `audit-logs-${format(new Date(), 'yyyy-MM-dd')}.xlsx`)
  }

  const exportPDF = () => {
    handleClose()
    setExporting(true)
    try {
      const doc = new jsPDF({ orientation: 'landscape' })
      doc.setFontSize(14)
      doc.text('Audit Logs', 14, 15)
      doc.setFontSize(10)
      doc.text(`Exported: ${format(new Date(), 'yyyy-MM-dd HH:mm')}`, 14, 22)
      autoTable(doc, {
        head: [COLUMNS],
        body: toRows(logs),
        startY: 28,
        styles: { fontSize: 8 },
        headStyles: { fillColor: [33, 150, 243] },
      })
      doc.save(`audit-logs-${format(new Date(), 'yyyy-MM-dd')}.pdf`)
    } finally {
      setExporting(false)
    }
  }

  return (
    <>
      <Button
        variant="outlined"
        startIcon={exporting ? <CircularProgress size={16} /> : <GetApp />}
        endIcon={<KeyboardArrowDown />}
        onClick={handleOpen}
        disabled={disabled || exporting || logs.length === 0}
      >
        Export
      </Button>
      <Menu anchorEl={anchorEl} open={open} onClose={handleClose}>
        <MenuItem onClick={exportCSV}>Export as CSV</MenuItem>
        <MenuItem onClick={exportExcel}>Export as Excel (.xlsx)</MenuItem>
        <MenuItem onClick={exportPDF}>Export as PDF</MenuItem>
      </Menu>
    </>
  )
}

export default ExportButton
