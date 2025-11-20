import React, { useState, useEffect } from 'react'
import { useParams, useNavigate } from 'react-router-dom'
import {
  Box,
  Typography,
  Paper,
  Grid,
  Button,
  Table,
  TableBody,
  TableCell,
  TableContainer,
  TableHead,
  TableRow,
  CircularProgress,
  Chip,
  Divider,
  Stack,
  useTheme,
  useMediaQuery,
  Alert,
} from '@mui/material'
import {
  ArrowBack as BackIcon,
  Edit as EditIcon,
  Print as PrintIcon,
  Receipt as ReceiptIcon,
  Payment as PaymentIcon,
  ShoppingCart as PurchaseOrderIcon,
  LocalShipping as ShippingIcon,
  Assignment as GRNIcon,
} from '@mui/icons-material'
import { formatCurrency } from '@/utils/formatters'
import { TYPOGRAPHY_STYLES, TABLE_STYLES } from '@/constants/typography'

interface PurchaseOrderItem {
  id: string
  product?: {
    id: string
    sku: string
    name: string
  }
  description: string
  quantity: number
  unitPrice: number
  discountPercent: number
  discountAmount: number
  totalAmount: number
  receivedQuantity: number
  isFullyReceived: boolean
  status: string
}

interface PurchaseOrder {
  id: string
  orderNumber: string
  supplier: {
    id: string
    supplierCode: string
    companyName: string
    contactPerson?: string
    email?: string
    phone?: string
  }
  orderDate: string
  subtotal: number
  discountPercent: number
  discountAmount: number
  shippingAmount: number
  totalAmount: number
  deliveryTerms?: string
  notes?: string
  isFullyReceived: boolean
  totalReceivedQuantity: number
  totalOrderedQuantity: number
  items: PurchaseOrderItem[]
  goodsReceivedNotes?: Array<{
    id: string
    grnNumber: string
    status: string
    receiptDate: string
  }>
  vendorPayments?: Array<{
    id: string
    paymentNumber: string
    amount: number
    paymentDate: string
    paymentMethod: string
    status: string
  }>
  createdAt: string
  updatedAt: string
}

const PurchaseOrderDetails: React.FC = () => {
  const { id } = useParams<{ id: string }>()
  const navigate = useNavigate()
  const theme = useTheme()
  const isMobile = useMediaQuery(theme.breakpoints.down('md'))

  const [loading, setLoading] = useState(true)
  const [error, setError] = useState<string | null>(null)
  const [purchaseOrder, setPurchaseOrder] = useState<PurchaseOrder | null>(null)

  useEffect(() => {
    if (id) {
      loadPurchaseOrder()
    }
  }, [id])

  const loadPurchaseOrder = async () => {
    try {
      setLoading(true)
      setError(null)

      const response = await fetch(`/api/purchasing/orders/${id}`)

      if (!response.ok) {
        throw new Error('Failed to load purchase order')
      }

      const result = await response.json()
      setPurchaseOrder(result.data)
    } catch (err: any) {
      console.error('Failed to load purchase order:', err)
      setError(err.message || 'Failed to load purchase order')
    } finally {
      setLoading(false)
    }
  }

  const handlePrint = () => {
    window.print()
  }

  const handleEdit = () => {
    navigate(`/purchasing/orders/edit/${id}`)
  }

  const handleBack = () => {
    navigate('/purchasing/orders')
  }

  const getInventoryStatusColor = (isFullyReceived: boolean) => {
    return isFullyReceived ? 'success' : 'warning'
  }

  const getInventoryStatusLabel = (isFullyReceived: boolean) => {
    return isFullyReceived ? 'Received' : 'Pending'
  }

  const getPaymentStatusColor = () => {
    if (!purchaseOrder) return 'error'

    const totalPaid = purchaseOrder.vendorPayments?.reduce((sum, p) => sum + p.amount, 0) || 0

    if (totalPaid === 0) return 'error'
    if (totalPaid >= purchaseOrder.totalAmount) return 'success'
    return 'warning'
  }

  const getPaymentStatusLabel = () => {
    if (!purchaseOrder) return 'Unpaid'

    const totalPaid = purchaseOrder.vendorPayments?.reduce((sum, p) => sum + p.amount, 0) || 0

    if (totalPaid === 0) return 'Unpaid'
    if (totalPaid >= purchaseOrder.totalAmount) return 'Paid'
    return 'Partial'
  }

  if (loading) {
    return (
      <Box sx={{ display: 'flex', justifyContent: 'center', alignItems: 'center', minHeight: '60vh' }}>
        <CircularProgress />
      </Box>
    )
  }

  if (error || !purchaseOrder) {
    return (
      <Box>
        <Button
          startIcon={<BackIcon />}
          onClick={handleBack}
          sx={{ mb: 2 }}
        >
          Back to Purchase Orders
        </Button>
        <Alert severity="error">
          {error || 'Purchase order not found'}
        </Alert>
      </Box>
    )
  }

  const totalPaid = purchaseOrder.vendorPayments?.reduce((sum, p) => sum + p.amount, 0) || 0
  const balance = purchaseOrder.totalAmount - totalPaid

  return (
    <Box>
      {/* Header */}
      <Box sx={{
        display: 'flex',
        flexDirection: isMobile ? 'column' : 'row',
        justifyContent: 'space-between',
        alignItems: isMobile ? 'stretch' : 'center',
        mb: 4,
        gap: isMobile ? 2 : 0
      }}>
        <Box sx={{ mb: isMobile ? 2 : 0 }}>
          <Box sx={{ display: 'flex', alignItems: 'center', gap: 2, mb: 1 }}>
            <Button
              startIcon={<BackIcon />}
              onClick={handleBack}
              size="small"
            >
              Back
            </Button>
          </Box>
          <Typography variant={isMobile ? TYPOGRAPHY_STYLES.pageHeader.mobileVariant : TYPOGRAPHY_STYLES.pageHeader.variant} sx={{
            fontWeight: TYPOGRAPHY_STYLES.pageHeader.fontWeight,
            mb: 1,
            display: 'flex',
            alignItems: 'center',
            gap: 2
          }}>
            <PurchaseOrderIcon sx={{
              fontSize: TYPOGRAPHY_STYLES.pageHeader.icon.fontSize,
              color: TYPOGRAPHY_STYLES.pageHeader.icon.color
            }} />
            Purchase Order {purchaseOrder.orderNumber}
          </Typography>
          <Typography variant={TYPOGRAPHY_STYLES.pageSubtitle.variant} color={TYPOGRAPHY_STYLES.pageSubtitle.color}>
            Order details and line items
          </Typography>
        </Box>
        <Box sx={{
          display: 'flex',
          flexDirection: isMobile ? 'column' : 'row',
          gap: isMobile ? 1.5 : 1,
          alignItems: isMobile ? 'stretch' : 'center'
        }}>
          <Button
            variant="outlined"
            startIcon={!isMobile ? <PrintIcon /> : undefined}
            onClick={handlePrint}
            size={isMobile ? "medium" : "medium"}
            fullWidth={isMobile}
          >
            {isMobile ? "Print" : "Print"}
          </Button>
          <Button
            variant="contained"
            startIcon={!isMobile ? <EditIcon /> : undefined}
            onClick={handleEdit}
            size="medium"
            fullWidth={isMobile}
          >
            Edit Order
          </Button>
        </Box>
      </Box>

      <Grid container spacing={3}>
        {/* Order Information */}
        <Grid item xs={12} md={6}>
          <Paper sx={{ p: 3 }}>
            <Typography variant={TYPOGRAPHY_STYLES.tableHeader.variant} sx={{
              fontWeight: TYPOGRAPHY_STYLES.tableHeader.fontWeight,
              fontSize: TYPOGRAPHY_STYLES.tableHeader.fontSize,
              mb: 2
            }}>
              Order Information
            </Typography>
            <Stack spacing={1.5}>
              <Box sx={{ display: 'flex', justifyContent: 'space-between' }}>
                <Typography variant="body2" color="text.secondary">Order Number:</Typography>
                <Typography variant="body2" sx={{ fontWeight: 600 }}>{purchaseOrder.orderNumber}</Typography>
              </Box>
              <Box sx={{ display: 'flex', justifyContent: 'space-between' }}>
                <Typography variant="body2" color="text.secondary">Order Date:</Typography>
                <Typography variant="body2">{new Date(purchaseOrder.orderDate).toLocaleDateString()}</Typography>
              </Box>
              <Box sx={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
                <Typography variant="body2" color="text.secondary">Inventory Status:</Typography>
                <Chip
                  label={getInventoryStatusLabel(purchaseOrder.isFullyReceived)}
                  color={getInventoryStatusColor(purchaseOrder.isFullyReceived) as any}
                  size="small"
                />
              </Box>
              <Box sx={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
                <Typography variant="body2" color="text.secondary">Payment Status:</Typography>
                <Chip
                  label={getPaymentStatusLabel()}
                  color={getPaymentStatusColor() as any}
                  size="small"
                />
              </Box>
            </Stack>
          </Paper>
        </Grid>

        {/* Supplier Information */}
        <Grid item xs={12} md={6}>
          <Paper sx={{ p: 3 }}>
            <Typography variant={TYPOGRAPHY_STYLES.tableHeader.variant} sx={{
              fontWeight: TYPOGRAPHY_STYLES.tableHeader.fontWeight,
              fontSize: TYPOGRAPHY_STYLES.tableHeader.fontSize,
              mb: 2
            }}>
              Supplier Information
            </Typography>
            <Stack spacing={1.5}>
              <Box sx={{ display: 'flex', justifyContent: 'space-between' }}>
                <Typography variant="body2" color="text.secondary">Company:</Typography>
                <Typography variant="body2" sx={{ fontWeight: 600 }}>{purchaseOrder.supplier.companyName}</Typography>
              </Box>
              <Box sx={{ display: 'flex', justifyContent: 'space-between' }}>
                <Typography variant="body2" color="text.secondary">Supplier Code:</Typography>
                <Typography variant="body2">{purchaseOrder.supplier.supplierCode}</Typography>
              </Box>
              {purchaseOrder.supplier.contactPerson && (
                <Box sx={{ display: 'flex', justifyContent: 'space-between' }}>
                  <Typography variant="body2" color="text.secondary">Contact Person:</Typography>
                  <Typography variant="body2">{purchaseOrder.supplier.contactPerson}</Typography>
                </Box>
              )}
              {purchaseOrder.supplier.email && (
                <Box sx={{ display: 'flex', justifyContent: 'space-between' }}>
                  <Typography variant="body2" color="text.secondary">Email:</Typography>
                  <Typography variant="body2">{purchaseOrder.supplier.email}</Typography>
                </Box>
              )}
              {purchaseOrder.supplier.phone && (
                <Box sx={{ display: 'flex', justifyContent: 'space-between' }}>
                  <Typography variant="body2" color="text.secondary">Phone:</Typography>
                  <Typography variant="body2">{purchaseOrder.supplier.phone}</Typography>
                </Box>
              )}
            </Stack>
          </Paper>
        </Grid>

        {/* Delivery Terms */}
        {purchaseOrder.deliveryTerms && (
          <Grid item xs={12} md={6}>
            <Paper sx={{ p: 3 }}>
              <Typography variant={TYPOGRAPHY_STYLES.tableHeader.variant} sx={{
                fontWeight: TYPOGRAPHY_STYLES.tableHeader.fontWeight,
                fontSize: TYPOGRAPHY_STYLES.tableHeader.fontSize,
                mb: 2,
                display: 'flex',
                alignItems: 'center',
                gap: 1
              }}>
                <ShippingIcon fontSize="small" />
                Delivery Terms
              </Typography>
              <Typography variant="body2">{purchaseOrder.deliveryTerms}</Typography>
            </Paper>
          </Grid>
        )}

        {/* Order Items */}
        <Grid item xs={12}>
          <Paper sx={{ overflow: 'hidden' }}>
            <Box sx={{ p: TABLE_STYLES.cell.padding.px, borderBottom: TABLE_STYLES.cell.border }}>
              <Typography variant={TYPOGRAPHY_STYLES.tableHeader.variant} sx={{
                fontWeight: TYPOGRAPHY_STYLES.tableHeader.fontWeight,
                fontSize: TYPOGRAPHY_STYLES.tableHeader.fontSize,
                display: 'flex',
                alignItems: 'center',
                gap: 1
              }}>
                <ReceiptIcon fontSize="small" />
                Order Items
              </Typography>
            </Box>
            <TableContainer>
              <Table
                size={TABLE_STYLES.size}
                sx={{
                  minWidth: 'max-content',
                  '& .MuiTableCell-root': {
                    borderBottom: TABLE_STYLES.cell.border,
                    py: TABLE_STYLES.cell.padding.py,
                    px: TABLE_STYLES.cell.padding.px,
                  }
                }}
              >
                <TableHead>
                  <TableRow sx={{ '& .MuiTableCell-head': {
                    fontWeight: TYPOGRAPHY_STYLES.tableHeader.fontWeight,
                    backgroundColor: (theme) => theme.palette.mode === 'dark' ? 'rgba(255, 255, 255, 0.05)' : '#fafafa',
                    color: TYPOGRAPHY_STYLES.tableHeader.color,
                    fontSize: TYPOGRAPHY_STYLES.tableHeader.fontSize,
                  } }}>
                    <TableCell>Product</TableCell>
                    <TableCell>SKU</TableCell>
                    <TableCell align="right">Qty Ordered</TableCell>
                    <TableCell align="right">Qty Received</TableCell>
                    <TableCell align="right">Unit Price</TableCell>
                    <TableCell align="right">Discount</TableCell>
                    <TableCell align="right">Total</TableCell>
                    <TableCell align="center">Status</TableCell>
                  </TableRow>
                </TableHead>
                <TableBody>
                  {purchaseOrder.items.map((item) => (
                    <TableRow
                      key={item.id}
                      hover
                      sx={{
                        '&:hover': { backgroundColor: 'action.hover' },
                        transition: 'background-color 0.2s ease',
                      }}
                    >
                      <TableCell sx={{ fontSize: '0.8rem' }}>
                        {item.product?.name || item.description}
                      </TableCell>
                      <TableCell sx={{ fontSize: '0.8rem' }}>
                        {item.product?.sku || '-'}
                      </TableCell>
                      <TableCell align="right" sx={{ fontSize: '0.8rem' }}>
                        {item.quantity}
                      </TableCell>
                      <TableCell align="right" sx={{ fontSize: '0.8rem' }}>
                        {item.receivedQuantity}
                      </TableCell>
                      <TableCell align="right" sx={{ fontSize: '0.8rem', fontWeight: 600 }}>
                        {formatCurrency(item.unitPrice)}
                      </TableCell>
                      <TableCell align="right" sx={{ fontSize: '0.8rem' }}>
                        {item.discountPercent > 0
                          ? `${item.discountPercent}%`
                          : item.discountAmount > 0
                          ? formatCurrency(item.discountAmount)
                          : '-'}
                      </TableCell>
                      <TableCell align="right" sx={{ fontSize: '0.8rem', fontWeight: 600 }}>
                        {formatCurrency(item.totalAmount)}
                      </TableCell>
                      <TableCell align="center" sx={{ fontSize: '0.8rem' }}>
                        <Chip
                          label={item.isFullyReceived ? 'Received' : 'Pending'}
                          color={item.isFullyReceived ? 'success' : 'warning'}
                          size="small"
                        />
                      </TableCell>
                    </TableRow>
                  ))}
                </TableBody>
              </Table>
            </TableContainer>

            {/* Order Totals */}
            <Box sx={{ p: 3, borderTop: TABLE_STYLES.cell.border }}>
              <Grid container spacing={2}>
                <Grid item xs={12} md={6}>
                  {/* Notes section */}
                  {purchaseOrder.notes && (
                    <Box>
                      <Typography variant="body2" color="text.secondary" sx={{ mb: 0.5, fontWeight: 600 }}>
                        Notes:
                      </Typography>
                      <Typography variant="body2">{purchaseOrder.notes}</Typography>
                    </Box>
                  )}
                </Grid>
                <Grid item xs={12} md={6}>
                  <Stack spacing={1}>
                    <Box sx={{ display: 'flex', justifyContent: 'space-between' }}>
                      <Typography variant="body2" color="text.secondary">Subtotal:</Typography>
                      <Typography variant="body2" sx={{ fontWeight: 600 }}>
                        {formatCurrency(purchaseOrder.subtotal)}
                      </Typography>
                    </Box>
                    {purchaseOrder.discountAmount > 0 && (
                      <Box sx={{ display: 'flex', justifyContent: 'space-between' }}>
                        <Typography variant="body2" color="text.secondary">
                          Discount ({purchaseOrder.discountPercent}%):
                        </Typography>
                        <Typography variant="body2" color="error.main" sx={{ fontWeight: 600 }}>
                          -{formatCurrency(purchaseOrder.discountAmount)}
                        </Typography>
                      </Box>
                    )}
                    {purchaseOrder.shippingAmount > 0 && (
                      <Box sx={{ display: 'flex', justifyContent: 'space-between' }}>
                        <Typography variant="body2" color="text.secondary">Shipping:</Typography>
                        <Typography variant="body2" sx={{ fontWeight: 600 }}>
                          {formatCurrency(purchaseOrder.shippingAmount)}
                        </Typography>
                      </Box>
                    )}
                    <Divider />
                    <Box sx={{ display: 'flex', justifyContent: 'space-between' }}>
                      <Typography variant="body1" sx={{ fontWeight: 700 }}>Total Amount:</Typography>
                      <Typography variant="body1" sx={{ fontWeight: 700, color: 'primary.main' }}>
                        {formatCurrency(purchaseOrder.totalAmount)}
                      </Typography>
                    </Box>
                    <Box sx={{ display: 'flex', justifyContent: 'space-between' }}>
                      <Typography variant="body2" color="text.secondary">Amount Paid:</Typography>
                      <Typography variant="body2" sx={{ fontWeight: 600, color: 'success.main' }}>
                        {formatCurrency(totalPaid)}
                      </Typography>
                    </Box>
                    <Box sx={{ display: 'flex', justifyContent: 'space-between' }}>
                      <Typography variant="body2" sx={{ fontWeight: 600 }}>Balance:</Typography>
                      <Typography variant="body2" sx={{ fontWeight: 600, color: balance > 0 ? 'error.main' : 'success.main' }}>
                        {formatCurrency(balance)}
                      </Typography>
                    </Box>
                  </Stack>
                </Grid>
              </Grid>
            </Box>
          </Paper>
        </Grid>

        {/* Goods Received Notes */}
        {purchaseOrder.goodsReceivedNotes && purchaseOrder.goodsReceivedNotes.length > 0 && (
          <Grid item xs={12} md={6}>
            <Paper sx={{ p: 3 }}>
              <Typography variant={TYPOGRAPHY_STYLES.tableHeader.variant} sx={{
                fontWeight: TYPOGRAPHY_STYLES.tableHeader.fontWeight,
                fontSize: TYPOGRAPHY_STYLES.tableHeader.fontSize,
                mb: 2,
                display: 'flex',
                alignItems: 'center',
                gap: 1
              }}>
                <GRNIcon fontSize="small" />
                Goods Received Notes
              </Typography>
              <Stack spacing={1.5}>
                {purchaseOrder.goodsReceivedNotes.map((grn) => (
                  <Box key={grn.id} sx={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
                    <Box>
                      <Typography variant="body2" sx={{ fontWeight: 600 }}>{grn.grnNumber}</Typography>
                      <Typography variant="caption" color="text.secondary">
                        {new Date(grn.receiptDate).toLocaleDateString()}
                      </Typography>
                    </Box>
                    <Chip
                      label={grn.status.charAt(0).toUpperCase() + grn.status.slice(1)}
                      color={grn.status === 'received' ? 'success' : 'default'}
                      size="small"
                    />
                  </Box>
                ))}
              </Stack>
            </Paper>
          </Grid>
        )}

        {/* Vendor Payments */}
        {purchaseOrder.vendorPayments && purchaseOrder.vendorPayments.length > 0 && (
          <Grid item xs={12} md={6}>
            <Paper sx={{ p: 3 }}>
              <Typography variant={TYPOGRAPHY_STYLES.tableHeader.variant} sx={{
                fontWeight: TYPOGRAPHY_STYLES.tableHeader.fontWeight,
                fontSize: TYPOGRAPHY_STYLES.tableHeader.fontSize,
                mb: 2,
                display: 'flex',
                alignItems: 'center',
                gap: 1
              }}>
                <PaymentIcon fontSize="small" />
                Vendor Payments
              </Typography>
              <Stack spacing={1.5}>
                {purchaseOrder.vendorPayments.map((payment) => (
                  <Box key={payment.id} sx={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
                    <Box>
                      <Typography variant="body2" sx={{ fontWeight: 600 }}>{payment.paymentNumber}</Typography>
                      <Typography variant="caption" color="text.secondary">
                        {new Date(payment.paymentDate).toLocaleDateString()} • {payment.paymentMethod}
                      </Typography>
                    </Box>
                    <Typography variant="body2" sx={{ fontWeight: 600, color: 'success.main' }}>
                      {formatCurrency(payment.amount)}
                    </Typography>
                  </Box>
                ))}
              </Stack>
            </Paper>
          </Grid>
        )}
      </Grid>
    </Box>
  )
}

export default PurchaseOrderDetails
