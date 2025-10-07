import React, { useState, useEffect } from 'react'
import {
  Dialog,
  DialogTitle,
  DialogContent,
  DialogActions,
  Button,
  Table,
  TableBody,
  TableCell,
  TableContainer,
  TableHead,
  TableRow,
  TextField,
  InputAdornment,
  Box,
  Typography,
  IconButton,
  Tooltip,
  Alert,
  CircularProgress,
  useTheme,
  useMediaQuery,
} from '@mui/material'
import {
  Search as SearchIcon,
  Restore as RestoreIcon,
  Close as CloseIcon,
  ShoppingCart as OrderIcon,
} from '@mui/icons-material'
import { purchasingApi } from '@/services/purchasingApi'
import type { PurchaseOrder } from '@/types'
import { useNotification } from '@/hooks/useNotification'
import { formatCurrency, formatDate } from '@/utils/formatters'
import { TYPOGRAPHY_STYLES, TABLE_STYLES } from '@/constants/typography'

interface DeletedPurchaseOrdersDialogProps {
  open: boolean
  onClose: () => void
  onRefresh?: () => void
}

const DeletedPurchaseOrdersDialog: React.FC<DeletedPurchaseOrdersDialogProps> = ({ open, onClose, onRefresh }) => {
  const { showSuccess, showError } = useNotification()
  const theme = useTheme()
  const isMobile = useMediaQuery(theme.breakpoints.down('md'))

  const [deletedOrders, setDeletedOrders] = useState<PurchaseOrder[]>([])
  const [loading, setLoading] = useState(false)
  const [searchTerm, setSearchTerm] = useState('')
  const [restoringId, setRestoringId] = useState<string | null>(null)

  useEffect(() => {
    if (open) {
      fetchDeletedOrders()
    }
  }, [open])

  const fetchDeletedOrders = async () => {
    setLoading(true)
    try {
      const response = await purchasingApi.getDeletedPurchaseOrders({ limit: 100 })
      const apiResponse = response as any
      setDeletedOrders(apiResponse.orders || apiResponse.data || [])
    } catch (error) {
      console.error('Error fetching deleted purchase orders:', error)
      showError('Failed to fetch deleted purchase orders')
    } finally {
      setLoading(false)
    }
  }

  // Filter orders based on search term
  const filteredOrders = deletedOrders.filter(order =>
    order.orderNumber?.toLowerCase().includes(searchTerm.toLowerCase()) ||
    order.supplier?.companyName?.toLowerCase().includes(searchTerm.toLowerCase())
  )

  const handleRestore = async (order: PurchaseOrder) => {
    setRestoringId(order.id)
    try {
      await purchasingApi.restorePurchaseOrder(order.id)
      showSuccess(`Purchase order ${order.orderNumber} restored successfully`)
      await fetchDeletedOrders()
      onRefresh?.()
    } catch (error: any) {
      showError(error?.response?.data?.message || 'Failed to restore purchase order')
    } finally {
      setRestoringId(null)
    }
  }

  const handleClose = () => {
    setSearchTerm('')
    onClose()
  }

  return (
    <Dialog
      open={open}
      onClose={handleClose}
      maxWidth="md"
      fullWidth
      fullScreen={isMobile}
      PaperProps={{
        sx: {
          borderRadius: isMobile ? 0 : 2,
          minHeight: isMobile ? '100vh' : '70vh',
          maxHeight: isMobile ? '100vh' : '85vh',
        }
      }}
    >
      <DialogTitle sx={{
        borderBottom: TABLE_STYLES.cell.border,
        display: 'flex',
        alignItems: 'center',
        justifyContent: 'space-between',
        gap: 2,
        pb: 2
      }}>
        <Box sx={{ display: 'flex', alignItems: 'center', gap: 2 }}>
          <OrderIcon color="warning" />
          <Box>
            <Typography variant="h6" sx={{
              fontWeight: 600,
              fontSize: '1.25rem'
            }}>
              Deleted Purchase Orders
            </Typography>
            <Typography variant="caption" color="text.secondary">
              {filteredOrders.length} deleted order{filteredOrders.length !== 1 ? 's' : ''}
            </Typography>
          </Box>
        </Box>
        <IconButton
          onClick={handleClose}
          size="small"
          sx={{ color: 'text.secondary' }}
        >
          <CloseIcon />
        </IconButton>
      </DialogTitle>

      <DialogContent sx={{ p: 0 }}>
        {/* Search Box */}
        <Box sx={{ p: 3, pb: 2, borderBottom: TABLE_STYLES.cell.border }}>
          <TextField
            fullWidth
            placeholder="Search by order number or supplier..."
            value={searchTerm}
            onChange={(e) => setSearchTerm(e.target.value)}
            size="small"
            InputProps={{
              startAdornment: (
                <InputAdornment position="start">
                  <SearchIcon sx={{ fontSize: TYPOGRAPHY_STYLES.searchField.icon.fontSize }} />
                </InputAdornment>
              ),
            }}
          />
        </Box>

        {/* Orders Table */}
        {loading ? (
          <Box sx={{ display: 'flex', justifyContent: 'center', alignItems: 'center', py: 8 }}>
            <CircularProgress />
          </Box>
        ) : filteredOrders.length === 0 ? (
          <Box sx={{ p: 8, textAlign: 'center' }}>
            <Alert severity="info" sx={{ maxWidth: 400, mx: 'auto' }}>
              {searchTerm ? 'No deleted purchase orders match your search.' : 'No deleted purchase orders found.'}
            </Alert>
          </Box>
        ) : (
          <TableContainer sx={{ maxHeight: isMobile ? 'calc(100vh - 280px)' : 'calc(85vh - 240px)' }}>
            <Table size={TABLE_STYLES.size} stickyHeader>
              <TableHead>
                <TableRow>
                  <TableCell sx={{
                    fontWeight: TYPOGRAPHY_STYLES.tableHeader.fontWeight,
                    fontSize: TYPOGRAPHY_STYLES.tableHeader.fontSize,
                    textTransform: 'uppercase',
                    letterSpacing: '0.5px',
                    backgroundColor: theme.palette.background.paper
                  }}>
                    Order Number
                  </TableCell>
                  <TableCell sx={{
                    fontWeight: TYPOGRAPHY_STYLES.tableHeader.fontWeight,
                    fontSize: TYPOGRAPHY_STYLES.tableHeader.fontSize,
                    textTransform: 'uppercase',
                    letterSpacing: '0.5px',
                    backgroundColor: theme.palette.background.paper
                  }}>
                    Supplier
                  </TableCell>
                  <TableCell sx={{
                    fontWeight: TYPOGRAPHY_STYLES.tableHeader.fontWeight,
                    fontSize: TYPOGRAPHY_STYLES.tableHeader.fontSize,
                    textTransform: 'uppercase',
                    letterSpacing: '0.5px',
                    backgroundColor: theme.palette.background.paper
                  }}>
                    Total Amount
                  </TableCell>
                  <TableCell sx={{
                    fontWeight: TYPOGRAPHY_STYLES.tableHeader.fontWeight,
                    fontSize: TYPOGRAPHY_STYLES.tableHeader.fontSize,
                    textTransform: 'uppercase',
                    letterSpacing: '0.5px',
                    backgroundColor: theme.palette.background.paper
                  }}>
                    Order Date
                  </TableCell>
                  <TableCell align="center" sx={{
                    fontWeight: TYPOGRAPHY_STYLES.tableHeader.fontWeight,
                    fontSize: TYPOGRAPHY_STYLES.tableHeader.fontSize,
                    textTransform: 'uppercase',
                    letterSpacing: '0.5px',
                    backgroundColor: theme.palette.background.paper,
                    width: 100
                  }}>
                    Actions
                  </TableCell>
                </TableRow>
              </TableHead>
              <TableBody>
                {filteredOrders.map((order) => (
                  <TableRow key={order.id} hover>
                    <TableCell>
                      <Typography
                        variant={TYPOGRAPHY_STYLES.tableCell.primary.variant}
                        sx={{
                          fontWeight: TYPOGRAPHY_STYLES.tableCell.primary.fontWeight,
                          fontSize: TYPOGRAPHY_STYLES.tableCell.primary.fontSize
                        }}
                      >
                        {order.orderNumber}
                      </Typography>
                    </TableCell>
                    <TableCell>
                      <Typography variant="body2">
                        {order.supplier?.companyName || 'N/A'}
                      </Typography>
                    </TableCell>
                    <TableCell>
                      <Typography variant="body2" sx={{ fontWeight: 600 }}>
                        {formatCurrency((order as any).totalAmount || order.total || 0)}
                      </Typography>
                    </TableCell>
                    <TableCell>
                      <Typography variant="body2">
                        {formatDate(order.orderDate)}
                      </Typography>
                    </TableCell>
                    <TableCell align="center">
                      <Tooltip title="Restore purchase order">
                        <span>
                          <IconButton
                            onClick={() => handleRestore(order)}
                            disabled={restoringId === order.id}
                            size="small"
                            sx={{
                              color: 'success.main',
                              '&:hover': {
                                backgroundColor: 'success.lighter'
                              }
                            }}
                          >
                            {restoringId === order.id ? (
                              <CircularProgress size={20} />
                            ) : (
                              <RestoreIcon fontSize="small" />
                            )}
                          </IconButton>
                        </span>
                      </Tooltip>
                    </TableCell>
                  </TableRow>
                ))}
              </TableBody>
            </Table>
          </TableContainer>
        )}
      </DialogContent>

      <DialogActions sx={{ p: 3, borderTop: TABLE_STYLES.cell.border }}>
        <Button onClick={handleClose} variant="outlined">
          Close
        </Button>
      </DialogActions>
    </Dialog>
  )
}

export default DeletedPurchaseOrdersDialog
