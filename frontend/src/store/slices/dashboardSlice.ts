import { createSlice, createAsyncThunk, PayloadAction } from '@reduxjs/toolkit'
import type { DashboardStats, ChartData } from '@/types'
import { dashboardApi } from '@/services/dashboardApi'

interface DashboardState {
  stats: DashboardStats | null
  salesChart: ChartData | null
  revenueChart: ChartData | null
  topProducts: Array<{
    id: string
    name: string
    sales: number
    revenue: number
  }>
  recentActivities: Array<{
    id: string
    type: string
    description: string
    timestamp: Date
    user: string
  }>
  alerts: Array<{
    id: string
    type: 'warning' | 'error' | 'info'
    message: string
    timestamp: Date
  }>
  loading: {
    stats: boolean
    charts: boolean
    activities: boolean
  }
  error: string | null
  lastUpdated: Date | null
}

const initialState: DashboardState = {
  stats: null,
  salesChart: null,
  revenueChart: null,
  topProducts: [],
  recentActivities: [],
  alerts: [],
  loading: {
    stats: false,
    charts: false,
    activities: false,
  },
  error: null,
  lastUpdated: null,
}

// Async thunks
export const fetchDashboardStats = createAsyncThunk(
  'dashboard/fetchStats',
  async (_, { rejectWithValue }) => {
    try {
      const response = await dashboardApi.getStats()
      return response
    } catch (error: any) {
      return rejectWithValue(error.response?.data?.message || 'Failed to fetch dashboard stats')
    }
  }
)

export const fetchSalesChart = createAsyncThunk(
  'dashboard/fetchSalesChart',
  async (params: { period: 'week' | 'month' | 'quarter' | 'year' }, { rejectWithValue }) => {
    try {
      const response = await dashboardApi.getSalesChart(params.period)
      return response
    } catch (error: any) {
      return rejectWithValue(error.response?.data?.message || 'Failed to fetch sales chart')
    }
  }
)

export const fetchRevenueChart = createAsyncThunk(
  'dashboard/fetchRevenueChart',
  async (params: { period: 'week' | 'month' | 'quarter' | 'year' }, { rejectWithValue }) => {
    try {
      const response = await dashboardApi.getRevenueChart(params.period)
      return response
    } catch (error: any) {
      return rejectWithValue(error.response?.data?.message || 'Failed to fetch revenue chart')
    }
  }
)

export const fetchTopProducts = createAsyncThunk(
  'dashboard/fetchTopProducts',
  async (params: { limit?: number }, { rejectWithValue }) => {
    try {
      const response = await dashboardApi.getTopProducts(params.limit || 10)
      return response
    } catch (error: any) {
      return rejectWithValue(error.response?.data?.message || 'Failed to fetch top products')
    }
  }
)

export const fetchRecentActivities = createAsyncThunk(
  'dashboard/fetchRecentActivities',
  async (params: { limit?: number }, { rejectWithValue }) => {
    try {
      const response = await dashboardApi.getRecentActivities(params.limit || 20)
      return response
    } catch (error: any) {
      return rejectWithValue(error.response?.data?.message || 'Failed to fetch recent activities')
    }
  }
)

export const fetchAlerts = createAsyncThunk(
  'dashboard/fetchAlerts',
  async (_, { rejectWithValue }) => {
    try {
      const response = await dashboardApi.getAlerts()
      return response
    } catch (error: any) {
      return rejectWithValue(error.response?.data?.message || 'Failed to fetch alerts')
    }
  }
)

const dashboardSlice = createSlice({
  name: 'dashboard',
  initialState,
  reducers: {
    clearError: (state) => {
      state.error = null
    },
    dismissAlert: (state, action: PayloadAction<string>) => {
      state.alerts = state.alerts.filter(alert => alert.id !== action.payload)
    },
    addAlert: (state, action: PayloadAction<Omit<typeof initialState.alerts[0], 'id' | 'timestamp'>>) => {
      const alert = {
        id: Date.now().toString(),
        timestamp: new Date(),
        ...action.payload,
      }
      state.alerts.unshift(alert)
    },
    setLastUpdated: (state) => {
      state.lastUpdated = new Date()
    },
  },
  extraReducers: (builder) => {
    // Fetch Dashboard Stats
    builder
      .addCase(fetchDashboardStats.pending, (state) => {
        state.loading.stats = true
        state.error = null
      })
      .addCase(fetchDashboardStats.fulfilled, (state, action) => {
        state.loading.stats = false
        if (action.payload) {
          state.stats = action.payload
        }
        state.lastUpdated = new Date()
      })
      .addCase(fetchDashboardStats.rejected, (state, action) => {
        state.loading.stats = false
        state.error = action.payload as string
      })

    // Fetch Sales Chart
    builder
      .addCase(fetchSalesChart.pending, (state) => {
        state.loading.charts = true
      })
      .addCase(fetchSalesChart.fulfilled, (state, action) => {
        state.loading.charts = false
        if (action.payload) {
          state.salesChart = action.payload
        }
      })
      .addCase(fetchSalesChart.rejected, (state, action) => {
        state.loading.charts = false
        state.error = action.payload as string
      })

    // Fetch Revenue Chart
    builder
      .addCase(fetchRevenueChart.fulfilled, (state, action) => {
        if (action.payload) {
          state.revenueChart = action.payload
        }
      })

    // Fetch Top Products
    builder
      .addCase(fetchTopProducts.fulfilled, (state, action) => {
        if (action.payload) {
          state.topProducts = action.payload
        }
      })

    // Fetch Recent Activities
    builder
      .addCase(fetchRecentActivities.pending, (state) => {
        state.loading.activities = true
      })
      .addCase(fetchRecentActivities.fulfilled, (state, action) => {
        state.loading.activities = false
        if (action.payload) {
          state.recentActivities = action.payload
        }
      })
      .addCase(fetchRecentActivities.rejected, (state, action) => {
        state.loading.activities = false
        state.error = action.payload as string
      })

    // Fetch Alerts
    builder
      .addCase(fetchAlerts.fulfilled, (state, action) => {
        if (action.payload) {
          state.alerts = action.payload
        }
      })
  },
})

export const {
  clearError,
  dismissAlert,
  addAlert,
  setLastUpdated,
} = dashboardSlice.actions

// Selectors
export const selectDashboardStats = (state: any) => state.dashboard?.stats
export const selectSalesChart = (state: any) => state.dashboard?.salesChart
export const selectRevenueChart = (state: any) => state.dashboard?.revenueChart
export const selectTopProducts = (state: any) => state.dashboard?.topProducts
export const selectRecentActivities = (state: any) => state.dashboard?.recentActivities
export const selectDashboardAlerts = (state: any) => state.dashboard?.alerts
export const selectDashboardLoading = (state: any) => state.dashboard?.loading
export const selectDashboardError = (state: any) => state.dashboard?.error
export const selectLastUpdated = (state: any) => state.dashboard?.lastUpdated

export default dashboardSlice.reducer