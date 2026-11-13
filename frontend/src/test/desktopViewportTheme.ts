import { unstable_createBreakpoints as createBreakpoints } from '@mui/material/styles'
import { darkTheme } from '@/styles/theme'

/**
 * Test-only copy of the production theme whose `lg` breakpoint matches jsdom's
 * viewport, for asserting desktop-only (`display: { xs: 'none', lg: ... }`) controls.
 *
 * jsdom 31 evaluates `@media` rules against a fixed 1024×768 viewport that tests
 * cannot widen: assigning `window.innerWidth` replaces only the public property,
 * not the frozen environment the media matcher reads. The production `lg`
 * (1280px) therefore never matches; lowering it to 1024px makes jsdom render the
 * desktop layout.
 *
 * The breakpoints are rebuilt rather than merged with `createTheme(darkTheme, …)`:
 * MUI's `createBreakpoints` spreads extra keys last, so the merged theme would keep
 * the production `up()`/`down()` functions and still query 1280px.
 */
export const desktopViewportTheme = {
  ...darkTheme,
  breakpoints: createBreakpoints({
    values: { ...darkTheme.breakpoints.values, lg: 1024 },
  }),
}
