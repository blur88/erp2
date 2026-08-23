import { useCallback, useMemo, useState } from 'react'
import PaymentIcon from '@mui/icons-material/Payment'
import ReceiptIcon from '@mui/icons-material/Receipt'
import { Box, Button, Card, CardContent, Grid, Tab, Tabs, Typography } from '@mui/material'
import { useLocation, useNavigate, useSearchParams } from 'react-router-dom'

import ConfirmationDialog from '@/components/common/ConfirmationDialog'
import { DataTable, type Column } from '@/components/common/DataTable'
import PageHeader from '@/components/common/PageHeader'
import PaymentDialog from '@/components/common/PaymentDialog'
import RefundDialog, { type RefundSeed } from '@/components/common/RefundDialog'
import { StatusChip } from '@/components/common/StatusChip'
import { TABLE_STYLES } from '@/constants/tableStyles'
import { useNotification } from '@/hooks/useNotification'
import { rtkErrorMessage } from '@/utils/errorMessage'
import {
  useCancelExpenseMutation,
  useUncancelExpenseMutation,
  usePayExpenseMutation,
  useRefundExpenseMutation,
} from '@/store/api/accountingApi'
import {
  useGetActivePaymentMethodsQuery,
  useGetActivePaymentMethodsForPurchasesQuery,
} from '@/store/api/paymentMethodsApi'
import type { Expense, ExpensePaymentRow } from '@/types'
import { toScaledAmount, fromScaledAmount } from '@/utils/currency'
import { extractListQuery, listPathWithQuery, withListQuery } from '@/utils/listQuery'
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
  const location = useLocation()
  // The ticket carried from the list. Detail→Edit forwards ONLY this — never
  // the whole detail search, which carries ?tab=.
  const listQuery = extractListQuery(location.search)
  const [searchParams, setSearchParams] = useSearchParams()
  const tabValue = Math.min(Math.max(Number(searchParams.get('tab') ?? 0), 0), 1)
  const [cancelDialogOpen, setCancelDialogOpen] = useState(false)
  const [uncancelDialogOpen, setUncancelDialogOpen] = useState(false)
  const [payDialogOpen, setPayDialogOpen] = useState(false)
  const [refundDialogOpen, setRefundDialogOpen] = useState(false)
  const { showSuccess, showError } = useNotification()

  const [cancelExpense, { isLoading: isCancelling }] = useCancelExpenseMutation()
  const [uncancelExpense, { isLoading: isUncancelling }] = useUncancelExpenseMutation()
  const [payExpense] = usePayExpenseMutation()
  const [refundExpense] = useRefundExpenseMutation()

  const { data: paymentMethods = [], isLoading: methodsLoading } =
    useGetActivePaymentMethodsForPurchasesQuery(undefined, { skip: !payDialogOpen })

  // Refunds may use ANY active method regardless of useForPurchases (#1096),
  // so this is a second, unfiltered query — it cannot share the Pay one.
  const { data: refundMethods = [], isLoading: refundMethodsLoading } =
    useGetActivePaymentMethodsQuery(undefined, { skip: !refundDialogOpen })

  // Per-method NET capacity for the refund preset: gross payments minus prior
  // refunds through the same method (refunds are negative rows on the same
  // paymentMethodId). Sum ALL signed rows first, then emit only methods with a
  // positive balance — a cross-method refund can drive one negative, which is
  // not a valid preset line (#1107).
  const seedAllocations: RefundSeed[] = useMemo(() => {
    const netByMethod = new Map<string, bigint>()
    for (const p of expense.payments ?? []) {
      netByMethod.set(
        p.paymentMethodId,
        (netByMethod.get(p.paymentMethodId) ?? 0n) + (toScaledAmount(p.amount) ?? 0n),
      )
    }
    return [...netByMethod]
      .filter(([, amount]) => amount > 0n)
      .map(([methodId, amount]) => ({ methodId, amount: fromScaledAmount(amount) }))
  }, [expense])

  const netPaidMinor = useMemo(
    () => (expense.payments ?? []).reduce((sum, p) => sum + (toScaledAmount(p.amount) ?? 0n), 0n),
    [expense],
  )
  const availableForRefund = fromScaledAmount(netPaidMinor > 0n ? netPaidMinor : 0n)
  const surplusMinor = netPaidMinor - (toScaledAmount(expense.totalAmount) ?? 0n)
  const seedTarget = fromScaledAmount(
    surplusMinor > 0n ? surplusMinor : netPaidMinor > 0n ? netPaidMinor : 0n,
  )

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
    async (lines: { paymentMethodId: string; amount: string; reference?: string; date?: string }[]) => {
      try {
        await refundExpense({
          id: expense.id,
          data: {
            refunds: lines.map((l) => ({
              paymentMethodId: l.paymentMethodId,
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

  const handleUncancelConfirm = async () => {
    try {
      await uncancelExpense(expense.id).unwrap()
      showSuccess(`Expense ${expense.expenseNumber} uncancelled`)
      setUncancelDialogOpen(false)
    } catch (error) {
      showError(rtkErrorMessage(error, 'Failed to uncancel expense'))
    }
  }

  const actionMetas = getExpenseActionMetas(expense)

  const actionLabels: Record<string, string> = {
    pay: 'Pay',
    refund: 'Refund',
    edit: 'Edit',
    cancel: 'Cancel',
    uncancel: 'Uncancel',
  }

  const actionVariants: Record<string, 'contained' | 'outlined'> = {
    pay: 'contained',
    refund: 'outlined',
    edit: 'outlined',
    cancel: 'outlined',
    uncancel: 'contained',
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
        navigate(
          withListQuery(`/accounting/expenses/${expense.id}/edit`, listQuery ? `?${listQuery}` : ''),
          { state: { expenseEditOrigin: 'detail' } },
        )
        break
      case 'cancel':
        setCancelDialogOpen(true)
        break
      case 'uncancel':
        setUncancelDialogOpen(true)
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
            <StatusChip status={expense.documentStatus} />
            <StatusChip status={expense.paymentStatus} />
          </Box>
        }
        backAction={() => navigate(listPathWithQuery('/accounting/expenses', location.search))}
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
            setSearchParams(
              (prev) => {
                const next = new URLSearchParams(prev)
                next.set('tab', String(value))
                return next
              },
              { replace: true },
            )}
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

      <ConfirmationDialog
        open={uncancelDialogOpen}
        title="Uncancel Expense"
        message={`Uncancel this expense? (${expense.expenseNumber})`}
        confirmText="Uncancel Expense"
        severity="warning"
        onConfirm={handleUncancelConfirm}
        onCancel={() => setUncancelDialogOpen(false)}
        loading={isUncancelling}
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
          methods={refundMethods.map((m) => ({ id: m.id, label: m.name }))}
          seedAllocations={seedAllocations}
          availableForRefund={availableForRefund}
          seedTarget={seedTarget}
          loading={refundMethodsLoading}
          open
          onClose={() => setRefundDialogOpen(false)}
          onSubmit={handleRefundSubmit}
          orderNumber={expense.expenseNumber}
          title={`Refund — ${expense.expenseNumber}`}
          showDateField
        />
      )}
    </Box>
  )
}
