import {
  Box,
  Button,
  CircularProgress,
  Paper,
  Table,
  TableBody,
  TableCell,
  TableContainer,
  TableHead,
  TableRow,
  Typography,
} from '@mui/material'
import { useNavigate } from 'react-router-dom'

import { TABLE_STYLES } from '@/constants/tableStyles'
import { useGetSupplierGRNsQuery } from '@/store/api/purchasingApi'
import { formatDate } from '@/utils/formatters'

interface SupplierGRNTabProps {
  supplierId: string
}

export default function SupplierGRNTab({ supplierId }: SupplierGRNTabProps) {
  const navigate = useNavigate()
  const { data, isLoading } = useGetSupplierGRNsQuery(supplierId)
  const grns = data?.data ?? []

  if (isLoading) {
    return (
      <Box sx={{ display: 'flex', justifyContent: 'center', py: 4 }}>
        <CircularProgress />
      </Box>
    )
  }

  if (grns.length === 0) {
    return (
      <Typography sx={{ color: 'text.secondary', py: 4, textAlign: 'center' }}>
        No goods received notes yet for this supplier.
      </Typography>
    )
  }

  return (
    <TableContainer component={Paper} variant="outlined">
      <Table size={TABLE_STYLES.size}>
        <TableHead>
          <TableRow sx={{ '& .MuiTableCell-head': { fontWeight: 600, backgroundColor: 'grey.50' } }}>
            <TableCell sx={{ width: '25%' }}>GRN #</TableCell>
            <TableCell sx={{ width: '25%' }}>Date</TableCell>
            <TableCell sx={{ width: '25%' }}>PO #</TableCell>
            <TableCell align="right" sx={{ width: '25%' }}>Action</TableCell>
          </TableRow>
        </TableHead>
        <TableBody>
          {grns.map((grn) => (
            <TableRow key={grn.id} hover>
              <TableCell>
                <Typography variant="body2" sx={{ fontWeight: 600 }}>
                  {grn.grnNumber}
                </Typography>
              </TableCell>
              <TableCell>{formatDate(grn.receivedDate)}</TableCell>
              <TableCell>{grn.purchaseOrder?.orderNumber ?? '-'}</TableCell>
              <TableCell align="right">
                <Button
                  size="small"
                  variant="text"
                  onClick={() => navigate('/purchasing/goods-received', { state: { highlightGRNId: grn.id } })}
                >
                  View
                </Button>
              </TableCell>
            </TableRow>
          ))}
        </TableBody>
      </Table>
    </TableContainer>
  )
}
