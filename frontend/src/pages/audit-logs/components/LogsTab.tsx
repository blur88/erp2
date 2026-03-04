import React from 'react'
import {
  Paper, Table, TableBody, TableCell, TableContainer, TableHead,
  TablePagination, TableRow, CircularProgress, Typography, Alert,
} from '@mui/material'
import type { AuditLog } from '@/types'
import LogRow from './LogRow'

interface LogsTabProps {
  logs: AuditLog[]
  loading: boolean
  error: string | null
  total: number
  page: number          // 1-based
  limit: number
  onPageChange: (page: number) => void
  onLimitChange: (limit: number) => void
}

const LogsTab: React.FC<LogsTabProps> = ({
  logs, loading, error, total, page, limit, onPageChange, onLimitChange,
}) => {
  return (
    <>
      {error && <Alert severity="error" sx={{ mb: 2 }}>{error}</Alert>}
      <Paper>
        <TableContainer>
          <Table>
            <TableHead>
              <TableRow>
                <TableCell sx={{ width: 32 }} />
                <TableCell>Date & Time</TableCell>
                <TableCell>Action</TableCell>
                <TableCell>Entity Type</TableCell>
                <TableCell>User</TableCell>
                <TableCell>Description</TableCell>
              </TableRow>
            </TableHead>
            <TableBody>
              {loading ? (
                <TableRow>
                  <TableCell colSpan={6} align="center" sx={{ py: 6 }}>
                    <CircularProgress />
                  </TableCell>
                </TableRow>
              ) : logs.length === 0 ? (
                <TableRow>
                  <TableCell colSpan={6} align="center" sx={{ py: 6 }}>
                    <Typography variant="body2" color="text.secondary">
                      No audit logs found
                    </Typography>
                  </TableCell>
                </TableRow>
              ) : (
                logs.map((log) => <LogRow key={log.id} log={log} />)
              )}
            </TableBody>
          </Table>
        </TableContainer>
        <TablePagination
          rowsPerPageOptions={[10, 20, 50, 100]}
          component="div"
          count={total}
          rowsPerPage={limit}
          page={page - 1}
          onPageChange={(_e, p) => onPageChange(p + 1)}
          onRowsPerPageChange={(e) => onLimitChange(parseInt(e.target.value, 10))}
        />
      </Paper>
    </>
  )
}

export default LogsTab
