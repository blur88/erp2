import { useEffect, useState } from 'react'
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
  useGetPaymentMethodMappingsQuery,
  useGetProviderSettlementQuery,
  usePostProviderSettlementMutation,
  useUpdateProviderSettlementMutation,
} from '@/store/api/accountingApi'
import { rtkErrorMessage } from '@/utils/errorMessage'
import { getCurrentDate, toMuiDatePickerFormat } from '@/utils/formatters'
import { sumScaledAmounts, toAmountInputValue, toScaledAmount } from '@/utils/currency'
import EligiblePaymentPicker, { type SelectedPayment } from './EligiblePaymentPicker'

const LIST_PATH = '/accounting/provider-settlements'

/** The 409 body nests the conflicting ids under `message` (filter keeps only message). */
interface ConflictBody {
  message?: { text?: string; unavailablePaymentIds?: string[] }
}

interface SettlementFormValues {
  providerPaymentMethodId: string
  bankAccountId: string
  settlementDate: string
  providerReference: string
  settlementAmount: string
}

/** What the form last loaded or saved; the unsaved-changes guard compares against it. */
interface Snapshot {
  form: SettlementFormValues
  paymentIds: string[]
}

/**
 * The selection is compared as a SET. Its order is only the order the rows
 * were ticked in — unticking and re-ticking a row reorders it without changing
 * what would be saved, so a positional compare would report a phantom change.
 */
function sameIdSet(a: string[], b: string[]) {
  if (a.length !== b.length) return false
  const set = new Set(a)
  return b.every((x) => set.has(x))
}

function isSnapshotDirty(snapshot: Snapshot, form: SettlementFormValues, paymentIds: string[]) {
  const keys = Object.keys(form) as (keyof SettlementFormValues)[]
  return keys.some((k) => form[k] !== snapshot.form[k]) || !sameIdSet(paymentIds, snapshot.paymentIds)
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
  const { data: mappings } = useGetPaymentMethodMappingsQuery()
  const { data: accountsPage } = useGetAccountsQuery({})
  const settlementNumberPreview = useDocumentNumberPreview('Provider Settlements', !isEdit)

  const [form, setForm] = useState<SettlementFormValues>(() => ({
    providerPaymentMethodId: '', bankAccountId: '',
    settlementDate: getCurrentDate(), providerReference: '', settlementAmount: '',
  }))
  const [selected, setSelected] = useState<SelectedPayment[]>([])
  // Create starts from the empty form; edit has no baseline until the draft is
  // seeded below, and reads clean until then.
  const [baseline, setBaseline] = useState<Snapshot | null>(() =>
    isEdit ? null : { form, paymentIds: [] },
  )
  const [saveError, setSaveError] = useState<string | null>(null)
  const [pendingProviderChange, setPendingProviderChange] = useState<string | null>(null)
  const [pendingDateChange, setPendingDateChange] = useState<string | null>(null)
  // Covers the WHOLE of save-and-post, including the navigation that follows,
  // so the unsaved-changes guard never interrupts a request it started.
  const [busy, setBusy] = useState<'saving' | 'posting' | null>(null)

  const isDirty = baseline !== null && isSnapshotDirty(baseline, form, selected.map((s) => s.id))
  const { UnsavedChangesDialog } = useUnsavedChangesGuard(isDirty, busy !== null)

  /**
   * Pass the draft's own id ONLY while the selected provider still matches the
   * saved one.
   *
   * The backend rejects a settlementId whose provider differs from the query's
   * (a 400, deliberately — it must never silently widen eligibility to another
   * provider's rows). So after changing Atome → Shopee, sending the Atome draft
   * id would query Shopee eligibility with an Atome settlement and 400. The
   * user could not save the provider change first either, because update
   * requires at least one payment and the picker would be empty. That is a
   * deadlock: the form cannot move forward or back.
   *
   * Omitting the id after a provider change is correct on its own terms — the
   * draft's claims are on the OLD provider's payments, which are not eligible
   * for the new one anyway, and the selection has just been cleared.
   */
  const providerUnchanged =
    isEdit && existing != null && form.providerPaymentMethodId === existing.providerPaymentMethodId
  const eligibilitySettlementId = providerUnchanged ? id : undefined

  // Seed from the existing draft. Selection carries each line's amount, so the
  // totals bar is correct before any eligible-payments page has loaded. The
  // seed is also the new baseline: a refetch after save re-seeds both, so the
  // server's normalized values never read as an unsaved change. Gated on
  // isEdit for the same reason as the clearing account below: a cached
  // settlement must never seed a brand-new form.
  useEffect(() => {
    if (!isEdit || !existing) return
    const seeded: SettlementFormValues = {
      providerPaymentMethodId: existing.providerPaymentMethodId,
      bankAccountId: existing.bankAccountId,
      settlementDate: existing.settlementDate,
      providerReference: existing.providerReference ?? '',
      // An editable input value, not a display string: toAmountInputValue
      // normalizes the scale-4 API string into what the text field shows
      // (currency.ts:96). fromScaledAmount takes a bigint and is wrong here.
      settlementAmount: toAmountInputValue(existing.settlementAmount),
    }
    const lines = (existing.lines ?? []).map((l) => ({ id: l.salesOrderPaymentId, amount: l.amount }))
    setForm(seeded)
    setSelected(lines)
    setBaseline({ form: seeded, paymentIds: lines.map((l) => l.id) })
  }, [isEdit, existing])

  // Only 'mapped' methods. 'unmapped' has no clearing account; 'invalid' points
  // at one that is missing, inactive or non-postable. The server enforces this
  // too — the dropdown is a convenience, not the guard.
  const providers = (mappings ?? []).filter((m) => m.status === 'mapped')
  const bankAccounts = (accountsPage?.data ?? []).filter((a) => a.isActive && a.isPostable)

  // Provider and settlement date both REDEFINE eligibility, so a selection
  // cannot survive either change — confirm, then clear.
  function requestProviderChange(next: string) {
    if (next === form.providerPaymentMethodId) return
    if (selected.length === 0) {
      setForm((f) => ({ ...f, providerPaymentMethodId: next }))
      return
    }
    setPendingProviderChange(next)
  }

  function confirmProviderChange() {
    setForm((f) => ({ ...f, providerPaymentMethodId: pendingProviderChange! }))
    setSelected([])
    setPendingProviderChange(null)
  }

  function requestDateChange(next: string) {
    if (next === form.settlementDate) return
    if (selected.length === 0) {
      setForm((f) => ({ ...f, settlementDate: next }))
      return
    }
    setPendingDateChange(next)
  }

  // bigint minor units. Both helpers return `bigint | null`; a null on either
  // side means the input is unparseable, which must block posting rather than
  // compare as equal.
  const selectedMinor = sumScaledAmounts(selected.map((s) => s.amount))
  const enteredMinor =
    form.settlementAmount.trim() === '' ? null : toScaledAmount(form.settlementAmount)
  const canPost =
    isEdit &&
    selected.length > 0 &&
    selectedMinor !== null &&
    enteredMinor !== null &&
    enteredMinor === selectedMinor

  const [create] = useCreateProviderSettlementMutation()
  const [update] = useUpdateProviderSettlementMutation()
  const [postSettlement] = usePostProviderSettlementMutation()

  async function save(): Promise<string | null> {
    setSaveError(null)
    // The COMPLETE selection every time — PATCH is full replacement, never a
    // delta.
    const body = { ...form, paymentIds: selected.map((s) => s.id) }
    try {
      const saved = isEdit
        ? await update({ id: id!, body }).unwrap()
        : await create(body).unwrap()
      showSuccess(`Settlement ${saved.referenceNumber} saved`)
      // What was sent is now what is stored. Set here rather than waiting for
      // the refetch, so a post that fails after this save leaves the form clean.
      setBaseline({ form: { ...form }, paymentIds: body.paymentIds })
      return saved.id
    } catch (err) {
      const conflict = (err as { data?: ConflictBody })?.data
      const unavailable = conflict?.message?.unavailablePaymentIds
      if (unavailable?.length) {
        // Drop ONLY the rows the server named and keep the rest — that is why
        // the 409 carries the actual conflicting ids. The message is also shown
        // inline, not only through the snackbar, so the reason stays on screen
        // next to the selection it explains.
        setSelected((prev) => prev.filter((sel) => !unavailable.includes(sel.id)))
        const text = conflict?.message?.text ?? 'Some payments are no longer available.'
        setSaveError(text)
        showError(text)
      } else {
        const message = rtkErrorMessage(err, 'Failed to save settlement')
        setSaveError(message)
        showError(message)
      }
      return null
    }
  }

  async function saveDraft() {
    setBusy('saving')
    try {
      const savedId = await save()
      // Create leaves the form, as Owner Equity does, handing the new draft back
      // for the list to highlight. Staying on /create would let a second Save
      // create a duplicate draft. Edit stays put so the draft can be posted.
      if (savedId && !isEdit) {
        navigate(LIST_PATH, { state: { highlightProviderSettlementId: savedId } })
      }
    } finally {
      setBusy(null)
    }
  }

  async function saveAndPost() {
    setBusy('posting')
    try {
      const savedId = await save()
      if (!savedId) return
      try {
        await postSettlement(savedId).unwrap()
        navigate(`${LIST_PATH}/${savedId}/view`)
      } catch (err) {
        showError(rtkErrorMessage(err, 'Failed to post settlement'))
      }
    } finally {
      setBusy(null)
    }
  }

  const handleCancel = () => {
    navigate(isEdit ? `${LIST_PATH}/${id}/view` : LIST_PATH)
  }

  if (isEdit && loadingExisting) {
    return (
      <Box sx={{ display: 'flex', justifyContent: 'center', pt: 10 }}>
        <CircularProgress />
      </Box>
    )
  }

  if (isEdit && (existingLoadFailed || !existing)) {
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

  const isBusy = busy !== null

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
                    <TextField
                      select label="Provider" value={form.providerPaymentMethodId}
                      onChange={(e) => requestProviderChange(e.target.value)}
                      disabled={isBusy}
                      fullWidth size="small"
                    >
                      {providers.map((m) => (
                        <MenuItem key={m.paymentMethodId} value={m.paymentMethodId}>
                          {m.paymentMethodName}
                        </MenuItem>
                      ))}
                    </TextField>
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
                        textField: { fullWidth: true, size: 'small', disabled: isBusy },
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
                      disabled={isBusy}
                      fullWidth size="small"
                    />
                  </Grid>
                  <Grid size={{ xs: 12, md: 6 }}>
                    <TextField
                      select label="Bank Account" value={form.bankAccountId}
                      onChange={(e) => setForm((f) => ({ ...f, bankAccountId: e.target.value }))}
                      disabled={isBusy}
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
                      label="Settlement Amount" value={form.settlementAmount}
                      onChange={(e) => setForm((f) => ({ ...f, settlementAmount: e.target.value }))}
                      disabled={isBusy}
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
                <Typography variant="h6" gutterBottom>Eligible Payments</Typography>
                {form.providerPaymentMethodId ? (
                  <EligiblePaymentPicker
                    providerPaymentMethodId={form.providerPaymentMethodId}
                    settlementDate={form.settlementDate}
                    // Its own claims stay selectable while the provider is
                    // unchanged; omitted when creating, and after a provider
                    // change. See above.
                    settlementId={eligibilitySettlementId}
                    selected={selected}
                    onChange={setSelected}
                    enteredAmount={form.settlementAmount}
                  />
                ) : (
                  <Typography variant="body2" color="text.secondary">
                    Select a provider to see its eligible payments.
                  </Typography>
                )}
              </CardContent>
            </Card>
          </Grid>

          {saveError && (
            <Grid size={12}>
              <Alert severity="error">{saveError}</Alert>
            </Grid>
          )}

          <Grid size={12}>
            <Box sx={{ display: 'flex', gap: 2, justifyContent: 'flex-end' }}>
              <AppButton variant="secondary" onClick={handleCancel} disabled={isBusy}>
                Cancel
              </AppButton>
              <AppButton variant="secondary" onClick={saveDraft} disabled={isBusy}>
                {busy === 'saving' ? 'Saving...' : 'Save Draft'}
              </AppButton>
              <AppButton variant="primary" onClick={saveAndPost} disabled={!canPost || isBusy}>
                {busy === 'posting' ? 'Posting...' : 'Post'}
              </AppButton>
            </Box>
          </Grid>
        </Grid>
      </form>

      <ConfirmationDialog
        open={pendingProviderChange !== null}
        title="Change provider?"
        message="Changing the provider clears the selected payments."
        onConfirm={confirmProviderChange}
        onCancel={() => setPendingProviderChange(null)}
      />
      <ConfirmationDialog
        open={pendingDateChange !== null}
        title="Change settlement date?"
        message="Changing the settlement date clears the selected payments."
        onConfirm={() => {
          setForm((f) => ({ ...f, settlementDate: pendingDateChange! }))
          setSelected([])
          setPendingDateChange(null)
        }}
        onCancel={() => setPendingDateChange(null)}
      />
      {UnsavedChangesDialog}
    </>
  )
}
