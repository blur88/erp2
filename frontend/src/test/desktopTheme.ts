import { createTheme } from '@mui/material/styles'
import { darkTheme } from '@/styles/theme'

// jsdom 31 fixes its CSS viewport at 1024px; changing window.innerWidth cannot
// select desktop media queries. Use this only for desktop interaction tests
// (#1906), and keep production-theme coverage for the hidden controls.
export const desktopTestTheme = createTheme({
  ...darkTheme,
  breakpoints: {
    values: { ...darkTheme.breakpoints.values, lg: 1024 },
  },
})
