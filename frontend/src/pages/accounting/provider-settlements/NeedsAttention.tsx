import { Alert, Box, Stack, Typography } from '@mui/material'

import { AppButton } from '@/components/common/AppButton'
import { fromScaledAmount, toScaledAmount } from '@/utils/currency'
import { formatCurrency } from '@/utils/formatters'

export interface AttentionGroup {
  key: string
  salesOrderId: string
  paymentMethodId: string
  orderNumber: string
  paymentMethodName: string
  savedNetAmount: string | null // null for groups never saved
  currentNetAmount: string | null // null ⇒ ineligible
  reason: string // 'Payments changed' | 'Refund added' | 'now RM0.00 — remove' | 'payments no longer eligible — remove'
  refreshed: boolean // Accept current enabled only when true
}

const ZERO_REASON = 'now RM0.00 — remove'
const INELIGIBLE_REASON = 'payments no longer eligible — remove'

/** Scale-4 API amount → display money; null renders as an em dash, never 0. */
function money(value: string | null): string {
  const units = toScaledAmount(value)
  return units === null ? '—' : formatCurrency(fromScaledAmount(units))
}

function attentionText(g: AttentionGroup): string {
  const lead = `${g.orderNumber} · ${g.paymentMethodName} — `
  if (g.reason === ZERO_REASON) return `${lead}${g.reason}`
  if (g.currentNetAmount === null) return `${lead}${INELIGIBLE_REASON}`
  const saved = g.savedNetAmount === null ? '' : `saved ${money(g.savedNetAmount)}, `
  return `${lead}${saved}now ${money(g.currentNetAmount)}. ${g.reason}`
}

/**
 * Claimed groups that changed since the draft was saved and so cannot be
 * carried over silently. Each can only be removed (dropping it from the
 * settlement) or, once the current values have been refreshed, accepted at
 * their new net. Until every group is resolved the form refuses to save.
 */
export default function NeedsAttention({ groups, onRemove, onAccept }: {
  groups: AttentionGroup[]
  onRemove: (key: string) => void
  onAccept: (key: string) => void
}) {
  if (groups.length === 0) return null
  return (
    <Alert severity="warning" data-testid="needs-attention" sx={{ mb: 2 }}>
      <Typography variant="subtitle2" gutterBottom>Needs attention</Typography>
      <Stack spacing={1}>
        {groups.map((g) => {
          const acceptable = g.currentNetAmount !== null && g.reason !== ZERO_REASON
          return (
            <Box
              key={g.key}
              data-testid="attention-row"
              sx={{ display: 'flex', gap: 2, alignItems: 'center', flexWrap: 'wrap' }}
            >
              <Typography variant="body2" sx={{ flex: 1 }}>{attentionText(g)}</Typography>
              {acceptable && (
                <AppButton
                  variant="secondary"
                  size="small"
                  disabled={!g.refreshed}
                  onClick={() => onAccept(g.key)}
                >
                  Accept current
                </AppButton>
              )}
              <AppButton variant="secondary" size="small" onClick={() => onRemove(g.key)}>
                Remove
              </AppButton>
            </Box>
          )
        })}
      </Stack>
    </Alert>
  )
}
