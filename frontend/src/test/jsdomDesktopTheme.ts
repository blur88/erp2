import { createTheme } from '@mui/material/styles'
import { darkTheme } from '@/styles/theme'

// jsdom 31 fixes its CSS viewport at 1024px; changing window.innerWidth cannot
// select desktop media queries. Use this only for desktop interaction tests
// (#1906), and keep production-theme coverage for the hidden controls.
// Rebuild breakpoints in the first argument: merging a finished theme as a
// second-argument override leaves up()/down() bound to the original values.
export const jsdomDesktopTheme = createTheme({
  ...darkTheme,
  breakpoints: {
    values: { ...darkTheme.breakpoints.values, lg: 1024 },
  },
})
