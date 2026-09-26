import { configureStore } from '@reduxjs/toolkit'
import { render, screen, waitFor } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import type { ReactElement } from 'react'
import { Provider } from 'react-redux'
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'

import api from '@/services/api'
import { priceListApiSlice } from '@/store/api/priceListApi'

import { FilterPriceList } from '../FilterPriceList'

// Only the Axios transport is mocked: the real priceListApi slice and
// axiosBaseQuery run, so a request the server would reject fails here too.
vi.mock('@/services/api', () => ({
  default: vi.fn(),
}))

const RETAIL = { id: 'pl1', code: 'RETAIL', name: 'Retail', isDefault: true, isActive: true }
const WHOLESALE = { id: 'pl2', code: 'WHOLESALE', name: 'Wholesale', isDefault: false, isActive: true }

// Mirrors QueryPriceListsDto's @Max(100) on `limit` (#1302).
function serveLikeBackend() {
  vi.mocked(api).mockImplementation(async (config: any) => {
    if (config.url === '/price-lists') {
      if (config.params?.limit !== undefined && Number(config.params.limit) > 100) {
        throw Object.assign(new Error('Request failed with status code 400'), {
          response: {
            status: 400,
            data: { message: 'Validation failed: limit must not be greater than 100' },
          },
        })
      }
      return { data: { data: [RETAIL, WHOLESALE], meta: { total: 2 } } }
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

describe('FilterPriceList', () => {
  beforeEach(() => {
    serveLikeBackend()
  })

  afterEach(() => {
    vi.clearAllMocks()
  })

  it('renders with Price List label', () => {
    renderWithStore(<FilterPriceList field="priceListId" value={null} onChange={vi.fn()} />)
    expect(screen.getByLabelText(/price list/i)).toBeInTheDocument()
  })

  it('shows price list names as options', async () => {
    renderWithStore(<FilterPriceList field="priceListId" value={null} onChange={vi.fn()} />)
    await userEvent.click(screen.getByRole('combobox'))
    expect(await screen.findByText('Retail')).toBeInTheDocument()
    expect(await screen.findByText('Wholesale')).toBeInTheDocument()
  })

  it('queries only active price lists, without pagination', async () => {
    renderWithStore(<FilterPriceList field="priceListId" value={null} onChange={vi.fn()} />)
    await waitFor(() => expect(api).toHaveBeenCalled())
    expect((vi.mocked(api).mock.calls[0][0] as any).params).toEqual({ isActive: true })
  })
})
