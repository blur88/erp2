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
  ShoppingCart as ProductIcon,
} from '@mui/icons-material'

import { TYPOGRAPHY_STYLES } from '@/constants/typography'

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
  productCount,
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
          display: 'flex',
          flexDirection: isMobile ? 'column' : 'row',
          justifyContent: 'space-between',
          alignItems: isMobile ? 'stretch' : 'center',
          mb: 3,
          gap: isMobile ? 2 : 0,
          transition: 'margin-right 0.3s ease-in-out',
          marginRight,
        }}
      >
        <Box sx={{ mb: isMobile ? 2 : 0 }}>
          <Typography
            variant={isMobile ? TYPOGRAPHY_STYLES.pageHeader.mobileVariant : TYPOGRAPHY_STYLES.pageHeader.variant}
            sx={{
              fontWeight: TYPOGRAPHY_STYLES.pageHeader.fontWeight,
              mb: 1,
              display: 'flex',
              alignItems: 'center',
              gap: 2,
            }}
          >
            <ProductIcon
              sx={{
                fontSize: TYPOGRAPHY_STYLES.pageHeader.icon.fontSize,
                color: TYPOGRAPHY_STYLES.pageHeader.icon.color,
              }}
            />
            Products
          </Typography>
          <Typography variant="body2" color="text.secondary">
            Manage your product catalog and inventory ({productCount} total)
          </Typography>
        </Box>
        <Box
          sx={{
            display: 'flex',
            flexDirection: isMobile ? 'column' : 'row',
            gap: isMobile ? 1.5 : 1,
            alignItems: isMobile ? 'stretch' : 'center',
          }}
        >
          <Button
            variant="outlined"
            startIcon={!isMobile ? <RestoreIcon /> : undefined}
            onClick={onOpenDeleted}
            size="medium"
            fullWidth={isMobile}
            sx={{
              color: 'warning.main',
              borderColor: 'warning.main',
              '&:hover': {
                borderColor: 'warning.dark',
                backgroundColor: 'warning.light',
              },
            }}
          >
            View Deleted
          </Button>
          <Button
            variant="contained"
            startIcon={!isMobile ? <AddIcon /> : undefined}
            size="medium"
            onClick={onAddProduct}
            fullWidth={isMobile}
          >
            {isMobile ? 'Add New Product' : 'Add Product'}
          </Button>
        </Box>
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
                height: TYPOGRAPHY_STYLES.searchField.input.height,
                fontSize: TYPOGRAPHY_STYLES.searchField.input.fontSize,
                '& input': {
                  padding: TYPOGRAPHY_STYLES.searchField.input.padding,
                  fontSize: TYPOGRAPHY_STYLES.searchField.input.fontSize,
                },
              },
              '& .MuiInputAdornment-root .MuiSvgIcon-root': {
                fontSize: TYPOGRAPHY_STYLES.searchField.icon.fontSize,
                color: TYPOGRAPHY_STYLES.searchField.icon.color,
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
                fontSize: TYPOGRAPHY_STYLES.searchField.input.fontSize,
                '&.MuiInputLabel-shrunk': {
                  fontSize: TYPOGRAPHY_STYLES.tableCell.caption.fontSize,
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
                height: TYPOGRAPHY_STYLES.searchField.input.height,
                fontSize: TYPOGRAPHY_STYLES.searchField.input.fontSize,
                '& .MuiSelect-select': {
                  display: 'flex',
                  alignItems: 'center',
                  fontSize: TYPOGRAPHY_STYLES.searchField.input.fontSize,
                  padding: TYPOGRAPHY_STYLES.searchField.input.padding,
                  height: TYPOGRAPHY_STYLES.searchField.input.height,
                  boxSizing: 'border-box',
                },
              }}
            >
              <MenuItem value="all" sx={{ fontSize: TYPOGRAPHY_STYLES.searchField.input.fontSize }}>
                All
              </MenuItem>
              {categories.map((category: any) => (
                <MenuItem key={category.id} value={category.id} sx={{ fontSize: TYPOGRAPHY_STYLES.searchField.input.fontSize }}>
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
              height: TYPOGRAPHY_STYLES.searchField.input.height,
              fontSize: TYPOGRAPHY_STYLES.searchField.input.fontSize,
              fontWeight: TYPOGRAPHY_STYLES.tableCell.primary.fontWeight,
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
              height: TYPOGRAPHY_STYLES.searchField.input.height,
              fontSize: TYPOGRAPHY_STYLES.searchField.input.fontSize,
              fontWeight: TYPOGRAPHY_STYLES.tableCell.primary.fontWeight,
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
              height: TYPOGRAPHY_STYLES.searchField.input.height,
              fontSize: TYPOGRAPHY_STYLES.searchField.input.fontSize,
              fontWeight: TYPOGRAPHY_STYLES.tableCell.primary.fontWeight,
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
