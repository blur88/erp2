import { render, screen, waitFor, within } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { LocalizationProvider } from '@mui/x-date-pickers/LocalizationProvider'
import { AdapterDateFns } from '@mui/x-date-pickers/AdapterDateFns'
import { beforeEach, describe, expect, it, vi } from 'vitest'

import PriceListCopyDialog from '../PriceListCopyDialog'

const { mockCopy } = vi.hoisted(() => ({ mockCopy: vi.fn() }))

vi.mock('@/store/api/priceListApi', () => ({
  useCopyPriceListMutation: () => [mockCopy],
}))

vi.mock('@/hooks/useNotification', () => ({
  useNotification: () => ({ showError: vi.fn(), showSuccess: vi.fn() }),
}))

const sourcePriceList = {
  id: 'pl-1',
  code: 'PL1',
  name: 'List',
  description: null,
  effectiveFrom: '2026-05-01',
  effectiveTo: null,
  isDefault: false,
} as never

const renderDialog = () =>
  render(
    <LocalizationProvider dateAdapter={AdapterDateFns}>
      <PriceListCopyDialog
        open
        priceList={sourcePriceList}
        onClose={vi.fn()}
        onSuccess={vi.fn()}
      />
    </LocalizationProvider>,
  )

describe('PriceListCopyDialog effective dates', () => {
  beforeEach(() => {
    mockCopy.mockReturnValue({ unwrap: () => Promise.resolve({}) })
    localStorage.setItem('dateFormat', 'DD/MM/YYYY')
  })

  it('renders Effective From as a picker', async () => {
    renderDialog()
    expect(await screen.findByRole('group', { name: /effective from/i })).toBeInTheDocument()
  })

  it('submits undefined — not null — for a cleared Effective From', async () => {
    renderDialog()
    const fromField = await screen.findByRole('group', { name: /effective from/i })
    const clear = within(fromField).queryByRole('button', { name: /clear/i })
    if (clear) await userEvent.click(clear)

    await userEvent.click(screen.getByRole('button', { name: /copy/i }))
    await waitFor(() => {
      expect(mockCopy).toHaveBeenCalledWith(
        expect.objectContaining({
          priceListId: 'pl-1',
          data: expect.objectContaining({ effectiveFrom: undefined }),
        }),
      )
    })
  })

  it('does not mark Effective From required', async () => {
    renderDialog()
    const fromField = await screen.findByRole('group', { name: /effective from/i })
    expect(fromField).not.toHaveAttribute('aria-required', 'true')
  })
})
