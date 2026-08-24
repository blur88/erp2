import React, { useState, useCallback } from 'react'
import {
  Box,
  Typography,
  Paper,
  Button,
  TextField,
  Table,
  TableBody,
  TableCell,
  TableContainer,
  TableHead,
  TableRow,
  Alert,
  CircularProgress,
  Chip,
  Stack,
  Dialog,
  DialogTitle,
  DialogContent,
  DialogActions,
  InputAdornment,
} from '@mui/material'
import { AppButton } from '@/components/common/AppButton'
import { StatusChip } from '@/components/common/StatusChip'
import { default as BackIcon } from '@mui/icons-material/ArrowBack'
import { default as CheckCircleIcon } from '@mui/icons-material/CheckCircle'
import { default as EditIcon } from '@mui/icons-material/Edit'
import { default as SaveIcon } from '@mui/icons-material/Save'
import { default as RefreshIcon } from '@mui/icons-material/Refresh'
import { default as AdjustIcon } from '@mui/icons-material/TrendingUp'
import { useLocation, useNavigate, useParams } from 'react-router-dom'
import { useNotification } from '@/hooks/useNotification'
import {
  useApplyPercentageAdjustmentMutation,
  useBulkUpdatePricesMutation,
  useGetPriceListItemsQuery,
  useGetPriceListQuery,
} from '@/store/api/priceListApi'
import type { PriceListItem } from '@/types'
import { TABLE_STYLES } from '@/constants/tableStyles'
import { formatCurrency } from '@/utils/currency'
import { currentListPath } from '@/utils/listQuery'
import { formatDate as formatDisplayDate } from '@/utils/formatters'

const PriceListDetailsPage: React.FC = () => {
  const { id } = useParams<{ id: string }>()
  const navigate = useNavigate()
  const location = useLocation()
  const { showSuccess, showError } = useNotification()

  const {
    data: selectedPriceList,
    isLoading: priceListLoading,
    error: priceListError,
    refetch: refetchPriceList,
  } = useGetPriceListQuery(id || '', { skip: !id })
  const {
    data: priceListItems = [],
    isLoading: priceListItemsLoading,
    error: priceListItemsError,
    refetch: refetchPriceListItems,
  } = useGetPriceListItemsQuery(id || '', { skip: !id })
  const [bulkUpdatePrices] = useBulkUpdatePricesMutation()
  const [applyPercentageAdjustment] = useApplyPercentageAdjustmentMutation()
  const error = priceListError || priceListItemsError

  // Local state
  const [editMode, setEditMode] = useState(false)
  const [editedItems, setEditedItems] = useState<Map<string, Partial<PriceListItem>>>(new Map())
  const [adjustmentDialogOpen, setAdjustmentDialogOpen] = useState(false)
  const [adjustmentPercentage, setAdjustmentPercentage] = useState<string>('')
  const [adjustmentType, setAdjustmentType] = useState<'increase' | 'decrease'>('increase')
  const [adjustCostBasis, setAdjustCostBasis] = useState(false)

  // Load price list and items
  const loadData = useCallback(() => {
    if (id) {
      refetchPriceList()
      refetchPriceListItems()
    }
  }, [id, refetchPriceList, refetchPriceListItems])

  // Handle edit item
  const handleEditItem = (item: PriceListItem, field: keyof PriceListItem, value: any) => {
    setEditedItems((prev) => {
      const newMap = new Map(prev)
      const existingEdit = newMap.get(item.id) || {}
      newMap.set(item.id, { ...existingEdit, [field]: value })
      return newMap
    })
  }

  // Handle save changes
  const handleSaveChanges = async () => {
    if (!id || editedItems.size === 0) return

    try {
      const updates = Array.from(editedItems.entries()).map(([itemId, changes]) => {
        const originalItem = priceListItems.find((i) => i.id === itemId)
        return {
          productId: originalItem?.productId || '',
          price: changes.price !== undefined ? Number(changes.price) : originalItem?.price || 0,
          costBasis:
            changes.costBasis !== undefined
              ? Number(changes.costBasis)
              : originalItem?.costBasis !== undefined
              ? originalItem.costBasis
              : undefined,
          marginPercent:
            changes.marginPercent !== undefined
              ? Number(changes.marginPercent)
              : originalItem?.marginPercent !== undefined
              ? originalItem.marginPercent
              : undefined,
          minQuantity:
            changes.minQuantity !== undefined
              ? Number(changes.minQuantity)
              : originalItem?.minQuantity || 1,
          maxQuantity:
            changes.maxQuantity !== undefined
              ? Number(changes.maxQuantity) || undefined
              : originalItem?.maxQuantity || undefined,
          notes: changes.notes !== undefined ? changes.notes : originalItem?.notes,
        }
      })

      await bulkUpdatePrices({ priceListId: id, items: updates }).unwrap()
      showSuccess('Prices updated successfully')
      setEditMode(false)
      setEditedItems(new Map())
      refetchPriceListItems()
    } catch (err: any) {
      showError(err.response?.data?.message || err.message || 'Failed to update prices')
    }
  }

  // Handle percentage adjustment
  const handleApplyAdjustment = async () => {
    if (!id || !adjustmentPercentage) return

    try {
      const percentage = parseFloat(adjustmentPercentage)
      if (isNaN(percentage) || percentage <= 0) {
        showError('Please enter a valid percentage')
        return
      }

      await applyPercentageAdjustment({
        priceListId: id,
        data: {
          percentage,
          adjustmentType,
          affectCostBasis: adjustCostBasis,
          roundTo: 2,
        },
      }).unwrap()

      showSuccess(`Prices ${adjustmentType === 'increase' ? 'increased' : 'decreased'} by ${percentage}%`)
      setAdjustmentDialogOpen(false)
      setAdjustmentPercentage('')
      refetchPriceListItems()
    } catch (err: any) {
      showError(err.response?.data?.message || err.message || 'Failed to apply adjustment')
    }
  }

  // Get edited value
  const getEditedValue = (item: PriceListItem, field: keyof PriceListItem) => {
    const edited = editedItems.get(item.id)
    return edited && edited[field] !== undefined ? edited[field] : item[field]
  }

  // Format date
  if (!selectedPriceList && priceListLoading) {
    return (
      <Box sx={{ display: 'flex', justifyContent: 'center', alignItems: 'center', minHeight: '400px' }}>
        <CircularProgress />
      </Box>
    )
  }

  if (!selectedPriceList) {
    return (
      <Box>
        <Alert severity="error">Price list not found</Alert>
        <AppButton variant="secondary" startIcon={<BackIcon />} onClick={() => navigate(currentListPath('/settings/price-lists'))} sx={{ mt: 2 }}>
          Back to Price Lists
        </AppButton>
      </Box>
    )
  }

  return (
    <>
      {/* Header */}
      <Box sx={{ mb: 3 }}>
        <AppButton variant="secondary" startIcon={<BackIcon />} onClick={() => navigate(currentListPath('/settings/price-lists'))} sx={{ mb: 2 }}>
          Back to Price Lists
        </AppButton>

        <Box sx={{ display: 'flex', justifyContent: 'space-between', alignItems: 'flex-start', mb: 2 }}>
          <Box>
            <Box sx={{ display: 'flex', alignItems: 'center', gap: 2, mb: 1 }}>
              <Typography variant="h4" sx={{ fontWeight: 700 }}>
                {selectedPriceList.name}
              </Typography>
              {selectedPriceList.isDefault && (
                <Chip label="Default" color="warning" size="small" />
              )}
              <StatusChip status={selectedPriceList.isActive ? 'active' : 'inactive'} />
            </Box>
            <Typography variant="body2" sx={{
              color: "text.secondary"
            }}>
              Code: {selectedPriceList.code}
            </Typography>
            {selectedPriceList.description && (
              <Typography
                variant="body2"
                sx={{
                  color: "text.secondary",
                  mt: 1
                }}>
                {selectedPriceList.description}
              </Typography>
            )}
          </Box>

          <Box sx={{ display: 'flex', gap: 1 }}>
            <AppButton variant="secondary" startIcon={<RefreshIcon />} onClick={loadData}>
              Refresh
            </AppButton>
            {!editMode && (
              <>
                <AppButton
                  variant="secondary"
                  startIcon={<AdjustIcon />}
                  onClick={() => setAdjustmentDialogOpen(true)}
                >
                  Adjust Prices
                </AppButton>
                <AppButton variant="secondary" startIcon={<EditIcon />} onClick={() => setEditMode(true)}>
                  Edit Prices
                </AppButton>
              </>
            )}
            {editMode && (
              <>
                <AppButton variant="secondary" onClick={() => { setEditMode(false); setEditedItems(new Map()); }}>
                  Cancel
                </AppButton>
                <AppButton
                  variant="success"
                  startIcon={<SaveIcon />}
                  onClick={handleSaveChanges}
                  disabled={editedItems.size === 0}
                >
                  Save Changes ({editedItems.size})
                </AppButton>
              </>
            )}
          </Box>
        </Box>

        {/* Metadata */}
        <Paper sx={{ p: 2, mb: 2 }}>
          <Stack direction="row" spacing={4}>
            <Box>
              <Typography variant="caption" sx={{
                color: "text.secondary"
              }}>
                Effective From
              </Typography>
              <Typography variant="body2">{formatDisplayDate(selectedPriceList.effectiveFrom)}</Typography>
            </Box>
            <Box>
              <Typography variant="caption" sx={{
                color: "text.secondary"
              }}>
                Effective To
              </Typography>
              <Typography variant="body2">{formatDisplayDate(selectedPriceList.effectiveTo)}</Typography>
            </Box>
            <Box>
              <Typography variant="caption" sx={{
                color: "text.secondary"
              }}>
                Total Items
              </Typography>
              <Typography variant="body2">{priceListItems.length}</Typography>
            </Box>
          </Stack>
        </Paper>
      </Box>
      {/* Error Alert */}
      {error && <Alert severity="error" sx={{ mb: 2 }}>Failed to load price list data</Alert>}
      {/* Price List Items Table */}
      <Paper sx={{ borderRadius: 2, overflow: 'hidden' }}>
        <TableContainer sx={{ overflowX: 'auto' }}>
          <Table
            size={TABLE_STYLES.size}
            sx={{
              '& .MuiTableCell-root': {
                borderBottom: TABLE_STYLES.cell.border,
                py: TABLE_STYLES.cell.padding.py,
                px: TABLE_STYLES.cell.padding.px,
              },
              '& .MuiTableBody-root .MuiTableRow-root:last-child .MuiTableCell-root': {
                borderBottom: 'none',
              },
            }}
          >
            <TableHead>
              <TableRow sx={{ '& .MuiTableCell-head': { fontWeight: 600, backgroundColor: 'grey.50', py: 1 } }}>
                <TableCell>
                  <Typography variant="caption" sx={{ fontWeight: 600, color: 'text.secondary', textTransform: 'uppercase', letterSpacing: '0.5px' }}>
                    Product
                  </Typography>
                </TableCell>
                <TableCell>
                  <Typography variant="caption" sx={{ fontWeight: 600, color: 'text.secondary', textTransform: 'uppercase', letterSpacing: '0.5px' }}>
                    Price
                  </Typography>
                </TableCell>
                <TableCell>
                  <Typography variant="caption" sx={{ fontWeight: 600, color: 'text.secondary', textTransform: 'uppercase', letterSpacing: '0.5px' }}>
                    Cost Basis
                  </Typography>
                </TableCell>
                <TableCell>
                  <Typography variant="caption" sx={{ fontWeight: 600, color: 'text.secondary', textTransform: 'uppercase', letterSpacing: '0.5px' }}>
                    Margin %
                  </Typography>
                </TableCell>
                <TableCell>
                  <Typography variant="caption" sx={{ fontWeight: 600, color: 'text.secondary', textTransform: 'uppercase', letterSpacing: '0.5px' }}>
                    Min Qty
                  </Typography>
                </TableCell>
                <TableCell>
                  <Typography variant="caption" sx={{ fontWeight: 600, color: 'text.secondary', textTransform: 'uppercase', letterSpacing: '0.5px' }}>
                    Max Qty
                  </Typography>
                </TableCell>
                <TableCell>
                  <Typography variant="caption" sx={{ fontWeight: 600, color: 'text.secondary', textTransform: 'uppercase', letterSpacing: '0.5px' }}>
                    Notes
                  </Typography>
                </TableCell>
              </TableRow>
            </TableHead>
            <TableBody>
              {priceListItemsLoading ? (
                <TableRow>
                  <TableCell colSpan={7} align="center" sx={{ py: 8 }}>
                    <CircularProgress />
                  </TableCell>
                </TableRow>
              ) : priceListItems.length === 0 ? (
                <TableRow>
                  <TableCell colSpan={7} align="center" sx={{ py: 8 }}>
                    <Typography sx={{
                      color: "text.secondary"
                    }}>No items in this price list</Typography>
                  </TableCell>
                </TableRow>
              ) : (
                priceListItems.map((item) => (
                  <TableRow
                    key={item.id}
                    hover
                    sx={{
                      '&:hover': {
                        backgroundColor: 'action.hover',
                      },
                      transition: 'background-color 0.2s ease',
                      height: TABLE_STYLES.row.height,
                      backgroundColor: editedItems.has(item.id) ? 'action.selected' : 'inherit',
                    }}
                  >
                    <TableCell>
                      <Typography variant="body2" sx={{ fontSize: '0.8rem', fontWeight: 400 }}>
                        {item.product?.name || 'Unknown Product'}
                      </Typography>
                    </TableCell>
                    <TableCell>
                      {editMode ? (
                        <TextField
                          type="number"
                          size="small"
                          value={getEditedValue(item, 'price')}
                          onChange={(e) => handleEditItem(item, 'price', e.target.value)}
                          slotProps={{
                            input: {
                              startAdornment: <InputAdornment position="start">$</InputAdornment>,
                            },
                          }}
                          sx={{ width: 120 }}
                        />
                      ) : (
                        <Typography variant="body2" sx={{ fontSize: '0.8rem', fontWeight: 400 }}>
                          {formatCurrency(item.price)}
                        </Typography>
                      )}
                    </TableCell>
                    <TableCell>
                      {editMode ? (
                        <TextField
                          type="number"
                          size="small"
                          value={getEditedValue(item, 'costBasis') || ''}
                          onChange={(e) => handleEditItem(item, 'costBasis', e.target.value)}
                          slotProps={{
                            input: {
                              startAdornment: <InputAdornment position="start">$</InputAdornment>,
                            },
                          }}
                          sx={{ width: 120 }}
                        />
                      ) : (
                        <Typography variant="body2" sx={{ fontSize: '0.8rem', fontWeight: 400 }}>
                          {item.costBasis ? formatCurrency(item.costBasis) : '-'}
                        </Typography>
                      )}
                    </TableCell>
                    <TableCell>
                      {editMode ? (
                        <TextField
                          type="number"
                          size="small"
                          value={getEditedValue(item, 'marginPercent') || ''}
                          onChange={(e) => handleEditItem(item, 'marginPercent', e.target.value)}
                          slotProps={{
                            input: {
                              endAdornment: <InputAdornment position="end">%</InputAdornment>,
                            },
                          }}
                          sx={{ width: 100 }}
                        />
                      ) : (
                        <Typography variant="body2" sx={{ fontSize: '0.8rem', fontWeight: 400 }}>
                          {item.marginPercent ? `${item.marginPercent}%` : '-'}
                        </Typography>
                      )}
                    </TableCell>
                    <TableCell>
                      {editMode ? (
                        <TextField
                          type="number"
                          size="small"
                          value={getEditedValue(item, 'minQuantity')}
                          onChange={(e) => handleEditItem(item, 'minQuantity', e.target.value)}
                          sx={{ width: 80 }}
                        />
                      ) : (
                        <Typography variant="body2" sx={{ fontSize: '0.8rem', fontWeight: 400 }}>
                          {item.minQuantity}
                        </Typography>
                      )}
                    </TableCell>
                    <TableCell>
                      {editMode ? (
                        <TextField
                          type="number"
                          size="small"
                          value={getEditedValue(item, 'maxQuantity') || ''}
                          onChange={(e) => handleEditItem(item, 'maxQuantity', e.target.value)}
                          sx={{ width: 80 }}
                        />
                      ) : (
                        <Typography variant="body2" sx={{ fontSize: '0.8rem', fontWeight: 400 }}>
                          {item.maxQuantity || '-'}
                        </Typography>
                      )}
                    </TableCell>
                    <TableCell>
                      {editMode ? (
                        <TextField
                          size="small"
                          value={getEditedValue(item, 'notes') || ''}
                          onChange={(e) => handleEditItem(item, 'notes', e.target.value)}
                          sx={{ width: 200 }}
                        />
                      ) : (
                        <Typography
                          variant="body2"
                          sx={{
                            fontSize: '0.8rem',
                            fontWeight: 400,
                            maxWidth: 200,
                            overflow: 'hidden',
                            textOverflow: 'ellipsis',
                            whiteSpace: 'nowrap',
                          }}
                        >
                          {item.notes || '-'}
                        </Typography>
                      )}
                    </TableCell>
                  </TableRow>
                ))
              )}
            </TableBody>
          </Table>
        </TableContainer>
      </Paper>
      {/* Percentage Adjustment Dialog */}
      <Dialog open={adjustmentDialogOpen} onClose={() => setAdjustmentDialogOpen(false)} maxWidth="sm" fullWidth>
        <DialogTitle>Apply Percentage Adjustment</DialogTitle>
        <DialogContent dividers>
          <Typography
            variant="body2"
            sx={{
              color: "text.secondary",
              mb: 3
            }}>
            Apply a percentage increase or decrease to all prices in this price list.
          </Typography>

          <Stack spacing={3}>
            <TextField
              label="Percentage"
              type="number"
              value={adjustmentPercentage}
              onChange={(e) => setAdjustmentPercentage(e.target.value)}
              fullWidth
              slotProps={{
                input: {
                  endAdornment: <InputAdornment position="end">%</InputAdornment>,
                },
              }}
              helperText="Enter a positive number (e.g., 10 for 10%)"
            />

            <Box>
              <Typography variant="body2" gutterBottom>
                Adjustment Type
              </Typography>
              <Stack direction="row" spacing={1}>
                <Button
                  variant={adjustmentType === 'increase' ? 'contained' : 'outlined'}
                  onClick={() => setAdjustmentType('increase')}
                  fullWidth
                >
                  Increase
                </Button>
                <Button
                  variant={adjustmentType === 'decrease' ? 'contained' : 'outlined'}
                  onClick={() => setAdjustmentType('decrease')}
                  fullWidth
                >
                  Decrease
                </Button>
              </Stack>
            </Box>

            <Box>
              <label>
                <input
                  type="checkbox"
                  checked={adjustCostBasis}
                  onChange={(e) => setAdjustCostBasis(e.target.checked)}
                />
                <Typography variant="body2" component="span" sx={{ ml: 1 }}>
                  Also adjust cost basis
                </Typography>
              </label>
            </Box>
          </Stack>
        </DialogContent>
        <DialogActions>
          <AppButton variant="secondary" onClick={() => setAdjustmentDialogOpen(false)}>Cancel</AppButton>
          <AppButton
            variant="success"
            startIcon={<CheckCircleIcon />}
            onClick={handleApplyAdjustment}
            disabled={!adjustmentPercentage || priceListItemsLoading}
          >
            Apply Adjustment
          </AppButton>
        </DialogActions>
      </Dialog>
    </>
  );
}

export default PriceListDetailsPage
