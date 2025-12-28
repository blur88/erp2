import React from 'react'
import {
  DataGrid,
  GridColDef,
  GridRowsProp,
  GridToolbar,
  GridActionsCellItem,
  GridRowId,
  GridPaginationModel,
} from '@mui/x-data-grid'
import {
  Box,
  Paper,
  Typography,
  IconButton,
  Tooltip,
  LinearProgress,
} from '@mui/material'
import {
  Edit as EditIcon,
  Delete as DeleteIcon,
  Visibility as ViewIcon,
  GetApp as ExportIcon,
} from '@mui/icons-material'

interface DataTableProps {
  title?: string
  columns: GridColDef[]
  rows: GridRowsProp
  loading?: boolean
  error?: string | null
  pageSize?: number
  totalRows?: number
  page?: number
  onPageChange?: (model: GridPaginationModel) => void
  onRowClick?: (id: GridRowId) => void
  onEdit?: (id: GridRowId) => void
  onDelete?: (id: GridRowId) => void
  onView?: (id: GridRowId) => void
  onExport?: () => void
  hideToolbar?: boolean
  disableSelection?: boolean
  checkboxSelection?: boolean
  height?: number | string
  sx?: any
}

const DataTable: React.FC<DataTableProps> = ({
  title,
  columns,
  rows,
  loading = false,
  error = null,
  pageSize = 25,
  totalRows,
  page = 0,
  onPageChange,
  onRowClick,
  onEdit,
  onDelete,
  onView,
  onExport,
  hideToolbar = false,
  disableSelection = false,
  checkboxSelection = false,
  height = 600,
  sx = {},
}) => {
  // Add action columns if handlers are provided
  const enhancedColumns: GridColDef[] = React.useMemo(() => {
    const hasActions = onEdit || onDelete || onView
    
    if (!hasActions) {
      return columns
    }

    const actionsColumn: GridColDef = {
      field: 'actions',
      type: 'actions',
      headerName: 'Actions',
      width: 120,
      cellClassName: 'actions',
      getActions: ({ id }) => {
        const actions = []

        if (onView) {
          actions.push(
            <GridActionsCellItem
              icon={<ViewIcon />}
              label="View"
              onClick={() => onView(id)}
              color="inherit"
            />
          )
        }

        if (onEdit) {
          actions.push(
            <GridActionsCellItem
              icon={<EditIcon />}
              label="Edit"
              onClick={() => onEdit(id)}
              color="inherit"
            />
          )
        }

        if (onDelete) {
          actions.push(
            <GridActionsCellItem
              icon={<DeleteIcon />}
              label="Delete"
              onClick={() => onDelete(id)}
              color="inherit"
            />
          )
        }

        return actions
      },
    }

    return [...columns, actionsColumn]
  }, [columns, onEdit, onDelete, onView])

  // Custom toolbar
  const CustomToolbar = () => (
    <Box
      sx={{
        display: 'flex',
        alignItems: 'center',
        justifyContent: 'space-between',
        p: 2,
        borderBottom: 1,
        borderColor: 'divider',
      }}
    >
      <Box sx={{ display: 'flex', alignItems: 'center', gap: 2 }}>
        {title && (
          <Typography variant="h6" sx={{ fontWeight: 600 }}>
            {title}
          </Typography>
        )}
        <GridToolbar />
      </Box>
      
      {onExport && (
        <Tooltip title="Export Data">
          <IconButton onClick={onExport} size="small">
            <ExportIcon />
          </IconButton>
        </Tooltip>
      )}
    </Box>
  )

  if (error) {
    return (
      <Paper sx={{ p: 3, textAlign: 'center', ...sx }}>
        <Typography color="error" variant="h6">
          Error loading data
        </Typography>
        <Typography color="error" variant="body2" sx={{ mt: 1 }}>
          {error}
        </Typography>
      </Paper>
    )
  }

  return (
    <Paper sx={{ height, ...sx }}>
      <DataGrid
        rows={rows}
        columns={enhancedColumns}
        loading={loading}
        pageSizeOptions={[10, 25, 50, 100]}
        paginationModel={{
          page,
          pageSize,
        }}
        onPaginationModelChange={onPageChange}
        paginationMode={totalRows ? 'server' : 'client'}
        rowCount={totalRows}
        onRowClick={onRowClick ? (params) => onRowClick(params.id) : undefined}
        checkboxSelection={checkboxSelection}
        disableRowSelectionOnClick={disableSelection}
        slots={{
          toolbar: !hideToolbar ? CustomToolbar : null,
          loadingOverlay: LinearProgress as any,
        }}
        slotProps={{
          toolbar: {
            showQuickFilter: true,
            quickFilterProps: { debounceMs: 500 },
          },
        }}
        sx={{
          border: 0,
          '& .MuiDataGrid-main': {
            border: 0,
          },
          '& .MuiDataGrid-columnHeaders': {
            bgcolor: 'background.default',
            borderBottom: 2,
            borderColor: 'divider',
          },
          '& .MuiDataGrid-cell': {
            borderBottom: 1,
            borderColor: 'divider',
          },
          '& .MuiDataGrid-row': {
            '&:hover': {
              bgcolor: 'action.hover',
            },
            '&.Mui-selected': {
              bgcolor: 'action.selected',
              '&:hover': {
                bgcolor: 'action.selected',
              },
            },
          },
          '& .MuiDataGrid-footerContainer': {
            borderTop: 2,
            borderColor: 'divider',
            bgcolor: 'background.default',
          },
          '& .actions': {
            color: 'text.secondary',
          },
          '& .actions .MuiDataGrid-actionsCellItem': {
            color: 'text.secondary',
            '&:hover': {
              color: 'primary.main',
            },
          },
        }}
      />
    </Paper>
  )
}

export default DataTable