import { render, screen, waitFor, within } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { LocalizationProvider } from '@mui/x-date-pickers/LocalizationProvider'
import { AdapterDateFns } from '@mui/x-date-pickers/AdapterDateFns'
import { beforeEach, describe, expect, it, vi } from 'vitest'

import PriceListFormDialog from '../PriceListFormDialog'

const { mockCreate, mockUpdate } = vi.hoisted(() => ({
  mockCreate: vi.fn(),
  mockUpdate: vi.fn(),
}))

vi.mock('@/store/api/priceListApi', () => ({
  useCreatePriceListMutation: () => [mockCreate],
  useUpdatePriceListMutation: () => [mockUpdate],
}))

vi.mock('@/hooks/useNotification', () => ({
  useNotification: () => ({ showError: vi.fn(), showSuccess: vi.fn() }),
}))

const existingPriceList = {
  id: 'pl-1',
  code: 'PL1',
  name: 'List',
  description: null,
  effectiveFrom: '2026-05-01',
  effectiveTo: null,
  isDefault: false,
} as never

const renderDialog = (priceList: unknown = null) =>
  render(
    <LocalizationProvider dateAdapter={AdapterDateFns}>
      <PriceListFormDialog
        open
        priceList={priceList as never}
        onClose={vi.fn()}
        onSuccess={vi.fn()}
      />
    </LocalizationProvider>,
  )

describe('PriceListFormDialog effective dates', () => {
  beforeEach(() => {
    mockCreate.mockReturnValue({ unwrap: () => Promise.resolve({}) })
    mockUpdate.mockReturnValue({ unwrap: () => Promise.resolve({}) })
    localStorage.setItem('dateFormat', 'DD/MM/YYYY')
  })

  it('renders Effective From as a picker showing the stored value', async () => {
    renderDialog(existingPriceList)
    await waitFor(() => {
      expect(screen.getByRole('group', { name: /effective from/i })).toHaveTextContent('01/05/2026')
    })
  })

  it('treats Effective From as optional — clearable, and submits null when empty', async () => {
    renderDialog(existingPriceList)
    const fromField = await screen.findByRole('group', { name: /effective from/i })
    await userEvent.click(within(fromField).getByRole('button', { name: /clear/i }))

    await userEvent.click(screen.getByRole('button', { name: /update|save/i }))
    await waitFor(() => {
      expect(mockUpdate).toHaveBeenCalledWith(
        expect.objectContaining({
          data: expect.objectContaining({ effectiveFrom: null }),
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
