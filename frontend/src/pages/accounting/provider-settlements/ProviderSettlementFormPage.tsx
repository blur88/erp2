import { useEffect, useState } from 'react'
import { Alert, Box, MenuItem, TextField } from '@mui/material'
import { useNavigate, useParams } from 'react-router-dom'

import { AppButton } from '@/components/common/AppButton'
import ConfirmationDialog from '@/components/common/ConfirmationDialog'
import { useNotification } from '@/hooks/useNotification'
import {
  useCreateProviderSettlementMutation,
  useGetAccountsQuery,
  useGetPaymentMethodMappingsQuery,
  useGetProviderSettlementQuery,
  usePostProviderSettlementMutation,
  useUpdateProviderSettlementMutation,
} from '@/store/api/accountingApi'
import { rtkErrorMessage } from '@/utils/errorMessage'
import { getCurrentDate } from '@/utils/formatters'
import { sumScaledAmounts, toAmountInputValue, toScaledAmount } from '@/utils/currency'
import EligiblePaymentPicker, { type SelectedPayment } from './EligiblePaymentPicker'

/** The 409 body nests the conflicting ids under `message` (filter keeps only message). */
interface ConflictBody {
  message?: { text?: string; unavailablePaymentIds?: string[] }
}

export default function ProviderSettlementFormPage() {
  const { id } = useParams<{ id: string }>()
  const navigate = useNavigate()
  const { showSuccess, showError } = useNotification()
  const isEdit = Boolean(id)

  const { data: existing } = useGetProviderSettlementQuery(id!, { skip: !isEdit })
  const { data: mappings } = useGetPaymentMethodMappingsQuery()
  const { data: accountsPage } = useGetAccountsQuery({})

  const [form, setForm] = useState({
    providerPaymentMethodId: '', bankAccountId: '',
    settlementDate: getCurrentDate(), providerReference: '', settlementAmount: '',
  })
  const [selected, setSelected] = useState<SelectedPayment[]>([])
  const [saveError, setSaveError] = useState<string | null>(null)
  const [pendingProviderChange, setPendingProviderChange] = useState<string | null>(null)
  const [pendingDateChange, setPendingDateChange] = useState<string | null>(null)

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
  // totals bar is correct before any eligible-payments page has loaded.
  useEffect(() => {
    if (!existing) return
    setForm({
      providerPaymentMethodId: existing.providerPaymentMethodId,
      bankAccountId: existing.bankAccountId,
      settlementDate: existing.settlementDate,
      providerReference: existing.providerReference ?? '',
      // An editable input value, not a display string: toAmountInputValue
      // normalizes the scale-4 API string into what the text field shows
      // (currency.ts:96). fromScaledAmount takes a bigint and is wrong here.
      settlementAmount: toAmountInputValue(existing.settlementAmount),
    })
    setSelected((existing.lines ?? []).map((l) => ({ id: l.salesOrderPaymentId, amount: l.amount })))
  }, [existing])

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

  async function saveAndPost() {
    const savedId = await save()
    if (!savedId) return
    try {
      await postSettlement(savedId).unwrap()
      navigate(`/accounting/provider-settlements/${savedId}/view`)
    } catch (err) {
      showError(rtkErrorMessage(err, 'Failed to post settlement'))
    }
  }

  return (
    <Box sx={{ p: 3, maxWidth: 720 }}>
      {saveError && (
        <Alert severity="error" sx={{ mb: 2 }}>
          {saveError}
        </Alert>
      )}

      <TextField
        select label="Provider" value={form.providerPaymentMethodId}
        onChange={(e) => requestProviderChange(e.target.value)}
        fullWidth sx={{ mb: 2 }}
      >
        {providers.map((m) => (
          <MenuItem key={m.paymentMethodId} value={m.paymentMethodId}>
            {m.paymentMethodName}
          </MenuItem>
        ))}
      </TextField>

      <TextField
        type="date" label="Settlement Date" value={form.settlementDate}
        slotProps={{ inputLabel: { shrink: true } }}
        onChange={(e) =>
          selected.length === 0
            ? setForm((f) => ({ ...f, settlementDate: e.target.value }))
            : setPendingDateChange(e.target.value)
        }
        fullWidth sx={{ mb: 2 }}
      />

      <TextField
        select label="Bank Account" value={form.bankAccountId}
        onChange={(e) => setForm((f) => ({ ...f, bankAccountId: e.target.value }))}
        fullWidth sx={{ mb: 2 }}
      >
        {bankAccounts.map((a) => (
          <MenuItem key={a.id} value={a.id}>{`${a.code} ${a.name}`}</MenuItem>
        ))}
      </TextField>

      <TextField
        label="Settlement Amount" value={form.settlementAmount}
        onChange={(e) => setForm((f) => ({ ...f, settlementAmount: e.target.value }))}
        fullWidth sx={{ mb: 2 }}
      />
      <TextField
        label="Provider Reference" value={form.providerReference}
        slotProps={{ htmlInput: { maxLength: 200 } }}
        onChange={(e) => setForm((f) => ({ ...f, providerReference: e.target.value }))}
        fullWidth sx={{ mb: 2 }}
      />

      {form.providerPaymentMethodId && (
        <EligiblePaymentPicker
          providerPaymentMethodId={form.providerPaymentMethodId}
          settlementDate={form.settlementDate}
          // Its own claims stay selectable while the provider is unchanged;
          // omitted when creating, and after a provider change. See above.
          settlementId={eligibilitySettlementId}
          selected={selected}
          onChange={setSelected}
          enteredAmount={form.settlementAmount}
        />
      )}

      <Box sx={{ mt: 2, display: 'flex', gap: 2 }}>
        <AppButton variant="secondary" onClick={save}>Save</AppButton>
        <AppButton variant="primary" onClick={saveAndPost} disabled={!canPost}>Post</AppButton>
      </Box>

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
    </Box>
  )
}
