import '@testing-library/jest-dom/vitest'
import { render, screen, within } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { describe, expect, it } from 'vitest'

import BalanceSheetGroupsSection from '../BalanceSheetGroupsSection'
import { useBalanceSheetGroupsDraft } from '../useBalanceSheetGroupsDraft'
import type { Account, BalanceSheetGroupRow } from '@/types'

const account = (id: string, code: string, name: string, type = 'Asset'): Account =>
  ({
    id, code, name, type, parentId: null, description: null, isActive: true,
    createdBy: null, isSystem: false, isPostable: true, openingBalance: '0.0000',
    createdAt: '', updatedAt: '',
  }) as Account

const ACCOUNTS: Account[] = [
  account('cimb', '1200', 'CIMB'),
  account('maybank', '1210', 'Maybank'),
  account('atome', '1240', 'Atome'),
  account('supdep', '1300', 'Supplier Deposits'),
  // Not eligible: the section must filter non-Asset accounts out of its options.
  account('custdep', '2100', 'Customer Deposits', 'Liability'),
]

const groupRow = (
  accountId: string,
  group: BalanceSheetGroupRow['group'],
  over: Partial<BalanceSheetGroupRow> = {},
): BalanceSheetGroupRow => {
  const a = ACCOUNTS.find((x) => x.id === accountId)
  return {
    accountId,
    group,
    accountCode: a?.code ?? null,
    accountName: a?.name ?? null,
    status: 'ok',
    invalidReason: null,
    ...over,
  }
}

/** Renders the section with a REAL draft hook, so staged edits are exercised. */
function Harness({
  rows = [] as BalanceSheetGroupRow[],
  disabled = false,
  onDirty,
}: {
  rows?: BalanceSheetGroupRow[]
  disabled?: boolean
  onDirty?: (dirty: boolean) => void
}) {
  const draft = useBalanceSheetGroupsDraft(rows)
  onDirty?.(draft.isDirty)
  return (
    <BalanceSheetGroupsSection
      accounts={ACCOUNTS}
      rows={rows}
      draft={draft}
      disabled={disabled}
    />
  )
}

const addAccount = async (
  user: ReturnType<typeof userEvent.setup>,
  line: string,
  optionLabel: RegExp,
) => {
  await user.click(within(screen.getByTestId(`bsg-select-${line}`)).getByRole('combobox'))
  await user.click(await screen.findByRole('option', { name: optionLabel }))
  await user.click(screen.getByTestId(`bsg-add-${line}`))
}

describe('BalanceSheetGroupsSection — rendering', () => {
  it('renders both groups with their LHDN line codes', () => {
    render(<Harness />)
    expect(screen.getByTestId('bsg-group-N38')).toBeInTheDocument()
    expect(screen.getByTestId('bsg-group-N39')).toBeInTheDocument()
    expect(screen.getByText(/N38 Bank Balance Accounts/)).toBeInTheDocument()
    expect(screen.getByText(/N39 Other Current Assets Accounts/)).toBeInTheDocument()
  })

  it('states the N39 replacement consequence explicitly', () => {
    /*
     * The agreed wording. Configuring N39 displaces the Supplier Deposit
     * Account, and an operator who does not read that here discovers it as an
     * unmapped balance that disqualifies the Balance Check. The instruction to
     * re-select it is the remedy, so the text must carry BOTH halves.
     */
    render(<Harness />)
    const help = within(screen.getByTestId('bsg-group-N39')).getByText(
      /Configuring this group replaces the Supplier Deposit Account/,
    )
    expect(help).toHaveTextContent('select it here as well to keep it included')
  })

  it('says a group is falling back while it is empty', () => {
    render(<Harness />)
    expect(screen.getByTestId('bsg-empty-N38')).toHaveTextContent(
      /falling back to the default account/,
    )
  })

  it('renders each configured account as its own chip', () => {
    // The acceptance criterion: N38 shows every contributing account.
    render(
      <Harness
        rows={[groupRow('cimb', 'BANK_BALANCE'), groupRow('maybank', 'BANK_BALANCE')]}
      />,
    )
    const members = screen.getByTestId('bsg-members-N38')
    expect(within(members).getByTestId('bsg-chip-cimb')).toHaveTextContent('1200 CIMB')
    expect(within(members).getByTestId('bsg-chip-maybank')).toHaveTextContent('1210 Maybank')
    expect(screen.queryByTestId('bsg-empty-N38')).not.toBeInTheDocument()
  })

  it('flags a grouped account that is no longer eligible', () => {
    render(
      <Harness
        rows={[groupRow('cimb', 'BANK_BALANCE', { status: 'invalid', invalidReason: 'inactive' })]}
      />,
    )
    expect(screen.getByTestId('bsg-chip-cimb')).toHaveTextContent('inactive')
  })

  it('offers only ASSET accounts', async () => {
    const user = userEvent.setup()
    render(<Harness />)
    await user.click(within(screen.getByTestId('bsg-select-N38')).getByRole('combobox'))
    expect(await screen.findByRole('option', { name: /1200 CIMB/ })).toBeInTheDocument()
    // Customer Deposits is a Liability and must not be selectable.
    expect(screen.queryByRole('option', { name: /2100 Customer Deposits/ })).toBeNull()
  })

  it('does not offer an account already in the OTHER group', async () => {
    const user = userEvent.setup()
    render(<Harness rows={[groupRow('atome', 'OTHER_CURRENT_ASSETS')]} />)
    await user.click(within(screen.getByTestId('bsg-select-N38')).getByRole('combobox'))
    // The UI half of the one-group-per-account rule.
    expect(screen.queryByRole('option', { name: /1240 Atome/ })).toBeNull()
  })
})

describe('BalanceSheetGroupsSection — dirty state', () => {
  it('adding an account stages the edit and reports dirty', async () => {
    const user = userEvent.setup()
    const dirty: boolean[] = []
    render(<Harness onDirty={(d) => dirty.push(d)} />)
    expect(dirty.at(-1)).toBe(false)

    await addAccount(user, 'N38', /1200 CIMB/)

    expect(screen.getByTestId('bsg-chip-cimb')).toBeInTheDocument()
    expect(dirty.at(-1)).toBe(true)
  })

  it('an added account is no longer offered in either group', async () => {
    const user = userEvent.setup()
    render(<Harness />)
    await addAccount(user, 'N38', /1200 CIMB/)

    await user.click(within(screen.getByTestId('bsg-select-N39')).getByRole('combobox'))
    expect(screen.queryByRole('option', { name: /1200 CIMB/ })).toBeNull()
  })

  it('the Add button is inert until an account is picked', () => {
    render(<Harness />)
    expect(screen.getByTestId('bsg-add-N38')).toBeDisabled()
  })
})

describe('BalanceSheetGroupsSection — removals', () => {
  it('removing a chip drops it from the group and reports dirty', async () => {
    const user = userEvent.setup()
    const dirty: boolean[] = []
    render(
      <Harness
        rows={[groupRow('cimb', 'BANK_BALANCE'), groupRow('maybank', 'BANK_BALANCE')]}
        onDirty={(d) => dirty.push(d)}
      />,
    )
    expect(dirty.at(-1)).toBe(false)

    await user.click(screen.getByTestId('bsg-remove-cimb'))

    expect(screen.queryByTestId('bsg-chip-cimb')).not.toBeInTheDocument()
    expect(screen.getByTestId('bsg-chip-maybank')).toBeInTheDocument()
    expect(dirty.at(-1)).toBe(true)
  })

  it('removing the LAST member shows the fallback notice again', async () => {
    const user = userEvent.setup()
    render(<Harness rows={[groupRow('cimb', 'BANK_BALANCE')]} />)
    await user.click(screen.getByTestId('bsg-remove-cimb'))
    expect(screen.getByTestId('bsg-empty-N38')).toBeInTheDocument()
  })

  it('a removed account becomes selectable again', async () => {
    const user = userEvent.setup()
    render(<Harness rows={[groupRow('cimb', 'BANK_BALANCE')]} />)
    await user.click(screen.getByTestId('bsg-remove-cimb'))

    await user.click(within(screen.getByTestId('bsg-select-N38')).getByRole('combobox'))
    expect(await screen.findByRole('option', { name: /1200 CIMB/ })).toBeInTheDocument()
  })

  it('a removal that returns to the persisted set reports CLEAN', async () => {
    const user = userEvent.setup()
    const dirty: boolean[] = []
    render(<Harness rows={[groupRow('cimb', 'BANK_BALANCE')]} onDirty={(d) => dirty.push(d)} />)

    await user.click(screen.getByTestId('bsg-remove-cimb'))
    expect(dirty.at(-1)).toBe(true)
    await addAccount(user, 'N38', /1200 CIMB/)
    expect(dirty.at(-1)).toBe(false)
  })
})

describe('BalanceSheetGroupsSection — read-only', () => {
  it('disables both controls and offers no removal when disabled', () => {
    render(<Harness rows={[groupRow('cimb', 'BANK_BALANCE')]} disabled />)
    expect(within(screen.getByTestId('bsg-select-N38')).getByRole('combobox'))
      .toHaveAttribute('aria-disabled', 'true')
    expect(screen.getByTestId('bsg-add-N38')).toBeDisabled()
    // No delete affordance at all, rather than one that silently does nothing.
    expect(screen.queryByTestId('bsg-remove-cimb')).not.toBeInTheDocument()
  })
})
