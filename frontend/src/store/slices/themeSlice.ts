import { createSlice, PayloadAction } from '@reduxjs/toolkit'
import type { ThemeConfig } from '@/types'

interface ThemeState {
  mode: 'light' | 'dark'
  primaryColor: string
  secondaryColor: string
}

const initialState: ThemeState = {
  mode: 'light',
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
    setThemeMode: (state, action: PayloadAction<'light' | 'dark'>) => {
      state.mode = action.payload
    },
    setPrimaryColor: (state, action: PayloadAction<string>) => {
      state.primaryColor = action.payload
    },
    setSecondaryColor: (state, action: PayloadAction<string>) => {
      state.secondaryColor = action.payload
    },
    setThemeConfig: (state, action: PayloadAction<ThemeConfig>) => {
      state.mode = action.payload.mode
      state.primaryColor = action.payload.primaryColor
      state.secondaryColor = action.payload.secondaryColor
    },
    resetTheme: () => initialState,
  },
})

export const {
  toggleTheme,
  setThemeMode,
  setPrimaryColor,
  setSecondaryColor,
  setThemeConfig,
  resetTheme,
} = themeSlice.actions

// Selectors
export const selectTheme = (state: { theme: ThemeState }) => state.theme
export const selectThemeMode = (state: { theme: ThemeState }) => state.theme.mode
export const selectPrimaryColor = (state: { theme: ThemeState }) => state.theme.primaryColor
export const selectSecondaryColor = (state: { theme: ThemeState }) => state.theme.secondaryColor

export default themeSlice.reducer