import React from 'react'
import {
    Box,
    Paper,
    Typography,
    Table,
    TableBody,
    TableCell,
    TableContainer,
    TableHead,
    TableRow,
    Chip,
} from '@mui/material'
import { useNavigate } from 'react-router-dom'
import { formatCurrency } from '@/utils/formatters'
import { TYPOGRAPHY_STYLES } from '@/constants/typography'
import { TABLE_STYLES } from '@/constants/tableStyles'

interface SalesOrder {
    id: string
    orderNumber: string
    customer?: {
        name: string
    }
    totalAmount: number
    isFulfilled: boolean
}

interface RecentSalesTableProps {
    orders: SalesOrder[]
    totalOrders: number
}

const RecentSalesTable: React.FC<RecentSalesTableProps> = ({ orders, totalOrders }) => {
    const navigate = useNavigate()

    return (
        <Paper sx={{ overflow: 'hidden' }}>
            <Box sx={{ p: 3, borderBottom: 1, borderColor: 'divider', display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
                <Typography variant={TYPOGRAPHY_STYLES.tableHeader.variant} sx={{ fontWeight: TYPOGRAPHY_STYLES.tableHeader.fontWeight }}>
                    Recent Sales Orders
                </Typography>
                <Chip
                    label={`${totalOrders} total`}
                    color="success"
                    size="small"
                />
            </Box>
            <TableContainer>
                <Table size={TABLE_STYLES.size}>
                    <TableHead>
                        <TableRow sx={{ '& .MuiTableCell-head': { fontWeight: TYPOGRAPHY_STYLES.tableHeader.fontWeight, backgroundColor: TABLE_STYLES.header.backgroundColor, py: TABLE_STYLES.header.padding.py } }}>
                            <TableCell>
                                <Typography variant={TYPOGRAPHY_STYLES.tableHeader.variant} sx={{ fontWeight: TYPOGRAPHY_STYLES.tableHeader.fontWeight, fontSize: TYPOGRAPHY_STYLES.tableHeader.fontSize }}>
                                    Order
                                </Typography>
                            </TableCell>
                            <TableCell>
                                <Typography variant={TYPOGRAPHY_STYLES.tableHeader.variant} sx={{ fontWeight: TYPOGRAPHY_STYLES.tableHeader.fontWeight, fontSize: TYPOGRAPHY_STYLES.tableHeader.fontSize }}>
                                    Customer
                                </Typography>
                            </TableCell>
                            <TableCell align="right">
                                <Typography variant={TYPOGRAPHY_STYLES.tableHeader.variant} sx={{ fontWeight: TYPOGRAPHY_STYLES.tableHeader.fontWeight, fontSize: TYPOGRAPHY_STYLES.tableHeader.fontSize }}>
                                    Amount
                                </Typography>
                            </TableCell>
                            <TableCell>
                                <Typography variant={TYPOGRAPHY_STYLES.tableHeader.variant} sx={{ fontWeight: TYPOGRAPHY_STYLES.tableHeader.fontWeight, fontSize: TYPOGRAPHY_STYLES.tableHeader.fontSize }}>
                                    Status
                                </Typography>
                            </TableCell>
                        </TableRow>
                    </TableHead>
                    <TableBody>
                        {orders && orders.length > 0 ? (
                            orders.map((order) => (
                                <TableRow
                                    key={order.id}
                                    hover
                                    sx={{
                                        cursor: 'pointer',
                                        '& .MuiTableCell-root': {
                                            borderBottom: TABLE_STYLES.cell.border,
                                            py: TABLE_STYLES.cell.padding.py,
                                            px: TABLE_STYLES.cell.padding.px
                                        },
                                        height: TABLE_STYLES.row.height
                                    }}
                                    onClick={() => navigate('/sales/orders', { state: { highlightOrderId: order.id } })}
                                >
                                    <TableCell>
                                        <Typography variant={TYPOGRAPHY_STYLES.tableCell.primary.variant} sx={{ fontSize: TYPOGRAPHY_STYLES.tableCell.primary.fontSize }}>
                                            {order.orderNumber}
                                        </Typography>
                                    </TableCell>
                                    <TableCell>
                                        <Typography variant={TYPOGRAPHY_STYLES.tableCell.primary.variant} sx={{ fontSize: TYPOGRAPHY_STYLES.tableCell.primary.fontSize }}>
                                            {order.customer?.name || 'Unknown'}
                                        </Typography>
                                    </TableCell>
                                    <TableCell align="right">
                                        <Typography variant={TYPOGRAPHY_STYLES.tableCell.primary.variant} color="success.main" sx={{ fontSize: TYPOGRAPHY_STYLES.tableCell.primary.fontSize }}>
                                            {formatCurrency(order.totalAmount)}
                                        </Typography>
                                    </TableCell>
                                    <TableCell>
                                        <Chip
                                            label={order.isFulfilled ? 'Fulfilled' : 'Pending'}
                                            color={order.isFulfilled ? 'success' : 'warning'}
                                            size="small"
                                            variant="outlined"
                                            sx={{
                                                fontSize: TYPOGRAPHY_STYLES.chip.small.fontSize,
                                                fontWeight: TYPOGRAPHY_STYLES.chip.small.fontWeight,
                                                height: TYPOGRAPHY_STYLES.chip.small.height
                                            }}
                                        />
                                    </TableCell>
                                </TableRow>
                            ))
                        ) : (
                            <TableRow>
                                <TableCell colSpan={4} align="center">
                                    <Typography variant={TYPOGRAPHY_STYLES.tableCell.secondary.variant} color="text.secondary">
                                        No recent orders
                                    </Typography>
                                </TableCell>
                            </TableRow>
                        )}
                    </TableBody>
                </Table>
            </TableContainer>
        </Paper>
    )
}

export default RecentSalesTable
