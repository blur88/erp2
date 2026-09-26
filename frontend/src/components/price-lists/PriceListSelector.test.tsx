import { configureStore } from '@reduxjs/toolkit'
import { render, screen, waitFor } from '@testing-library/react'
import type { ReactElement } from 'react'
import { Provider } from 'react-redux'
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'

import api from '@/services/api'
import { priceListApiSlice } from '@/store/api/priceListApi'

import PriceListSelector from './PriceListSelector'

// Only the Axios transport is mocked: the real priceListApi slice and
// axiosBaseQuery run, so a request the server would reject fails here too.
vi.mock('@/services/api', () => ({
  default: vi.fn(),
}))

const RETAIL = { id: 'pl-retail', code: 'RETAIL', name: 'Retail', isDefault: true, isActive: true }
const SHOPEE = { id: 'pl-shopee', code: 'SHOPEE', name: 'Shopee', isDefault: false, isActive: true }

// Mirrors QueryPriceListsDto's @Max(100) on `limit` (#1302).
function serveLikeBackend() {
  vi.mocked(api).mockImplementation(async (config: any) => {
    if (config.url === '/price-lists/effective') {
      return { data: [RETAIL, SHOPEE] }
    }
    if (config.url === '/price-lists') {
      if (config.params?.limit !== undefined && Number(config.params.limit) > 100) {
        throw Object.assign(new Error('Request failed with status code 400'), {
          response: {
            status: 400,
            data: { message: 'Validation failed: limit must not be greater than 100' },
          },
        })
      }
      return { data: { data: [RETAIL, SHOPEE], meta: { total: 2 } } }
    }
    throw new Error(`Unexpected request: ${config.url}`)
  })
}

// A fresh store per render so no cached response can mask a failed request.
function renderWithStore(ui: ReactElement) {
  const store = configureStore({
    reducer: { [priceListApiSlice.reducerPath]: priceListApiSlice.reducer },
    middleware: (getDefaultMiddleware) => getDefaultMiddleware().concat(priceListApiSlice.middleware),
  })
  return render(<Provider store={store}>{ui}</Provider>)
}

describe('PriceListSelector', () => {
  beforeEach(() => {
    serveLikeBackend()
  })

  afterEach(() => {
    vi.clearAllMocks()
  })

  it('applies compact size and custom styles to the form control', () => {
    const { container } = renderWithStore(
      <PriceListSelector
        value="pl-retail"
        onChange={vi.fn()}
        label="Price List"
        size="small"
        sx={{ marginTop: '8px' }}
      />,
    )

    expect(screen.getByLabelText('Price List').closest('.MuiInputBase-root')).toHaveClass('MuiInputBase-sizeSmall')
    expect(container.firstElementChild).toHaveStyle({ marginTop: '8px' })
  })

  it('preselects the default price list when no value is set', async () => {
    const onChange = vi.fn()
    renderWithStore(<PriceListSelector value="" onChange={onChange} />)

    await waitFor(() => expect(onChange).toHaveBeenCalledWith('pl-retail'))
  })

  it('requests price lists without pagination so the full set comes back', async () => {
    renderWithStore(<PriceListSelector value="" onChange={vi.fn()} />)

    await waitFor(() =>
      expect(api).toHaveBeenCalledWith(expect.objectContaining({ url: '/price-lists' })),
    )
    const listCall = vi.mocked(api).mock.calls.find(([config]: any) => config.url === '/price-lists')
    expect((listCall![0] as any).params).not.toHaveProperty('limit')
    expect((listCall![0] as any).params).not.toHaveProperty('page')
  })
})
