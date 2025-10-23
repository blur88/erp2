import React, { useState, useEffect, useCallback, useRef } from 'react'
import { useNavigate, useLocation } from 'react-router-dom'
import {
  Box,
  Typography,
  Paper,
  Button,
  TextField,
  Grid,
  Chip,
  IconButton,
  Menu,
  MenuItem,
  FormControl,
  InputLabel,
  Select,
  InputAdornment,
  Table,
  TableBody,
  TableCell,
  TableContainer,
  TableRow,
  TablePagination,
  CircularProgress,
  useTheme,
  useMediaQuery,
  Tabs,
  Tab,
} from '@mui/material'
import {
  Add as AddIcon,
  Search as SearchIcon,
  Edit as EditIcon,
  Delete as DeleteIcon,
  GetApp as ExportIcon,
  RestoreFromTrash as RestoreIcon,
  DragIndicator as DragIndicatorIcon,
  Calculate as CalculateIcon,
  ArrowDropDown as ArrowDropDownIcon,
  TableChart as TableChartIcon,
  PictureAsPdf as PictureAsPdfIcon,
  CloudUpload as CloudUploadIcon,
  Inventory2 as InventoryIcon,
} from '@mui/icons-material'
import { useDispatch, useSelector } from 'react-redux'
import { useNotification } from '@/hooks/useNotification'
import { useSearchAndFilter, useKeyboardShortcuts } from '@/hooks/useSearchAndFilter'
import { ApiService } from '@/services/api'
import DeletedProductsDialog from '@/components/inventory/DeletedProductsDialog'
import ProductImportDialog from '@/components/inventory/ProductImportDialog'
import ProductDetailsTab from '@/components/inventory/ProductDetailsTab'
import MovementHistoryTab from '@/components/inventory/MovementHistoryTab'
import ConfirmationDialog from '@/components/common/ConfirmationDialog'
import SlidingCalculatorPanel from '@/components/calculator/SlidingCalculatorPanel'
import type { Product } from '@/types'
import { formatCurrency } from '@/utils/currency'
import { exportProducts } from '@/utils/exportUtils'
import {
  fetchProducts,
  fetchCategories,
  deleteProduct,
  selectProducts,
  selectCategories,
  selectInventoryLoading,
  selectInventoryPagination,
  setProductFilters,
  selectProductFilters,
} from '@/store/slices/inventorySlice'
import { TYPOGRAPHY_STYLES, TABLE_STYLES } from '@/constants/typography'

const ProductsPage: React.FC = () => {
  const dispatch = useDispatch() as any
  const navigate = useNavigate()
  const location = useLocation()
  const { showSuccess, showError } = useNotification()
  const theme = useTheme()
  const isMobile = useMediaQuery(theme.breakpoints.down('md'))

  const products = useSelector(selectProducts) || []
  const categories = useSelector(selectCategories) || []
  const loading = useSelector(selectInventoryLoading)
  const pagination = useSelector(selectInventoryPagination)?.products
  const productFilters = useSelector(selectProductFilters) || { search: '', categoryId: '', lowStock: false, inStock: true }
  const [page, setPage] = useState(0)
  const [rowsPerPage, setRowsPerPage] = useState(20)
  const [selectedProductForDetails, setSelectedProductForDetails] = useState<Product | null>(null)
  const [deletedProductsDialogOpen, setDeletedProductsDialogOpen] = useState(false)
  const [importDialogOpen, setImportDialogOpen] = useState(false)
  const [calculatorPanelOpen, setCalculatorPanelOpen] = useState(false)
  const [deleteConfirmOpen, setDeleteConfirmOpen] = useState(false)
  const [productToDelete, setProductToDelete] = useState<Product | null>(null)
  const [focusedProductIndex, setFocusedProductIndex] = useState<number>(-1)
  const [exportMenuAnchor, setExportMenuAnchor] = useState<null | HTMLElement>(null)
  const [isExporting, setIsExporting] = useState(false)
  const [hasNavigatedWithSelection, setHasNavigatedWithSelection] = useState(false)
  const [currentTab, setCurrentTab] = useState(0)
  const productListRef = useRef<HTMLDivElement>(null)

  // Search and filter functionality
  const { searchTerm, setSearchTerm, focusSearchInput } = useSearchAndFilter({
    initialSearchTerm: productFilters.search,
    onSearchChange: (searchTerm) => {
      dispatch(setProductFilters({ search: searchTerm }))
    },
  })

  // Local state for category filter (will be moved to Redux)
  const [selectedCategory, setSelectedCategory] = useState(productFilters.categoryId || 'all')

  // Update Redux when local category changes
  useEffect(() => {
    dispatch(setProductFilters({ categoryId: selectedCategory === 'all' ? undefined : selectedCategory }))
  }, [dispatch, selectedCategory])

  useEffect(() => {
    dispatch(fetchCategories({ includeProductCount: true }))
  }, [dispatch])

  useEffect(() => {
    dispatch(fetchProducts({
      page: page + 1, // API expects 1-based page numbers
      limit: rowsPerPage,
      search: productFilters.search || undefined,
      categoryId: productFilters.categoryId || undefined
    }))
  }, [dispatch, productFilters.search, productFilters.categoryId, page, rowsPerPage])

  // Update selectedProductForDetails when products change (to reflect updates in detail view)
  useEffect(() => {
    if (selectedProductForDetails && products.length > 0) {
      const updatedProduct = products.find(p => p.id === selectedProductForDetails.id)
      if (updatedProduct) {
        // Only update if the product data has actually changed to avoid unnecessary re-renders
        const hasChanged = JSON.stringify(updatedProduct) !== JSON.stringify(selectedProductForDetails)
        if (hasChanged) {
          setSelectedProductForDetails(updatedProduct)
        }
      } else {
        // Product might have been deleted, clear selection
        setSelectedProductForDetails(null)
      }
    }
  }, [products, selectedProductForDetails])


  // Store the selected product ID from navigation to prevent it from being lost
  const [pendingProductId, setPendingProductId] = useState<string | null>(null)

  // Auto-select product when navigating from create/edit page
  useEffect(() => {
    const state = location.state as { selectedProductId?: string }
    if (state?.selectedProductId && state.selectedProductId !== pendingProductId) {
      setHasNavigatedWithSelection(true)
      setPendingProductId(state.selectedProductId)

      // Clear the navigation state to prevent re-triggering
      navigate(location.pathname, { replace: true, state: {} })
    }
  }, [location.state, location.pathname, navigate, pendingProductId])

  // Separate effect to handle product selection when products list changes
  useEffect(() => {
    if (pendingProductId && products.length > 0) {
      const product = products.find((p: Product) => p.id === pendingProductId)
      if (product) {
        // Product found in current list
        setSelectedProductForDetails(product)
        const index = products.findIndex((p: Product) => p.id === pendingProductId)
        if (index >= 0) {
          setFocusedProductIndex(index)
        }
        // Clear the pending ID and reset the flag
        setPendingProductId(null)
        setTimeout(() => setHasNavigatedWithSelection(false), 1000)
      } else {
        // Product not in current list - fetch it directly by ID
        ApiService.get(`/inventory/products/${pendingProductId}`)
          .then((response: any) => {
            const product = response as Product
            setSelectedProductForDetails(product)
            setFocusedProductIndex(-1) // No index since it's not in the list

            // Also refresh the products list to get the latest data
            setPage(0)
            dispatch(fetchProducts({
              page: 1,
              limit: rowsPerPage,
              search: undefined,
              categoryId: undefined
            }))
          })
          .catch((error) => {
            console.error('Failed to fetch product:', error)
            showError('Failed to load the product')
          })
          .finally(() => {
            setPendingProductId(null)
            setTimeout(() => setHasNavigatedWithSelection(false), 1000)
          })
      }
    }
  }, [pendingProductId, products, dispatch, rowsPerPage, showError])

  // Reset focused index when products change or page changes
  useEffect(() => {
    setFocusedProductIndex(-1)
  }, [page, rowsPerPage, productFilters.search, productFilters.categoryId])

  // Auto-focus the first product when the list becomes available
  useEffect(() => {
    if (products.length > 0 && focusedProductIndex === -1) {
      // Only auto-focus if we don't have a selected product AND we haven't just navigated with a selection
      if (!selectedProductForDetails && !hasNavigatedWithSelection) {
        setFocusedProductIndex(0)
        // Automatically show product details for the first product
        setSelectedProductForDetails(products[0])
      }
    }
  }, [products, focusedProductIndex, selectedProductForDetails, hasNavigatedWithSelection])

  // Auto-scroll to keep focused item visible
  useEffect(() => {
    if (focusedProductIndex >= 0 && productListRef.current) {
      const focusedRow = productListRef.current.querySelector(`[data-product-index="${focusedProductIndex}"]`)
      if (focusedRow) {
        focusedRow.scrollIntoView({
          behavior: 'smooth',
          block: 'nearest'
        })
      }
    }
  }, [focusedProductIndex])

  const handleAddProduct = () => {
    navigate('/inventory/products/create')
  }


  // Enhanced keyboard shortcuts with table navigation
  const handleNavigateUp = useCallback(() => {
    if (focusedProductIndex > 0) {
      const newIndex = focusedProductIndex - 1
      setFocusedProductIndex(newIndex)
      setSelectedProductForDetails(products[newIndex])
    }
  }, [focusedProductIndex, products])

  const handleNavigateDown = useCallback(() => {
    if (focusedProductIndex < products.length - 1) {
      const newIndex = focusedProductIndex + 1
      setFocusedProductIndex(newIndex)
      setSelectedProductForDetails(products[newIndex])
    }
  }, [focusedProductIndex, products])

  const handleNavigateHome = useCallback(() => {
    if (products.length > 0) {
      setFocusedProductIndex(0)
      setSelectedProductForDetails(products[0])
    }
  }, [products])

  const handleNavigateEnd = useCallback(() => {
    if (products.length > 0) {
      const lastIndex = products.length - 1
      setFocusedProductIndex(lastIndex)
      setSelectedProductForDetails(products[lastIndex])
    }
  }, [products])

  const handlePageUpNavigation = useCallback(() => {
    const newIndex = Math.max(0, focusedProductIndex - rowsPerPage)
    setFocusedProductIndex(newIndex)
    if (products[newIndex]) {
      setSelectedProductForDetails(products[newIndex])
    }
  }, [focusedProductIndex, rowsPerPage, products])

  const handlePageDownNavigation = useCallback(() => {
    const newIndex = Math.min(products.length - 1, focusedProductIndex + rowsPerPage)
    setFocusedProductIndex(newIndex)
    if (products[newIndex]) {
      setSelectedProductForDetails(products[newIndex])
    }
  }, [focusedProductIndex, rowsPerPage, products])

  const handleEnterAction = useCallback(() => {
    if (focusedProductIndex >= 0 && products[focusedProductIndex]) {
      const product = products[focusedProductIndex]
      navigate(`/inventory/products/${product.id}/edit`)
    }
  }, [focusedProductIndex, products, navigate])

  const handleEscapeAction = useCallback(() => {
    setFocusedProductIndex(-1)
    setSelectedProductForDetails(null)
    setDeletedProductsDialogOpen(false)
    setImportDialogOpen(false)
    setDeleteConfirmOpen(false)
  }, [])

  // Only keep keyboard navigation and search shortcuts
  useKeyboardShortcuts({
    onSearch: focusSearchInput,
    onArrowUp: handleNavigateUp,
    onArrowDown: handleNavigateDown,
    onEnter: handleEnterAction,
    onPageUp: handlePageUpNavigation,
    onPageDown: handlePageDownNavigation,
    onHome: handleNavigateHome,
    onEnd: handleNavigateEnd,
    onEscape: handleEscapeAction,
  })

  const handleEditProduct = (product: Product) => {
    // Navigate to edit page instead of inline editing
    navigate(`/inventory/products/${product.id}/edit`)
  }

  const handleDeleteProduct = (product: Product) => {
    setProductToDelete(product)
    setDeleteConfirmOpen(true)
  }

  const handleConfirmDelete = async () => {
    if (productToDelete) {
      try {
        const result = await dispatch(deleteProduct(productToDelete.id))

        if (deleteProduct.fulfilled.match(result)) {
          showSuccess(`Product ${productToDelete.name} deleted successfully`)

          // If the deleted product was selected for details, clear the selection
          if (selectedProductForDetails?.id === productToDelete.id) {
            setSelectedProductForDetails(null)
          }

          // Refresh the product list to ensure consistency
          dispatch(fetchProducts({
            page: page + 1, // API expects 1-based page numbers
            limit: rowsPerPage,
            search: productFilters.search || undefined,
            categoryId: productFilters.categoryId || undefined
          }))
        } else {
          throw new Error(result.payload as string)
        }
      } catch (error: any) {
        const errorMessage = error?.message || 'Failed to delete product. Please try again.'
        showError(errorMessage)
      } finally {
        setDeleteConfirmOpen(false)
        setProductToDelete(null)
      }
    }
  }

  const handleCancelDelete = () => {
    setDeleteConfirmOpen(false)
    setProductToDelete(null)
  }


  const getStockStatus = (product: any) => {
    const stock = product.stockQuantity || 0
    const reorderLevel = product.reorderLevel || 0
    
    if (stock <= 0) {
      return { label: 'Out of Stock', color: 'error' as const }
    } else if (stock <= reorderLevel) {
      return { label: 'Low Stock', color: 'warning' as const }
    } else {
      return { label: 'In Stock', color: 'success' as const }
    }
  }

  // Export handlers
  const handleExportClick = (event: React.MouseEvent<HTMLElement>) => {
    setExportMenuAnchor(event.currentTarget)
  }

  const handleExportClose = () => {
    setExportMenuAnchor(null)
  }

  const handleExport = async (format: 'csv' | 'excel' | 'pdf') => {
    try {
      setIsExporting(true)
      handleExportClose()
      
      const exportData = {
        products: products,
        filters: {
          search: productFilters.search || undefined,
          category: productFilters.categoryId || undefined
        }
      }
      
      await exportProducts(format, exportData)
      showSuccess(`Products exported successfully as ${format.toUpperCase()}`)
    } catch (error: any) {
      console.error('Export error:', error)
      showError(error.message || `Failed to export as ${format.toUpperCase()}`)
    } finally {
      setIsExporting(false)
    }
  }


  return (
    <Box>
      {/* Header */}
      <Box sx={{ 
        display: 'flex', 
        flexDirection: isMobile ? 'column' : 'row',
        justifyContent: 'space-between', 
        alignItems: isMobile ? 'stretch' : 'center', 
        mb: 4,
        gap: isMobile ? 2 : 0,
        transition: 'margin-right 0.3s ease-in-out',
        marginRight: calculatorPanelOpen ? { xs: '0px', md: '320px' } : '0px',
      }}>
        <Box sx={{ mb: isMobile ? 2 : 0 }}>
          <Typography variant={isMobile ? TYPOGRAPHY_STYLES.pageHeader.mobileVariant : TYPOGRAPHY_STYLES.pageHeader.variant} sx={{
            fontWeight: TYPOGRAPHY_STYLES.pageHeader.fontWeight,
            mb: 1,
            display: 'flex',
            alignItems: 'center',
            gap: 2
          }}>
            <InventoryIcon sx={{
              fontSize: TYPOGRAPHY_STYLES.pageHeader.icon.fontSize,
              color: TYPOGRAPHY_STYLES.pageHeader.icon.color
            }} />
            Products
          </Typography>
          <Typography variant={TYPOGRAPHY_STYLES.pageSubtitle.variant} color={TYPOGRAPHY_STYLES.pageSubtitle.color}>
            Manage your product catalog and inventory ({pagination?.total || 0} total)
          </Typography>
        </Box>
        <Box sx={{ 
          display: 'flex', 
          flexDirection: isMobile ? 'column' : 'row',
          gap: isMobile ? 1.5 : 1,
          alignItems: isMobile ? 'stretch' : 'center'
        }}>
          <Button
            variant="outlined"
            startIcon={!isMobile ? <RestoreIcon /> : undefined}
            onClick={() => setDeletedProductsDialogOpen(true)}
            size={isMobile ? "medium" : "medium"}
            fullWidth={isMobile}
            sx={{
              color: 'warning.main',
              borderColor: 'warning.main',
              '&:hover': {
                borderColor: 'warning.dark',
                backgroundColor: 'warning.light'
              }
            }}
          >
            {isMobile ? "View Deleted" : "View Deleted"}
          </Button>
          <Button
            variant="contained"
            startIcon={!isMobile ? <AddIcon /> : undefined}
            size={isMobile ? "medium" : "medium"}
            onClick={handleAddProduct}
            fullWidth={isMobile}
          >
            {isMobile ? "Add New Product" : "Add Product"}
          </Button>
        </Box>
      </Box>

      {/* Filters and Search */}
      <Box sx={{
        display: 'flex',
        flexDirection: isMobile ? 'column' : 'row',
        gap: isMobile ? 2 : 1,
        alignItems: isMobile ? 'stretch' : 'center',
        mb: 3,
        '& > *': {
          alignSelf: isMobile ? 'stretch' : 'flex-start'
        },
        transition: 'margin-right 0.3s ease-in-out',
        marginRight: calculatorPanelOpen ? { xs: '0px', md: '320px' } : '0px',
      }}>
        <TextField
          placeholder="Search by name, barcode, or brand..."
          value={searchTerm}
          onChange={(e) => setSearchTerm(e.target.value)}
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
                fontSize: TYPOGRAPHY_STYLES.searchField.input.fontSize
              }
            },
            '& .MuiInputAdornment-root': {
              '& .MuiSvgIcon-root': {
                fontSize: TYPOGRAPHY_STYLES.searchField.icon.fontSize,
                color: TYPOGRAPHY_STYLES.searchField.icon.color
              }
            }
          }}
          InputProps={{
            startAdornment: (
              <InputAdornment position="start">
                <SearchIcon fontSize="small" />
              </InputAdornment>
            ),
          }}
        />
        <FormControl
          size="medium"
          sx={{
            minWidth: isMobile ? 'auto' : 120,
            flex: 'none'
          }}
        >
          <InputLabel
            sx={{
              fontSize: TYPOGRAPHY_STYLES.searchField.input.fontSize,
              '&.MuiInputLabel-shrunk': {
                fontSize: TYPOGRAPHY_STYLES.tableCell.caption.fontSize
              }
            }}
          >
            Category
          </InputLabel>
          <Select
            value={selectedCategory}
            label="Category"
            onChange={(e) => setSelectedCategory(e.target.value)}
            MenuProps={{
              PaperProps: {
                style: {
                  maxHeight: 'none', // Remove height restriction
                  maxWidth: 'none',  // Remove width restriction
                  overflow: 'visible' // Ensure content is fully visible
                },
                sx: {
                  '& .MuiList-root': {
                    maxHeight: '400px', // Set max height on the list itself
                    overflow: 'auto',   // Enable scrolling on the list
                    padding: 0
                  }
                }
              },
              // Render dropdown in document body to avoid clipping
              disablePortal: false,
              // Allow dropdown to position freely
              anchorOrigin: {
                vertical: 'bottom',
                horizontal: 'left'
              },
              transformOrigin: {
                vertical: 'top',
                horizontal: 'left'
              },
              // Ensure z-index is high enough
              sx: {
                zIndex: 9999
              }
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
                boxSizing: 'border-box'
              },
              '& .MuiOutlinedInput-notchedOutline': {
                borderColor: 'rgba(0, 0, 0, 0.23)'
              },
              '&:hover .MuiOutlinedInput-notchedOutline': {
                borderColor: 'rgba(0, 0, 0, 0.87)'
              },
              '&.Mui-focused .MuiOutlinedInput-notchedOutline': {
                borderColor: theme.palette.primary.main,
                borderWidth: 2
              }
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
          onClick={handleExportClick}
          disabled={isExporting || products.length === 0}
          sx={{
            flex: 'none',
            height: TYPOGRAPHY_STYLES.searchField.input.height,
            fontSize: TYPOGRAPHY_STYLES.searchField.input.fontSize,
            fontWeight: TYPOGRAPHY_STYLES.tableCell.primary.fontWeight
          }}
        >
          {isExporting ? 'Exporting...' : 'Export'}
        </Button>
        <Button
          variant="outlined"
          startIcon={<CloudUploadIcon />}
          size="medium"
          onClick={() => setImportDialogOpen(true)}
          sx={{
            flex: 'none',
            height: TYPOGRAPHY_STYLES.searchField.input.height,
            fontSize: TYPOGRAPHY_STYLES.searchField.input.fontSize,
            fontWeight: TYPOGRAPHY_STYLES.tableCell.primary.fontWeight,
            color: 'success.main',
            borderColor: 'success.main',
            '&:hover': {
              borderColor: 'success.dark',
              backgroundColor: 'success.light'
            }
          }}
        >
          Import
        </Button>
        <Button
          variant="outlined"
          startIcon={<CalculateIcon />}
          size="medium"
          onClick={() => setCalculatorPanelOpen(!calculatorPanelOpen)}
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
              backgroundColor: 'info.light'
            },
            transition: 'all 0.3s ease-in-out'
          }}
        >
          {calculatorPanelOpen ? "Close Calculator" : "Calculator"}
        </Button>
      </Box>

      {/* Split Layout: Active Products and Product Details */}
      <Box
        sx={{
          transition: 'margin-right 0.3s ease-in-out',
          marginRight: calculatorPanelOpen ? { xs: '0px', md: '320px' } : '0px',
        }}
      >
        <Grid container spacing={3}>
          {/* Left Side - Active Products List */}
          <Grid item xs={12} md={3}>
            <Paper sx={{ height: 'calc(100vh - 300px)', display: 'flex', flexDirection: 'column' }}>
            <Box sx={{ p: TABLE_STYLES.cell.padding.px, borderBottom: TABLE_STYLES.cell.border }}>
              <Box sx={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
                <Typography variant={TYPOGRAPHY_STYLES.tableHeader.variant} sx={{ fontWeight: TYPOGRAPHY_STYLES.tableHeader.fontWeight, fontSize: TYPOGRAPHY_STYLES.tableHeader.fontSize, textTransform: 'uppercase', letterSpacing: '0.5px' }}>
                  Product List ({pagination?.total || 0})
                </Typography>
              </Box>
            </Box>
            <Box 
              sx={{ 
                flex: 1, 
                overflow: 'hidden', 
                display: 'flex', 
                flexDirection: 'column',
                '&:focus': {
                  outline: '2px solid',
                  outlineColor: 'primary.main',
                  outlineOffset: '-2px'
                }
              }}
              ref={productListRef}
              tabIndex={0}
              onFocus={() => {
                // Auto-focus first product when the container gets focus
                if (products.length > 0 && focusedProductIndex === -1) {
                  setFocusedProductIndex(0)
                  // Automatically show product details for the first product
                  setSelectedProductForDetails(products[0])
                }
              }}
            >
              {loading?.products ? (
                <Box sx={{ display: 'flex', justifyContent: 'center', alignItems: 'center', flex: 1 }}>
                  <CircularProgress />
                </Box>
              ) : products.length === 0 ? (
                <Box sx={{ p: 4, textAlign: 'center', flex: 1, display: 'flex', alignItems: 'center', justifyContent: 'center' }}>
                  <Typography variant={TYPOGRAPHY_STYLES.tableCell.primary.variant} color="text.secondary">
                    No products found. Create your first product to get started.
                  </Typography>
                </Box>
              ) : (
                <>
                  <TableContainer sx={{ flex: 1, overflowX: 'auto' }}>
                    <Table
                      size={TABLE_STYLES.size}
                      stickyHeader
                      sx={{
                        '& .MuiTableCell-root': {
                          borderBottom: TABLE_STYLES.cell.border,
                          py: TABLE_STYLES.cell.padding.py,
                          px: TABLE_STYLES.cell.padding.px
                        }
                      }}
                    >
                      <TableBody>
                        {products.map((product: any, index: number) => {
                          const isSelected = selectedProductForDetails?.id === product.id
                          const isFocused = focusedProductIndex === index
                          return (
                            <TableRow 
                              key={product.id}
                              data-product-index={index}
                              hover
                              tabIndex={-1}
                              onClick={() => {
                                setSelectedProductForDetails(product)
                                setFocusedProductIndex(index)
                              }}
                              sx={{
                                cursor: 'pointer',
                                backgroundColor: isSelected 
                                  ? 'action.selected' 
                                  : isFocused 
                                    ? 'primary.light'
                                    : 'inherit',
                                '&:hover': {
                                  backgroundColor: isSelected 
                                    ? 'action.selected' 
                                    : isFocused 
                                      ? 'primary.light'
                                      : 'action.hover'
                                },
                                transition: 'background-color 0.2s ease',
                                height: TABLE_STYLES.row.height,
                                ...(isFocused && {
                                  outline: `2px solid ${theme.palette.primary.main}`,
                                  outlineOffset: '-2px'
                                })
                              }}
                            >
                              <TableCell sx={{ py: TABLE_STYLES.cell.padding.py }}>
                                <Box sx={{ display: 'flex', alignItems: 'center', gap: 0.5 }}>
                                  <DragIndicatorIcon sx={{ color: 'text.secondary', fontSize: TYPOGRAPHY_STYLES.searchField.input.fontSize }} />
                                  <Typography variant={TYPOGRAPHY_STYLES.tableCell.secondary.variant} sx={{ fontSize: '0.8rem', lineHeight: TYPOGRAPHY_STYLES.tableCell.secondary.lineHeight, fontWeight: 400 }}>
                                    {product.name}
                                  </Typography>
                                </Box>
                              </TableCell>
                            </TableRow>
                          )
                        })}
                      </TableBody>
                    </Table>
                  </TableContainer>
                  <TablePagination
                    rowsPerPageOptions={[10, 20, 50]}
                    component="div"
                    count={pagination?.total || 0}
                    rowsPerPage={rowsPerPage}
                    page={page}
                    onPageChange={(_, newPage) => setPage(newPage)}
                    onRowsPerPageChange={(e) => {
                      setRowsPerPage(parseInt(e.target.value, 10))
                      setPage(0)
                    }}
                    size="small"
                  />
                </>
              )}
            </Box>
          </Paper>
        </Grid>

        {/* Right Side - Product Details View with Tabs */}
        <Grid item xs={12} md={9}>
          <Paper sx={{ height: 'calc(100vh - 300px)', display: 'flex', flexDirection: 'column' }}>
            {!selectedProductForDetails ? (
              <Box sx={{ flex: 1, display: 'flex', justifyContent: 'center', alignItems: 'center' }}>
                <Typography variant="body1" color="text.secondary" textAlign="center">
                  Select a product from the list to view its details
                </Typography>
              </Box>
            ) : (
              <>
                <Box sx={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', borderBottom: 1, borderColor: 'divider' }}>
                  <Tabs
                    value={currentTab}
                    onChange={(_, newValue) => setCurrentTab(newValue)}
                    sx={{
                      minHeight: 40,
                      flex: 1,
                      '& .MuiTab-root': {
                        minHeight: 40,
                        fontSize: TYPOGRAPHY_STYLES.tableCell.primary.fontSize,
                        textTransform: 'none',
                        fontWeight: TYPOGRAPHY_STYLES.tableCell.primary.fontWeight,
                      }
                    }}
                  >
                    <Tab label="Details" />
                    <Tab label="Movement History" />
                  </Tabs>
                  <Box
                    className="product-actions"
                    sx={{
                      display: 'flex',
                      alignItems: 'center',
                      gap: 0.25,
                      pr: TABLE_STYLES.cell.padding.px,
                      opacity: 0.7,
                      transition: 'opacity 0.2s ease'
                    }}
                  >
                    <IconButton
                      size="small"
                      title={`Edit ${selectedProductForDetails.name}`}
                      aria-label={`Edit product ${selectedProductForDetails.name}`}
                      onClick={() => handleEditProduct(selectedProductForDetails)}
                      sx={{
                        height: `${TABLE_STYLES.row.height * 0.75}px`,
                        width: `${TABLE_STYLES.row.height * 0.75}px`,
                        minHeight: 20,
                        minWidth: 20,
                        p: 0.125,
                        color: 'primary.main',
                        '&:hover': {
                          backgroundColor: 'primary.light',
                          color: 'primary.dark'
                        }
                      }}
                    >
                      <EditIcon sx={{
                        fontSize: `${TABLE_STYLES.row.height * 0.5}px`
                      }} />
                    </IconButton>
                    <IconButton
                      size="small"
                      title={`Delete ${selectedProductForDetails.name}`}
                      aria-label={`Delete product ${selectedProductForDetails.name}`}
                      onClick={() => handleDeleteProduct(selectedProductForDetails)}
                      sx={{
                        height: `${TABLE_STYLES.row.height * 0.75}px`,
                        width: `${TABLE_STYLES.row.height * 0.75}px`,
                        minHeight: 20,
                        minWidth: 20,
                        p: 0.125,
                        color: 'error.main',
                        '&:hover': {
                          backgroundColor: 'error.light',
                          color: 'error.dark'
                        }
                      }}
                    >
                      <DeleteIcon sx={{
                        fontSize: `${TABLE_STYLES.row.height * 0.5}px`
                      }} />
                    </IconButton>
                  </Box>
                </Box>

                <Box sx={{ flex: 1, overflow: 'auto', p: TABLE_STYLES.cell.padding.px }}>
                  {currentTab === 0 && (
                    <ProductDetailsTab product={selectedProductForDetails} />
                  )}
                  {currentTab === 1 && (
                    <MovementHistoryTab productId={selectedProductForDetails.id} />
                  )}
                </Box>
              </>
            )}
          </Paper>
        </Grid>
      </Grid>
      </Box>

      {/* Export Menu */}
      <Menu
        anchorEl={exportMenuAnchor}
        open={Boolean(exportMenuAnchor)}
        onClose={handleExportClose}
        slotProps={{
          paper: {
            sx: { minWidth: 200 }
          }
        }}
      >
        <MenuItem 
          onClick={() => handleExport('csv')}
          disabled={isExporting}
        >
          <TableChartIcon sx={{ mr: 1, fontSize: TYPOGRAPHY_STYLES.tableHeader.fontSize }} />
          <Box>
            <Typography variant="body2" sx={{ fontWeight: 500 }}>
              Export as CSV
            </Typography>
            <Typography variant="caption" color="text.secondary">
              Comma-separated values
            </Typography>
          </Box>
        </MenuItem>
        <MenuItem 
          onClick={() => handleExport('excel')}
          disabled={isExporting}
        >
          <TableChartIcon sx={{ mr: 1, fontSize: TYPOGRAPHY_STYLES.tableHeader.fontSize, color: 'success.main' }} />
          <Box>
            <Typography variant="body2" sx={{ fontWeight: 500 }}>
              Export as Excel
            </Typography>
            <Typography variant="caption" color="text.secondary">
              With summary & formatting
            </Typography>
          </Box>
        </MenuItem>
        <MenuItem 
          onClick={() => handleExport('pdf')}
          disabled={isExporting}
        >
          <PictureAsPdfIcon sx={{ mr: 1, fontSize: TYPOGRAPHY_STYLES.tableHeader.fontSize, color: 'error.main' }} />
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
              {productFilters.categoryId && (
                <>
                  <br />
                  Category filter applied
                </>
              )}
            </Typography>
          </Box>
        )}
      </Menu>


      {/* Sliding Calculator Panel */}
      <SlidingCalculatorPanel
        isOpen={calculatorPanelOpen}
        onClose={() => setCalculatorPanelOpen(false)}
      />

      {/* Deleted Products Dialog */}
      <DeletedProductsDialog
        open={deletedProductsDialogOpen}
        onClose={() => setDeletedProductsDialogOpen(false)}
      />

      {/* Product Import Dialog */}
      <ProductImportDialog
        open={importDialogOpen}
        onClose={() => setImportDialogOpen(false)}
        onImportSuccess={() => {
          dispatch(fetchProducts({
            page: page + 1,
            limit: rowsPerPage,
            search: productFilters.search || undefined,
            categoryId: productFilters.categoryId || undefined
          }))
          dispatch(fetchCategories({ includeProductCount: true }))
        }}
      />

      {/* Delete Confirmation Dialog */}
      <ConfirmationDialog
        open={deleteConfirmOpen}
        title="Confirm Delete"
        message={`Are you sure you want to delete "${productToDelete?.name}"? This will move it to deleted items.`}
        confirmText="Delete"
        cancelText="Cancel"
        onConfirm={handleConfirmDelete}
        onCancel={handleCancelDelete}
        severity="warning"
      />
    </Box>
  )
}

export default ProductsPage