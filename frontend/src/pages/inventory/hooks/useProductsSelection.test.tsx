import { renderHook, waitFor } from '@testing-library/react'
import { MemoryRouter } from 'react-router-dom'
import { describe, expect, it, vi } from 'vitest'

import { useProductsSelection } from './useProductsSelection'

import type { Product } from '@/types'

const makeProduct = (id: string, name: string): Product =>
  (({
    id,
    name,
    barcode: `SKU-${id}`,
    type: 'Stocked Product',
    baseCost: 10,
    stockQuantity: 5,
    isActive: true,
    isOutOfStock: false,
    createdAt: new Date('2026-03-10T00:00:00.000Z'),
    updatedAt: new Date('2026-03-10T00:00:00.000Z'),
  }) as Product)

function renderSelectionHook(
  initialEntry: string | { pathname: string; state?: { selectedProductId?: string } },
  props: Parameters<typeof useProductsSelection>[0],
) {
  return renderHook(() => useProductsSelection(props), {
    wrapper: ({ children }) => (
      <MemoryRouter initialEntries={[initialEntry]}>{children}</MemoryRouter>
    ),
  })
}

describe('useProductsSelection', () => {
  it('selects and highlights the product when navigation state id matches a loaded product', async () => {
    const dispatch = vi.fn()
    const navigate = vi.fn()
    const setFocusedProductIndex = vi.fn()
    const alpha = makeProduct('1', 'Alpha')
    const beta = makeProduct('2', 'Beta')

    renderSelectionHook(
      {
        pathname: '/inventory/products',
        state: { selectedProductId: '2' },
      },
      {
        dispatch: dispatch as never,
        navigate,
        products: [alpha, beta],
        selectedProduct: null,
        focusedProductIndex: -1,
        setFocusedProductIndex,
        productListRef: { current: null },
      },
    )

    await waitFor(() => {
      expect(navigate).toHaveBeenCalledWith('/inventory/products', { replace: true, state: {} })
    })

    expect(dispatch).toHaveBeenCalledWith(expect.objectContaining({ payload: beta }))
    expect(setFocusedProductIndex).toHaveBeenCalledWith(1)
  })

  it('does not navigate when there is no navigation state', async () => {
    const dispatch = vi.fn()
    const navigate = vi.fn()
    const setFocusedProductIndex = vi.fn()

    renderSelectionHook('/inventory/products', {
      dispatch: dispatch as never,
      navigate,
      products: [makeProduct('1', 'Alpha'), makeProduct('2', 'Beta')],
      selectedProduct: null,
      focusedProductIndex: -1,
      setFocusedProductIndex,
      productListRef: { current: null },
    })

    await new Promise((resolve) => setTimeout(resolve, 100))

    expect(navigate).not.toHaveBeenCalled()
  })

  it('does not navigate or select when the navigation selection id is not in the loaded list', async () => {
    const dispatch = vi.fn()
    const navigate = vi.fn()
    const setFocusedProductIndex = vi.fn()

    renderSelectionHook(
      {
        pathname: '/inventory/products',
        state: { selectedProductId: 'missing-id' },
      },
      {
        dispatch: dispatch as never,
        navigate,
        products: [makeProduct('1', 'Alpha'), makeProduct('2', 'Beta')],
        selectedProduct: null,
        focusedProductIndex: -1,
        setFocusedProductIndex,
        productListRef: { current: null },
      },
    )

    await new Promise((resolve) => setTimeout(resolve, 100))

    expect(navigate).not.toHaveBeenCalled()
    expect(dispatch).not.toHaveBeenCalledWith(
      expect.objectContaining({ payload: expect.objectContaining({ id: 'missing-id' }) }),
    )
  })
})
