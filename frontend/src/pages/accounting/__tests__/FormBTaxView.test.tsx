import { render, screen } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { MemoryRouter } from 'react-router-dom'
import { describe, it, expect, vi } from 'vitest'
import FormBTaxView from '../FormBTaxView'
import type { FormBResponse } from '@/types'

vi.mock('@/store/api/printSettingsApi', () => ({
  useGetPrintSettingsQuery: () => ({
    data: { id: '1', companyName: 'Acme Sdn Bhd', address: '1 Test Road' },
    isLoading: false,
  }),
}))

const FORM_DEFS: Array<{ line: string; label: string; formula: string | null }> = [
  { line: 'N3', label: 'Sales / Turnover', formula: null },
  { line: 'N4', label: 'Opening Inventory', formula: null },
  { line: 'N5', label: 'Purchases and Production Costs', formula: null },
  { line: 'N6', label: 'Closing Inventory', formula: null },
  { line: 'N7', label: 'Cost of Sales', formula: 'N4 + N5 - N6' },
  { line: 'N8', label: 'Gross Profit / Loss', formula: 'N3 - N7' },
  { line: 'N9', label: 'Other Business', formula: null },
  { line: 'N10', label: 'Dividends', formula: null },
  { line: 'N11', label: 'Interest and Discounts', formula: null },
  { line: 'N12', label: 'Rent, Royalties and Premiums', formula: null },
  { line: 'N13', label: 'Other Income', formula: null },
  { line: 'N14', label: 'Total Other Income', formula: 'N9 to N13' },
  { line: 'N15', label: 'Loan Interest', formula: null },
  { line: 'N16', label: 'Salaries and Wages', formula: null },
  { line: 'N17', label: 'Rent / Lease', formula: null },
  { line: 'N18', label: 'Contract and Subcontract', formula: null },
  { line: 'N19', label: 'Commission', formula: null },
  { line: 'N20', label: 'Bad Debts', formula: null },
  { line: 'N21', label: 'Travel and Transportation', formula: null },
  { line: 'N22', label: 'Repairs and Maintenance', formula: null },
  { line: 'N23', label: 'Promotion and Advertising', formula: null },
  { line: 'N24', label: 'Other Expenses', formula: null },
  { line: 'N25', label: 'Total Expenses', formula: 'N15 to N24' },
  { line: 'N26', label: 'Net Profit / Loss', formula: 'N8 + N14 - N25' },
  { line: 'N27', label: 'Disallowed Expenses', formula: null },
]

const makeRow = (line: string, over: any = {}) => {
  const def = FORM_DEFS.find((d) => d.line === line) ?? { line, label: `Label ${line}`, formula: null }
  return {
    line: def.line,
    label: def.label,
    formula: def.formula,
    amount: '0.0000',
    accounts: [],
    cohorts: null,
    // Mirrors the service: productionCost is present (and null) on N5 only
    // (form-b.service.ts:388). A fixture that omits it cannot exercise the
    // retail annotation.
    ...(def.line === 'N5' ? { productionCost: null } : {}),
    ...(def.line === 'N27' ? { derived: false, status: 'requiresFilerInput' } : {}),
    ...over,
  }
}

const fullResponse = (): FormBResponse => ({
  year: 2025,
  formVersion: 2025,
  availableYears: [2025],
  identity: {
    businessName: { value: 'Acme Sdn Bhd', source: 'companySettings' },
    registrationNumber: { value: '201901234567', source: 'companySettings' },
  },
  rows: FORM_DEFS.map((def) => makeRow(def.line)) as any,
  reconciliation: {
    n7: '0.0000',
    accountingTotalCostOfSales: '0.0000',
    inventoryAdjustments: '0.0000',
    ownerStockDrawings: '0.0000',
    residual: '0.0000',
  },
  findings: [],
  readiness: { hasWarnings: false, hasIncomplete: false, hasIntegrity: false, counts: { warning: 0, incomplete: 0, integrity: 0 } },
})

const responseWith = (over: any): FormBResponse => {
  const base = fullResponse()
  const idx = base.rows.findIndex((r: any) => r.line === over.line)
  if (idx >= 0) {
    base.rows[idx] = { ...base.rows[idx], ...over } as any
  } else {
    base.rows.push(makeRow(over.line, over) as any)
  }
  return base
}

const responseWithFinding = (finding: any): FormBResponse => {
  const base = fullResponse()
  const severity = finding.severity
  base.findings = [finding as any]
  base.readiness = {
    hasWarnings: severity === 'warning',
    hasIncomplete: severity === 'incomplete',
    hasIntegrity: severity === 'integrity',
    counts: {
      warning: severity === 'warning' ? 1 : 0,
      incomplete: severity === 'incomplete' ? 1 : 0,
      integrity: severity === 'integrity' ? 1 : 0,
    },
  }
  return base
}

const responseWithIdentity = (over: any): FormBResponse => {
  const base = fullResponse()
  base.identity = {
    ...base.identity,
    ...over,
  } as any
  // Also merge nested fields if over provides partial
  for (const key of Object.keys(over)) {
    base.identity[key as keyof typeof base.identity] = {
      ...(base.identity[key as keyof typeof base.identity] as any),
      ...(over[key] as any),
    } as any
  }
  return base
}

const responseWithReconciliation = (over: any): FormBResponse => {
  const base = fullResponse()
  base.reconciliation = { ...base.reconciliation, ...over }
  return base
}

const responseWithCohort = (): FormBResponse => {
  const base = fullResponse()
  const contributor = {
    accountId: 'a1',
    code: '6990',
    name: 'Sundry',
    isActive: true,
    category: null,
    assignment: 'fallback' as const,
    amount: '5.0000',
  }
  const idx = base.rows.findIndex((r: any) => r.line === 'N24')
  if (idx >= 0) {
    base.rows[idx] = {
      ...base.rows[idx],
      accounts: [contributor],
      cohorts: { explicit: [], fallback: [contributor] },
    } as any
  }
  return base
}

const renderTaxView = (data: FormBResponse, opts?: { onOpenLedger?: any }) => {
  const onOpenLedger = opts?.onOpenLedger ?? vi.fn()
  return render(
    <MemoryRouter>
      <FormBTaxView data={data} year={data.year} isLoading={false} isError={false} onOpenLedger={onOpenLedger} />
    </MemoryRouter>,
  )
}

describe('FormBTaxView — loading transition', () => {
  /*
   * The defect this pins: early returns placed ABOVE useMemo/useCallback in one
   * component change the hook count between the loading render and the first
   * render with data, and React throws "Rendered more hooks than during the
   * previous render".
   *
   * It is invisible to every test that mocks a settled query, because those
   * never render the loading state. This test must render loading FIRST and
   * then rerender with data on the SAME element tree.
   *
   * Note React 19: rerender() with the same element reference no-ops, so fresh
   * JSX is inlined on each call.
   */
  it('survives the loading -> loaded transition without a hook-count error', () => {
    const onOpenLedger = vi.fn()
    const { rerender } = render(
      <MemoryRouter>
        <FormBTaxView data={undefined} year={2025} isLoading isError={false} onOpenLedger={onOpenLedger} />
      </MemoryRouter>,
    )
    expect(screen.getByTestId('formb-loading')).toBeInTheDocument()

    expect(() =>
      rerender(
        <MemoryRouter>
          <FormBTaxView data={fullResponse()} year={2025} isLoading={false} isError={false} onOpenLedger={onOpenLedger} />
        </MemoryRouter>,
      ),
    ).not.toThrow()

    expect(screen.getByTestId('formb-line-N3')).toBeInTheDocument()
  })

  it('survives the loading -> error transition', () => {
    const onOpenLedger = vi.fn()
    const { rerender } = render(
      <MemoryRouter>
        <FormBTaxView data={undefined} year={2025} isLoading isError={false} onOpenLedger={onOpenLedger} />
      </MemoryRouter>,
    )
    expect(() =>
      rerender(
        <MemoryRouter>
          <FormBTaxView data={undefined} year={2025} isLoading={false} isError onOpenLedger={onOpenLedger} />
        </MemoryRouter>,
      ),
    ).not.toThrow()
  })
})

describe('FormBTaxView', () => {
  it('renders every statutory line including zero rows', () => {
    renderTaxView(fullResponse())
    for (let n = 3; n <= 27; n++) {
      expect(screen.getByTestId(`formb-line-N${n}`)).toBeInTheDocument()
    }
  })

  it('renders a null amount as an em dash, distinct from 0.00', () => {
    renderTaxView(responseWith({ line: 'N7', amount: null }))
    expect(screen.getByTestId('formb-line-N7')).toHaveTextContent('—')
  })

  it('shows the formula caption on derived lines', () => {
    renderTaxView(fullResponse())
    expect(screen.getByTestId('formb-line-N7')).toHaveTextContent('N4 + N5 - N6')
  })

  // The period line moved to the shell (ProfitAndLossPage owns the single
  // AccountingReportPrintLayout), so the mismatch header is asserted there —
  // see ProfitAndLossPage.test.tsx 'derives the print period'.

  // Spec §5.1: production cost is never computed, stored, or defaulted to zero.
  // The annotation is what stops a reader inferring it was measured as nil.
  /*
   * N27 can never be resolved — it has no ledger source — so counting it makes
   * the summary permanently non-zero and trains people to ignore it.
   */
  it('excludes the permanent N27 finding from the readiness count', () => {
    renderTaxView(responseWithFinding({
      code: 'DISALLOWED_EXPENSES_UNDETERMINED', severity: 'incomplete',
      message: 'N27 requires filer input', accounts: [], settingKey: null,
    }))
    // The count and the N27 note must be SEPARATE elements: rendered together
    // the note reads as the item being counted.
    const summary = screen.getByTestId('formb-readiness')
    expect(summary).toHaveTextContent(/No issues detected by these checks/i)
    expect(summary).not.toHaveTextContent(/N27/i)
    expect(screen.getByTestId('formb-standing-note'))
      .toHaveTextContent(/Always required, not counted above/i)
  })

  it('counts only actionable findings alongside the permanent one', () => {
    const base = fullResponse()
    base.findings = [
      { code: 'DISALLOWED_EXPENSES_UNDETERMINED', severity: 'incomplete',
        message: 'N27 requires filer input', accounts: [], settingKey: null },
      { code: 'MISSING_BUSINESS_IDENTITY', severity: 'incomplete',
        message: 'Business information is incomplete', accounts: [], settingKey: 'companySettings' },
    ] as any
    renderTaxView(base)
    expect(screen.getByTestId('formb-readiness'))
      .toHaveTextContent(/1 item below needs attention/i)
    // The count refers to the findings list, never to the standing N27 note.
    expect(screen.getByTestId('formb-readiness')).not.toHaveTextContent(/N27/i)
  })

  // The finding itself must still be shown — the filer has to supply the figure.
  it('still lists the N27 finding even though it is not counted', () => {
    renderTaxView(responseWithFinding({
      code: 'DISALLOWED_EXPENSES_UNDETERMINED', severity: 'incomplete',
      message: 'N27 requires filer input', accounts: [], settingKey: null,
    }))
    expect(screen.getByText('N27 requires filer input')).toBeInTheDocument()
  })

  it('renders the retail production-cost annotation on N5 only', () => {
    renderTaxView(fullResponse())
    expect(screen.getByTestId('formb-annotation-N5'))
      .toHaveTextContent('Production cost: N/A — retail business')
    expect(screen.queryByTestId('formb-annotation-N7')).not.toBeInTheDocument()
  })

  it('renders warnings with their severity', () => {
    renderTaxView(
      responseWithFinding({
        code: 'UNMAPPED_EXPENSE_ACCOUNTS',
        severity: 'warning',
        message: '2 expense account(s) have no Form B category',
        accounts: [],
        settingKey: null,
      }),
    )
    expect(screen.getByText(/2 expense account\(s\)/)).toBeInTheDocument()
  })

  // Every code in the contract must reach the screen. A code the UI silently
  // drops is a finding the filer never sees.
  it.each([
    'UNMAPPED_EXPENSE_ACCOUNTS',
    'UNMAPPED_INCOME_ACCOUNTS',
    'MISSING_BUSINESS_IDENTITY',
    'DISALLOWED_EXPENSES_UNDETERMINED',
    'FORM_VERSION_MISMATCH',
    'MISSING_CONFIGURED_ROOT',
    'INVALID_CONFIGURED_ROOT',
    'MAPPED_ACCOUNT_INELIGIBLE',
    'UNEXPLAINED_INVENTORY_RESIDUAL',
    'ACCOUNTING_VIEW_TIE_OUT_FAILED',
    'ACCOUNTING_VIEW_ANOMALIES',
    'ACCOUNTING_VIEW_STRUCTURAL_FAULTS',
  ])('renders finding code %s', (code) => {
    renderTaxView(
      responseWithFinding({
        code: code as any,
        severity: 'integrity',
        message: `message for ${code}`,
        accounts: [],
        settingKey: null,
      }),
    )
    expect(screen.getByText(`message for ${code}`)).toBeInTheDocument()
  })

  it('renders the readiness summary without claiming correctness', () => {
    renderTaxView(fullResponse())
    const summary = screen.getByTestId('formb-readiness')
    expect(summary.textContent).not.toMatch(/correct/i)
  })

  // Identity now has one source (Company Settings), so there is no fallback
  // label to render; an unset value reads as "Not set in Company Settings".
  it('names Company Settings when an identity field is unset', () => {
    renderTaxView(responseWithIdentity({
      registrationNumber: { value: null, source: null },
    }))
    expect(screen.getByText(/Not set in Company Settings/i)).toBeInTheDocument()
  })

  it('renders the reconciliation panel with surviving terms when one is null', () => {
    renderTaxView(
      responseWithReconciliation({
        n7: '10.0000',
        accountingTotalCostOfSales: null,
        inventoryAdjustments: '1.0000',
        ownerStockDrawings: '2.0000',
        residual: null,
      }),
    )
    const panel = screen.getByTestId('formb-reconciliation')
    expect(panel).toHaveTextContent('10.0000')
    expect(panel).toHaveTextContent('1.0000')
    expect(panel).toHaveTextContent('—')
  })

  it('drills a cohort account through to the general ledger', async () => {
    const user = userEvent.setup()
    const onOpenLedger = vi.fn()
    renderTaxView(responseWithCohort(), { onOpenLedger })
    await user.click(screen.getByTestId('formb-line-N24'))
    await user.click(screen.getByTestId('formb-cohort-N24-0'))
    expect(onOpenLedger).toHaveBeenCalledWith('a1', 2025)
  })

  it('gives expansion controls the print-control class so they do not print', () => {
    renderTaxView(responseWithCohort())
    expect(screen.getByTestId('formb-line-N24').querySelector('.acct-print-control')).toBeInTheDocument()
  })
})
