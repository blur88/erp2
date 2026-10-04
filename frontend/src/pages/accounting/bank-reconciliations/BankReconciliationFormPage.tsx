import React, { useCallback, useEffect, useMemo, useRef, useState } from 'react'
import {
  Alert,
  Box,
  Card,
  CardContent,
  CircularProgress,
  Grid,
  MenuItem,
  TextField,
  Typography,
} from '@mui/material'
import { useLocation, useNavigate, useParams } from 'react-router-dom'

import { AppButton } from '@/components/common/AppButton'
import ConfirmationDialog from '@/components/common/ConfirmationDialog'
import PageHeader from '@/components/common/PageHeader'
import { useNotification } from '@/hooks/useNotification'
import { bankAccountOptions } from '@/pages/accounting/provider-settlements/bankAccountOptions'
import {
  useCreateBankReconciliationMutation,
  useGetAccountsQuery,
  useGetBankReconciliationNextPeriodQuery,
  useGetBankReconciliationQuery,
  usePreviewBankReconciliationMutation,
  useSearchEligibleReconciliationLinesMutation,
  useUpdateBankReconciliationMutation,
} from '@/store/api/accountingApi'
import { useAppSelector } from '@/hooks/useRedux'
import { selectCurrentUser } from '@/store/slices/authSlice'
import type {
  Account,
  BankReconciliationDetailDto,
  ReconciliationLineDto,
  SetupClassification,
  SetupSummaryDto,
} from '@/types'
import { rtkErrorMessage } from '@/utils/errorMessage'
import { currentListPath, forwardListQuery } from '@/utils/listQuery'

import {
  accountWritable,
  readOnlyNotice,
} from './bankReconciliationActions'
import InvalidEntriesPanel from './InvalidEntriesPanel'
import {
  clearDraft,
  draftKey,
  loadDraft,
  newCreateToken,
  saveDraft,
} from './reconciliationDraftStorage'
import {
  applyPreview,
  clearClassification,
  effectiveClassification,
  emptyForm,
  fromDetail,
  isDirty,
  previewTotals,
  setClassification,
  toCreateBody,
  toggleMatched,
  toUpdateBody,
  untickMatched,
  type PickerContext,
  type ReconciliationFormState,
} from './reconciliationForm'
import ReconciliationLinePicker from './ReconciliationLinePicker'
import ReconciliationSummary from './ReconciliationSummary'
import SetupClassificationSection from './SetupClassificationSection'

const LIST_PATH = '/accounting/bank-reconciliations'

export default function BankReconciliationFormPage(): React.ReactElement {
  const { id } = useParams<{ id: string }>()
  const isEdit = Boolean(id)
  const navigate = useNavigate()
  const location = useLocation()
  const { showSuccess, showError } = useNotification()
  const currentUser = useAppSelector(selectCurrentUser)
  const userId = currentUser?.id ?? 'anonymous'

  // Manage create token in URL query
  const searchParams = new URLSearchParams(location.search)
  const draftTokenFromUrl = searchParams.get('draft')
  const [createToken, setCreateToken] = useState<string>(() => draftTokenFromUrl || newCreateToken())

  useEffect(() => {
    if (!isEdit && !draftTokenFromUrl) {
      navigate({ search: `?draft=${createToken}` }, { replace: true })
    }
  }, [isEdit, draftTokenFromUrl, createToken, navigate])

  const storageKey = useMemo(() => {
    return isEdit
      ? draftKey(userId, { reconciliationId: id! })
      : draftKey(userId, { createToken })
  }, [isEdit, userId, id, createToken])

  // Queries & Mutations
  const { data: accountsPage, isLoading: accountsLoading } = useGetAccountsQuery({})
  const { data: existingDetail, isLoading: existingLoading, isError: existingError } =
    useGetBankReconciliationQuery(id!, { skip: !isEdit })

  const [form, setForm] = useState<ReconciliationFormState>(emptyForm)
  const [baseline, setBaseline] = useState<ReconciliationFormState>(emptyForm)
  const [picker, setPicker] = useState<PickerContext>({
    checklist: { page: 1, search: '' },
    setup: { page: 1, search: '', filter: 'ALL' },
  })

  const [staleLockWarning, setStaleLockWarning] = useState(false)
  const [checklistRows, setChecklistRows] = useState<ReconciliationLineDto[]>([])
  const [checklistTotal, setChecklistTotal] = useState(0)
  const [checklistLoading, setChecklistLoading] = useState(false)

  const [setupRows, setSetupRows] = useState<ReconciliationLineDto[]>([])
  const [setupTotal, setSetupTotal] = useState(0)
  const [setupLoading, setSetupLoading] = useState(false)

  const [setupSummary, setSetupSummary] = useState<SetupSummaryDto | null>(null)
  const [invalidMatched, setInvalidMatched] = useState<ReconciliationLineDto[]>([])
  const [invalidClassifications, setInvalidClassifications] = useState<ReconciliationLineDto[]>([])

  const [confirmCancel, setConfirmCancel] = useState(false)
  const [saveError, setSaveError] = useState<string | null>(null)

  const [searchEligibleLines] = useSearchEligibleReconciliationLinesMutation()
  const [previewReconciliation] = usePreviewBankReconciliationMutation()
  const [createReconciliation, { isLoading: isCreating }] = useCreateBankReconciliationMutation()
  const [updateReconciliation, { isLoading: isUpdating }] = useUpdateBankReconciliationMutation()

  const isSaving = isCreating || isUpdating

  // Check next-period in create mode
  const { data: nextPeriod, isLoading: nextPeriodLoading } =
    useGetBankReconciliationNextPeriodQuery(form.bankAccountId, {
      skip: !form.bankAccountId || isEdit,
    })

  const isFirst = isEdit ? existingDetail?.sequenceNo === 1 : nextPeriod?.isFirst ?? false
  const blockedReason = !isEdit && nextPeriod?.blockedReason ? nextPeriod.blockedReason : null

  // Redirection when account not writable in edit mode
  useEffect(() => {
    if (isEdit && existingDetail) {
      if (!accountWritable(existingDetail)) {
        const notice = readOnlyNotice(existingDetail)
        if (notice) showError(notice)
        navigate(`/accounting/bank-reconciliations/${id}/view`, { replace: true })
      }
    }
  }, [isEdit, existingDetail, id, navigate, showError])

  // Initialize form state
  const initializedRef = useRef(false)
  const staleDiscardedRef = useRef(false)
  useEffect(() => {
    if (initializedRef.current) return

    if (isEdit) {
      if (!existingDetail) return
      initializedRef.current = true

      const base = fromDetail(existingDetail)
      setBaseline(base)

      const stored = loadDraft(storageKey)
      if (stored) {
        if (stored.lockVersion === existingDetail.lockVersion) {
          setForm(stored.form)
          setPicker(stored.picker)
        } else {
          setStaleLockWarning(true)
          clearDraft(storageKey)
          staleDiscardedRef.current = true
          setForm(base)
        }
      } else {
        setForm(base)
      }
    } else {
      initializedRef.current = true
      const stored = loadDraft(storageKey)
      if (stored) {
        setForm(stored.form)
        setPicker(stored.picker)
      }
    }
  }, [isEdit, existingDetail, storageKey])

  // Apply next period defaults when selecting account in create mode
  useEffect(() => {
    if (!isEdit && nextPeriod && !nextPeriod.isFirst) {
      setForm((prev) => ({
        ...prev,
        periodFrom: nextPeriod.periodFrom ?? prev.periodFrom,
        openingBalance: nextPeriod.openingBalance ?? prev.openingBalance,
      }))
    }
  }, [isEdit, nextPeriod])

  // Save draft on form or picker changes
  useEffect(() => {
    if (!initializedRef.current) return
    if (isEdit && !isDirty(form, baseline)) return

    const lockVersion = isEdit && existingDetail ? existingDetail.lockVersion : null
    saveDraft(storageKey, {
      v: 1,
      lockVersion,
      form,
      picker,
      savedAt: new Date().toISOString(),
    })
  }, [storageKey, form, picker, isEdit, existingDetail, baseline])

  // Monotonically increasing counter for preview
  const previewSeqRef = useRef(0)
  const previewTimerRef = useRef<ReturnType<typeof setTimeout> | null>(null)

  const runPreview = useCallback(
    async (currentForm: ReconciliationFormState, seq: number) => {
      if (!currentForm.bankAccountId || !currentForm.periodTo) return

      try {
        const setupChanges = Object.entries(currentForm.setupChanges).map(
          ([journalEntryLineId, classification]) => ({
            journalEntryLineId,
            classification,
          }),
        )

        const res = await previewReconciliation({
          bankAccountId: currentForm.bankAccountId,
          reconciliationId: id,
          periodFrom: currentForm.periodFrom || undefined,
          periodTo: currentForm.periodTo,
          openingBalance: currentForm.openingBalance || undefined,
          matchedLineIds: Object.keys(currentForm.matched),
          setupChanges: setupChanges.length > 0 ? setupChanges : undefined,
        }).unwrap()

        if (seq === previewSeqRef.current) {
          setForm((f) => applyPreview(f, res))
          setSetupSummary(res.setupSummary)
          setInvalidMatched(res.invalidMatched)
          setInvalidClassifications(res.invalidClassifications)
        }
      } catch {
        // Silently handle preview errors
      }
    },
    [id, previewReconciliation],
  )

  // Trigger preview on changes
  const prevFormRef = useRef<ReconciliationFormState>(form)
  useEffect(() => {
    if (!initializedRef.current) return

    const prev = prevFormRef.current
    prevFormRef.current = form

    const periodOrAccountChanged =
      prev.bankAccountId !== form.bankAccountId ||
      prev.periodFrom !== form.periodFrom ||
      prev.periodTo !== form.periodTo ||
      prev.openingBalance !== form.openingBalance

    const matchedOrSetupChanged =
      prev.matched !== form.matched || prev.setupChanges !== form.setupChanges

    if (periodOrAccountChanged) {
      if (previewTimerRef.current) clearTimeout(previewTimerRef.current)
      const seq = ++previewSeqRef.current
      runPreview(form, seq)
    } else if (matchedOrSetupChanged) {
      if (previewTimerRef.current) clearTimeout(previewTimerRef.current)
      const seq = ++previewSeqRef.current
      previewTimerRef.current = setTimeout(() => {
        runPreview(form, seq)
      }, 300)
    }
  }, [form, runPreview])

  // Monotonically increasing counter for checklist search
  const checklistSeqRef = useRef(0)
  const checklistDebounceRef = useRef<ReturnType<typeof setTimeout> | null>(null)

  const runChecklistSearch = useCallback(
    async (searchQuery: string, pageNum: number, currentForm: ReconciliationFormState) => {
      if (!currentForm.bankAccountId || !currentForm.periodTo) {
        setChecklistRows([])
        setChecklistTotal(0)
        return
      }

      setChecklistLoading(true)
      const seq = ++checklistSeqRef.current

      try {
        const setupChanges = Object.entries(currentForm.setupChanges).map(
          ([journalEntryLineId, classification]) => ({
            journalEntryLineId,
            classification,
          }),
        )

        const res = await searchEligibleLines({
          view: 'checklist',
          bankAccountId: currentForm.bankAccountId,
          reconciliationId: id,
          periodFrom: currentForm.periodFrom || undefined,
          periodTo: currentForm.periodTo,
          openingBalance: currentForm.openingBalance || undefined,
          setupChanges: setupChanges.length > 0 ? setupChanges : undefined,
          search: searchQuery || undefined,
          page: pageNum,
          limit: 25,
        }).unwrap()

        if (seq === checklistSeqRef.current) {
          setChecklistRows(res.data)
          setChecklistTotal(res.meta.total)
        }
      } catch {
        if (seq === checklistSeqRef.current) {
          setChecklistRows([])
          setChecklistTotal(0)
        }
      } finally {
        if (seq === checklistSeqRef.current) {
          setChecklistLoading(false)
        }
      }
    },
    [id, searchEligibleLines],
  )

  useEffect(() => {
    if (!form.bankAccountId || !form.periodTo) return
    if (checklistDebounceRef.current) clearTimeout(checklistDebounceRef.current)
    checklistDebounceRef.current = setTimeout(() => {
      runChecklistSearch(picker.checklist.search, picker.checklist.page, form)
    }, 150)
  }, [
    form.bankAccountId,
    form.periodFrom,
    form.periodTo,
    form.openingBalance,
    form.setupChanges,
    picker.checklist.search,
    picker.checklist.page,
    runChecklistSearch,
  ])

  // Monotonically increasing counter for setup search
  const setupSeqRef = useRef(0)
  const setupDebounceRef = useRef<ReturnType<typeof setTimeout> | null>(null)

  const runSetupSearch = useCallback(
    async (
      searchQuery: string,
      filterVal: SetupClassification | 'ALL',
      pageNum: number,
      currentForm: ReconciliationFormState,
    ) => {
      if (!isFirst || !currentForm.bankAccountId || !currentForm.periodTo) {
        setSetupRows([])
        setSetupTotal(0)
        return
      }

      setSetupLoading(true)
      const seq = ++setupSeqRef.current

      try {
        const setupChanges = Object.entries(currentForm.setupChanges).map(
          ([journalEntryLineId, classification]) => ({
            journalEntryLineId,
            classification,
          }),
        )

        const res = await searchEligibleLines({
          view: 'setup',
          classification: filterVal === 'ALL' ? undefined : filterVal,
          bankAccountId: currentForm.bankAccountId,
          reconciliationId: id,
          periodFrom: currentForm.periodFrom || undefined,
          periodTo: currentForm.periodTo,
          openingBalance: currentForm.openingBalance || undefined,
          setupChanges: setupChanges.length > 0 ? setupChanges : undefined,
          search: searchQuery || undefined,
          page: pageNum,
          limit: 25,
        }).unwrap()

        if (seq === setupSeqRef.current) {
          setSetupRows(res.data)
          setSetupTotal(res.meta.total)
        }
      } catch {
        if (seq === setupSeqRef.current) {
          setSetupRows([])
          setSetupTotal(0)
        }
      } finally {
        if (seq === setupSeqRef.current) {
          setSetupLoading(false)
        }
      }
    },
    [isFirst, id, searchEligibleLines],
  )

  useEffect(() => {
    if (!isFirst || !form.bankAccountId || !form.periodTo) return
    if (setupDebounceRef.current) clearTimeout(setupDebounceRef.current)
    setupDebounceRef.current = setTimeout(() => {
      runSetupSearch(picker.setup.search, picker.setup.filter, picker.setup.page, form)
    }, 150)
  }, [
    isFirst,
    form.bankAccountId,
    form.periodFrom,
    form.periodTo,
    form.openingBalance,
    form.setupChanges,
    picker.setup.search,
    picker.setup.filter,
    picker.setup.page,
    runSetupSearch,
  ])

  // Handlers for Checklist & Setup
  const handleToggleMatched = useCallback((line: ReconciliationLineDto) => {
    setForm((f) => toggleMatched(f, line))
  }, [])

  const handleUntick = useCallback((lineId: string) => {
    setForm((f) => untickMatched(f, lineId))
    setInvalidMatched((prev) => prev.filter((l) => l.journalEntryLineId !== lineId))
  }, [])

  const handleClassify = useCallback(
    (line: ReconciliationLineDto, next: 'CLEARED' | 'OUTSTANDING') => {
      const saved = line.classification ?? 'UNCLASSIFIED'
      setForm((f) => setClassification(f, line.journalEntryLineId, next, saved))
    },
    [],
  )

  const handleClearClassification = useCallback((line: ReconciliationLineDto) => {
    const saved = line.classification ?? 'UNCLASSIFIED'
    setForm((f) => clearClassification(f, line.journalEntryLineId, saved))
    setInvalidClassifications((prev) =>
      prev.filter((l) => l.journalEntryLineId !== line.journalEntryLineId),
    )
  }, [])

  const classificationOf = useCallback(
    (lineId: string, saved: SetupClassification): SetupClassification => {
      return effectiveClassification(form, lineId, saved)
    },
    [form],
  )

  // Calculations for summary
  const totals = useMemo(() => previewTotals(form), [form])

  // Bank accounts options
  const allAccounts: Account[] = accountsPage?.data ?? []
  const bankOptions = useMemo(() => {
    const stored = existingDetail?.bankAccount
    return bankAccountOptions(allAccounts, form.bankAccountId, stored)
  }, [allAccounts, form.bankAccountId, existingDetail?.bankAccount])

  // Submit / Cancel
  const handleCancel = useCallback(() => {
    if (isDirty(form, baseline)) {
      setConfirmCancel(true)
    } else {
      clearDraft(storageKey)
      navigate(currentListPath(LIST_PATH))
    }
  }, [form, baseline, storageKey, navigate])

  const handleConfirmCancel = useCallback(() => {
    clearDraft(storageKey)
    setConfirmCancel(false)
    navigate(currentListPath(LIST_PATH))
  }, [storageKey, navigate])

  const handleSave = useCallback(async () => {
    setSaveError(null)

    try {
      if (isEdit) {
        if (!existingDetail) return
        const body = toUpdateBody(form, existingDetail.lockVersion, isFirst)
        const updated = await updateReconciliation({ id: existingDetail.id, body }).unwrap()
        clearDraft(storageKey)
        showSuccess('Reconciliation updated')
        navigate(forwardListQuery(`/accounting/bank-reconciliations/${updated.id}/view`))
      } else {
        const body = toCreateBody(form, isFirst)
        const created = await createReconciliation(body).unwrap()
        clearDraft(storageKey)
        showSuccess('Reconciliation created')
        navigate(forwardListQuery(`/accounting/bank-reconciliations/${created.id}/view`))
      }
    } catch (err) {
      setSaveError(rtkErrorMessage(err, 'Failed to save bank reconciliation'))
      const lockVersion = isEdit && existingDetail ? existingDetail.lockVersion : null
      saveDraft(storageKey, {
        v: 1,
        lockVersion,
        form,
        picker,
        savedAt: new Date().toISOString(),
      })
    }
  }, [
    isEdit,
    existingDetail,
    form,
    picker,
    isFirst,
    updateReconciliation,
    createReconciliation,
    storageKey,
    showSuccess,
    navigate,
  ])

  // Blockers for Save
  const hasInvalidSelections = invalidMatched.length > 0 || invalidClassifications.length > 0
  const canSave =
    !isSaving &&
    !blockedReason &&
    !hasInvalidSelections &&
    Boolean(form.bankAccountId) &&
    Boolean(form.periodTo) &&
    Boolean(form.closingBalance) &&
    totals !== null

  if (isEdit && existingLoading) {
    return (
      <Box sx={{ display: 'flex', justifyContent: 'center', py: 8 }}>
        <CircularProgress />
      </Box>
    )
  }

  if (isEdit && (existingError || !existingDetail)) {
    return (
      <Box sx={{ p: 3 }}>
        <Alert severity="error">Failed to load bank reconciliation.</Alert>
      </Box>
    )
  }

  return (
    <Box sx={{ display: 'flex', flexDirection: 'column', gap: 3, pb: 8 }}>
      <PageHeader
        title={isEdit ? 'Edit Bank Reconciliation' : 'New Bank Reconciliation'}
        subtitle={
          isEdit
            ? `Editing draft ${existingDetail?.reconciliationNo}`
            : 'Match statement lines against the general ledger'
        }
      />

      {staleLockWarning && (
        <Alert severity="warning">
          Your unsaved changes could not be restored because this reconciliation was changed elsewhere.
          The current saved version is shown.
        </Alert>
      )}

      {blockedReason && <Alert severity="error">{blockedReason}</Alert>}

      {saveError && <Alert severity="error">{saveError}</Alert>}

      {/* Statement Details */}
      <Card variant="outlined">
        <CardContent>
          <Typography variant="h6" gutterBottom>
            Statement Details
          </Typography>

          <Grid container spacing={2}>
            <Grid size={{ xs: 12, sm: 6 }}>
              <TextField
                select
                fullWidth
                size="small"
                label="Bank Account"
                value={form.bankAccountId ?? ''}
                disabled={isEdit || accountsLoading}
                onChange={(e) =>
                  setForm((f) => ({
                    ...f,
                    bankAccountId: e.target.value,
                    matched: {},
                    setupChanges: {},
                  }))
                }
              >
                {bankOptions.map((opt) => (
                  <MenuItem key={opt.id} value={opt.id} disabled={opt.disabled}>
                    {opt.label}
                  </MenuItem>
                ))}
              </TextField>
            </Grid>

            <Grid size={{ xs: 12, sm: 3 }}>
              <TextField
                fullWidth
                type="date"
                size="small"
                label="Period From"
                value={form.periodFrom ?? ''}
                disabled={!isFirst}
                slotProps={{ inputLabel: { shrink: true } }}
                onChange={(e) => setForm((f) => ({ ...f, periodFrom: e.target.value }))}
              />
            </Grid>

            <Grid size={{ xs: 12, sm: 3 }}>
              <TextField
                fullWidth
                type="date"
                size="small"
                label="Period To"
                value={form.periodTo ?? ''}
                slotProps={{ inputLabel: { shrink: true } }}
                onChange={(e) => setForm((f) => ({ ...f, periodTo: e.target.value }))}
              />
            </Grid>

            <Grid size={{ xs: 12, sm: 6 }}>
              <TextField
                fullWidth
                size="small"
                label="Opening Balance"
                value={form.openingBalance ?? ''}
                disabled={!isFirst}
                onChange={(e) => setForm((f) => ({ ...f, openingBalance: e.target.value }))}
              />
            </Grid>

            <Grid size={{ xs: 12, sm: 6 }}>
              <TextField
                fullWidth
                size="small"
                label="Closing Balance"
                value={form.closingBalance ?? ''}
                onChange={(e) => setForm((f) => ({ ...f, closingBalance: e.target.value }))}
              />
            </Grid>
          </Grid>
        </CardContent>
      </Card>

      {/* First-time setup (sequence 1 only) */}
      {isFirst && (
        <SetupClassificationSection
          rows={setupRows}
          total={setupTotal}
          page={picker.setup.page}
          search={picker.setup.search}
          filter={picker.setup.filter}
          loading={setupLoading}
          summary={setupSummary}
          classificationOf={classificationOf}
          onClassify={handleClassify}
          onClear={handleClearClassification}
          onPageChange={(p) => setPicker((prev) => ({ ...prev, setup: { ...prev.setup, page: p } }))}
          onSearchChange={(s) =>
            setPicker((prev) => ({ ...prev, setup: { ...prev.setup, search: s, page: 1 } }))
          }
          onFilterChange={(f) =>
            setPicker((prev) => ({ ...prev, setup: { ...prev.setup, filter: f, page: 1 } }))
          }
        />
      )}

      {/* Invalid Entries Panel (only shown when non-empty) */}
      <InvalidEntriesPanel
        invalidMatched={invalidMatched}
        invalidClassifications={invalidClassifications}
        onUntick={handleUntick}
        onClearClassification={handleClearClassification}
      />

      {/* Transactions Picker */}
      <ReconciliationLinePicker
        rows={checklistRows}
        total={checklistTotal}
        page={picker.checklist.page}
        search={picker.checklist.search}
        loading={checklistLoading}
        selectedIds={new Set(Object.keys(form.matched))}
        onToggle={handleToggleMatched}
        onPageChange={(p) =>
          setPicker((prev) => ({ ...prev, checklist: { ...prev.checklist, page: p } }))
        }
        onSearchChange={(s) =>
          setPicker((prev) => ({ ...prev, checklist: { ...prev.checklist, search: s, page: 1 } }))
        }
      />

      {/* Summary */}
      <ReconciliationSummary
        moneyIn={totals?.moneyIn ?? '0.00'}
        moneyOut={totals?.moneyOut ?? '0.00'}
        calculatedClosingBalance={totals?.calculatedClosingBalance ?? '0.00'}
        difference={totals?.difference ?? '0.00'}
        openingBalanceDifference={isFirst ? setupSummary?.openingBalanceDifference ?? null : null}
        unclassifiedCount={isFirst ? setupSummary?.unclassifiedCount ?? null : null}
      />

      {/* Bottom Action Bar */}
      <Box sx={{ display: 'flex', justifyContent: 'flex-end', gap: 2 }}>
        <AppButton variant="secondary" onClick={handleCancel} disabled={isSaving}>
          Cancel
        </AppButton>
        <AppButton
          variant="primary"
          onClick={handleSave}
          disabled={!canSave}
        >
          {isSaving ? (isEdit ? 'Saving...' : 'Creating...') : isEdit ? 'Save Changes' : 'Create'}
        </AppButton>
      </Box>

      {/* Cancel Confirmation Dialog */}
      <ConfirmationDialog
        open={confirmCancel}
        title="Discard unsaved changes?"
        message="You have unsaved changes. Are you sure you want to discard them?"
        confirmText="Discard Changes"
        severity="warning"
        onConfirm={handleConfirmCancel}
        onCancel={() => setConfirmCancel(false)}
      />
    </Box>
  )
}
