import { useCallback, useMemo, useState } from 'react'
import PaymentIcon from '@mui/icons-material/Payment'
import ReceiptIcon from '@mui/icons-material/Receipt'
import { Box, Button, Card, CardContent, Grid, Tab, Tabs, Typography } from '@mui/material'
import { useNavigate, useSearchParams } from 'react-router-dom'

import ConfirmationDialog from '@/components/common/ConfirmationDialog'
import { DataTable, type Column } from '@/components/common/DataTable'
import PageHeader from '@/components/common/PageHeader'
import PaymentDialog from '@/components/common/PaymentDialog'
import RefundDialog, { type RefundSource } from '@/components/common/RefundDialog'
import { StatusChip } from '@/components/common/StatusChip'
import { TABLE_STYLES } from '@/constants/tableStyles'
import { useNotification } from '@/hooks/useNotification'
import { rtkErrorMessage } from '@/utils/errorMessage'
import {
  useCancelExpenseMutation,
  usePayExpenseMutation,
  useRefundExpenseMutation,
} from '@/store/api/accountingApi'
import { useGetActivePaymentMethodsForPurchasesQuery } from '@/store/api/paymentMethodsApi'
import type { Expense, ExpensePaymentRow } from '@/types'
import { toScaledAmount, fromScaledAmount } from '@/utils/currency'
import { formatCurrency, formatDate } from '@/utils/formatters'

import { getExpenseActionMetas } from './expenseActions'

interface TabPanelProps {
  children?: React.ReactNode
  index: number
  value: number
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
  )
}

function Field({ label, value }: { label: string; value?: React.ReactNode }) {
  return (
    <Box sx={{ mb: 1.5 }}>
      <Typography variant="caption" sx={{ color: 'text.secondary', display: 'block', mb: 0.25 }}>
        {label}
      </Typography>
      <Typography component="div" variant="body2" sx={{ color: 'text.primary' }}>
        {value ?? '—'}
      </Typography>
    </Box>
  )
}

export default function ExpenseDetailView({ expense }: { expense: Expense }) {
  const navigate = useNavigate()
  const [searchParams, setSearchParams] = useSearchParams()
  const tabValue = Math.min(Math.max(Number(searchParams.get('tab') ?? 0), 0), 1)
  const [cancelDialogOpen, setCancelDialogOpen] = useState(false)
  const [payDialogOpen, setPayDialogOpen] = useState(false)
  const [refundDialogOpen, setRefundDialogOpen] = useState(false)
  const { showSuccess, showError } = useNotification()

  const [cancelExpense, { isLoading: isCancelling }] = useCancelExpenseMutation()
  const [payExpense] = usePayExpenseMutation()
  const [refundExpense] = useRefundExpenseMutation()

  const { data: paymentMethods = [], isLoading: methodsLoading } =
    useGetActivePaymentMethodsForPurchasesQuery(undefined, { skip: !payDialogOpen })

  const refundSources: RefundSource[] = useMemo(() => {
    if (!expense.payments) return []
    return expense.payments
      .filter((p) => (toScaledAmount(p.amount) ?? 0n) > 0n)
      .map((p) => ({
        id: p.id,
        label: p.paymentMethod?.name ?? 'Payment',
        paidAmount: fromScaledAmount(toScaledAmount(p.amount) ?? 0n),
        alreadyRefunded: fromScaledAmount(
          p.remainingRefundable
            ? (toScaledAmount(p.amount) ?? 0n) - (toScaledAmount(p.remainingRefundable) ?? 0n)
            : 0n,
        ),
      }))
  }, [expense])

  const handlePaySubmit = useCallback(
    async (payments: { paymentMethodId: string; amount: string; paymentDate: string; reference?: string }[]) => {
      try {
        await payExpense({
          id: expense.id,
          data: {
            payments,
          },
        }).unwrap()
        showSuccess(`Payment recorded for ${expense.expenseNumber}`)
        setPayDialogOpen(false)
      } catch (error) {
        showError(rtkErrorMessage(error, 'Failed to record payment'))
        throw error
      }
    },
    [expense, payExpense, showError, showSuccess],
  )

  const handleRefundSubmit = useCallback(
    async (lines: { sourceId: string; amount: string; reference?: string; date?: string }[]) => {
      try {
        await refundExpense({
          id: expense.id,
          data: {
            refunds: lines.map((l) => ({
              sourcePaymentId: l.sourceId,
              amount: l.amount,
              reference: l.reference,
              refundDate: l.date as string,
            })),
          },
        }).unwrap()
        showSuccess(`Refund recorded for ${expense.expenseNumber}`)
        setRefundDialogOpen(false)
      } catch (error) {
        showError(rtkErrorMessage(error, 'Failed to record refund'))
        throw error
      }
    },
    [expense, refundExpense, showError, showSuccess],
  )

  const handleCancelConfirm = async () => {
    try {
      await cancelExpense(expense.id).unwrap()
      showSuccess(`Expense ${expense.expenseNumber} cancelled`)
      setCancelDialogOpen(false)
    } catch (error) {
      showError(rtkErrorMessage(error, 'Failed to cancel expense'))
    }
  }

  const actionMetas = getExpenseActionMetas(expense)

  const actionLabels: Record<string, string> = {
    pay: 'Pay',
    refund: 'Refund',
    edit: 'Edit',
    cancel: 'Cancel',
  }

  const actionVariants: Record<string, 'contained' | 'outlined'> = {
    pay: 'contained',
    refund: 'outlined',
    edit: 'outlined',
    cancel: 'outlined',
  }

  const handleAction = (action: string) => {
    switch (action) {
      case 'pay':
        setPayDialogOpen(true)
        break
      case 'refund':
        setRefundDialogOpen(true)
        break
      case 'edit':
        navigate(`/accounting/expenses/${expense.id}/edit`)
        break
      case 'cancel':
        setCancelDialogOpen(true)
        break
    }
  }

  const paymentColumns: Column<ExpensePaymentRow>[] = [
    { header: 'Date', width: '22%', render: (p) => formatDate(p.paymentDate) },
    { header: 'Payment Method', width: '28%', render: (p) => p.paymentMethod?.name ?? '—' },
    { header: 'Reference', width: '28%', render: (p) => p.reference ?? '—' },
    {
      header: 'Amount',
      align: 'right',
      width: '22%',
      render: (p) => (
        <Typography
          variant="body2"
          component="span"
          data-testid={`payment-amount-${p.id}`}
          sx={{ color: Number(p.amount) < 0 ? 'error.main' : 'text.primary' }}
        >
          {formatCurrency(p.amount)}
        </Typography>
      ),
    },
  ]

  const payments = expense.payments ?? []

  return (
    <Box sx={{ display: 'flex', flexDirection: 'column', flex: 1, minHeight: 0 }}>
      <PageHeader
        title={expense.expenseNumber}
        subtitle={expense.description}
        titleBadge={
          <Box sx={{ display: 'flex', gap: 1 }}>
            <StatusChip
              status={expense.documentStatus}
              label={expense.documentStatus === 'DRAFT' ? 'Draft' : 'Cancelled'}
            />
            <StatusChip status={expense.paymentStatus} />
          </Box>
        }
        backAction={() => navigate('/accounting/expenses')}
      />

      {actionMetas.length > 0 && (
        <Box sx={{ display: 'flex', gap: 1, px: 3, pb: 1.5, flexWrap: 'wrap' }}>
          {actionMetas.map(({ action, disabled, tooltip }) => (
            <Button
              key={action}
              variant={actionVariants[action]}
              size="small"
              onClick={() => handleAction(action)}
              disabled={disabled}
              title={tooltip}
            >
              {actionLabels[action]}
            </Button>
          ))}
        </Box>
      )}

      <Box sx={{ borderBottom: 1, borderColor: 'divider' }}>
        <Tabs
          value={tabValue}
          onChange={(_, value: number) =>
            setSearchParams({ tab: String(value) }, { replace: true })
          }
          sx={{ minHeight: 36 }}
        >
          <Tab
            icon={<ReceiptIcon sx={{ fontSize: 16 }} />}
            iconPosition="start"
            label="Overview"
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
        <Grid container spacing={3} sx={{ alignItems: 'stretch' }}>
          <Grid size={{ xs: 12, md: 6 }} sx={{ display: 'flex' }}>
            <Card sx={{ flex: 1 }}>
              <CardContent>
                <Typography variant="h6" gutterBottom>
                  Expense Information
                </Typography>
                <Field label="Date" value={formatDate(expense.expenseDate)} />
                <Field label="Payee" value={expense.payee} />
                <Field label="Description" value={expense.description} />
                <Field label="Notes" value={expense.notes} />
              </CardContent>
            </Card>
          </Grid>
          <Grid size={{ xs: 12, md: 6 }} sx={{ display: 'flex' }}>
            <Card sx={{ flex: 1 }}>
              <CardContent>
                <Typography variant="h6" gutterBottom>
                  Accounting
                </Typography>
                <Field
                  label="Account"
                  value={
                    expense.expenseAccount
                      ? `${expense.expenseAccount.code} ${expense.expenseAccount.name}`
                      : '—'
                  }
                />
                <Field label="Total" value={formatCurrency(expense.totalAmount)} />
                <Field label="Paid" value={formatCurrency(expense.paidAmount)} />
                <Field label="Balance" value={formatCurrency(expense.balance)} />
              </CardContent>
            </Card>
          </Grid>
        </Grid>
      </TabPanel>
      <TabPanel value={tabValue} index={1}>
        <DataTable
          columns={paymentColumns}
          rows={payments}
          getRowKey={(p) => p.id}
          emptyText="No payments recorded for this expense."
          isLoading={false}
        />
      </TabPanel>

      <ConfirmationDialog
        open={cancelDialogOpen}
        title="Cancel Expense"
        message={`Cancel this expense? (${expense.expenseNumber})`}
        confirmText="Cancel Expense"
        severity="error"
        onConfirm={handleCancelConfirm}
        onCancel={() => setCancelDialogOpen(false)}
        loading={isCancelling}
      />

      {payDialogOpen && (
        <PaymentDialog
          open
          onClose={() => setPayDialogOpen(false)}
          onSubmit={handlePaySubmit}
          documentNumber={expense.expenseNumber}
          totalAmount={expense.totalAmount}
          paidAmount={expense.paidAmount}
          paymentMethods={paymentMethods}
          loading={methodsLoading}
        />
      )}

      {refundDialogOpen && (
        <RefundDialog
          open
          onClose={() => setRefundDialogOpen(false)}
          onSubmit={handleRefundSubmit}
          sources={refundSources}
          orderNumber={expense.expenseNumber}
          totalAmount={expense.totalAmount}
          showDateField
        />
      )}
    </Box>
  )
}
