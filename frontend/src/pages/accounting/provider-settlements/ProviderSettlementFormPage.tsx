import { useEffect, useRef, useState } from 'react'
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
import { DatePicker } from '@mui/x-date-pickers/DatePicker'
import { format, parseISO } from 'date-fns'
import { useNavigate, useParams } from 'react-router-dom'

import { AppButton } from '@/components/common/AppButton'
import ConfirmationDialog from '@/components/common/ConfirmationDialog'
import PageHeader from '@/components/common/PageHeader'
import { useDocumentNumberPreview } from '@/hooks/useDocumentNumberPreview'
import { useNotification } from '@/hooks/useNotification'
import { useUnsavedChangesGuard } from '@/hooks/useUnsavedChangesGuard'
import {
  useCreateProviderSettlementMutation,
  useGetAccountsQuery,
  useGetClaimedSettlementRowsQuery,
  useGetProviderSettlementQuery,
  useLazyGetClaimedSettlementRowsQuery,
  useLazyGetEligibleSettlementRowsQuery,
  useUpdateProviderSettlementMutation,
} from '@/store/api/accountingApi'
import type { ClaimedSettlementRow } from '@/types'
import { toAmountInputValue, toScaledAmount } from '@/utils/currency'
import { rtkErrorMessage } from '@/utils/errorMessage'
import { getCurrentDate, toMuiDatePickerFormat } from '@/utils/formatters'

import NeedsAttention, { type AttentionGroup } from './NeedsAttention'
import SettlementRowPicker from './SettlementRowPicker'
import {
  changeReason,
  groupKey,
  methodsIn,
  saveBlockReason,
  selectionFingerprint,
  toRowInputs,
  type SelectedRow,
} from './settlementSelection'

const LIST_PATH = '/accounting/provider-settlements'

interface SettlementFormValues {
  bankAccountId: string
  settlementDate: string
  providerReference: string
  settlementAmount: string
}

/** What the form last loaded or saved; the unsaved-changes guard compares against it. */
interface Snapshot {
  form: SettlementFormValues
  fingerprint: string
}

/** The 409 body nests the conflicting rows under `message` (filter keeps only message). */
interface ConflictBody {
  message?: {
    text?: string
    staleRows?: Array<{ salesOrderId: string; paymentMethodId: string; currentNetAmount: string | null }>
  }
}

export default function ProviderSettlementFormPage() {
  const { id } = useParams<{ id: string }>()
  const navigate = useNavigate()
  const { showSuccess, showError } = useNotification()
  const isEdit = Boolean(id)

  const {
    data: existing,
    isLoading: loadingExisting,
    isError: existingLoadFailed,
  } = useGetProviderSettlementQuery(id!, { skip: !isEdit })
  const { data: accountsPage } = useGetAccountsQuery({})
  const { data: claimed, isError: claimedLoadFailed } = useGetClaimedSettlementRowsQuery(
    { settlementId: id!, settlementDate: existing?.settlementDate ?? '' },
    { skip: !isEdit || !existing },
  )
  const [refreshClaimed] = useLazyGetClaimedSettlementRowsQuery()
  const [refreshEligible] = useLazyGetEligibleSettlementRowsQuery()
  const settlementNumberPreview = useDocumentNumberPreview('Provider Settlements', !isEdit)

  const [form, setForm] = useState<SettlementFormValues>(() => ({
    bankAccountId: '',
    settlementDate: getCurrentDate(),
    providerReference: '',
    settlementAmount: '',
  }))
  const [selected, setSelected] = useState<SelectedRow[]>([])
  const [attention, setAttention] = useState<AttentionGroup[]>([])
  /**
   * The group keys the draft itself claims. A 409 on one of them can be
   * refreshed through `scope=claimed`; anything else was selected since the
   * last save and is refreshed through the eligible-rows query instead.
   */
  const [claimedKeys, setClaimedKeys] = useState<Set<string>>(new Set())
  // Create starts from the empty form; edit has no baseline until the draft and
  // its claims are seeded below, and reads clean until then.
  const [baseline, setBaseline] = useState<Snapshot | null>(() =>
    isEdit ? null : { form, fingerprint: selectionFingerprint([], []) },
  )
  const [saveError, setSaveError] = useState<string | null>(null)
  const [pendingDateChange, setPendingDateChange] = useState<string | null>(null)
  // Covers the whole save, including the navigation that follows, so the
  // unsaved-changes guard never interrupts a request it started.
  const [isSaving, setIsSaving] = useState(false)

  const zeroReason = 'now RM0.00 — remove'
  const ineligibleReason = 'payments no longer eligible — remove'

  function attentionFromClaimed(c: ClaimedSettlementRow): AttentionGroup {
    const base = {
      key: groupKey(c),
      salesOrderId: c.salesOrderId,
      paymentMethodId: c.paymentMethodId,
      orderNumber: c.orderNumber,
      paymentMethodName: c.paymentMethodName,
      savedNetAmount: c.savedNetAmount,
      currentNetAmount: c.currentNetAmount,
      refreshed: true,
    }
    if (c.state === 'zero') return { ...base, reason: zeroReason }
    if (c.state === 'ineligible') return { ...base, reason: ineligibleReason }
    return { ...base, reason: changeReason(c.savedPayments, c.currentPayments) }
  }

  // Seed ONCE per editing session. `claimed` and `existing` change again after a
  // 409 refresh (the lazy refetch writes the same cache entry) and after a save
  // (tag invalidation); re-seeding then would overwrite unsaved form fields,
  // selections and attention rows. Later refreshes are merged into the affected
  // groups only, by handleStale().
  const seededFor = useRef<string | null>(null)

  useEffect(() => {
    if (!isEdit || !existing || !claimed) return
    if (seededFor.current === id) return
    seededFor.current = id!
    const seededForm: SettlementFormValues = {
      bankAccountId: existing.bankAccountId,
      settlementDate: existing.settlementDate,
      providerReference: existing.providerReference ?? '',
      settlementAmount: toAmountInputValue(existing.settlementAmount),
    }
    const current = claimed.data
      .filter((c) => c.state === 'current')
      .map((c) => ({
        salesOrderId: c.salesOrderId,
        paymentMethodId: c.paymentMethodId,
        paymentMethodName: c.paymentMethodName,
        orderNumber: c.orderNumber,
        netAmount: c.currentNetAmount!,
      }))
    const needs = claimed.data.filter((c) => c.state !== 'current').map(attentionFromClaimed)
    setForm(seededForm)
    setSelected(current)
    setAttention(needs)
    setClaimedKeys(new Set(claimed.data.map(groupKey)))
    setBaseline({
      form: seededForm,
      fingerprint: selectionFingerprint(current, needs.map((n) => n.key)),
    })
  }, [isEdit, existing, claimed])

  function removeAttention(key: string) {
    setAttention((prev) => prev.filter((a) => a.key !== key))
  }

  function acceptAttention(key: string) {
    const g = attention.find((a) => a.key === key)
    if (!g || g.currentNetAmount === null) return
    setSelected((prev) => [
      ...prev,
      {
        salesOrderId: g.salesOrderId,
        paymentMethodId: g.paymentMethodId,
        paymentMethodName: g.paymentMethodName,
        orderNumber: g.orderNumber,
        netAmount: g.currentNetAmount!,
      },
    ])
    removeAttention(key)
  }

  /** 409: stale rows leave the selection for Needs attention, then refresh (spec §5.4). */
  async function handleStale(
    staleRows: Array<{ salesOrderId: string; paymentMethodId: string; currentNetAmount: string | null }>,
  ) {
    const staleKeys = new Set(staleRows.map(groupKey))
    const moving = selected.filter((s) => staleKeys.has(groupKey(s)))
    setSelected((prev) => prev.filter((s) => !staleKeys.has(groupKey(s))))
    const pending: AttentionGroup[] = staleRows.map((r) => {
      const sel = moving.find((m) => groupKey(m) === groupKey(r))
      return {
        key: groupKey(r),
        salesOrderId: r.salesOrderId,
        paymentMethodId: r.paymentMethodId,
        orderNumber: sel?.orderNumber ?? r.salesOrderId,
        paymentMethodName: sel?.paymentMethodName ?? '',
        savedNetAmount: sel?.netAmount ?? null,
        currentNetAmount: r.currentNetAmount,
        reason: 'Payments changed',
        refreshed: false,
      }
    })
    setAttention((prev) => [...prev.filter((a) => !staleKeys.has(a.key)), ...pending])

    const fromClaimed = pending.filter((p) => isEdit && claimedKeys.has(p.key))
    const others = pending.filter((p) => !(isEdit && claimedKeys.has(p.key)))
    const updates = new Map<string, Partial<AttentionGroup>>()

    if (fromClaimed.length) {
      const res = await refreshClaimed({ settlementId: id!, settlementDate: form.settlementDate }).unwrap()
      for (const p of fromClaimed) {
        const c = res.data.find((x) => groupKey(x) === p.key)
        updates.set(
          p.key,
          c
            ? { ...attentionFromClaimed(c), refreshed: true }
            : { currentNetAmount: null, reason: ineligibleReason, refreshed: true },
        )
      }
    }
    if (others.length) {
      const res = await refreshEligible({
        settlementDate: form.settlementDate,
        salesOrderIds: [...new Set(others.map((o) => o.salesOrderId))],
        ...(isEdit ? { settlementId: id } : {}),
      }).unwrap()
      for (const p of others) {
        const row = res.data.find((x) => groupKey(x) === p.key)
        updates.set(
          p.key,
          row
            ? { currentNetAmount: row.netAmount, reason: 'Payments changed', refreshed: true }
            : { currentNetAmount: null, reason: ineligibleReason, refreshed: true },
        )
      }
    }
    setAttention((prev) => prev.map((a) => (updates.has(a.key) ? { ...a, ...updates.get(a.key) } : a)))
  }

  /**
   * The selection is compared by fingerprint, not position: unticking and
   * re-ticking a row reorders it without changing what would be saved, so a
   * positional compare would report a phantom change. Amounts compare by
   * scaled value, so '70' and '70.00' are the same edit (and an unparseable
   * amount only counts as a change while it stays unparseable).
   */
  const fingerprint = selectionFingerprint(selected, attention.map((a) => a.key))

  function isSnapshotDirty(snapshot: Snapshot) {
    const keys = Object.keys(form) as (keyof SettlementFormValues)[]
    return (
      keys.some((k) =>
        k === 'settlementAmount'
          ? toScaledAmount(form[k]) !== toScaledAmount(snapshot.form[k]) ||
            (toScaledAmount(form[k]) === null && form[k] !== snapshot.form[k])
          : form[k] !== snapshot.form[k],
      ) || fingerprint !== snapshot.fingerprint
    )
  }

  const isDirty = baseline !== null && isSnapshotDirty(baseline)
  const { UnsavedChangesDialog } = useUnsavedChangesGuard(isDirty, isSaving)

  const blockReason = saveBlockReason({
    selected,
    entered: form.settlementAmount,
    unresolvedAttention: attention.length,
  })

  const bankAccounts = (accountsPage?.data ?? []).filter((a) => a.isActive && a.isPostable)
  const methods = methodsIn(selected)

  function requestDateChange(next: string) {
    if (next === form.settlementDate) return
    if (selected.length === 0 && attention.length === 0) {
      setForm((f) => ({ ...f, settlementDate: next }))
      return
    }
    setPendingDateChange(next)
  }

  const [create] = useCreateProviderSettlementMutation()
  const [update] = useUpdateProviderSettlementMutation()

  async function save(): Promise<string | null> {
    setSaveError(null)
    // The COMPLETE selection every time — PATCH is full replacement, never a
    // delta.
    const body = { ...form, rows: toRowInputs(selected) }
    try {
      const saved = isEdit
        ? await update({ id: id!, body }).unwrap()
        : await create(body).unwrap()
      showSuccess(`Settlement ${saved.referenceNumber} saved`)
      // What was sent is now what is stored. Set here rather than waiting for
      // the refetch, so a post that fails after this save leaves the form clean.
      setBaseline({ form: { ...form }, fingerprint })
      // The saved groups are now the draft's claims, so a later 409 on them
      // refreshes through `scope=claimed` rather than the eligible-rows query.
      if (isEdit) setClaimedKeys(new Set(selected.map(groupKey)))
      return saved.id
    } catch (err) {
      const conflict = (err as { data?: ConflictBody })?.data
      const staleRows = conflict?.message?.staleRows
      if (staleRows?.length) {
        // Drop ONLY the rows the server named, keep the rest, and park them in
        // Needs attention until they are resolved. The message is also shown
        // inline, not only through the snackbar, so the reason stays on screen
        // next to the rows it explains.
        const text = conflict?.message?.text ?? 'Some rows changed since they were loaded. Review them and save again.'
        setSaveError(text)
        showError(text)
        try {
          await handleStale(staleRows)
        } catch {
          // The refresh failed: Accept stays disabled (refreshed: false), so
          // Remove is the only working action until the page is reloaded.
          showError('Could not refresh the changed rows. Remove them or reload the page.')
        }
      } else {
        const message = rtkErrorMessage(err, 'Failed to save settlement')
        setSaveError(message)
        showError(message)
      }
      return null
    }
  }

  // The form only saves the draft. Posting is a lifecycle action on the list
  // row menu, behind its confirmation — as Owner Equity keeps Complete off its
  // form (#1281).
  async function saveDraft() {
    setIsSaving(true)
    try {
      const savedId = await save()
      // Create leaves the form, as Owner Equity does, handing the new draft back
      // for the list to highlight. Staying on /create would let a second Save
      // create a duplicate draft. Edit stays put.
      if (savedId && !isEdit) {
        navigate(LIST_PATH, { state: { highlightProviderSettlementId: savedId } })
      }
    } finally {
      setIsSaving(false)
    }
  }

  const handleCancel = () => {
    navigate(isEdit ? `${LIST_PATH}/${id}/view` : LIST_PATH)
  }

  const loadFailed = existingLoadFailed || claimedLoadFailed

  if (isEdit && !loadFailed && (loadingExisting || !claimed)) {
    return (
      <Box sx={{ display: 'flex', justifyContent: 'center', pt: 10 }}>
        <CircularProgress />
      </Box>
    )
  }

  if (isEdit && (loadFailed || !existing)) {
    return (
      <>
        <PageHeader
          title="Edit Provider Settlement"
          subtitle=""
          variant="workflow"
          backAction={() => navigate(LIST_PATH)}
        />
        <Alert severity="error" sx={{ mt: 2 }}>
          Failed to load this settlement. Go back and try again.
        </Alert>
      </>
    )
  }

  return (
    <>
      <PageHeader
        title={isEdit ? 'Edit Provider Settlement' : 'New Provider Settlement'}
        subtitle={
          isEdit
            ? `Editing ${existing?.referenceNumber ?? ''}`
            : "Clear a payment provider's payout to a bank account"
        }
        variant="workflow"
        backAction={handleCancel}
      />

      <form noValidate onSubmit={(e) => e.preventDefault()}>
        <Grid container spacing={3}>
          <Grid size={12}>
            <Card>
              <CardContent>
                <Typography variant="h6" gutterBottom>Settlement Information</Typography>
                <Grid container spacing={2}>
                  <Grid size={{ xs: 12, md: 4 }}>
                    {/*
                      Read-only. The method is inferred from the selected rows —
                      they all share one by construction — and the backend
                      re-derives it on save; there is nothing to choose here.
                    */}
                    <TextField
                      label="Payment Method"
                      value={
                        methods.length === 1
                          ? methods[0].paymentMethodName
                          : methods.length > 1
                            ? 'Multiple — see warning'
                            : '—'
                      }
                      slotProps={{ input: { readOnly: true }, inputLabel: { shrink: true } }}
                      helperText="Inferred from the selected rows"
                      fullWidth size="small"
                    />
                  </Grid>
                  <Grid size={{ xs: 12, md: 4 }}>
                    <DatePicker
                      // #1275 kept 'Settlement Date' on the form input to tell
                      // it apart from the payment dates listed below.
                      label="Settlement Date"
                      value={form.settlementDate ? parseISO(form.settlementDate) : null}
                      format={toMuiDatePickerFormat(localStorage.getItem('dateFormat') || 'DD/MM/YYYY')}
                      onChange={(date) =>
                        requestDateChange(
                          date && !Number.isNaN(date.getTime()) ? format(date, 'yyyy-MM-dd') : '',
                        )
                      }
                      slotProps={{
                        textField: { fullWidth: true, size: 'small', disabled: isSaving },
                      }}
                    />
                  </Grid>
                  <Grid size={{ xs: 12, md: 4 }}>
                    <TextField
                      label="Settlement No."
                      value={isEdit ? (existing?.referenceNumber ?? '') : (settlementNumberPreview ?? '')}
                      disabled
                      fullWidth size="small"
                    />
                  </Grid>
                  <Grid size={{ xs: 12, md: 6 }}>
                    <TextField
                      label="Provider Reference" value={form.providerReference}
                      slotProps={{ htmlInput: { maxLength: 200 } }}
                      onChange={(e) => setForm((f) => ({ ...f, providerReference: e.target.value }))}
                      disabled={isSaving}
                      fullWidth size="small"
                    />
                  </Grid>
                  <Grid size={{ xs: 12, md: 6 }}>
                    <TextField
                      select label="Bank Account" value={form.bankAccountId}
                      onChange={(e) => setForm((f) => ({ ...f, bankAccountId: e.target.value }))}
                      disabled={isSaving}
                      fullWidth size="small"
                    >
                      {bankAccounts.map((a) => (
                        <MenuItem key={a.id} value={a.id}>{`${a.code} ${a.name}`}</MenuItem>
                      ))}
                    </TextField>
                  </Grid>
                </Grid>
              </CardContent>
            </Card>
          </Grid>

          <Grid size={12}>
            <Card>
              <CardContent>
                <Typography variant="h6" gutterBottom>Amount &amp; Accounting</Typography>
                <Grid container spacing={2}>
                  <Grid size={{ xs: 12, md: 6 }}>
                    <TextField
                      label="Amount Received in Bank" value={form.settlementAmount}
                      onChange={(e) => setForm((f) => ({ ...f, settlementAmount: e.target.value }))}
                      disabled={isSaving}
                      slotProps={{ htmlInput: { inputMode: 'decimal' as const } }}
                      fullWidth size="small"
                    />
                  </Grid>
                  <Grid size={{ xs: 12, md: 6 }}>
                    {/*
                      Read-only. The clearing account is DERIVED by the backend
                      from the selected payments' original journal entries,
                      never chosen here — the whole point is that it matches the
                      account those payments actually debited. It is therefore
                      only known once a draft exists.
                    */}
                    <TextField
                      label="Provider Clearing Account"
                      value={
                        // Gate on isEdit, not merely on `existing` being
                        // present: RTK Query can hand back a cached settlement
                        // from a previous visit even while `skip` is set, which
                        // would show a stale account on a brand-new form.
                        isEdit && existing?.clearingAccount
                          ? `${existing.clearingAccount.code} ${existing.clearingAccount.name}`
                          : ''
                      }
                      placeholder="Derived from the selected payments when saved"
                      slotProps={{ input: { readOnly: true }, inputLabel: { shrink: true } }}
                      helperText="Derived from the selected payments' original postings"
                      fullWidth size="small"
                    />
                  </Grid>
                </Grid>
              </CardContent>
            </Card>
          </Grid>

          <Grid size={12}>
            <Card>
              <CardContent>
                <Typography variant="h6" gutterBottom>Sales Order Payments</Typography>
                <NeedsAttention
                  groups={attention}
                  onRemove={removeAttention}
                  onAccept={acceptAttention}
                />
                <SettlementRowPicker
                  settlementDate={form.settlementDate}
                  settlementId={isEdit ? id : undefined}
                  selected={selected}
                  onChange={setSelected}
                  enteredAmount={form.settlementAmount}
                  attentionKeys={attention.map((a) => a.key)}
                />
              </CardContent>
            </Card>
          </Grid>

          {saveError && (
            <Grid size={12}>
              <Alert severity="error">{saveError}</Alert>
            </Grid>
          )}

          <Grid size={12}>
            <Box sx={{ display: 'flex', gap: 2, alignItems: 'center', justifyContent: 'flex-end' }}>
              {blockReason && (
                <Typography
                  variant="body2"
                  color="text.secondary"
                  data-testid="save-block-reason"
                  sx={{ flex: 1 }}
                >
                  {blockReason}
                </Typography>
              )}
              <AppButton variant="secondary" onClick={handleCancel} disabled={isSaving}>
                Cancel
              </AppButton>
              {/* onClick, not type="submit": Enter in a field (e.g. the
                  payment picker) must not create a draft by accident. */}
              <AppButton
                variant="primary"
                onClick={saveDraft}
                disabled={isSaving || blockReason !== null}
              >
                {isSaving
                  ? isEdit
                    ? 'Saving...'
                    : 'Creating...'
                  : isEdit
                    ? 'Save Settlement'
                    : 'Create Settlement'}
              </AppButton>
            </Box>
          </Grid>
        </Grid>
      </form>

      <ConfirmationDialog
        open={pendingDateChange !== null}
        title="Change settlement date?"
        message="Changing the settlement date clears the selected payments."
        onConfirm={() => {
          setForm((f) => ({ ...f, settlementDate: pendingDateChange! }))
          setSelected([])
          setAttention([])
          setPendingDateChange(null)
        }}
        onCancel={() => setPendingDateChange(null)}
      />
      {UnsavedChangesDialog}
    </>
  )
}
