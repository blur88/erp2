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
import { StatusChip } from '@/components/common/StatusChip'
import { formatCurrency } from '@/utils/formatters'
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
                <Typography variant="tableHeader" sx={{ fontWeight: 600 }}>
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
                        <TableRow sx={{ '& .MuiTableCell-head': { fontWeight: 600, backgroundColor: TABLE_STYLES.header.backgroundColor, py: TABLE_STYLES.header.padding.py } }}>
                            <TableCell>
                                <Typography variant="tableHeader" sx={{ fontWeight: 600, fontSize: '0.8rem' }}>
                                    Order
                                </Typography>
                            </TableCell>
                            <TableCell>
                                <Typography variant="tableHeader" sx={{ fontWeight: 600, fontSize: '0.8rem' }}>
                                    Customer
                                </Typography>
                            </TableCell>
                            <TableCell align="right">
                                <Typography variant="tableHeader" sx={{ fontWeight: 600, fontSize: '0.8rem' }}>
                                    Amount
                                </Typography>
                            </TableCell>
                            <TableCell>
                                <Typography variant="tableHeader" sx={{ fontWeight: 600, fontSize: '0.8rem' }}>
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
                                        <Typography variant="body2" sx={{ fontSize: '0.8rem' }}>
                                            {order.orderNumber}
                                        </Typography>
                                    </TableCell>
                                    <TableCell>
                                        <Typography variant="body2" sx={{ fontSize: '0.8rem' }}>
                                            {order.customer?.name || 'Unknown'}
                                        </Typography>
                                    </TableCell>
                                    <TableCell align="right">
                                        <Typography
                                            variant="body2"
                                            sx={{
                                                color: "success.main",
                                                fontSize: '0.8rem'
                                            }}>
                                            {formatCurrency(order.totalAmount)}
                                        </Typography>
                                    </TableCell>
                                    <TableCell>
                                        <StatusChip status={order.isFulfilled ? 'fulfilled' : 'unfulfilled'} variant="outlined" sx={{ fontSize: '0.7rem', fontWeight: 500, height: 20 }} />
                                    </TableCell>
                                </TableRow>
                            ))
                        ) : (
                            <TableRow>
                                <TableCell colSpan={4} align="center">
                                    <Typography variant="body2" sx={{
                                        color: "text.secondary"
                                    }}>
                                        No recent orders
                                    </Typography>
                                </TableCell>
                            </TableRow>
                        )}
                    </TableBody>
                </Table>
            </TableContainer>
        </Paper>
    );
}

export default RecentSalesTable
