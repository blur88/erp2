import React, { useEffect, useState } from 'react';
import {
  Box,
  CircularProgress,
  Paper,
  Tab,
  Table,
  TableBody,
  TableCell,
  TableContainer,
  TableHead,
  TableRow,
  Tabs,
  Typography,
} from '@mui/material';
import { default as PaymentIcon } from '@mui/icons-material/Payment';
import { default as OrdersIcon } from '@mui/icons-material/ShoppingCart';
import { useNavigate } from 'react-router-dom';

import { TABLE_STYLES } from '@/constants/tableStyles';
import { useGetCustomerPaymentsQuery, useGetCustomerSalesHistoryQuery } from '@/store/api/salesApi';
import type { Customer } from '@/types';
import { formatCurrency } from '@/utils/currency';
import { formatDate } from '@/utils/formatters';

interface TabPanelProps {
  children?: React.ReactNode;
  index: number;
  value: number;
}

function TabPanel({ children, value, index }: TabPanelProps) {
  return (
    <Box
      role="tabpanel"
      sx={{
        flex: 1,
        overflow: 'auto',
        display: value === index ? 'flex' : 'none',
        flexDirection: 'column',
      }}
    >
      {value === index && <Box sx={{ p: TABLE_STYLES.cell.padding.px, flex: 1 }}>{children}</Box>}
    </Box>
  );
}

interface CustomerWorkspaceCardProps {
  selectedCustomer: Customer | null;
}

const CustomerWorkspaceCard: React.FC<CustomerWorkspaceCardProps> = ({ selectedCustomer }) => {
  const navigate = useNavigate();
  const [tabValue, setTabValue] = useState(0);

  const customerId = selectedCustomer?.id ?? '';

  useEffect(() => {
    setTabValue(0);
  }, [customerId]);

  const {
    data: ordersData,
    isLoading: ordersLoading,
    isError: ordersError,
  } = useGetCustomerSalesHistoryQuery(customerId, {
    skip: !customerId || tabValue !== 0,
  });
  const {
    data: paymentsData,
    isLoading: paymentsLoading,
    isError: paymentsError,
  } = useGetCustomerPaymentsQuery(customerId, {
    skip: !customerId || tabValue !== 1,
  });

  const orders = ordersData?.orders ?? [];
  const payments = paymentsData ?? [];

  if (!selectedCustomer) {
    return <Paper sx={{ flex: 1 }} />;
  }

  return (
    <Paper sx={{ flex: 1, overflow: 'hidden', display: 'flex', flexDirection: 'column' }}>
      <Box sx={{ borderBottom: 1, borderColor: 'divider' }}>
        <Tabs value={tabValue} onChange={(_, value) => setTabValue(value)} sx={{ minHeight: 36 }}>
          <Tab
            icon={<OrdersIcon sx={{ fontSize: 16 }} />}
            iconPosition="start"
            label="Orders"
            sx={{ minHeight: 36 }}
          />
          <Tab
            icon={<PaymentIcon sx={{ fontSize: 16 }} />}
            iconPosition="start"
            label="Payments"
            sx={{ minHeight: 36 }}
          />
        </Tabs>
      </Box>
      <TabPanel value={tabValue} index={0}>
        {ordersLoading ? (
          <Box sx={{ display: 'flex', justifyContent: 'center', py: 4 }}>
            <CircularProgress />
          </Box>
        ) : ordersError ? (
          <Typography
            sx={{
              color: 'error.main',
              py: 4,
              textAlign: 'center',
            }}
          >
            Failed to load orders.
          </Typography>
        ) : orders.length === 0 ? (
          <Typography
            sx={{
              color: 'text.secondary',
              py: 4,
              textAlign: 'center',
            }}
          >
            No orders found.
          </Typography>
        ) : (
          <TableContainer component={Paper} variant="outlined">
            <Table size={TABLE_STYLES.size}>
              <TableHead>
                <TableRow
                  sx={{ '& .MuiTableCell-head': { fontWeight: 600, backgroundColor: 'grey.50' } }}
                >
                  <TableCell>Order #</TableCell>
                  <TableCell>Date</TableCell>
                  <TableCell>Status</TableCell>
                  <TableCell align="right">Total</TableCell>
                </TableRow>
              </TableHead>
              <TableBody>
                {orders.map((order) => (
                  <TableRow
                    key={order.id}
                    hover
                    sx={{ cursor: 'pointer' }}
                    onClick={() => navigate(`/sales/orders?highlight=${order.id}`)}
                  >
                    <TableCell>
                      <Typography
                        variant="body2"
                        color="primary"
                        sx={{
                          fontWeight: 600,
                        }}
                      >
                        {order.orderNumber}
                      </Typography>
                    </TableCell>
                    <TableCell>{formatDate(order.orderDate)}</TableCell>
                    <TableCell>
                      <Typography
                        variant="body2"
                        sx={{
                          color: order.isFulfilled
                            ? 'success.main'
                            : order.isPaid
                              ? 'primary.main'
                              : 'text.secondary',
                        }}
                      >
                        {order.isFulfilled ? 'Fulfilled' : order.isPaid ? 'Paid' : 'Pending'}
                      </Typography>
                    </TableCell>
                    <TableCell align="right">{formatCurrency(order.totalAmount)}</TableCell>
                  </TableRow>
                ))}
              </TableBody>
            </Table>
          </TableContainer>
        )}
      </TabPanel>
      <TabPanel value={tabValue} index={1}>
        {paymentsLoading ? (
          <Box sx={{ display: 'flex', justifyContent: 'center', py: 4 }}>
            <CircularProgress />
          </Box>
        ) : paymentsError ? (
          <Typography
            sx={{
              color: 'error.main',
              py: 4,
              textAlign: 'center',
            }}
          >
            Failed to load payments.
          </Typography>
        ) : payments.length === 0 ? (
          <Typography
            sx={{
              color: 'text.secondary',
              py: 4,
              textAlign: 'center',
            }}
          >
            No payments found.
          </Typography>
        ) : (
          <TableContainer component={Paper} variant="outlined">
            <Table size={TABLE_STYLES.size}>
              <TableHead>
                <TableRow
                  sx={{ '& .MuiTableCell-head': { fontWeight: 600, backgroundColor: 'grey.50' } }}
                >
                  <TableCell>Date</TableCell>
                  <TableCell>Status</TableCell>
                  <TableCell align="right">Amount</TableCell>
                </TableRow>
              </TableHead>
              <TableBody>
                {payments.map((payment) => (
                  <TableRow
                    key={payment.id}
                    hover
                  >
                    <TableCell>{formatDate(payment.paymentDate)}</TableCell>
                    <TableCell>{payment.status}</TableCell>
                    <TableCell align="right">{formatCurrency(payment.amount)}</TableCell>
                  </TableRow>
                ))}
              </TableBody>
            </Table>
          </TableContainer>
        )}
      </TabPanel>
    </Paper>
  );
};

export default CustomerWorkspaceCard;
