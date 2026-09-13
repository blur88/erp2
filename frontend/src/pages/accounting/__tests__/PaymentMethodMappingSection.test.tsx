import '@testing-library/jest-dom/vitest'
import { render, screen, within } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { describe, expect, it } from 'vitest'

import type { Account, PaymentMethodMappingRow } from '@/types'
import PaymentMethodMappingSection from '../PaymentMethodMappingSection'
import { usePaymentMethodMappingDraft } from '../usePaymentMethodMappingDraft'

const rows: PaymentMethodMappingRow[] = [
  {
    paymentMethodId: 'pm-1',
    paymentMethodName: 'Maybank',
    paymentMethodCode: 'MB',
    accountingChannel: 'BANK',
    accountId: 'a-1',
    accountCode: '1210',
    accountName: 'Maybank',
    status: 'mapped',
    invalidReason: null,
  },
  {
    paymentMethodId: 'pm-2',
    paymentMethodName: 'Atome',
    paymentMethodCode: 'ATM',
    accountingChannel: 'BANK',
    accountId: null,
    accountCode: null,
    accountName: null,
    status: 'unmapped',
    invalidReason: null,
  },
  {
    paymentMethodId: 'pm-3',
    paymentMethodName: 'Shopee',
    paymentMethodCode: 'SHP',
    accountingChannel: 'BANK',
    accountId: 'a-3',
    accountCode: '1230',
    accountName: 'Shopee',
    status: 'invalid',
    invalidReason: 'inactive',
  },
]

const account = (id: string, code: string, name: string): Account => ({
  id,
  code,
  name,
  type: 'Asset',
  parentId: null,
  description: null,
  isActive: true,
  createdBy: null,
  isSystem: false,
  isPostable: true,
  openingBalance: '0.0000',
  createdAt: '',
  updatedAt: '',
})

// Active postable options only. a-3 (the invalid mapped account) is
// deliberately absent — it must be injected per-row as a disabled option.
const accounts: Account[] = [
  account('a-1', '1210', 'Maybank'),
  account('cash-1', '1100', 'Cash on Hand'),
]

let draftRef: ReturnType<typeof usePaymentMethodMappingDraft>

function Harness({
  sectionRows = rows,
  sectionAccounts = accounts,
  disabled = false,
}: {
  sectionRows?: PaymentMethodMappingRow[]
  sectionAccounts?: Account[]
  disabled?: boolean
}) {
  const draft = usePaymentMethodMappingDraft()
  draftRef = draft
  return (
    <PaymentMethodMappingSection
      rows={sectionRows}
      accounts={sectionAccounts}
      draft={draft}
      disabled={disabled}
    />
  )
}

function renderSection(opts: {
  sectionRows?: PaymentMethodMappingRow[]
  sectionAccounts?: Account[]
  disabled?: boolean
} = {}) {
  return render(<Harness {...opts} />)
}

describe('PaymentMethodMappingSection', () => {
  it('renders one row per active payment method', () => {
    renderSection()

    expect(within(screen.getByTestId('pm-map-row-pm-1')).getByText('Maybank')).toBeInTheDocument()
    expect(within(screen.getByTestId('pm-map-row-pm-2')).getByText('Atome')).toBeInTheDocument()
    expect(within(screen.getByTestId('pm-map-row-pm-3')).getByText('Shopee')).toBeInTheDocument()
  })

  it('shows the accounting channel read-only', () => {
    renderSection()

    for (const id of ['pm-1', 'pm-2', 'pm-3']) {
      const cell = within(screen.getByTestId(`pm-map-channel-${id}`))
      expect(cell.getByText('BANK')).toBeInTheDocument()
      // The channel is derived, never chosen: there must be no control here.
      expect(cell.queryByRole('combobox')).not.toBeInTheDocument()
      expect(cell.queryByRole('textbox')).not.toBeInTheDocument()
    }
  })

  it('flags an unmapped row', () => {
    renderSection()

    expect(screen.getByTestId('pm-map-unmapped-pm-2')).toHaveTextContent(/channel default/i)
    expect(screen.queryByTestId('pm-map-unmapped-pm-1')).not.toBeInTheDocument()
    expect(screen.queryByTestId('pm-map-unmapped-pm-3')).not.toBeInTheDocument()
  })

  /*
   * The invalid account must stay VISIBLE. A blank select would hide the very
   * misconfiguration the flag points at, and the row would read as unmapped.
   */
  it('flags an invalid row and still shows its mapped account', () => {
    renderSection()

    const row = within(screen.getByTestId('pm-map-row-pm-3'))
    expect(row.getByText(/1230 Shopee/)).toBeInTheDocument()
    expect(row.getByTestId('pm-map-invalid-pm-3')).toHaveTextContent(/inactive/i)
  })

  it('falls back to the raw account id when code and name are absent', () => {
    const missing: PaymentMethodMappingRow[] = [
      {
        ...rows[2],
        accountCode: null,
        accountName: null,
        accountId: 'orphan-id',
        invalidReason: 'missing',
      },
    ]
    renderSection({ sectionRows: missing })

    const row = within(screen.getByTestId('pm-map-row-pm-3'))
    expect(row.getByText('orphan-id')).toBeInTheDocument()
    expect(row.getByTestId('pm-map-invalid-pm-3')).toHaveTextContent(/missing/i)
  })

  it('submits null, not an empty string, when a mapping is cleared', async () => {
    const user = userEvent.setup()
    renderSection()

    await user.click(within(screen.getByTestId('pm-map-select-pm-1')).getByRole('combobox'))
    await user.click(await screen.findByRole('option', { name: /use channel default/i }))

    expect(draftRef.payload).toEqual([{ paymentMethodId: 'pm-1', accountId: null }])
  })

  it('omits untouched methods from the submitted payload', async () => {
    const user = userEvent.setup()
    renderSection()

    await user.click(within(screen.getByTestId('pm-map-select-pm-2')).getByRole('combobox'))
    await user.click(await screen.findByRole('option', { name: /1100 Cash on Hand/i }))

    expect(draftRef.payload).toEqual([{ paymentMethodId: 'pm-2', accountId: 'cash-1' }])
  })
})
