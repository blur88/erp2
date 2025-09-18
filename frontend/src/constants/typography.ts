// Typography constants for consistent font styling across the application

export const TYPOGRAPHY_STYLES = {
  // Page headers
  pageHeader: {
    variant: 'h4' as const,
    mobileVariant: 'h5' as const,
    fontWeight: 700,
    icon: {
      fontSize: 40,
      color: 'primary.main'
    }
  },

  // Page subtitles
  pageSubtitle: {
    variant: 'body1' as const,
    color: 'text.secondary'
  },

  // Table headers
  tableHeader: {
    variant: 'body2' as const,
    fontWeight: 600,
    fontSize: '0.8rem',
    color: 'text.primary'
  },

  // Table cell content
  tableCell: {
    primary: {
      variant: 'body2' as const,
      fontWeight: 600,
      fontSize: '0.8rem',
      lineHeight: 1.2
    },
    secondary: {
      variant: 'body2' as const,
      fontWeight: 400,
      fontSize: '0.8rem',
      lineHeight: 1.2
    },
    caption: {
      variant: 'caption' as const,
      fontSize: '0.7rem'
    }
  },

  // Search fields
  searchField: {
    input: {
      fontSize: '0.875rem',
      height: '40px',
      padding: '8.5px 14px'
    },
    icon: {
      fontSize: '1.25rem',
      color: 'action.active'
    }
  },

  // Chips and status indicators
  chip: {
    small: {
      fontSize: '0.7rem',
      fontWeight: 500,
      height: 20
    },
    extraSmall: {
      fontSize: '0.65rem',
      height: 18
    }
  },

  // Mobile-specific overrides
  mobile: {
    caption: {
      fontSize: '0.65rem'
    }
  }
} as const

// Table styling constants
export const TABLE_STYLES = {
  size: 'small' as const,
  cell: {
    padding: {
      py: 0.75,
      px: 1.5
    },
    border: '1px solid rgba(224, 224, 224, 0.4)'
  },
  row: {
    height: 36
  },
  header: {
    backgroundColor: 'grey.50',
    padding: { py: 1 }
  }
} as const