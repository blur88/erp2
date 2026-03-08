import { createSlice } from '@reduxjs/toolkit'
import type { RootState } from '@/store'

interface ThemeState {
  mode: 'light' | 'dark'
  primaryColor: string
  secondaryColor: string
}

const initialState: ThemeState = {
  mode: 'dark',
  primaryColor: '#1976d2',
  secondaryColor: '#dc004e',
}

const themeSlice = createSlice({
  name: 'theme',
  initialState,
  reducers: {
    toggleTheme: (state) => {
      state.mode = state.mode === 'light' ? 'dark' : 'light'
    },
  },
})

export const {
  toggleTheme,
} = themeSlice.actions

export const selectTheme = (state: RootState) => state.theme
export const selectThemeMode = (state: RootState) => state.theme.mode

export default themeSlice.reducer
