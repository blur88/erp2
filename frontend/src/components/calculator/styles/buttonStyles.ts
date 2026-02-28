import { Theme } from '@mui/material/styles'

export const getButtonStyles = (theme: Theme) => {
  const baseButtonStyle = {
    minHeight: 48,
    fontSize: '1.1rem',
    fontWeight: 600,
    borderRadius: 1,
  }

  return {
    base: baseButtonStyle,
    
    number: {
      ...baseButtonStyle,
      backgroundColor: 'background.paper',
      color: 'text.primary',
      border: `1px solid ${theme.palette.divider}`,
      '&:hover': {
        backgroundColor: 'action.hover',
      },
    },

    operator: {
      ...baseButtonStyle,
      backgroundColor: 'primary.main',
      color: 'primary.contrastText',
      '&:hover': {
        backgroundColor: 'primary.dark',
      },
    },

    special: {
      ...baseButtonStyle,
      backgroundColor: 'warning.main',
      color: 'warning.contrastText',
      '&:hover': {
        backgroundColor: 'warning.dark',
      },
    },

    equals: {
      ...baseButtonStyle,
      backgroundColor: 'success.main',
      color: 'success.contrastText',
      '&:hover': {
        backgroundColor: 'success.dark',
      },
      minHeight: 56,
      fontSize: '1.2rem',
    },
  }
}

export const getCompactButtonStyles = (theme: Theme) => {
  const baseButtonStyle = {
    minHeight: 40,
    fontSize: '0.9rem',
    fontWeight: 600,
    borderRadius: 1,
  }

  return {
    base: baseButtonStyle,
    
    number: {
      ...baseButtonStyle,
      backgroundColor: 'background.paper',
      color: 'text.primary',
      border: `1px solid ${theme.palette.divider}`,
      '&:hover': {
        backgroundColor: 'action.hover',
      },
    },

    operator: {
      ...baseButtonStyle,
      backgroundColor: 'primary.main',
      color: 'primary.contrastText',
      '&:hover': {
        backgroundColor: 'primary.dark',
      },
    },

    special: {
      ...baseButtonStyle,
      backgroundColor: 'warning.main',
      color: 'warning.contrastText',
      '&:hover': {
        backgroundColor: 'warning.dark',
      },
    },

    equals: {
      ...baseButtonStyle,
      backgroundColor: 'success.main',
      color: 'success.contrastText',
      '&:hover': {
        backgroundColor: 'success.dark',
      },
      minHeight: 48,
      fontSize: '1.1rem',
    },
  }
}
