import { createSlice, createAsyncThunk, PayloadAction } from '@reduxjs/toolkit'
import type { PriceList, PriceListItem } from '@/types'
import { priceListApi, type BulkUpdatePriceDto, type CopyPriceListDto, type PercentageAdjustmentDto } from '@/services/priceListApi'

interface PriceListState {
  priceLists: PriceList[]
  selectedPriceList: PriceList | null
  priceListItems: PriceListItem[]
  effectivePriceLists: PriceList[]
  defaultPriceList: PriceList | null
  loading: {
    priceLists: boolean
    priceListItems: boolean
    effectivePriceLists: boolean
    defaultPriceList: boolean
  }
  error: string | null
  pagination: {
    page: number
    limit: number
    total: number
    totalPages: number
  }
  filters: {
    search: string
    isActive?: boolean
  }
}

const initialState: PriceListState = {
  priceLists: [],
  selectedPriceList: null,
  priceListItems: [],
  effectivePriceLists: [],
  defaultPriceList: null,
  loading: {
    priceLists: false,
    priceListItems: false,
    effectivePriceLists: false,
    defaultPriceList: false,
  },
  error: null,
  pagination: {
    page: 1,
    limit: 20,
    total: 0,
    totalPages: 0,
  },
  filters: {
    search: '',
    isActive: true,
  },
}

// Async thunks
export const fetchPriceLists = createAsyncThunk(
  'priceLists/fetchAll',
  async (params?: any) => {
    return await priceListApi.getPriceLists(params)
  }
)

export const fetchPriceListById = createAsyncThunk(
  'priceLists/fetchById',
  async (id: string) => {
    return await priceListApi.getPriceList(id)
  }
)

export const createPriceList = createAsyncThunk(
  'priceLists/create',
  async (data: Partial<PriceList>) => {
    return await priceListApi.createPriceList(data)
  }
)

export const updatePriceList = createAsyncThunk(
  'priceLists/update',
  async ({ id, data }: { id: string; data: Partial<PriceList> }) => {
    return await priceListApi.updatePriceList(id, data)
  }
)

export const deletePriceList = createAsyncThunk(
  'priceLists/delete',
  async (id: string) => {
    await priceListApi.deletePriceList(id)
    return id
  }
)

export const setDefaultPriceList = createAsyncThunk(
  'priceLists/setDefault',
  async (id: string) => {
    return await priceListApi.setDefaultPriceList(id)
  }
)

export const fetchEffectivePriceLists = createAsyncThunk(
  'priceLists/fetchEffective',
  async () => {
    return await priceListApi.getEffectivePriceLists()
  }
)

export const fetchPriceListItems = createAsyncThunk(
  'priceLists/fetchItems',
  async (priceListId: string) => {
    return await priceListApi.getPriceListItems(priceListId)
  }
)

export const bulkUpdatePrices = createAsyncThunk(
  'priceLists/bulkUpdatePrices',
  async ({ priceListId, items }: { priceListId: string; items: BulkUpdatePriceDto[] }) => {
    return await priceListApi.bulkUpdatePrices(priceListId, items)
  }
)

export const copyPriceList = createAsyncThunk(
  'priceLists/copy',
  async ({ priceListId, data }: { priceListId: string; data: CopyPriceListDto }) => {
    return await priceListApi.copyPriceList(priceListId, data)
  }
)

export const applyPercentageAdjustment = createAsyncThunk(
  'priceLists/applyPercentageAdjustment',
  async ({ priceListId, data }: { priceListId: string; data: PercentageAdjustmentDto }) => {
    return await priceListApi.applyPercentageAdjustment(priceListId, data)
  }
)

const priceListSlice = createSlice({
  name: 'priceLists',
  initialState,
  reducers: {
    setFilters: (state, action: PayloadAction<Partial<typeof initialState.filters>>) => {
      state.filters = { ...state.filters, ...action.payload }
    },
    setPagination: (state, action: PayloadAction<Partial<typeof initialState.pagination>>) => {
      state.pagination = { ...state.pagination, ...action.payload }
    },
    clearError: (state) => {
      state.error = null
    },
  },
  extraReducers: (builder) => {
    // Fetch all price lists
    builder
      .addCase(fetchPriceLists.pending, (state) => {
        state.loading.priceLists = true
        state.error = null
      })
      .addCase(fetchPriceLists.fulfilled, (state, action) => {
        state.loading.priceLists = false
        if (action.payload) {
          state.priceLists = (action.payload as any).data || []
          const meta = (action.payload as any).meta
          if (meta) {
            state.pagination = {
              page: meta.page || 1,
              limit: meta.limit || 20,
              total: meta.total || 0,
              totalPages: meta.totalPages || 0,
            }
          }
        }
      })
      .addCase(fetchPriceLists.rejected, (state, action) => {
        state.loading.priceLists = false
        state.error = action.error.message || 'Failed to fetch price lists'
      })

    // Fetch price list by ID
    builder
      .addCase(fetchPriceListById.pending, (state) => {
        state.loading.priceLists = true
        state.error = null
      })
      .addCase(fetchPriceListById.fulfilled, (state, action) => {
        state.loading.priceLists = false
        if (action.payload) {
          const payload = action.payload as any
          state.selectedPriceList = payload.data || payload
        }
      })
      .addCase(fetchPriceListById.rejected, (state, action) => {
        state.loading.priceLists = false
        state.error = action.error.message || 'Failed to fetch price list'
      })

    // Create price list
    builder
      .addCase(createPriceList.pending, (state) => {
        state.loading.priceLists = true
        state.error = null
      })
      .addCase(createPriceList.fulfilled, (state, action) => {
        state.loading.priceLists = false
        if (action.payload) {
          const payload = action.payload as any
          const priceList = payload.data || payload
          state.priceLists.unshift(priceList)
          state.pagination.total += 1
        }
      })
      .addCase(createPriceList.rejected, (state, action) => {
        state.loading.priceLists = false
        state.error = action.error.message || 'Failed to create price list'
      })

    // Update price list
    builder
      .addCase(updatePriceList.pending, (state) => {
        state.loading.priceLists = true
        state.error = null
      })
      .addCase(updatePriceList.fulfilled, (state, action) => {
        state.loading.priceLists = false
        if (action.payload) {
          const payload = action.payload as any
          const priceList = payload.data || payload
          const index = state.priceLists.findIndex((pl) => pl.id === priceList.id)
          if (index !== -1) {
            state.priceLists[index] = priceList
          }
          if (state.selectedPriceList?.id === priceList.id) {
            state.selectedPriceList = priceList
          }
        }
      })
      .addCase(updatePriceList.rejected, (state, action) => {
        state.loading.priceLists = false
        state.error = action.error.message || 'Failed to update price list'
      })

    // Delete price list
    builder
      .addCase(deletePriceList.pending, (state) => {
        state.loading.priceLists = true
        state.error = null
      })
      .addCase(deletePriceList.fulfilled, (state, action) => {
        state.loading.priceLists = false
        if (action.payload) {
          state.priceLists = state.priceLists.filter((pl) => pl.id !== action.payload)
          state.pagination.total -= 1
          if (state.selectedPriceList?.id === action.payload) {
            state.selectedPriceList = null
          }
        }
      })
      .addCase(deletePriceList.rejected, (state, action) => {
        state.loading.priceLists = false
        state.error = action.error.message || 'Failed to delete price list'
      })

    // Set default price list
    builder
      .addCase(setDefaultPriceList.pending, (state) => {
        state.loading.priceLists = true
        state.error = null
      })
      .addCase(setDefaultPriceList.fulfilled, (state, action) => {
        state.loading.priceLists = false
        if (action.payload) {
          const payload = action.payload as any
          const priceList = payload.data || payload
          // Update all price lists to set isDefault = false except the new default
          state.priceLists = state.priceLists.map((pl) => ({
            ...pl,
            isDefault: pl.id === priceList.id,
          }))
          state.defaultPriceList = priceList
        }
      })
      .addCase(setDefaultPriceList.rejected, (state, action) => {
        state.loading.priceLists = false
        state.error = action.error.message || 'Failed to set default price list'
      })

    // Fetch effective price lists
    builder
      .addCase(fetchEffectivePriceLists.pending, (state) => {
        state.loading.effectivePriceLists = true
        state.error = null
      })
      .addCase(fetchEffectivePriceLists.fulfilled, (state, action) => {
        state.loading.effectivePriceLists = false
        if (action.payload) {
          const payload = action.payload as any
          state.effectivePriceLists = payload.data || payload
        }
      })
      .addCase(fetchEffectivePriceLists.rejected, (state, action) => {
        state.loading.effectivePriceLists = false
        state.error = action.error.message || 'Failed to fetch effective price lists'
      })

    // Fetch price list items
    builder
      .addCase(fetchPriceListItems.pending, (state) => {
        state.loading.priceListItems = true
        state.error = null
      })
      .addCase(fetchPriceListItems.fulfilled, (state, action) => {
        state.loading.priceListItems = false
        if (action.payload) {
          const payload = action.payload as any
          state.priceListItems = payload.data || payload
        }
      })
      .addCase(fetchPriceListItems.rejected, (state, action) => {
        state.loading.priceListItems = false
        state.error = action.error.message || 'Failed to fetch price list items'
      })

    // Bulk update prices
    builder
      .addCase(bulkUpdatePrices.pending, (state) => {
        state.loading.priceListItems = true
        state.error = null
      })
      .addCase(bulkUpdatePrices.fulfilled, (state, action) => {
        state.loading.priceListItems = false
        if (action.payload) {
          const payload = action.payload as any
          const result = payload.data || payload
          if (result.items) {
            state.priceListItems = result.items
          }
        }
      })
      .addCase(bulkUpdatePrices.rejected, (state, action) => {
        state.loading.priceListItems = false
        state.error = action.error.message || 'Failed to bulk update prices'
      })

    // Copy price list
    builder
      .addCase(copyPriceList.pending, (state) => {
        state.loading.priceLists = true
        state.error = null
      })
      .addCase(copyPriceList.fulfilled, (state, action) => {
        state.loading.priceLists = false
        if (action.payload) {
          const payload = action.payload as any
          const priceList = payload.data || payload
          state.priceLists.unshift(priceList)
          state.pagination.total += 1
        }
      })
      .addCase(copyPriceList.rejected, (state, action) => {
        state.loading.priceLists = false
        state.error = action.error.message || 'Failed to copy price list'
      })

    // Apply percentage adjustment
    builder
      .addCase(applyPercentageAdjustment.pending, (state) => {
        state.loading.priceListItems = true
        state.error = null
      })
      .addCase(applyPercentageAdjustment.fulfilled, (state, action) => {
        state.loading.priceListItems = false
        if (action.payload) {
          const payload = action.payload as any
          const result = payload.data || payload
          if (result.items) {
            state.priceListItems = result.items
          }
        }
      })
      .addCase(applyPercentageAdjustment.rejected, (state, action) => {
        state.loading.priceListItems = false
        state.error = action.error.message || 'Failed to apply percentage adjustment'
      })
  },
})

export const { setFilters, setPagination, clearError } = priceListSlice.actions

export default priceListSlice.reducer
