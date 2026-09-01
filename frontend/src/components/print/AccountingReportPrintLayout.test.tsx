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

describe('AccountingReportPrintLayout generated timestamp', () => {
  /*
   * The "Generated ..." line used toLocaleString(), i.e. the BROWSER locale, so
   * a printed statutory report could carry a date format the business never
   * configured — and one that differs from every other date in the app.
   */
  it('formats the timestamp per Regional Settings, not the browser locale', () => {
    localStorage.setItem('dateFormat', 'DD/MM/YYYY')
    localStorage.setItem('timeFormat', '24h')
    const { container } = render(<Report />)
    const text = container.textContent ?? ''
    expect(text).toMatch(/Generated \d{2}\/\d{2}\/\d{4} \d{2}:\d{2}/)
  })

  it('follows a changed date format', () => {
    localStorage.setItem('dateFormat', 'YYYY-MM-DD')
    localStorage.setItem('timeFormat', '24h')
    const { container } = render(<Report />)
    expect(container.textContent ?? '').toMatch(/Generated \d{4}-\d{2}-\d{2} \d{2}:\d{2}/)
  })
})

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
