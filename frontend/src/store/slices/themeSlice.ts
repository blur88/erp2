import { createSlice } from '@reduxjs/toolkit'

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

// Selectors
export const selectTheme = (state: any) => state.theme
export const selectThemeMode = (state: any) => state.theme?.mode

export default themeSlice.reducer
