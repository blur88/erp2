import '@testing-library/jest-dom/vitest'
import { render } from '@testing-library/react'
import { describe, expect, it, vi } from 'vitest'

vi.mock('@/store/api/printSettingsApi', () => ({
  useGetPrintSettingsQuery: () => ({ data: { companyName: 'Acme Sdn Bhd' }, isLoading: false }),
}))

import { AccountingReportPrintLayout } from './AccountingReportPrintLayout'

const Report = () => (
  <AccountingReportPrintLayout title="TEST" period="Year 2026">
    <div>body</div>
  </AccountingReportPrintLayout>
)

describe('AccountingReportPrintLayout print mode', () => {
  it('marks the body while mounted and clears it on unmount', () => {
    const { unmount } = render(<Report />)
    expect(document.body).toHaveClass('acct-print-mode')
    unmount()
    expect(document.body).not.toHaveClass('acct-print-mode')
  })

  it('keeps the mark while any owner is still mounted', () => {
    // The class belongs to the document, not to one instance. A plain
    // add/remove pair lets the first unmount strip it while a sibling still
    // needs it — and the failure is invisible until someone prints.
    const first = render(<Report />)
    const second = render(<Report />)
    expect(document.body).toHaveClass('acct-print-mode')

    first.unmount()
    expect(document.body).toHaveClass('acct-print-mode')

    second.unmount()
    expect(document.body).not.toHaveClass('acct-print-mode')
  })
})
