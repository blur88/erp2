import { createSlice } from '@reduxjs/toolkit'

interface DashboardState {
  loading: {
    stats: boolean
    charts: boolean
    activities: boolean
  }
  error: string | null
}

const initialState: DashboardState = {
  loading: {
    stats: false,
    charts: false,
    activities: false,
  },
  error: null,
}

const dashboardSlice = createSlice({
  name: 'dashboard',
  initialState,
  reducers: {},
})

export default dashboardSlice.reducer
