// Table layout and spacing constants.
// Typography constants are in the MUI theme (frontend/src/styles/theme.ts).
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

// Pagination — single source of truth for every TablePagination.
// One option set for all views; do not reintroduce per-page variants.
// Exception: components/backup/BackupList.tsx intentionally uses [5,10,25,50]/10.
export const PAGINATION = {
  options: [10, 25, 50, 100],
  defaultPageSize: 25,
} as const
