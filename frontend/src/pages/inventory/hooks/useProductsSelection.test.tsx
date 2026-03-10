import { renderHook, waitFor } from '@testing-library/react'
import { describe, expect, it, vi } from 'vitest'

import { useProductsSelection } from './useProductsSelection'

import type { Product } from '@/types'

const makeProduct = (id: string, name: string): Product =>
  ({
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
  }) as Product

describe('useProductsSelection', () => {
  it('does not fetch a product when the navigation selection id is missing from the loaded list', async () => {
    const dispatch = vi.fn()
    const navigate = vi.fn()
    const setFocusedProductIndex = vi.fn()
    const setPendingProductId = vi.fn()
    const setHasNavigatedWithSelection = vi.fn()
    const fetchProductById = vi.fn(() => ({ unwrap: vi.fn().mockResolvedValue(makeProduct('missing-id', 'Fetched')) }))
    const refetchProducts = vi.fn()
    const showError = vi.fn()

    renderHook(() =>
      useProductsSelection({
        dispatch: dispatch as never,
        navigate,
        location: {
          pathname: '/inventory/products',
          state: { selectedProductId: 'missing-id' },
        } as never,
        products: [makeProduct('1', 'Alpha'), makeProduct('2', 'Beta')],
        selectedProduct: null,
        focusedProductIndex: -1,
        setFocusedProductIndex,
        selectedCategory: 'all',
        productListRef: { current: null },
      }),
    )

    await waitFor(() => {
      expect(navigate).toHaveBeenCalledWith('/inventory/products', { replace: true, state: {} })
    })

    expect(fetchProductById).not.toHaveBeenCalled()
    expect(refetchProducts).not.toHaveBeenCalled()
    expect(showError).not.toHaveBeenCalled()
  })
})
