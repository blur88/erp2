import React from 'react'
import {
  Box,
  Button,
  FormControl,
  InputAdornment,
  InputLabel,
  MenuItem,
  Paper,
  Select,
  TextField,
  Typography,
} from '@mui/material'
import {
  Add as AddIcon,
  ArrowDropDown as ArrowDropDownIcon,
  Calculate as CalculateIcon,
  CloudUpload as CloudUploadIcon,
  GetApp as ExportIcon,
  RestoreFromTrash as RestoreIcon,
  Search as SearchIcon,
} from '@mui/icons-material'

import PageHeader from '@/components/common/PageHeader'

interface ProductsToolbarProps {
  isMobile: boolean
  productCount: number
  searchTerm: string
  selectedCategory: string
  categories: any[]
  calculatorPanelOpen: boolean
  isExporting: boolean
  hasProducts: boolean
  marginRight: string | { xs: string; md: string }
  onSearchChange: (value: string) => void
  onCategoryChange: (value: string) => void
  onOpenDeleted: () => void
  onAddProduct: () => void
  onExportClick: (event: React.MouseEvent<HTMLElement>) => void
  onImport: () => void
  onToggleCalculator: () => void
}

const ProductsToolbar: React.FC<ProductsToolbarProps> = ({
  isMobile,
  searchTerm,
  selectedCategory,
  categories,
  calculatorPanelOpen,
  isExporting,
  hasProducts,
  marginRight,
  onSearchChange,
  onCategoryChange,
  onOpenDeleted,
  onAddProduct,
  onExportClick,
  onImport,
  onToggleCalculator,
}) => {
  return (
    <>
      <Box
        sx={{
          mb: 3,
          transition: 'margin-right 0.3s ease-in-out',
          marginRight,
        }}
      >
        <PageHeader
          title="Products"
          subtitle="Manage your product catalog and inventory"
          secondaryAction={{ label: 'View Deleted', onClick: onOpenDeleted }}
          primaryAction={{ label: 'Add Product', onClick: onAddProduct }}
        />
      </Box>

      <Paper sx={{ p: 2, mb: 3 }}>
        <Box
          sx={{
            display: 'flex',
            flexDirection: isMobile ? 'column' : 'row',
            gap: isMobile ? 2 : 1,
            alignItems: isMobile ? 'stretch' : 'center',
            '& > *': { alignSelf: isMobile ? 'stretch' : 'flex-start' },
            transition: 'margin-right 0.3s ease-in-out',
            marginRight,
          }}
        >
          <TextField
            placeholder="Search by name, barcode, or brand..."
            value={searchTerm}
            onChange={(event) => onSearchChange(event.target.value)}
            size="medium"
            sx={{
              minWidth: isMobile ? 'auto' : 250,
              flex: isMobile ? 'none' : 1,
              maxWidth: isMobile ? 'none' : 400,
              '& .MuiOutlinedInput-root': {
                height: '40px',
                fontSize: '0.875rem',
                '& input': {
                  padding: '8.5px 14px',
                  fontSize: '0.875rem',
                },
              },
              '& .MuiInputAdornment-root .MuiSvgIcon-root': {
                fontSize: '1.25rem',
                color: 'action.active',
              },
            }}
            InputProps={{
              startAdornment: (
                <InputAdornment position="start">
                  <SearchIcon fontSize="small" />
                </InputAdornment>
              ),
            }}
          />

          <FormControl size="medium" sx={{ minWidth: isMobile ? 'auto' : 120, flex: 'none' }}>
            <InputLabel
              sx={{
                fontSize: '0.875rem',
                '&.MuiInputLabel-shrunk': {
                  fontSize: '0.7rem',
                },
              }}
            >
              Category
            </InputLabel>
            <Select
              value={selectedCategory}
              label="Category"
              onChange={(event) => onCategoryChange(event.target.value)}
              MenuProps={{
                PaperProps: {
                  style: { maxHeight: 'none', maxWidth: 'none', overflow: 'visible' },
                  sx: {
                    '& .MuiList-root': {
                      maxHeight: '400px',
                      overflow: 'auto',
                      padding: 0,
                    },
                  },
                },
                disablePortal: false,
                anchorOrigin: { vertical: 'bottom', horizontal: 'left' },
                transformOrigin: { vertical: 'top', horizontal: 'left' },
                sx: { zIndex: 9999 },
              }}
              sx={{
                height: '40px',
                fontSize: '0.875rem',
                '& .MuiSelect-select': {
                  display: 'flex',
                  alignItems: 'center',
                  fontSize: '0.875rem',
                  padding: '8.5px 14px',
                  height: '40px',
                  boxSizing: 'border-box',
                },
              }}
            >
              <MenuItem value="all" sx={{ fontSize: '0.875rem' }}>
                All
              </MenuItem>
              {categories.map((category: any) => (
                <MenuItem key={category.id} value={category.id} sx={{ fontSize: '0.875rem' }}>
                  {category.name}
                </MenuItem>
              ))}
            </Select>
          </FormControl>

          <Button
            variant="outlined"
            startIcon={<ExportIcon />}
            endIcon={<ArrowDropDownIcon />}
            size="medium"
            onClick={onExportClick}
            disabled={isExporting || !hasProducts}
            sx={{
              flex: 'none',
              height: '40px',
              fontSize: '0.875rem',
              fontWeight: 600,
            }}
          >
            {isExporting ? 'Exporting...' : 'Export'}
          </Button>

          <Button
            variant="outlined"
            startIcon={<CloudUploadIcon />}
            size="medium"
            onClick={onImport}
            sx={{
              flex: 'none',
              height: '40px',
              fontSize: '0.875rem',
              fontWeight: 600,
              color: 'success.main',
              borderColor: 'success.main',
              '&:hover': {
                borderColor: 'success.dark',
                backgroundColor: 'success.light',
              },
            }}
          >
            Import
          </Button>

          <Button
            variant="outlined"
            startIcon={<CalculateIcon />}
            size="medium"
            onClick={onToggleCalculator}
            sx={{
              flex: 'none',
              height: '40px',
              fontSize: '0.875rem',
              fontWeight: 600,
              color: calculatorPanelOpen ? 'info.dark' : 'info.main',
              borderColor: calculatorPanelOpen ? 'info.dark' : 'info.main',
              backgroundColor: calculatorPanelOpen ? 'info.light' : 'transparent',
              '&:hover': {
                borderColor: 'info.dark',
                backgroundColor: 'info.light',
              },
              transition: 'all 0.3s ease-in-out',
            }}
          >
            {calculatorPanelOpen ? 'Close Calculator' : 'Calculator'}
          </Button>
        </Box>
      </Paper>
    </>
  )
}

export default ProductsToolbar
