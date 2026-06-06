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
} from '@mui/material';
import { useNavigate } from 'react-router-dom';

import { TABLE_STYLES } from '@/constants/tableStyles';
import { useGetPaymentsQuery } from '@/store/api/salesApi';
import { formatCurrency } from '@/utils/currency';
import { formatDate } from '@/utils/formatters';

interface CustomerPaymentsTabProps {
  customerId: string;
}

export default function CustomerPaymentsTab({ customerId }: CustomerPaymentsTabProps) {
  const navigate = useNavigate();
  const { data, isLoading } = useGetPaymentsQuery({ customerId });
  const payments = [...(data?.data ?? [])].sort((a, b) =>
    (a.paymentNumber ?? '').localeCompare(b.paymentNumber ?? '', undefined, { numeric: true }),
  );

  if (isLoading) {
    return (
      <Box sx={{ display: 'flex', justifyContent: 'center', py: 4 }}>
        <CircularProgress />
      </Box>
    );
  }

  if (payments.length === 0) {
    return (
      <Typography sx={{ color: 'text.secondary', py: 4, textAlign: 'center' }}>
        No payments yet for this customer.
      </Typography>
    );
  }

  return (
    <TableContainer component={Paper} variant="outlined">
      <Table size={TABLE_STYLES.size}>
        <TableHead>
          <TableRow
            sx={{ '& .MuiTableCell-head': { fontWeight: 600, backgroundColor: 'grey.50' } }}
          >
            <TableCell sx={{ width: '18%' }}>Payment #</TableCell>
            <TableCell sx={{ width: '18%' }}>Invoice #</TableCell>
            <TableCell sx={{ width: '16%' }}>Date</TableCell>
            <TableCell sx={{ width: '18%' }}>Method</TableCell>
            <TableCell align="right" sx={{ width: '15%' }}>
              Amount
            </TableCell>
            <TableCell align="right" sx={{ width: '15%' }}>
              Action
            </TableCell>
          </TableRow>
        </TableHead>
        <TableBody>
          {payments.map((payment) => (
            <TableRow key={payment.id} hover>
              <TableCell>
                <Typography variant="body2" sx={{ fontWeight: 600 }}>
                  {payment.paymentNumber}
                </Typography>
              </TableCell>
              <TableCell>{payment.salesOrderId ?? '—'}</TableCell>
              <TableCell>{formatDate(payment.paymentDate)}</TableCell>
              <TableCell>{payment.paymentMethodEntity?.name ?? '—'}</TableCell>
              <TableCell align="right">{formatCurrency(payment.amount)}</TableCell>
              <TableCell align="right">
                <Button
                  size="small"
                  variant="text"
                  onClick={() =>
                    navigate('/sales/payments', { state: { highlightPaymentId: payment.id } })
                  }
                >
                  View
                </Button>
              </TableCell>
            </TableRow>
          ))}
        </TableBody>
      </Table>
    </TableContainer>
  );
}
