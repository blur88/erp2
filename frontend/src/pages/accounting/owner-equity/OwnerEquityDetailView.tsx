import { useCallback, useMemo, useState } from 'react'
import {
  Box,
  Button,
  Card,
  CardContent,
  Grid,
  Tab,
  Tabs,
  Typography,
} from '@mui/material'
import { useNavigate, useSearchParams } from 'react-router-dom'

import ConfirmationDialog from '@/components/common/ConfirmationDialog'
import { DataTable, type Column } from '@/components/common/DataTable'
import PageHeader from '@/components/common/PageHeader'
import PaymentDialog from '@/components/common/PaymentDialog'
import RefundDialog, { type RefundSeed } from '@/components/common/RefundDialog'
import { StatusChip } from '@/components/common/StatusChip'
import { TABLE_STYLES } from '@/constants/tableStyles'
import { useNotification } from '@/hooks/useNotification'
import { rtkErrorMessage } from '@/utils/errorMessage'
import { fromScaledAmount, toScaledAmount } from '@/utils/currency'
import { formatCurrency, formatDate, formatQuantity } from '@/utils/formatters'
import {
  useCancelOwnerEquityMutation,
  useCompleteOwnerEquityMutation,
  useRefundOwnerEquityMutation,
  useSettleOwnerEquityMutation,
  useUncancelOwnerEquityMutation,
  useUncompleteOwnerEquityMutation,
} from '@/store/api/accountingApi'
import {
  useGetActivePaymentMethodsForPurchasesQuery,
  useGetActivePaymentMethodsQuery,
} from '@/store/api/paymentMethodsApi'
import type { OwnerEquityDocument, OwnerEquitySettlement } from '@/types'

import { getOwnerEquityActionMetas } from './ownerEquityActions'
import { OWNER_EQUITY_TYPE_LABELS } from './OwnerEquityPage'

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

const isMonetary = (doc: OwnerEquityDocument) =>
  doc.type === 'CAPITAL_INJECTION' || doc.type === 'CASH_DRAWING'

export default function OwnerEquityDetailView({ document: doc }: { document: OwnerEquityDocument }) {
  const navigate = useNavigate()
  const [searchParams, setSearchParams] = useSearchParams()
  const tabValue = Math.min(Math.max(Number(searchParams.get('tab') ?? 0), 0), 1)
  const [settleOpen, setSettleOpen] = useState(false)
  const [refundOpen, setRefundOpen] = useState(false)
  const [cancelOpen, setCancelOpen] = useState(false)
  const [uncancelOpen, setUncancelOpen] = useState(false)
  const [completeOpen, setCompleteOpen] = useState(false)
  const [uncompleteOpen, setUncompleteOpen] = useState(false)
  const { showSuccess, showError } = useNotification()

  const [completeOwnerEquity, { isLoading: isCompleting }] = useCompleteOwnerEquityMutation()
  const [uncompleteOwnerEquity, { isLoading: isUncompleting }] = useUncompleteOwnerEquityMutation()
  const [cancelOwnerEquity, { isLoading: isCancelling }] = useCancelOwnerEquityMutation()
  const [uncancelOwnerEquity, { isLoading: isUncancelling }] = useUncancelOwnerEquityMutation()
  const [settleOwnerEquity] = useSettleOwnerEquityMutation()
  const [refundOwnerEquity] = useRefundOwnerEquityMutation()

  // Capital Injection receives money and may use any active method; Cash
  // Drawing pays money out and is restricted to purchase-enabled methods,
  // matching the backend guard in OwnerEquitySettlementService.
  const needsPurchaseMethods = doc.type === 'CASH_DRAWING'
  const { data: purchaseMethods = [], isLoading: purchaseMethodsLoading } =
    useGetActivePaymentMethodsForPurchasesQuery(undefined, {
      skip: !settleOpen || !needsPurchaseMethods,
    })
  const { data: allActiveMethods = [], isLoading: allMethodsLoading } =
    useGetActivePaymentMethodsQuery(undefined, {
      // Live for Capital Injection settle OR for any refund (#1096).
      skip: (!settleOpen || needsPurchaseMethods) && !refundOpen,
    })
  const paymentMethods = needsPurchaseMethods ? purchaseMethods : allActiveMethods
  const methodsLoading = needsPurchaseMethods ? purchaseMethodsLoading : allMethodsLoading

  // Per-method NET capacity for the refund preset: gross payments minus prior
  // refunds through the same method (refunds are negative rows on the same
  // paymentMethodId). Sum ALL signed rows first, then emit only methods with a
  // positive balance — a cross-method refund can drive one negative, which is
  // not a valid preset line (#1107).
  const seedAllocations: RefundSeed[] = useMemo(() => {
    const netByMethod = new Map<string, bigint>()
    for (const s of doc.settlements ?? []) {
      netByMethod.set(
        s.paymentMethodId,
        (netByMethod.get(s.paymentMethodId) ?? 0n) + (toScaledAmount(s.amount) ?? 0n),
      )
    }
    return [...netByMethod]
      .filter(([, amount]) => amount > 0n)
      .map(([methodId, amount]) => ({ methodId, amount: fromScaledAmount(amount) }))
  }, [doc])

  const netSettledMinor = useMemo(
    () => (doc.settlements ?? []).reduce((s, r) => s + (toScaledAmount(r.amount) ?? 0n), 0n),
    [doc],
  )
  const availableForRefund = fromScaledAmount(netSettledMinor > 0n ? netSettledMinor : 0n)
  const surplusMinor = netSettledMinor - (toScaledAmount(doc.totalAmount ?? '0') ?? 0n)
  const seedTarget = fromScaledAmount(
    surplusMinor > 0n ? surplusMinor : netSettledMinor > 0n ? netSettledMinor : 0n,
  )

  const settleTerminology = useMemo(() => {
    return doc.type === 'CAPITAL_INJECTION'
      ? { noun: 'Receipt', verbPast: 'Received', submitLabel: 'Record Receipt', lineNoun: 'Receipt' }
      : { noun: 'Payment', verbPast: 'Paid', submitLabel: 'Record Payment', lineNoun: 'Payment' }
  }, [doc])

  const handleSettleSubmit = useCallback(
    async (payments: { paymentMethodId: string; amount: string; paymentDate: string; reference?: string }[]) => {
      try {
        await settleOwnerEquity({
          referenceNumber: doc.referenceNumber,
          data: {
            settlements: payments.map((p) => ({
              paymentMethodId: p.paymentMethodId,
              amount: p.amount,
              settlementDate: p.paymentDate,
              reference: p.reference,
            })),
          },
        }).unwrap()
        showSuccess(`Settlement recorded for ${doc.referenceNumber}`)
        setSettleOpen(false)
      } catch (error) {
        showError(rtkErrorMessage(error, 'Failed to record settlement'))
        throw error
      }
    },
    [doc, settleOwnerEquity, showSuccess, showError],
  )

  const handleRefundSubmit = useCallback(
    async (lines: { paymentMethodId: string; amount: string; reference?: string; date?: string }[]) => {
      try {
        await refundOwnerEquity({
          referenceNumber: doc.referenceNumber,
          data: {
            refunds: lines.map((l) => ({
              paymentMethodId: l.paymentMethodId,
              amount: l.amount,
              reference: l.reference,
              refundDate: l.date as string,
            })),
          },
        }).unwrap()
        showSuccess(`Refund recorded for ${doc.referenceNumber}`)
        setRefundOpen(false)
      } catch (error) {
        showError(rtkErrorMessage(error, 'Failed to record refund'))
        throw error
      }
    },
    [doc, refundOwnerEquity, showSuccess, showError],
  )

  const handleConfirm = async (fn: () => Promise<unknown>, label: string) => {
    try {
      await fn()
      showSuccess(`Owner equity document ${label}`)
    } catch (error) {
      showError(rtkErrorMessage(error, `Failed to ${label}`))
    }
  }

  const actionMetas = getOwnerEquityActionMetas(doc)

  const actionLabels: Record<string, string> = {
    settle: 'Settle',
    refund: 'Refund',
    edit: 'Edit',
    complete: 'Complete',
    uncomplete: 'Uncomplete',
    cancel: 'Cancel',
    uncancel: 'Uncancel',
  }

  const actionVariants: Record<string, 'contained' | 'outlined'> = {
    settle: 'contained',
    refund: 'outlined',
    edit: 'outlined',
    complete: 'contained',
    uncomplete: 'contained',
    cancel: 'outlined',
    uncancel: 'contained',
  }

  const handleAction = (action: string) => {
    switch (action) {
      case 'settle':
        setSettleOpen(true)
        break
      case 'refund':
        setRefundOpen(true)
        break
      case 'edit':
        navigate(`/accounting/owner-equity/${doc.referenceNumber}/edit`)
        break
      case 'complete':
        setCompleteOpen(true)
        break
      case 'uncomplete':
        setUncompleteOpen(true)
        break
      case 'cancel':
        setCancelOpen(true)
        break
      case 'uncancel':
        setUncancelOpen(true)
        break
    }
  }

  const handleCompleteConfirm = () =>
    handleConfirm(() => completeOwnerEquity({ referenceNumber: doc.referenceNumber }).unwrap(), `${doc.referenceNumber} completed`).finally(
      () => setCompleteOpen(false),
    )
  const handleUncompleteConfirm = () =>
    handleConfirm(() => uncompleteOwnerEquity({ referenceNumber: doc.referenceNumber }).unwrap(), `${doc.referenceNumber} uncompleted`).finally(
      () => setUncompleteOpen(false),
    )
  const handleCancelConfirm = () =>
    handleConfirm(() => cancelOwnerEquity({ referenceNumber: doc.referenceNumber }).unwrap(), `${doc.referenceNumber} cancelled`).finally(
      () => setCancelOpen(false),
    )
  const handleUncancelConfirm = () =>
    handleConfirm(() => uncancelOwnerEquity({ referenceNumber: doc.referenceNumber }).unwrap(), `${doc.referenceNumber} uncancelled`).finally(
      () => setUncancelOpen(false),
    )

  const settlementColumns: Column<OwnerEquitySettlement>[] = [
    { header: 'Date', width: '20%', render: (s) => formatDate(s.settlementDate) },
    { header: 'Payment Method', width: '32%', render: (s) => s.paymentMethod?.name ?? '—' },
    { header: 'Reference', width: '28%', render: (s) => s.reference ?? '—' },
    {
      header: 'Amount',
      align: 'right',
      width: '20%',
      render: (s) => (
        <Typography
          variant="body2"
          component="span"
          sx={{ color: (toScaledAmount(s.amount) ?? 0n) < 0n ? 'error.main' : 'text.primary' }}
        >
          {formatCurrency(s.amount)}
        </Typography>
      ),
    },
  ]

  const tabs = isMonetary(doc)
    ? [
        { label: 'Overview', value: 0 },
        { label: 'Settlements', value: 1 },
      ]
    : [
        { label: 'Overview', value: 0 },
        { label: 'Stock Details', value: 1 },
      ]

  return (
    <Box sx={{ display: 'flex', flexDirection: 'column', flex: 1, minHeight: 0 }}>
      <PageHeader
        title={doc.referenceNumber}
        subtitle={doc.description}
        titleBadge={
          <Box sx={{ display: 'flex', gap: 1 }}>
            <StatusChip status={doc.documentStatus} />
            {isMonetary(doc) && <StatusChip status={doc.settlementStatus ?? 'UNSETTLED'} />}
          </Box>
        }
        backAction={() => navigate('/accounting/owner-equity')}
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
          onChange={(_, v: number) =>
            setSearchParams(
              (prev) => {
                const next = new URLSearchParams(prev)
                next.set('tab', String(v))
                return next
              },
              { replace: true },
            )}
          sx={{ minHeight: 36 }}
        >
          {tabs.map((t) => (
            <Tab key={t.label} label={t.label} sx={{ minHeight: 36 }} />
          ))}
        </Tabs>
      </Box>

      <TabPanel value={tabValue} index={0}>
        <Grid container spacing={3} sx={{ alignItems: 'stretch' }}>
          <Grid size={{ xs: 12, md: 6 }} sx={{ display: 'flex' }}>
            <Card sx={{ flex: 1 }}>
              <CardContent>
                <Typography variant="h6" gutterBottom>Equity Information</Typography>
                <Field label="Date" value={formatDate(doc.equityDate)} />
                <Field label="Type" value={OWNER_EQUITY_TYPE_LABELS[doc.type]} />
                <Field label="Description" value={doc.description} />
                <Field label="Notes" value={doc.notes} />
              </CardContent>
            </Card>
          </Grid>
          <Grid size={{ xs: 12, md: 6 }} sx={{ display: 'flex' }}>
            <Card sx={{ flex: 1 }}>
              <CardContent>
                <Typography variant="h6" gutterBottom>
                  {isMonetary(doc) ? 'Accounting' : 'Stock Valuation'}
                </Typography>
                {isMonetary(doc) ? (
                  <>
                    <Field label="Total Amount" value={formatCurrency(doc.totalAmount)} />
                    <Field label="Settled" value={formatCurrency(doc.settledAmount)} />
                    <Field label="Balance" value={formatCurrency(doc.balance)} />
                  </>
                ) : (
                  <>
                    <Field label="Unit Cost" value={formatCurrency(doc.unitCost)} />
                    <Field label="Total Cost" value={formatCurrency(doc.totalCost)} />
                  </>
                )}
              </CardContent>
            </Card>
          </Grid>
        </Grid>
      </TabPanel>

      <TabPanel value={tabValue} index={1}>
        {isMonetary(doc) ? (
          <DataTable
            columns={settlementColumns}
            rows={doc.settlements ?? []}
            getRowKey={(s) => s.id}
            emptyText="No settlements recorded for this equity document."
            isLoading={false}
          />
        ) : (
          <Grid container spacing={3} sx={{ alignItems: 'stretch' }}>
            <Grid size={{ xs: 12, md: 6 }} sx={{ display: 'flex' }}>
              <Card sx={{ flex: 1 }}>
                <CardContent>
                  <Typography variant="h6" gutterBottom>Stock Movement</Typography>
                  <Field label="Product" value={doc.product?.name ?? doc.productId ?? '—'} />
                  <Field label="Quantity" value={formatQuantity(doc.quantity)} />
                  <Field label="Unit Cost" value={formatCurrency(doc.unitCost)} />
                  <Field label="Total Cost" value={formatCurrency(doc.totalCost)} />
                </CardContent>
              </Card>
            </Grid>
          </Grid>
        )}
      </TabPanel>

      <ConfirmationDialog
        open={cancelOpen}
        title="Cancel Owner Equity"
        message={`Cancel this document? (${doc.referenceNumber})`}
        confirmText="Cancel"
        severity="error"
        onConfirm={handleCancelConfirm}
        onCancel={() => setCancelOpen(false)}
        loading={isCancelling}
      />

      <ConfirmationDialog
        open={uncancelOpen}
        title="Uncancel Owner Equity"
        message={`Uncancel this document? (${doc.referenceNumber})`}
        confirmText="Uncancel"
        severity="warning"
        onConfirm={handleUncancelConfirm}
        onCancel={() => setUncancelOpen(false)}
        loading={isUncancelling}
      />

      <ConfirmationDialog
        open={completeOpen}
        title="Complete Owner Equity"
        message={`Mark ${OWNER_EQUITY_TYPE_LABELS[doc.type]} ${doc.referenceNumber} as completed?`}
        confirmText="Complete"
        severity="info"
        onConfirm={handleCompleteConfirm}
        onCancel={() => setCompleteOpen(false)}
        loading={isCompleting}
      />

      {/* Complete/Uncomplete are stock-drawing-only (#1094): monetary documents
          complete implicitly on full settlement, so monetaryMetas() never emits
          either action and neither dialog can open for them. */}
      <ConfirmationDialog
        open={uncompleteOpen}
        title="Uncomplete Owner Equity"
        message={`Uncomplete ${doc.referenceNumber}? This restores the drawn stock and reverses its journal entry.`}
        confirmText="Uncomplete"
        severity="warning"
        onConfirm={handleUncompleteConfirm}
        onCancel={() => setUncompleteOpen(false)}
        loading={isUncompleting}
      />

      {settleOpen && (
        <PaymentDialog
          open
          onClose={() => setSettleOpen(false)}
          onSubmit={handleSettleSubmit}
          documentNumber={doc.referenceNumber}
          totalAmount={doc.totalAmount ?? '0'}
          paidAmount={doc.settledAmount ?? '0'}
          paymentMethods={paymentMethods}
          loading={methodsLoading}
          terminology={settleTerminology}
        />
      )}

      {refundOpen && (
        <RefundDialog
          methods={allActiveMethods.map((m) => ({ id: m.id, label: m.name }))}
          seedAllocations={seedAllocations}
          availableForRefund={availableForRefund}
          seedTarget={seedTarget}
          loading={allMethodsLoading}
          open
          onClose={() => setRefundOpen(false)}
          onSubmit={handleRefundSubmit}
          orderNumber={doc.referenceNumber}
          title={`Refund — ${doc.referenceNumber}`}
          showDateField
        />
      )}
    </Box>
  )
}
