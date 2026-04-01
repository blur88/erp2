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

interface PurchaseOrder {
    id: string
    orderNumber: string
    supplier?: {
        companyName: string
    }
    totalAmount: number | string
    isFullyReceived: boolean
}

interface RecentPurchasesTableProps {
    orders: PurchaseOrder[]
    totalOrders: number
}

const RecentPurchasesTable: React.FC<RecentPurchasesTableProps> = ({ orders, totalOrders }) => {
    const navigate = useNavigate()

    return (
        <Paper sx={{ overflow: 'hidden' }}>
            <Box sx={{ p: 3, borderBottom: 1, borderColor: 'divider', display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
                <Typography variant={TYPOGRAPHY_STYLES.tableHeader.variant} sx={{ fontWeight: TYPOGRAPHY_STYLES.tableHeader.fontWeight }}>
                    Recent Purchase Orders
                </Typography>
                <Chip
                    label={`${totalOrders} total`}
                    color="warning"
                    size="small"
                />
            </Box>
            <TableContainer>
                <Table size={TABLE_STYLES.size}>
                    <TableHead>
                        <TableRow sx={{ '& .MuiTableCell-head': { fontWeight: TYPOGRAPHY_STYLES.tableHeader.fontWeight, backgroundColor: TABLE_STYLES.header.backgroundColor, py: TABLE_STYLES.header.padding.py } }}>
                            <TableCell>
                                <Typography variant={TYPOGRAPHY_STYLES.tableHeader.variant} sx={{ fontWeight: TYPOGRAPHY_STYLES.tableHeader.fontWeight, fontSize: TYPOGRAPHY_STYLES.tableHeader.fontSize }}>
                                    PO Number
                                </Typography>
                            </TableCell>
                            <TableCell>
                                <Typography variant={TYPOGRAPHY_STYLES.tableHeader.variant} sx={{ fontWeight: TYPOGRAPHY_STYLES.tableHeader.fontWeight, fontSize: TYPOGRAPHY_STYLES.tableHeader.fontSize }}>
                                    Supplier
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
                                    onClick={() => navigate(`/purchasing/orders?poId=${order.id}`)}
                                >
                                    <TableCell>
                                        <Typography variant={TYPOGRAPHY_STYLES.tableCell.primary.variant} sx={{ fontSize: TYPOGRAPHY_STYLES.tableCell.primary.fontSize }}>
                                            {order.orderNumber}
                                        </Typography>
                                    </TableCell>
                                    <TableCell>
                                        <Typography variant={TYPOGRAPHY_STYLES.tableCell.primary.variant} sx={{ fontSize: TYPOGRAPHY_STYLES.tableCell.primary.fontSize }}>
                                            {order.supplier?.companyName || 'Unknown'}
                                        </Typography>
                                    </TableCell>
                                    <TableCell align="right">
                                        <Typography variant={TYPOGRAPHY_STYLES.tableCell.primary.variant} color="warning.main" sx={{ fontSize: TYPOGRAPHY_STYLES.tableCell.primary.fontSize }}>
                                            {formatCurrency(order.totalAmount)}
                                        </Typography>
                                    </TableCell>
                                    <TableCell>
                                        <Chip
                                            label={order.isFullyReceived ? 'Received' : 'Pending'}
                                            color={order.isFullyReceived ? 'success' : 'warning'}
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
                                        No recent purchase orders
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

export default RecentPurchasesTable
