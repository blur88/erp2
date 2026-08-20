import { createTheme, ThemeOptions } from '@mui/material/styles'
import { alpha } from '@mui/material/styles'
import type {} from '@mui/x-date-pickers/themeAugmentation'

declare module '@mui/material/styles' {
  interface TypeBackground {
    sidebar: string
  }
}

declare module '@mui/material/styles' {
  interface TypographyVariants {
    tableHeader: React.CSSProperties
    tableCaption: React.CSSProperties
  }
  interface TypographyVariantsOptions {
    tableHeader?: React.CSSProperties
    tableCaption?: React.CSSProperties
  }
}
declare module '@mui/material/Typography' {
  interface TypographyPropsVariantOverrides {
    tableHeader: true
    tableCaption: true
  }
}

declare module '@mui/material/OutlinedInput' {
  interface OutlinedInputPropsSizeOverrides {
    xs: true
  }
}

declare module '@mui/material/InputBase' {
  interface InputBasePropsSizeOverrides {
    xs: true
  }
}

declare module '@mui/material/FormControl' {
  interface FormControlPropsSizeOverrides {
    xs: true
  }
}

declare module '@mui/material/TextField' {
  interface TextFieldPropsSizeOverrides {
    xs: true
  }
}

declare module '@mui/material/InputLabel' {
  interface InputLabelPropsSizeOverrides {
    xs: true
  }
}

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
    fontFamily: '"Roboto", sans-serif',
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
    tableHeader: {
      fontSize: '0.75rem',
      fontWeight: 600,
      textTransform: 'uppercase' as const,
      letterSpacing: '0.08em',
      lineHeight: 1.5,
    },
    tableCaption: {
      fontSize: '0.7rem',
      fontWeight: 400,
      lineHeight: 1.2,
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
    MuiButtonBase: {
      styleOverrides: {
        root: {
          fontFamily: 'inherit',
        },
      },
    },
    MuiOutlinedInput: {
      styleOverrides: {
        root: {
          '&.MuiInputBase-sizeXs': {
            height: 32,
            '& .MuiOutlinedInput-input': {
              paddingTop: '4px',
              paddingBottom: '4px',
            },
          },
        },
      },
    },
    MuiInputLabel: {
      styleOverrides: {
        root: {
          fontSize: '0.875rem',
          // outlined unshrunk: MUI default is translate(14px,9px); 32px field center is 4px higher
          '&.MuiInputLabel-outlined.MuiInputLabel-sizeXs:not(.MuiInputLabel-shrink)': {
            transform: 'translate(14px, 5px) scale(1)',
          },
        },
      },
    },
    MuiInputBase: {
      styleOverrides: {
        input: { fontSize: '0.875rem' },
      },
    },
    // Select dropdown options only. SelectInput applies role="listbox" to a
    // Select's menu list (SelectInput.js:785); a plain MenuList is role="menu"
    // (MenuList.js:241), so standalone action menus are excluded structurally.
    //
    // This MUST be scoped from the LIST side, not from MuiMenuItem.root.
    // Emotion substitutes `&` with the element's own generated class, so a
    // MuiMenuItem rule written as `':where(.MuiMenu-list[role=listbox]) &'`
    // compiles to `.item:where(...) .item` — a MenuItem containing a MenuItem,
    // which never matches. Styling the list's descendants is the correct
    // direction. :where() keeps specificity at 0 so per-item sx still wins.
    MuiMenu: {
      styleOverrides: {
        list: {
          '&[role="listbox"] .MuiMenuItem-root': { fontSize: '0.875rem' },
        },
      },
    },
    // MUI X v9 pickers render the date into MuiPickersInputBase-sectionContent
    // spans, NOT an <input>, so .MuiInputBase-input never matched them.
    MuiPickersInputBase: {
      styleOverrides: {
        root: { fontSize: '0.875rem' },
      },
    },
  },
}

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
      50: colors.grey[800],
    },
    background: {
      default: '#121212',
      paper: '#1e1e1e',
      sidebar: '#0D0D0D',
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
  components: {
    ...baseThemeOptions.components,
    MuiOutlinedInput: {
      styleOverrides: {
        root: {
          '&.MuiInputBase-sizeXs': {
            height: 32,
            '& .MuiOutlinedInput-input': {
              paddingTop: '4px',
              paddingBottom: '4px',
            },
          },
          '& .MuiOutlinedInput-notchedOutline': {
            borderColor: alpha('#ffffff', 0.23) + ' !important',
          },
          '&:hover .MuiOutlinedInput-notchedOutline': {
            borderColor: alpha('#ffffff', 0.4) + ' !important',
          },
          '&.Mui-focused .MuiOutlinedInput-notchedOutline': {
            borderColor: colors.primary[400] + ' !important',
          },
        },
      },
    },
    MuiTextField: {
      styleOverrides: {
        root: {
          '& .MuiOutlinedInput-root': {
            borderRadius: 8,
            '& fieldset': {
              borderColor: alpha('#ffffff', 0.23) + ' !important',
            },
            '&:hover fieldset': {
              borderColor: alpha('#ffffff', 0.4) + ' !important',
            },
            '&.Mui-focused fieldset': {
              borderColor: colors.primary[400] + ' !important',
            },
          },
        },
      },
    },
    MuiSelect: {
      styleOverrides: {
        root: {
          '& .MuiOutlinedInput-notchedOutline': {
            borderColor: alpha('#ffffff', 0.23) + ' !important',
          },
          '&:hover .MuiOutlinedInput-notchedOutline': {
            borderColor: alpha('#ffffff', 0.4) + ' !important',
          },
          '&.Mui-focused .MuiOutlinedInput-notchedOutline': {
            borderColor: colors.primary[400] + ' !important',
          },
        },
      },
    },
  },
})

export { darkTheme }
