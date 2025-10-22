import { createTheme, ThemeOptions } from '@mui/material/styles'
import { alpha } from '@mui/material/styles'

// Color palette
const colors = {
  primary: {
    50: '#e3f2fd',
    100: '#bbdefb',
    200: '#90caf9',
    300: '#64b5f6',
    400: '#42a5f5',
    500: '#2196f3',
    600: '#1e88e5',
    700: '#1976d2',
    800: '#1565c0',
    900: '#0d47a1',
  },
  secondary: {
    50: '#fce4ec',
    100: '#f8bbd9',
    200: '#f48fb1',
    300: '#f06292',
    400: '#ec407a',
    500: '#e91e63',
    600: '#d81b60',
    700: '#c2185b',
    800: '#ad1457',
    900: '#880e4f',
  },
  success: {
    50: '#e8f5e8',
    100: '#c8e6c9',
    200: '#a5d6a7',
    300: '#81c784',
    400: '#66bb6a',
    500: '#4caf50',
    600: '#43a047',
    700: '#388e3c',
    800: '#2e7d32',
    900: '#1b5e20',
  },
  warning: {
    50: '#fff8e1',
    100: '#ffecb3',
    200: '#ffe082',
    300: '#ffd54f',
    400: '#ffca28',
    500: '#ffc107',
    600: '#ffb300',
    700: '#ffa000',
    800: '#ff8f00',
    900: '#ff6f00',
  },
  error: {
    50: '#ffebee',
    100: '#ffcdd2',
    200: '#ef9a9a',
    300: '#e57373',
    400: '#ef5350',
    500: '#f44336',
    600: '#e53935',
    700: '#d32f2f',
    800: '#c62828',
    900: '#b71c1c',
  },
  grey: {
    50: '#fafafa',
    100: '#f5f5f5',
    200: '#eeeeee',
    300: '#e0e0e0',
    400: '#bdbdbd',
    500: '#9e9e9e',
    600: '#757575',
    700: '#616161',
    800: '#424242',
    900: '#212121',
  },
}

// Common theme options
const baseThemeOptions: ThemeOptions = {
  typography: {
    fontFamily: [
      '"Roboto"',
      '-apple-system',
      'BlinkMacSystemFont',
      '"Segoe UI"',
      '"Helvetica Neue"',
      'Arial',
      'sans-serif',
    ].join(','),
    h1: {
      fontSize: '2.5rem',
      fontWeight: 600,
      lineHeight: 1.2,
    },
    h2: {
      fontSize: '2rem',
      fontWeight: 600,
      lineHeight: 1.3,
    },
    h3: {
      fontSize: '1.75rem',
      fontWeight: 600,
      lineHeight: 1.3,
    },
    h4: {
      fontSize: '1.5rem',
      fontWeight: 600,
      lineHeight: 1.4,
    },
    h5: {
      fontSize: '1.25rem',
      fontWeight: 600,
      lineHeight: 1.4,
    },
    h6: {
      fontSize: '1rem',
      fontWeight: 600,
      lineHeight: 1.4,
    },
    subtitle1: {
      fontSize: '1rem',
      fontWeight: 500,
      lineHeight: 1.5,
    },
    subtitle2: {
      fontSize: '0.875rem',
      fontWeight: 500,
      lineHeight: 1.5,
    },
    body1: {
      fontSize: '1rem',
      fontWeight: 400,
      lineHeight: 1.5,
    },
    body2: {
      fontSize: '0.875rem',
      fontWeight: 400,
      lineHeight: 1.5,
    },
    button: {
      fontSize: '0.875rem',
      fontWeight: 500,
      textTransform: 'none',
    },
    caption: {
      fontSize: '0.75rem',
      fontWeight: 400,
      lineHeight: 1.5,
    },
    overline: {
      fontSize: '0.75rem',
      fontWeight: 600,
      textTransform: 'uppercase',
      letterSpacing: '0.08em',
      lineHeight: 1.5,
    },
  },
  shape: {
    borderRadius: 8,
  },
  spacing: 8,
  breakpoints: {
    values: {
      xs: 0,
      sm: 600,
      md: 960,
      lg: 1280,
      xl: 1920,
    },
  },
  components: {
    MuiButton: {
      styleOverrides: {
        root: {
          borderRadius: 8,
          textTransform: 'none',
          fontWeight: 500,
          boxShadow: 'none',
          '&:hover': {
            boxShadow: 'none',
          },
        },
        contained: {
          boxShadow: '0px 2px 4px rgba(0, 0, 0, 0.1)',
          '&:hover': {
            boxShadow: '0px 4px 8px rgba(0, 0, 0, 0.15)',
          },
        },
      },
    },
    MuiCard: {
      styleOverrides: {
        root: {
          borderRadius: 12,
          boxShadow: '0px 2px 8px rgba(0, 0, 0, 0.08)',
          '&:hover': {
            boxShadow: '0px 4px 16px rgba(0, 0, 0, 0.12)',
          },
        },
      },
    },
    MuiPaper: {
      styleOverrides: {
        root: {
          backgroundImage: 'none',
        },
        elevation1: {
          boxShadow: '0px 2px 4px rgba(0, 0, 0, 0.08)',
        },
        elevation4: {
          boxShadow: '0px 4px 12px rgba(0, 0, 0, 0.12)',
        },
      },
    },
    MuiTextField: {
      styleOverrides: {
        root: {
          '& .MuiOutlinedInput-root': {
            borderRadius: 8,
          },
        },
      },
    },
    MuiTableHead: {
      styleOverrides: {
        root: {
          '& .MuiTableCell-head': {
            fontWeight: 600,
            textTransform: 'uppercase',
            fontSize: '0.75rem',
            letterSpacing: '0.08em',
          },
        },
      },
    },
    MuiChip: {
      styleOverrides: {
        root: {
          borderRadius: 6,
        },
      },
    },
    MuiDrawer: {
      styleOverrides: {
        paper: {
          borderRight: 'none',
          boxShadow: '0px 0px 20px rgba(0, 0, 0, 0.08)',
        },
      },
    },
  },
}

// Light theme
const lightTheme = createTheme({
  ...baseThemeOptions,
  palette: {
    mode: 'light',
    primary: {
      main: colors.primary[700],
      light: colors.primary[400],
      dark: colors.primary[800],
      contrastText: '#fff',
    },
    secondary: {
      main: colors.secondary[600],
      light: colors.secondary[400],
      dark: colors.secondary[800],
      contrastText: '#fff',
    },
    success: {
      main: colors.success[600],
      light: colors.success[400],
      dark: colors.success[800],
      contrastText: '#fff',
    },
    warning: {
      main: colors.warning[600],
      light: colors.warning[400],
      dark: colors.warning[800],
      contrastText: '#000',
    },
    error: {
      main: colors.error[600],
      light: colors.error[400],
      dark: colors.error[800],
      contrastText: '#fff',
    },
    grey: colors.grey,
    background: {
      default: colors.grey[50],
      paper: '#ffffff',
    },
    text: {
      primary: colors.grey[900],
      secondary: colors.grey[700],
      disabled: colors.grey[400],
    },
    divider: colors.grey[200],
    action: {
      active: colors.grey[700],
      hover: alpha(colors.grey[900], 0.04),
      selected: alpha(colors.grey[900], 0.08),
      disabled: colors.grey[400],
      disabledBackground: colors.grey[100],
    },
  },
})

// Dark theme
const darkTheme = createTheme({
  ...baseThemeOptions,
  palette: {
    mode: 'dark',
    primary: {
      main: colors.primary[400],
      light: colors.primary[300],
      dark: colors.primary[600],
      contrastText: '#000',
    },
    secondary: {
      main: colors.secondary[400],
      light: colors.secondary[300],
      dark: colors.secondary[600],
      contrastText: '#000',
    },
    success: {
      main: colors.success[400],
      light: colors.success[300],
      dark: colors.success[600],
      contrastText: '#000',
    },
    warning: {
      main: colors.warning[400],
      light: colors.warning[300],
      dark: colors.warning[600],
      contrastText: '#000',
    },
    error: {
      main: colors.error[400],
      light: colors.error[300],
      dark: colors.error[600],
      contrastText: '#000',
    },
    grey: {
      ...colors.grey,
      // Override grey.50 for dark mode to use a darker shade
      50: colors.grey[800], // Map grey.50 to grey.800 for dark mode
    },
    background: {
      default: '#121212',
      paper: '#1e1e1e',
    },
    text: {
      primary: '#ffffff',
      secondary: colors.grey[400],
      disabled: colors.grey[600],
    },
    divider: colors.grey[800],
    action: {
      active: colors.grey[300],
      hover: alpha('#ffffff', 0.04),
      selected: alpha('#ffffff', 0.08),
      disabled: colors.grey[600],
      disabledBackground: colors.grey[800],
    },
  },
})

// Export themes
export { lightTheme, darkTheme }

// Default theme (dark)
export const theme = darkTheme

// Theme creator function
export const createAppTheme = (mode: 'light' | 'dark', primaryColor?: string) => {
  const baseTheme = mode === 'dark' ? darkTheme : lightTheme
  
  if (primaryColor) {
    return createTheme({
      ...baseTheme,
      palette: {
        ...baseTheme.palette,
        primary: {
          ...baseTheme.palette.primary,
          main: primaryColor,
        },
      },
    })
  }
  
  return baseTheme
}