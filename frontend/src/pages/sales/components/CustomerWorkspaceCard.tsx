import React, { useEffect, useState } from 'react';
import { Box, Link, Paper, Tab, Tabs, Typography } from '@mui/material';
import { default as PaymentIcon } from '@mui/icons-material/Payment';
import { default as OrdersIcon } from '@mui/icons-material/ShoppingCart';
import { useNavigate } from 'react-router-dom';

import { DataTable, type Column } from '@/components/common/DataTable/DataTable';
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

  const orderColumns: Column<(typeof orders)[number]>[] = [
    {
      header: 'Order #',
      render: (order) => (
        <Link
          component="button"
          type="button"
          variant="body2"
          onClick={() => navigate('/sales/orders')}
          sx={{ fontWeight: 600, textAlign: 'left' }}
        >
          {order.orderNumber}
        </Link>
      ),
    },
    { header: 'Date', render: (order) => formatDate(order.orderDate) },
    {
      header: 'Status',
      render: (order) => (
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
      ),
    },
    { header: 'Total', align: 'right', render: (order) => formatCurrency(order.totalAmount) },
  ];

  const paymentColumns: Column<(typeof payments)[number]>[] = [
    { header: 'Date', render: (payment) => formatDate(payment.paymentDate) },
    { header: 'Status', render: (payment) => payment.status },
    { header: 'Amount', align: 'right', render: (payment) => formatCurrency(payment.amount) },
  ];

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
        <DataTable
          columns={orderColumns}
          rows={orders}
          getRowKey={(order) => order.id}
          emptyText="No orders found."
          isLoading={ordersLoading}
          isError={ordersError}
          errorText="Failed to load orders."
        />
      </TabPanel>
      <TabPanel value={tabValue} index={1}>
        <DataTable
          columns={paymentColumns}
          rows={payments}
          getRowKey={(payment) => payment.id}
          emptyText="No payments found."
          isLoading={paymentsLoading}
          isError={paymentsError}
          errorText="Failed to load payments."
        />
      </TabPanel>
    </Paper>
  );
};

export default CustomerWorkspaceCard;
