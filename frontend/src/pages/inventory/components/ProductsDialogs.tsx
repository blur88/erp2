import React from 'react'
import { Box, Menu, MenuItem, Typography } from '@mui/material'
import {
  PictureAsPdf as PictureAsPdfIcon,
  TableChart as TableChartIcon,
} from '@mui/icons-material'

import ConfirmationDialog from '@/components/common/ConfirmationDialog'
import SlidingCalculatorPanel from '@/components/calculator/SlidingCalculatorPanel'
import DeletedProductsDialog from '@/components/inventory/DeletedProductsDialog'
import ProductImportDialog from '@/components/inventory/ProductImportDialog'
import type { Product } from '@/types'

interface ProductsDialogsProps {
  exportMenuAnchor: HTMLElement | null
  isExporting: boolean
  products: Product[]
  productFilters: { search?: string }
  calculatorPanelOpen: boolean
  deletedProductsDialogOpen: boolean
  importDialogOpen: boolean
  deleteConfirmOpen: boolean
  productToDelete: Product | null
  onCloseExportMenu: () => void
  onExport: (format: 'csv' | 'excel' | 'pdf') => void
  onCloseCalculator: () => void
  onCloseDeletedProductsDialog: () => void
  onCloseImportDialog: () => void
  onImportSuccess: () => void
  onConfirmDelete: () => void
  onCancelDelete: () => void
}

const ProductsDialogs: React.FC<ProductsDialogsProps> = ({
  exportMenuAnchor,
  isExporting,
  products,
  productFilters,
  calculatorPanelOpen,
  deletedProductsDialogOpen,
  importDialogOpen,
  deleteConfirmOpen,
  productToDelete,
  onCloseExportMenu,
  onExport,
  onCloseCalculator,
  onCloseDeletedProductsDialog,
  onCloseImportDialog,
  onImportSuccess,
  onConfirmDelete,
  onCancelDelete,
}) => {
  return (
    <>
      <Menu
        anchorEl={exportMenuAnchor}
        open={Boolean(exportMenuAnchor)}
        onClose={onCloseExportMenu}
        slotProps={{ paper: { sx: { minWidth: 200 } } }}
      >
        <MenuItem onClick={() => onExport('csv')} disabled={isExporting}>
          <TableChartIcon sx={{ mr: 1, fontSize: '0.8rem' }} />
          <Box>
            <Typography variant="body2" sx={{ fontWeight: 500 }}>
              Export as CSV
            </Typography>
            <Typography variant="caption" color="text.secondary">
              Comma-separated values
            </Typography>
          </Box>
        </MenuItem>
        <MenuItem onClick={() => onExport('excel')} disabled={isExporting}>
          <TableChartIcon sx={{ mr: 1, fontSize: '0.8rem', color: 'success.main' }} />
          <Box>
            <Typography variant="body2" sx={{ fontWeight: 500 }}>
              Export as Excel
            </Typography>
            <Typography variant="caption" color="text.secondary">
              With summary & formatting
            </Typography>
          </Box>
        </MenuItem>
        <MenuItem onClick={() => onExport('pdf')} disabled={isExporting}>
          <PictureAsPdfIcon sx={{ mr: 1, fontSize: '0.8rem', color: 'error.main' }} />
          <Box>
            <Typography variant="body2" sx={{ fontWeight: 500 }}>
              Export as PDF
            </Typography>
            <Typography variant="caption" color="text.secondary">
              Formatted report
            </Typography>
          </Box>
        </MenuItem>
        {products.length > 0 && (
          <Box sx={{ px: 2, py: 1, borderTop: '1px solid', borderColor: 'divider' }}>
            <Typography variant="caption" color="text.secondary">
              {products.length} product{products.length !== 1 ? 's' : ''} will be exported
              {productFilters.search && (
                <>
                  <br />
                  Search: "{productFilters.search}"
                </>
              )}
            </Typography>
          </Box>
        )}
      </Menu>

      <SlidingCalculatorPanel isOpen={calculatorPanelOpen} onClose={onCloseCalculator} />
      <DeletedProductsDialog open={deletedProductsDialogOpen} onClose={onCloseDeletedProductsDialog} />
      <ProductImportDialog open={importDialogOpen} onClose={onCloseImportDialog} onImportSuccess={onImportSuccess} />
      <ConfirmationDialog
        open={deleteConfirmOpen}
        title="Confirm Delete"
        message={`Are you sure you want to delete "${productToDelete?.name}"? This will move it to deleted items.`}
        confirmText="Delete"
        cancelText="Cancel"
        onConfirm={onConfirmDelete}
        onCancel={onCancelDelete}
        severity="warning"
      />
    </>
  )
}

export default ProductsDialogs
