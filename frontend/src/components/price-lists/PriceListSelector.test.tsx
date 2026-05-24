import { render, screen } from '@testing-library/react'
import { describe, expect, it, vi } from 'vitest'

import PriceListSelector from './PriceListSelector'

vi.mock('@/store/api/priceListApi', () => ({
  useGetEffectivePriceListsQuery: () => ({ data: [], isLoading: false }),
  useGetPriceListsQuery: () => ({ data: { data: [] } }),
}))

describe('PriceListSelector', () => {
  it('applies compact size and custom styles to the form control', () => {
    const { container } = render(
      <PriceListSelector
        value=""
        onChange={vi.fn()}
        label="Price List"
        size="small"
        sx={{ marginTop: '8px' }}
      />,
    )

    expect(screen.getByLabelText('Price List').closest('.MuiInputBase-root')).toHaveClass('MuiInputBase-sizeSmall')
    expect(container.firstElementChild).toHaveStyle({ marginTop: '8px' })
  })
})
