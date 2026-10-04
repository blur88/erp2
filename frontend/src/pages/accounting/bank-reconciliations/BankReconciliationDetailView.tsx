import React, { useCallback, useMemo, useState } from 'react'
import {
  Alert,
  Box,
  Button,
  Card,
  CardContent,
  CircularProgress,
  Grid,
  Link as MuiLink,
  Tab,
  Table,
  TableBody,
  TableCell,
  TableContainer,
  TableHead,
  TableRow,
  Tabs,
  Typography,
} from '@mui/material'
import { Link as RouterLink, useNavigate, useSearchParams } from 'react-router-dom'

import ConfirmationDialog from '@/components/common/ConfirmationDialog'
import PageHeader from '@/components/common/PageHeader'
import PagePagination from '@/components/common/PagePagination'
import { StatusChip } from '@/components/common/StatusChip'
import { useNotification } from '@/hooks/useNotification'
import { useAppSelector } from '@/hooks/useRedux'
import SourceLink from '@/pages/accounting/components/SourceLink'
import {
  useCancelReopenBankReconciliationMutation,
  useCompleteBankReconciliationMutation,
  useDiscardBankReconciliationMutation,
  useGetBankReconciliationLinesQuery,
  useReopenBankReconciliationMutation,
} from '@/store/api/accountingApi'
import { selectCurrentUser } from '@/store/slices/authSlice'
import type {
  AccountingSourceType,
  BankReconciliationDetailDto,
  ReconciliationLineDto,
  ReconciliationLineRole,
} from '@/types'
import { reconciliationErrorMessage } from './reconciliationErrorMessage'
import { formatCurrency, formatDate } from '@/utils/formatters'
import { currentListPath } from '@/utils/listQuery'
import {
  CONFIRM_COPY,
  DONE_LABEL,
  availableActions,
  completeBlockers,
  lockedReason,
  readOnlyNotice,
  type BankReconciliationActionKey,
} from './bankReconciliationActions'
import { clearDraft, draftKey } from './reconciliationDraftStorage'
import ReconciliationSummary from './ReconciliationSummary'

const LIST_PATH = '/accounting/bank-reconciliations'
const PAGE_SIZE = 25

type LifecycleAction = 'complete' | 'reopen' | 'cancelReopen' | 'discard'

interface BankReconciliationDetailViewProps {
  reconciliation: BankReconciliationDetailDto
  onRefetch?: () => void
}

export default function BankReconciliationDetailView({
  reconciliation,
  onRefetch,
}: BankReconciliationDetailViewProps): React.ReactElement {
  const navigate = useNavigate()
  const [searchParams, setSearchParams] = useSearchParams()
  const { showSuccess, showError } = useNotification()
  const currentUser = useAppSelector(selectCurrentUser)
  const userId = currentUser?.id ?? 'anonymous'

  const [confirmAction, setConfirmAction] = useState<LifecycleAction | null>(null)
  const [actionError, setActionError] = useState<string | null>(null)

  // Mutations
  const [completeReconciliation, { isLoading: isCompleting }] =
    useCompleteBankReconciliationMutation()
  const [reopenReconciliation, { isLoading: isReopening }] =
    useReopenBankReconciliationMutation()
  const [cancelReopenReconciliation, { isLoading: isCancellingReopen }] =
    useCancelReopenBankReconciliationMutation()
  const [discardReconciliation, { isLoading: isDiscarding }] =
    useDiscardBankReconciliationMutation()

  const isBusy = isCompleting || isReopening || isCancellingReopen || isDiscarding

  // Tab & pagination state in URL
  const rawTab = searchParams.get('tab') || 'matched'
  const isSequence1 = reconciliation.sequenceNo === 1
  const activeTab = useMemo(() => {
    if (rawTab === 'cleared_at_setup' && !isSequence1) return 'matched'
    if (['matched', 'outstanding', 'cleared_at_setup'].includes(rawTab)) return rawTab
    return 'matched'
  }, [rawTab, isSequence1])

  const currentPage = Math.max(1, parseInt(searchParams.get('page') || '1', 10) || 1)

  const activeRole: ReconciliationLineRole = useMemo(() => {
    switch (activeTab) {
      case 'outstanding':
        return 'OUTSTANDING'
      case 'cleared_at_setup':
        return 'OPENING_CLEARED'
      case 'matched':
      default:
        return 'MATCHED'
    }
  }, [activeTab])

  const handleTabChange = useCallback(
    (_: React.SyntheticEvent, newTab: string) => {
      setSearchParams({ tab: newTab, page: '1' })
    },
    [setSearchParams],
  )

  const handlePageChange = useCallback(
    (newPage: number) => {
      setSearchParams({ tab: activeTab, page: String(newPage) })
    },
    [activeTab, setSearchParams],
  )

  // Lines query
  const { data: linesPage, isLoading: linesLoading, isFetching: linesFetching } =
    useGetBankReconciliationLinesQuery({
      id: reconciliation.id,
      role: activeRole,
      page: currentPage,
      limit: PAGE_SIZE,
    })

  const lines = linesPage?.data ?? []
  const totalLines = linesPage?.meta?.total ?? 0

  // Actions
  const actions = useMemo(() => availableActions(reconciliation), [reconciliation])
  const blockers = useMemo(() => completeBlockers(reconciliation.summary), [reconciliation.summary])
  const notice = useMemo(() => readOnlyNotice(reconciliation), [reconciliation])
  const locked = useMemo(() => lockedReason(reconciliation), [reconciliation])

  const isReopenedDraft =
    reconciliation.status === 'DRAFT' &&
    (reconciliation.reopened || reconciliation.currentVersionNo !== null)

  const handleConfirmAction = async () => {
    if (!confirmAction) return
    const action = confirmAction
    setConfirmAction(null)
    setActionError(null)

    try {
      const lockVersion = reconciliation.lockVersion
      if (action === 'complete') {
        await completeReconciliation({ id: reconciliation.id, lockVersion }).unwrap()
        clearDraft(draftKey(userId, { reconciliationId: reconciliation.id }))
        showSuccess(DONE_LABEL.complete)
      } else if (action === 'reopen') {
        await reopenReconciliation({ id: reconciliation.id, lockVersion }).unwrap()
        showSuccess(DONE_LABEL.reopen)
      } else if (action === 'cancelReopen') {
        await cancelReopenReconciliation({ id: reconciliation.id, lockVersion }).unwrap()
        clearDraft(draftKey(userId, { reconciliationId: reconciliation.id }))
        showSuccess(DONE_LABEL.cancelReopen)
      } else if (action === 'discard') {
        await discardReconciliation({ id: reconciliation.id, lockVersion }).unwrap()
        clearDraft(draftKey(userId, { reconciliationId: reconciliation.id }))
        showSuccess(DONE_LABEL.discard)
        navigate(currentListPath(LIST_PATH))
      }
    } catch (err) {
      const msg = reconciliationErrorMessage(err, 'Failed to perform action')
      setActionError(msg)
      showError(msg)
      if (action === 'complete') {
        onRefetch?.()
      }
    }
  }

  return (
    <Box sx={{ display: 'flex', flexDirection: 'column', gap: 3, p: 3 }}>
      <PageHeader
        title={reconciliation.reconciliationNo}
        subtitle={`Period: ${formatDate(reconciliation.periodFrom)} – ${formatDate(reconciliation.periodTo)}`}
        backAction={() => navigate(currentListPath(LIST_PATH))}
        toolbar={
          <Box sx={{ display: 'flex', alignItems: 'center', gap: 1.5, flexWrap: 'wrap' }}>
            {actions.includes('edit') && (
              <Button
                variant="outlined"
                onClick={() => navigate(`/accounting/bank-reconciliations/${reconciliation.id}/edit`)}
                disabled={isBusy}
              >
                Edit
              </Button>
            )}

            {actions.includes('complete') && (
              <Box sx={{ display: 'flex', alignItems: 'center', gap: 1 }}>
                <Button
                  variant="contained"
                  color="primary"
                  onClick={() => setConfirmAction('complete')}
                  disabled={blockers.length > 0 || isBusy}
                >
                  Complete
                </Button>
                {blockers.length > 0 && (
                  <Box sx={{ display: 'flex', flexDirection: 'column', gap: 0.25 }}>
                    {blockers.map((b) => (
                      <Typography key={b} variant="caption" color="error">
                        {b}
                      </Typography>
                    ))}
                  </Box>
                )}
              </Box>
            )}

            {reconciliation.status === 'COMPLETED' &&
              (locked ? (
                <Typography variant="body2" color="text.secondary">
                  {locked}
                </Typography>
              ) : (
                actions.includes('reopen') && (
                  <Button
                    variant="outlined"
                    onClick={() => setConfirmAction('reopen')}
                    disabled={isBusy}
                  >
                    Reopen
                  </Button>
                )
              ))}

            {actions.includes('cancelReopen') && (
              <Button
                variant="outlined"
                onClick={() => setConfirmAction('cancelReopen')}
                disabled={isBusy}
              >
                Cancel Reopen
              </Button>
            )}

            {actions.includes('discard') && (
              <Button
                variant="outlined"
                color="error"
                onClick={() => setConfirmAction('discard')}
                disabled={isBusy}
              >
                Discard
              </Button>
            )}
          </Box>
        }
      />

      {notice && <Alert severity="warning">{notice}</Alert>}

      {isReopenedDraft && (
        <Alert severity="info">
          Reopened. Cancel Reopen restores the version completed on{' '}
          {formatDate(reconciliation.completedAt)}.
        </Alert>
      )}

      {actionError && <Alert severity="error">{actionError}</Alert>}

      {/* Overview Card */}
      <Card variant="outlined">
        <CardContent>
          <Typography variant="h6" gutterBottom>
            Statement Details
          </Typography>
          <Grid container spacing={2}>
            <Grid size={{ xs: 12, sm: 4 }}>
              <Typography variant="caption" color="text.secondary" sx={{ display: 'block' }}>
                Reconciliation No
              </Typography>
              <Typography variant="body1" sx={{ fontWeight: 500 }}>
                {reconciliation.reconciliationNo}
              </Typography>
            </Grid>
            <Grid size={{ xs: 12, sm: 4 }}>
              <Typography variant="caption" color="text.secondary" sx={{ display: 'block' }}>
                Status
              </Typography>
              <Box sx={{ mt: 0.5 }}>
                <StatusChip status={reconciliation.status} />
              </Box>
            </Grid>
            <Grid size={{ xs: 12, sm: 4 }}>
              <Typography variant="caption" color="text.secondary" sx={{ display: 'block' }}>
                Bank Account
              </Typography>
              <Typography variant="body1">
                {reconciliation.bankAccount.code} {reconciliation.bankAccount.name}
              </Typography>
            </Grid>

            <Grid size={{ xs: 12, sm: 3 }}>
              <Typography variant="caption" color="text.secondary" sx={{ display: 'block' }}>
                Period From
              </Typography>
              <Typography variant="body2">{formatDate(reconciliation.periodFrom)}</Typography>
            </Grid>
            <Grid size={{ xs: 12, sm: 3 }}>
              <Typography variant="caption" color="text.secondary" sx={{ display: 'block' }}>
                Period To
              </Typography>
              <Typography variant="body2">{formatDate(reconciliation.periodTo)}</Typography>
            </Grid>
            <Grid size={{ xs: 12, sm: 3 }}>
              <Typography variant="caption" color="text.secondary" sx={{ display: 'block' }}>
                Opening Balance
              </Typography>
              <Typography variant="body2">
                {formatCurrency(reconciliation.summary.openingBalance)}
              </Typography>
            </Grid>
            <Grid size={{ xs: 12, sm: 3 }}>
              <Typography variant="caption" color="text.secondary" sx={{ display: 'block' }}>
                Closing Balance
              </Typography>
              <Typography variant="body2">
                {formatCurrency(reconciliation.summary.closingBalance)}
              </Typography>
            </Grid>

            {reconciliation.status === 'COMPLETED' && (
              <Grid size={{ xs: 12 }}>
                <Typography variant="body2" color="text.secondary">
                  Completed by {reconciliation.completedBy || '—'} on{' '}
                  {formatDate(reconciliation.completedAt)}
                </Typography>
              </Grid>
            )}
          </Grid>
        </CardContent>
      </Card>

      {/* Summary Component */}
      <ReconciliationSummary
        moneyIn={reconciliation.summary.moneyIn}
        moneyOut={reconciliation.summary.moneyOut}
        calculatedClosingBalance={reconciliation.summary.calculatedClosingBalance}
        difference={reconciliation.summary.difference}
        openingBalanceDifference={reconciliation.summary.openingBalanceDifference}
        unclassifiedCount={reconciliation.summary.unclassifiedCount}
      />

      {/* Transactions Card with Tabs */}
      <Card variant="outlined">
        <CardContent sx={{ display: 'flex', flexDirection: 'column', gap: 2 }}>
          <Typography variant="h6">Transactions</Typography>

          <Box sx={{ borderBottom: 1, borderColor: 'divider' }}>
            <Tabs
              value={activeTab}
              onChange={handleTabChange}
              variant="scrollable"
              scrollButtons="auto"
            >
              <Tab label="Matched" value="matched" />
              <Tab label="Outstanding" value="outstanding" />
              {isSequence1 && <Tab label="Cleared at setup" value="cleared_at_setup" />}
            </Tabs>
          </Box>

          <TableContainer sx={{ minHeight: 180, position: 'relative' }}>
            {(linesLoading || linesFetching) && (
              <Box
                sx={{
                  position: 'absolute',
                  top: 0,
                  left: 0,
                  right: 0,
                  bottom: 0,
                  display: 'flex',
                  alignItems: 'center',
                  justifyContent: 'center',
                  backgroundColor: 'rgba(255, 255, 255, 0.6)',
                  zIndex: 1,
                }}
              >
                <CircularProgress size={32} />
              </Box>
            )}

            <Table size="small">
              <TableHead>
                <TableRow>
                  <TableCell>Date</TableCell>
                  <TableCell>Journal No</TableCell>
                  <TableCell>Source</TableCell>
                  <TableCell>Description</TableCell>
                  <TableCell align="right">Money In</TableCell>
                  <TableCell align="right">Money Out</TableCell>
                </TableRow>
              </TableHead>
              <TableBody>
                {lines.length === 0 ? (
                  <TableRow>
                    <TableCell colSpan={6} align="center" sx={{ py: 3, color: 'text.secondary' }}>
                      No transactions in this category.
                    </TableCell>
                  </TableRow>
                ) : (
                  lines.map((line: ReconciliationLineDto) => (
                    <TableRow key={line.journalEntryLineId} hover>
                      <TableCell>{formatDate(line.entryDate)}</TableCell>
                      <TableCell>
                        <MuiLink
                          component={RouterLink}
                          to={`/accounting/journal-entries/${line.journalEntryId}`}
                          underline="hover"
                        >
                          {line.journalNo}
                        </MuiLink>
                      </TableCell>
                      <TableCell>
                        <SourceLink
                          sourceType={line.sourceType as AccountingSourceType}
                          sourceDocumentId={line.sourceDocumentId}
                          sourceRef={line.sourceRef}
                        />
                      </TableCell>
                      <TableCell>{line.description || '—'}</TableCell>
                      <TableCell align="right">{formatCurrency(line.moneyIn)}</TableCell>
                      <TableCell align="right">{formatCurrency(line.moneyOut)}</TableCell>
                    </TableRow>
                  ))
                )}
              </TableBody>
            </Table>
          </TableContainer>

          {totalLines > 0 && (
            <Box sx={{ display: 'flex', justifyContent: 'flex-end', pt: 1 }}>
              <PagePagination
                total={totalLines}
                page={currentPage}
                limit={PAGE_SIZE}
                onPageChange={handlePageChange}
                onLimitChange={() => {}}
              />
            </Box>
          )}
        </CardContent>
      </Card>

      {/* Confirmation Dialog */}
      {confirmAction && (
        <ConfirmationDialog
          open={Boolean(confirmAction)}
          title={CONFIRM_COPY[confirmAction].title}
          message={CONFIRM_COPY[confirmAction].message}
          confirmText={CONFIRM_COPY[confirmAction].confirmText}
          severity={confirmAction === 'discard' ? 'error' : 'warning'}
          onConfirm={handleConfirmAction}
          onCancel={() => setConfirmAction(null)}
        />
      )}
    </Box>
  )
}
