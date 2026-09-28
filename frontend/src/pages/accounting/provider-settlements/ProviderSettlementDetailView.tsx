import { useMemo, type ReactNode } from 'react'
import {
  Alert,
  Box,
  Card,
  CardContent,
  Grid,
  Link,
  Tab,
  Tabs,
  Typography,
} from '@mui/material'
import { Link as RouterLink, useNavigate, useSearchParams } from 'react-router-dom'

import { DataTable, type Column } from '@/components/common/DataTable'
import PageHeader from '@/components/common/PageHeader'
import { StatusChip } from '@/components/common/StatusChip'
import { TABLE_STYLES } from '@/constants/tableStyles'
import type { ProviderSettlement, ProviderSettlementLine } from '@/types'
import { toScaledAmount } from '@/utils/currency'
import { formatCurrency, formatDate } from '@/utils/formatters'
import { currentListPath } from '@/utils/listQuery'
import { isNotProviderClearingDraft } from './providerSettlementActions'

interface TabPanelProps {
  children?: ReactNode
  index: number
  value: number
}

// Same TabPanel and Field as ExpenseDetailView / OwnerEquityDetailView (#1315);
// neither exports them.
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

// `component="div"` so a Link or StatusChip can be a value.
function Field({ label, value, testId }: {
  label: string; value?: ReactNode; testId?: string
}) {
  return (
    <Box sx={{ mb: 1.5 }}>
      <Typography variant="caption" sx={{ color: 'text.secondary', display: 'block', mb: 0.25 }}>
        {label}
      </Typography>
      <Typography
        component="div"
        variant="body2"
        sx={{ color: 'text.primary' }}
        data-testid={testId}
      >
        {value ?? '—'}
      </Typography>
    </Box>
  )
}

export default function ProviderSettlementDetailView({
  settlement,
}: { settlement: ProviderSettlement }) {
  const navigate = useNavigate()
  const [searchParams, setSearchParams] = useSearchParams()
  // Only an exact '1' opens Payments; anything else (absent, garbage, out of
  // range) is Overview. Number('abc') is NaN, which a min/max clamp passes
  // straight through to <Tabs value>.
  const tabValue = searchParams.get('tab') === '1' ? 1 : 0

  // One row per claimed payment, like the sibling Payments tabs, ordered by
  // sales order then payment date. Legacy lines without the joined payment
  // (no order number) sort last and render '—', never the raw UUID.
  const rows = useMemo(
    () =>
      [...(settlement.lines ?? [])].sort((a, b) => {
        const ao = a.salesOrderPayment?.salesOrder?.orderNumber
        const bo = b.salesOrderPayment?.salesOrder?.orderNumber
        if (ao !== bo) {
          if (ao == null) return 1
          if (bo == null) return -1
          return ao.localeCompare(bo)
        }
        return (a.salesOrderPayment?.paymentDate ?? '')
          .localeCompare(b.salesOrderPayment?.paymentDate ?? '')
      }),
    [settlement.lines],
  )

  // Deduplicated by LABEL, in line order: legacy lines without a joined payment
  // all render as the same "— · —".
  const blockedLabels = useMemo(
    () => (isNotProviderClearingDraft(settlement)
      ? [...new Set((settlement.lines ?? []).map((l) =>
          `${l.salesOrderPayment?.salesOrder?.orderNumber ?? '—'} · ${
            l.salesOrderPayment?.paymentMethod?.name ?? '—'}`))]
      : []),
    [settlement],
  )

  const account = (a?: { code: string; name: string }) => (a ? `${a.code} ${a.name}` : '—')
  const providerName = settlement.providerPaymentMethod?.name ?? '—'

  // Same shape as ExpenseDetailView's paymentColumns, plus the sales order the
  // payment belongs to. Amounts are the line SNAPSHOT — never
  // salesOrderPayment.amount, which is live.
  const lineColumns: Column<ProviderSettlementLine>[] = [
    {
      header: 'Date',
      width: '16%',
      render: (l) => (l.salesOrderPayment?.paymentDate ? formatDate(l.salesOrderPayment.paymentDate) : '—'),
    },
    {
      header: 'Sales Order No',
      width: '20%',
      render: (l) => l.salesOrderPayment?.salesOrder?.orderNumber ?? '—',
    },
    {
      header: 'Payment Method',
      width: '22%',
      render: (l) => l.salesOrderPayment?.paymentMethod?.name ?? '—',
    },
    { header: 'Reference', width: '22%', render: (l) => l.salesOrderPayment?.referenceNumber ?? '—' },
    {
      header: 'Amount',
      align: 'right',
      width: '20%',
      render: (l) => (
        <Typography
          variant="body2"
          component="span"
          data-testid={`line-amount-${l.id}`}
          sx={{ color: (toScaledAmount(l.amount) ?? 0n) < 0n ? 'error.main' : 'text.primary' }}
        >
          {formatCurrency(l.amount)}
        </Typography>
      ),
    },
  ]

  return (
    <Box sx={{ display: 'flex', flexDirection: 'column', flex: 1, minHeight: 0 }}>
      <PageHeader
        title={settlement.referenceNumber}
        subtitle={providerName}
        titleBadge={<StatusChip status={settlement.status} />}
        backAction={() => navigate(currentListPath('/accounting/provider-settlements'))}
      />

      {/* Reserved: the sibling detail pages render their action-button row here.
          Settlement actions stay in the list-row menu for now (#1315 non-goal);
          detail-page actions are tracked in #1316. */}

      {blockedLabels.length > 0 && (
        <Alert severity="warning" data-testid="not-provider-clearing" sx={{ mx: 3, mb: 1.5 }}>
          These payments were not recorded to a provider clearing account. Edit the draft to remove them, or discard it.
          <Box component="ul" sx={{ m: 0, mt: 1, pl: 3 }}>
            {blockedLabels.map((label) => <li key={label}>{label}</li>)}
          </Box>
        </Alert>
      )}

      <Box sx={{ borderBottom: 1, borderColor: 'divider' }}>
        <Tabs
          value={tabValue}
          onChange={(_, value: number) =>
            setSearchParams(
              () => {
                // Merge against the LIVE URL, as the sibling detail pages do (#1131 review).
                const next = new URLSearchParams(window.location.search)
                next.set('tab', String(value))
                return next
              },
              { replace: true },
            )}
          sx={{ minHeight: 36 }}
        >
          <Tab label="Overview" sx={{ minHeight: 36 }} />
          <Tab label="Payments" sx={{ minHeight: 36 }} />
        </Tabs>
      </Box>

      <TabPanel value={tabValue} index={0}>
        <Grid container spacing={3} sx={{ alignItems: 'stretch' }}>
          <Grid size={{ xs: 12, md: 6 }} sx={{ display: 'flex' }}>
            <Card sx={{ flex: 1 }}>
              <CardContent>
                <Typography variant="h6" gutterBottom>Settlement Information</Typography>
                <Field
                  label="Date"
                  value={formatDate(settlement.settlementDate)}
                  testId="settlement-date"
                />
                <Field label="Provider" value={providerName} />
                <Field label="Provider Reference" value={settlement.providerReference ?? '—'} />
              </CardContent>
            </Card>
          </Grid>
          <Grid size={{ xs: 12, md: 6 }} sx={{ display: 'flex' }}>
            <Card sx={{ flex: 1 }}>
              <CardContent>
                <Typography variant="h6" gutterBottom>Accounting</Typography>
                <Field
                  label="Provider Clearing Account"
                  value={account(settlement.clearingAccount)}
                />
                <Field label="Bank Account" value={account(settlement.bankAccount)} />
                <Field
                  label="Settlement Amount"
                  // A decimal STRING from the API. formatCurrency takes it directly;
                  // fromScaledAmount takes a bigint and would be a type error here.
                  value={formatCurrency(settlement.settlementAmount)}
                  testId="settlement-amount"
                />
                {/* Both entries are shown once reversed: the original is preserved, and
                    hiding it would make the audit trail unreachable from the document. */}
                {settlement.journalEntryId && (
                  <Field
                    label="Journal"
                    value={(
                      <Link
                        component={RouterLink}
                        to={`/accounting/journal-entries/${settlement.journalEntryId}`}
                      >
                        Journal Entry
                      </Link>
                    )}
                  />
                )}
                {settlement.reversalJournalEntryId && (
                  <Field
                    label="Reversal"
                    value={(
                      <Link
                        component={RouterLink}
                        to={`/accounting/journal-entries/${settlement.reversalJournalEntryId}`}
                      >
                        Reversing Entry
                      </Link>
                    )}
                  />
                )}
              </CardContent>
            </Card>
          </Grid>
        </Grid>
      </TabPanel>

      <TabPanel value={tabValue} index={1}>
        <DataTable
          columns={lineColumns}
          rows={rows}
          getRowKey={(l) => l.id}
          emptyText="No payments in this settlement."
          isLoading={false}
          footer={(
            <Box sx={{ display: 'flex', justifyContent: 'flex-end', mt: 2 }}>
              <Box sx={{ minWidth: 240, display: 'flex', justifyContent: 'space-between' }}>
                <Typography variant="body2" sx={{ fontWeight: 600 }}>Settlement Amount</Typography>
                <Typography
                  variant="body2"
                  sx={{ fontWeight: 600 }}
                  data-testid="payments-settlement-amount"
                >
                  {formatCurrency(settlement.settlementAmount)}
                </Typography>
              </Box>
            </Box>
          )}
        />
      </TabPanel>
    </Box>
  )
}
