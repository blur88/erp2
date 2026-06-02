import React, { useState, useEffect } from 'react'
import { useNavigate, useParams } from 'react-router-dom'
import {
  Box,
  Grid,
  TextField,
  Typography,
  Table,
  TableBody,
  TableCell,
  TableContainer,
  TableHead,
  TableRow,
  IconButton,
  Paper,
  Autocomplete,
  Alert,
  Card,
  CardContent,
  MenuItem,
  useTheme,
} from '@mui/material'
import { default as AddIcon } from '@mui/icons-material/Add'
import { default as DeleteIcon } from '@mui/icons-material/Delete'
import { useForm, useFieldArray, Controller } from 'react-hook-form'
import { yupResolver } from '@hookform/resolvers/yup'
import * as yup from 'yup'
import { formatCurrency, getCurrentDate } from '@/utils/formatters'
import { AppButton } from '@/components/common/AppButton'
import PageHeader from '@/components/common/PageHeader'
import TransactionForm from '@/components/common/TransactionForm'
import { useNotification } from '@/hooks/useNotification'
import { useProductSearch } from '@/hooks/useProductSearch'
import { useAppDispatch } from '@/hooks/useRedux'
import { useUnsavedChangesGuard } from '@/hooks/useUnsavedChangesGuard'
import { setSelectedPurchaseOrder, updatePurchaseOrderInPlace } from '@/store/slices/purchasingSlice'
import {
  useCreatePurchaseOrderMutation,
  useGetSuppliersQuery,
  useUpdatePurchaseOrderMutation,
  useLazyGetPurchaseOrderByNumberQuery,
} from '@/store/api/purchasingApi'
import { useCurrency } from '@/hooks/useCurrency'

interface PurchaseOrderItem {
  productId: string
  product?: any
  quantity: number
  unitPrice: number
  discountType: 'percent' | 'amount'
  discountValue: number
  discountPercent: number
  totalPrice: number
}

interface CreatePurchaseOrderFormData {
  supplierId: string
  orderDate: string
  notes?: string
  shipping: number
  items: PurchaseOrderItem[]
}

const schema = yup.object({
  supplierId: yup.string().required('Supplier is required'),
  orderDate: yup.string().required('Order date is required'),
  notes: yup.string().optional(),
  shipping: yup.number().min(0).optional(),
  items: yup.array().of(
    yup.object({
      productId: yup.string().required('Product is required'),
      quantity: yup.number().positive('Quantity must be positive').required(),
      unitPrice: yup.number().min(0).required(),
      discountType: yup.string().oneOf(['percent', 'amount']).required(),
      discountValue: yup.number().min(0).optional(),
      discountPercent: yup.number().min(0).max(100).optional(),
      totalPrice: yup.number().min(0).required(),
    })
  ).min(1, 'At least one item is required'),
})

const CreatePurchaseOrderPage: React.FC = () => {
  const {currency} = useCurrency()
  const theme = useTheme()
  const navigate = useNavigate()
  const dispatch = useAppDispatch()
  const { orderNumber } = useParams<{ orderNumber: string }>()
  const isEditMode = !!orderNumber
  const { showSuccess, showError } = useNotification()
  // Shared options list for all product Autocomplete rows. Replaced (not merged) on each
  // search so the dropdown shows only current results. Selected values survive options
  // replacement because each row's `value` prop is sourced from watchedItems, not from
  // this array — see `isOptionEqualToValue` and the value expression in the Autocomplete.
  const { products, loadProducts, seedProducts } = useProductSearch()
  const [loading, setLoading] = useState(false)
  const [loadingOrder, setLoadingOrder] = useState(false)
  const [error, setError] = useState<string | null>(null)
  const [orderToLoad, setOrderToLoad] = useState<any>(null)
  const { data: suppliersResponse } = useGetSuppliersQuery({})
  const [createPurchaseOrder] = useCreatePurchaseOrderMutation()
  const [updatePurchaseOrder] = useUpdatePurchaseOrderMutation()
  const [fetchPurchaseOrderByNumber] = useLazyGetPurchaseOrderByNumberQuery()
  const [editingOrderId, setEditingOrderId] = useState<string | null>(null)
  const suppliers = suppliersResponse?.data || []

  const { control, handleSubmit, watch, setValue, reset, formState: { errors, isDirty, isSubmitting } } = useForm<CreatePurchaseOrderFormData>({
    resolver: yupResolver(schema) as any,
    defaultValues: {
      supplierId: '',
      orderDate: getCurrentDate(),
      notes: '',
      shipping: 0,
      items: [
        {
          productId: '',
          quantity: 1,
          unitPrice: 0,
          discountType: 'percent' as const,
          discountValue: 0,
          discountPercent: 0,
          totalPrice: 0,
        }
      ],
    },
  })
  const { UnsavedChangesDialog } = useUnsavedChangesGuard(isDirty, isSubmitting)

  const { fields, append, remove } = useFieldArray({
    control,
    name: 'items',
  })

  const watchedItems = watch('items')
  const watchedShipping = watch('shipping')

  useEffect(() => {
    loadProducts()
  }, [])

  // Load purchase order data in edit mode
  useEffect(() => {
    if (isEditMode && orderNumber) {
      loadPurchaseOrder(orderNumber)
    }
  }, [isEditMode, orderNumber])

  const loadPurchaseOrder = async (currentOrderNumber: string) => {
    setLoadingOrder(true)
    try {
      const order = await fetchPurchaseOrderByNumber(currentOrderNumber).unwrap()
      setEditingOrderId(order.id)

      // Extract products from order items and add to products state
      if (order.items && order.items.length > 0) {
        const orderProducts = order.items
          .filter((item: any) => item.product)
          .map((item: any) => item.product)

        seedProducts(orderProducts)
      }

      // Store order data to be loaded after products are set
      setOrderToLoad(order)
    } catch (err: any) {
      showError(err?.response?.data?.message || 'Failed to load purchase order')
      setError('Failed to load purchase order')
      setLoadingOrder(false)
    }
  }

  // Reset form after products are loaded
  useEffect(() => {
    if (orderToLoad && products.length > 0) {
      const itemsToReset = orderToLoad.items?.map((item: any) => {
        const productId = item.productId || item.product?.id || ''

        return {
          productId,
          product: item.product,
          quantity: item.quantity || 1,
          unitPrice: item.unitPrice || item.unitCost || 0,
          discountType: (item.discountPercent > 0 ? 'percent' : 'amount') as 'percent' | 'amount',
          discountValue: item.discountPercent || item.discountAmount || 0,
          discountPercent: item.discountPercent || 0,
          totalPrice: item.totalAmount || 0,
        }
      })

      // Map order data to form
      reset({
        supplierId: orderToLoad.supplierId || orderToLoad.supplier?.id || '',
        orderDate: orderToLoad.orderDate ? new Date(orderToLoad.orderDate).toISOString().split('T')[0] : getCurrentDate(),
        notes: orderToLoad.notes || '',
        shipping: orderToLoad.shippingAmount || 0,
        items: itemsToReset || [
          {
            productId: '',
            quantity: 1,
            unitPrice: 0,
            discountType: 'percent' as const,
            discountValue: 0,
            discountPercent: 0,
            totalPrice: 0,
          }
        ],
      })

      setOrderToLoad(null)
      setLoadingOrder(false)
    }
  }, [orderToLoad, products, reset])

  // Recalculate totals when items change
  useEffect(() => {
    watchedItems.forEach((item, index) => {
      const quantityValue = item.quantity as number | string | null | undefined

      if (quantityValue != null && quantityValue !== '' && item.unitPrice !== undefined) {
        const quantity = Number(quantityValue)
        const unitPrice = Number(item.unitPrice)
        let unitDiscount = 0

        if (item.discountType === 'percent') {
          // Percentage discount: apply to unit price
          unitDiscount = unitPrice * (Number(item.discountValue || 0) / 100)
        } else {
          // Fixed amount discount: per unit
          unitDiscount = Number(item.discountValue || 0)
        }

        const discountedUnitPrice = unitPrice - unitDiscount
        const total = discountedUnitPrice * quantity

        if (Math.abs(item.totalPrice - total) > 0.01) {
          // Derived recompute — must NOT mark the form dirty, or loading an
          // existing order would flip isDirty true with no user action.
          setValue(`items.${index}.totalPrice`, Number(total.toFixed(2)))
        }
      }
    })
  }, [JSON.stringify(watchedItems), setValue])

  const onSubmit = async (data: CreatePurchaseOrderFormData) => {
    setLoading(true)
    setError(null)

    try {
      const orderData = {
        supplierId: data.supplierId,
        orderDate: data.orderDate,
        notes: data.notes || undefined,
        shippingAmount: Number(data.shipping) || 0,
        items: data.items.map((item, index) => {
          // Map frontend discount type to backend format
          const discountType = item.discountType === 'percent' ? 'percentage' : 'fixed_amount'

          return {
            lineNumber: index + 1,
            productId: item.productId,
            quantity: item.quantity,
            unitPrice: item.unitPrice,
            discountType: discountType,
            discountPercent: item.discountType === 'percent' ? Number(item.discountValue || 0) : 0,
            discountAmount: item.discountType === 'amount' ? Number(item.discountValue || 0) : 0,
          }
        }),
      }

      if (isEditMode && editingOrderId) {
        const updatedOrder = await updatePurchaseOrder({ id: editingOrderId, data: orderData as any }).unwrap()

        dispatch(updatePurchaseOrderInPlace(updatedOrder))
        dispatch(setSelectedPurchaseOrder(updatedOrder as any))

        showSuccess('Purchase order updated successfully')
        navigate(`/purchasing/orders?highlight=${updatedOrder.id}`)
      } else {
        const result = await createPurchaseOrder(orderData as any).unwrap()
        dispatch(setSelectedPurchaseOrder(result as any))
        showSuccess('Purchase order created successfully')
        // Navigate to orders page with the new order selected
        navigate(`/purchasing/orders?highlight=${(result as any).id}`)
      }
    } catch (err: any) {
      console.error('Error creating purchase order:', err)
      setError(err.response?.data?.message || 'Failed to create purchase order')
      showError(err.response?.data?.message || 'Failed to create purchase order')
    } finally {
      setLoading(false)
    }
  }

  const handleProductSelect = async (index: number, product: any) => {
    if (product) {
      seedProducts([product])
      await Promise.resolve()
      setValue(`items.${index}.productId`, product.id, { shouldDirty: true })
      setValue(`items.${index}.unitPrice`, Number(product.baseCost || 0), { shouldDirty: true })
      setValue(`items.${index}.product`, product, { shouldDirty: true })
    }
  }

  const formatNumberWithCommas = (value: number | string): string => {
    if (value === '' || value === null || value === undefined) return ''
    const num = typeof value === 'string' ? parseFloat(value) : value
    if (isNaN(num)) return ''

    // Format with 2 decimal places
    const fixed = num.toFixed(2)
    const parts = fixed.split('.')
    parts[0] = parts[0].replace(/\B(?=(\d{3})+(?!\d))/g, ',')
    return parts.join('.')
  }

  const parseFormattedNumber = (value: string): number => {
    return parseFloat(value.replace(/,/g, '')) || 0;
  }

  const calculateOrderTotals = () => {
    const subtotal = watchedItems.reduce((sum, item) => sum + (Number(item.totalPrice) || 0), 0)
    const shipping = Number(watchedShipping) || 0
    const totalAmount = subtotal + shipping
    return { subtotal, shipping, totalAmount }
  }

  const addItem = () => {
    append({
      productId: '',
      quantity: 1,
      unitPrice: 0,
      discountType: 'percent' as const,
      discountValue: 0,
      discountPercent: 0,
      totalPrice: 0,
    })
  }

  // Calculate totals reactively - recalculates whenever watchedItems or watchedShipping changes
  // Note: We use JSON.stringify for watchedItems because it's a proxy object from watch()
  // and the reference doesn't change when item values change
  const totals = React.useMemo(() => {
    return calculateOrderTotals()
  }, [JSON.stringify(watchedItems), watchedShipping])

  return (
    <>
      {/* Header */}
      <PageHeader
        variant="workflow"
        title={isEditMode ? 'Edit Purchase Order' : 'Create Purchase Order'}
        subtitle={isEditMode ? 'Update order details, items, and pricing' : 'Fill in order details, add items, and set pricing'}
        backAction={() => navigate('/purchasing/orders')}
      />
      {loadingOrder ? (
        <Box sx={{ display: 'flex', justifyContent: 'center', py: 8 }}>
          <Typography>Loading purchase order...</Typography>
        </Box>
      ) : (
      <TransactionForm
        mode="custom"
        entityLabel="Supplier"
        entityOptions={suppliers.map((supplier: any) => ({ id: supplier.id, name: supplier.companyName }))}
        lineItemColumns={[
          { key: 'product', label: 'Product' },
          { key: 'quantity', label: 'Qty' },
          { key: 'unitPrice', label: 'Cost Price' },
          { key: 'discount', label: 'Discount' },
          { key: 'subtotal', label: 'Sub-total' },
        ]}
        onSubmit={handleSubmit(onSubmit)}
        onCancel={() => navigate('/purchasing/orders')}
        isSubmitting={loading}
        hideDefaultActions
        error={error ? (
          <Alert severity="error" sx={{ mb: 3 }}>
            {error}
          </Alert>
        ) : null}
      >
        <Grid container spacing={3}>
          {/* PO Information Card */}
          <Grid size={12}>
            <Card>
              <CardContent>
                <Typography variant="h6" gutterBottom>PO Information</Typography>
                <Grid container spacing={2}>
                  <Grid
                    size={{
                      xs: 12,
                      md: 6
                    }}>
                    <Controller
                      name="supplierId"
                      control={control}
                      render={({ field }) => (
                        <Autocomplete
                          options={suppliers}
                          getOptionLabel={(option) => option.companyName}
                          value={suppliers.find(s => s.id === field.value) || null}
                          onChange={(_, value) => field.onChange(value?.id || '')}
                          size="small"
                          renderInput={(params) => (
                            <TextField
                              {...params}
                              label="Supplier"
                              error={!!errors.supplierId}
                              helperText={errors.supplierId?.message}
                              required
                              size="small"
                              sx={{
                                '& .MuiInputBase-input': {
                                  fontSize: '0.875rem',
                                },
                                '& .MuiInputLabel-root': {
                                  fontSize: '0.875rem',
                                }
                              }}
                            />
                          )}
                          slotProps={{
                            paper: {
                              sx: {
                                '& .MuiAutocomplete-option': {
                                  fontSize: '0.875rem',
                                }
                              }
                            }
                          }}
                        />
                      )}
                    />
                  </Grid>

                  <Grid
                    size={{
                      xs: 12,
                      md: 6
                    }}>
                    <Controller
                      name="orderDate"
                      control={control}
                      render={({ field }) => (
                        <TextField
                          {...field}
                          label="Order Date"
                          type="date"
                          slotProps={{ inputLabel: { shrink: true } }}
                          error={!!errors.orderDate}
                          helperText={errors.orderDate?.message}
                          required
                          fullWidth
                          size="small"
                          sx={{
                            '& .MuiInputBase-input': {
                              fontSize: '0.875rem',
                            },
                            '& .MuiInputLabel-root': {
                              fontSize: '0.875rem',
                            }
                          }}
                        />
                      )}
                    />
                  </Grid>
                </Grid>
              </CardContent>
            </Card>
          </Grid>

          {/* PO Items Card */}
          <Grid size={12}>
            <Card>
              <CardContent>
                <Box sx={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', mb: 2 }}>
                  <Typography variant="h6">PO Items</Typography>
                  <AppButton
                    variant="secondary"
                    startIcon={<AddIcon />}
                    onClick={addItem}
                  >
                    Add Item
                  </AppButton>
                </Box>

                <TableContainer component={Paper} sx={{ border: `1px solid ${theme.palette.divider}` }}>
                  <Table
                    size="small"
                    sx={{
                      '& .MuiTableCell-root': {
                        border: `1px solid ${theme.palette.divider}`,
                        padding: '4px 8px',
                        fontSize: '0.875rem',
                      },
                      '& .MuiTableHead-root .MuiTableCell-root': {
                        backgroundColor: theme.palette.grey[50],
                        fontWeight: 600,
                        color: theme.palette.text.primary,
                        border: `1px solid ${theme.palette.divider}`,
                      },
                      '& .MuiTableBody-root .MuiTableRow-root:hover': {
                        backgroundColor: theme.palette.action.hover,
                      },
                      '& .MuiTextField-root': {
                        '& .MuiOutlinedInput-root': {
                          border: 'none',
                          '& fieldset': {
                            border: 'none',
                          },
                          '&:hover fieldset': {
                            border: `1px solid ${theme.palette.primary.main}`,
                          },
                          '&.Mui-focused fieldset': {
                            border: `1px solid ${theme.palette.primary.main}`,
                          },
                          backgroundColor: 'transparent',
                          fontSize: '0.875rem',
                        },
                        '& .MuiInputBase-input': {
                          padding: '6px 8px',
                          textAlign: 'center',
                        },
                        '& .MuiFormHelperText-root': {
                          position: 'absolute',
                          bottom: '-20px',
                          fontSize: '0.75rem',
                        },
                      },
                      '& .MuiAutocomplete-root .MuiTextField-root .MuiInputBase-input': {
                        textAlign: 'left',
                      }
                    }}
                  >
                    <TableHead>
                      <TableRow>
                        <TableCell align="center" sx={{ width: '30%', minWidth: 200 }}>Product</TableCell>
                        <TableCell align="center" sx={{ width: '8%', minWidth: 70 }}>Qty</TableCell>
                        <TableCell align="center" sx={{ width: '13%', minWidth: 100 }}>Price</TableCell>
                        <TableCell align="center" sx={{ width: '16%', minWidth: 120 }}>Discount</TableCell>
                        <TableCell align="center" sx={{ width: '13%', minWidth: 100 }}>Sub-total</TableCell>
                        <TableCell align="center" sx={{ width: '8%', minWidth: 60 }}>Action</TableCell>
                        <TableCell align="center" sx={{ width: '5%', minWidth: 40 }}></TableCell>
                      </TableRow>
                    </TableHead>
                    <TableBody>
                      {fields.map((field, index) => (
                        <TableRow key={field.id}>
                          <TableCell sx={{ padding: '2px !important' }}>
                            <Controller
                              name={`items.${index}.productId`}
                              control={control}
                              render={({ field: productField }) => (
                                <Autocomplete
                                  options={products}
                                  getOptionLabel={(option) => option?.name || ''}
                                  isOptionEqualToValue={(option, value) => option.id === value.id}
                                  value={watchedItems[index]?.product || products.find(p => p.id === productField.value) || null}
                                  onChange={(_, value) => handleProductSelect(index, value)}
                                  onInputChange={(_, value, reason) => {
                                    if (reason === 'input' && value.trim().length >= 1) {
                                      loadProducts(value)
                                    } else if (reason === 'input') {
                                      loadProducts('')
                                    }
                                  }}
                                  filterOptions={(options) => options}
                                  size="small"
                                  renderInput={(params) => (
                                    <TextField
                                      {...params}
                                      placeholder="Search by name or barcode..."
                                      variant="outlined"
                                      error={!!errors.items?.[index]?.productId}
                                      sx={{
                                        '& .MuiInputBase-input': {
                                          textAlign: 'left !important',
                                          padding: '6px 8px !important',
                                          fontSize: '0.875rem',
                                        }
                                      }}
                                    />
                                  )}
                                  sx={{
                                    '& .MuiAutocomplete-inputRoot': {
                                      padding: '0 !important',
                                    }
                                  }}
                                  slotProps={{
                                    paper: {
                                      sx: {
                                        '& .MuiAutocomplete-option': {
                                          fontSize: '0.875rem',
                                        }
                                      }
                                    }
                                  }}
                                />
                              )}
                            />
                          </TableCell>
                          <TableCell sx={{ padding: '2px !important' }}>
                            <Controller
                              name={`items.${index}.quantity`}
                              control={control}
                              render={({ field: qtyField }) => {
                                const formatQuantity = (value: number | string): string => {
                                  if (value === '' || value === null || value === undefined) return ''
                                  const num = typeof value === 'string' ? parseInt(value) : Math.floor(value)
                                  if (isNaN(num)) return ''
                                  return num.toString().replace(/\B(?=(\d{3})+(?!\d))/g, ',');
                                }

                                const [displayValue, setDisplayValue] = React.useState(formatQuantity(qtyField.value))
                                const [isFocused, setIsFocused] = React.useState(false)

                                React.useEffect(() => {
                                  if (!isFocused) {
                                    setDisplayValue(formatQuantity(qtyField.value))
                                  }
                                }, [qtyField.value, isFocused])

                                return (
                                  <TextField
                                    value={displayValue}
                                    onChange={(e) => {
                                      const value = e.target.value.replace(/[^0-9]/g, '')
                                      setDisplayValue(value)
                                      qtyField.onChange(parseInt(value) || 0)
                                    }}
                                    onFocus={() => {
                                      setIsFocused(true)
                                      setDisplayValue(qtyField.value?.toString() || '')
                                    }}
                                    onBlur={() => {
                                      setIsFocused(false)
                                      setDisplayValue(formatQuantity(qtyField.value))
                                    }}
                                    variant="outlined"
                                    slotProps={{ htmlInput: { style: { textAlign: 'center', fontSize: '0.875rem' } } }}
                                    error={!!errors.items?.[index]?.quantity}
                                  />
                                );
                              }}
                            />
                          </TableCell>
                          <TableCell sx={{ padding: '2px !important' }}>
                            <Controller
                              name={`items.${index}.unitPrice`}
                              control={control}
                              render={({ field: priceField }) => {
                                const [displayValue, setDisplayValue] = React.useState(formatNumberWithCommas(priceField.value))
                                const [isFocused, setIsFocused] = React.useState(false)

                                React.useEffect(() => {
                                  if (!isFocused) {
                                    setDisplayValue(formatNumberWithCommas(priceField.value))
                                  }
                                }, [priceField.value, isFocused])

                                return (
                                  <TextField
                                    value={displayValue}
                                    onChange={(e) => {
                                      const value = e.target.value.replace(/[^0-9.]/g, '')
                                      setDisplayValue(value)
                                      priceField.onChange(parseFormattedNumber(value))
                                    }}
                                    onFocus={() => {
                                      setIsFocused(true)
                                      setDisplayValue(priceField.value?.toString() || '')
                                    }}
                                    onBlur={() => {
                                      setIsFocused(false)
                                      setDisplayValue(formatNumberWithCommas(priceField.value))
                                    }}
                                    variant="outlined"
                                    slotProps={{
                                      htmlInput: { style: { textAlign: 'right', fontSize: '0.875rem' } },
                                      input: { startAdornment: <span style={{ marginRight: '4px', fontSize: '0.75rem', color: theme.palette.text.secondary }}>{currency}</span> }
                                    }}
                                    error={!!errors.items?.[index]?.unitPrice}
                                  />
                                );
                              }}
                            />
                          </TableCell>
                          <TableCell sx={{ padding: '2px !important' }}>
                            <Box sx={{ display: 'flex', gap: '2px', alignItems: 'center' }}>
                              <Controller
                                name={`items.${index}.discountValue`}
                                control={control}
                                render={({ field: discountField }) => {
                                  const [displayValue, setDisplayValue] = React.useState(formatNumberWithCommas(discountField.value))
                                  const [isFocused, setIsFocused] = React.useState(false)

                                  React.useEffect(() => {
                                    if (!isFocused) {
                                      setDisplayValue(formatNumberWithCommas(discountField.value))
                                    }
                                  }, [discountField.value, isFocused])

                                  return (
                                    <TextField
                                      value={displayValue}
                                      onChange={(e) => {
                                        const value = e.target.value.replace(/[^0-9.]/g, '')
                                        setDisplayValue(value)
                                        discountField.onChange(parseFormattedNumber(value))
                                      }}
                                      onFocus={() => {
                                        setIsFocused(true)
                                        setDisplayValue(discountField.value?.toString() || '')
                                      }}
                                      onBlur={() => {
                                        setIsFocused(false)
                                        setDisplayValue(formatNumberWithCommas(discountField.value))
                                      }}
                                      variant="outlined"
                                      slotProps={{
                                        htmlInput: { style: { textAlign: 'right', fontSize: '0.875rem' } }
                                      }}
                                      error={!!errors.items?.[index]?.discountValue}
                                      sx={{
                                        flex: 1,
                                      }}
                                    />
                                  );
                                }}
                              />
                              <Controller
                                name={`items.${index}.discountType`}
                                control={control}
                                render={({ field: typeField }) => (
                                  <TextField
                                    {...typeField}
                                    select
                                    variant="outlined"
                                    sx={{
                                      width: '60px',
                                      '& .MuiInputBase-input': {
                                        fontSize: '0.875rem',
                                        padding: '6px 4px',
                                      }
                                    }}
                                    slotProps={{
                                      select: {
                                        MenuProps: {
                                          slotProps: {
                                            paper: {
                                              sx: {
                                                '& .MuiMenuItem-root': {
                                                  fontSize: '0.875rem',
                                                }
                                              }
                                            }
                                          }
                                        }
                                      }
                                    }}
                                  >
                                    <MenuItem value="percent">%</MenuItem>
                                    <MenuItem value="amount">{currency}</MenuItem>
                                  </TextField>
                                )}
                              />
                            </Box>
                          </TableCell>
                          <TableCell align="right" sx={{ padding: '2px 8px !important' }}>
                            <Typography variant="body2" sx={{
                              fontWeight: "600"
                            }}>
                              {formatCurrency(watchedItems[index]?.totalPrice || 0)}
                            </Typography>
                          </TableCell>
                          <TableCell align="center" sx={{ padding: '2px !important' }}>
                            <IconButton
                              onClick={() => remove(index)}
                              disabled={fields.length === 1}
                              size="small"
                              sx={{
                                color: theme.palette.error.main,
                                '&:hover': { backgroundColor: theme.palette.error.light },
                                '&.Mui-disabled': { color: theme.palette.action.disabled }
                              }}
                            >
                              <DeleteIcon fontSize="small" />
                            </IconButton>
                          </TableCell>
                          <TableCell sx={{ width: 40, padding: '2px !important' }}>
                            <Typography variant="caption" sx={{ color: theme.palette.text.secondary }}>
                              {index + 1}
                            </Typography>
                          </TableCell>
                        </TableRow>
                      ))}
                    </TableBody>
                  </Table>
                </TableContainer>
              </CardContent>
            </Card>
          </Grid>

          {/* Notes and Summary */}
          <Grid
            size={{
              xs: 12,
              md: 8
            }}>
            <Card sx={{ height: '100%' }}>
              <CardContent sx={{ height: '100%', display: 'flex', flexDirection: 'column' }}>
                <Controller
                  name="notes"
                  control={control}
                  render={({ field }) => (
                    <TextField
                      {...field}
                      label="Notes"
                      multiline
                      fullWidth
                      sx={{
                        flex: 1,
                        '& .MuiInputBase-root': {
                          height: '100%',
                          alignItems: 'flex-start',
                        },
                        '& .MuiInputBase-input': {
                          fontSize: '0.875rem',
                        },
                        '& .MuiInputLabel-root': {
                          fontSize: '0.875rem',
                        }
                      }}
                    />
                  )}
                />
              </CardContent>
            </Card>
          </Grid>

          <Grid
            size={{
              xs: 12,
              md: 4
            }}>
            <Card sx={{ height: '100%' }}>
              <CardContent sx={{ height: '100%', display: 'flex', flexDirection: 'column' }}>
                <Typography variant="h6" gutterBottom>PO Summary</Typography>

                <Box sx={{ display: 'flex', justifyContent: 'space-between', mb: 1 }}>
                  <Typography variant="body2">Sub-total:</Typography>
                  <Typography variant="body2">{formatCurrency(totals.subtotal)}</Typography>
                </Box>

                <Box sx={{ display: 'flex', justifyContent: 'space-between', mb: 1 }}>
                  <Typography variant="body2">Shipping:</Typography>
                  <Controller
                    name="shipping"
                    control={control}
                    render={({ field }) => {
                      const [displayValue, setDisplayValue] = React.useState(formatNumberWithCommas(field.value))
                      const [isFocused, setIsFocused] = React.useState(false)

                      React.useEffect(() => {
                        if (!isFocused) {
                          setDisplayValue(formatNumberWithCommas(field.value))
                        }
                      }, [field.value, isFocused])

                      return (
                        <TextField
                          value={displayValue}
                          onChange={(e) => {
                            const value = e.target.value.replace(/[^0-9.]/g, '')
                            setDisplayValue(value)
                            // Allow empty string or parse the number
                            const numValue = value === '' ? 0 : parseFloat(value.replace(/,/g, ''))
                            field.onChange(isNaN(numValue) ? 0 : numValue)
                          }}
                          onFocus={() => {
                            setIsFocused(true)
                            // Show the actual value, including 0
                            setDisplayValue(field.value === 0 ? '0' : (field.value?.toString() || '0'))
                          }}
                          onBlur={() => {
                            setIsFocused(false)
                            // If empty or invalid, set to 0
                            if (displayValue === '' || displayValue === '.') {
                              field.onChange(0)
                            }
                            setDisplayValue(formatNumberWithCommas(field.value || 0))
                          }}
                          variant="outlined"
                          size="small"
                          slotProps={{
                            htmlInput: { style: { textAlign: 'right', fontSize: '0.875rem' } },
                            input: { startAdornment: <span style={{ marginRight: '4px', fontSize: '0.75rem', color: theme.palette.text.secondary }}>{currency}</span> }
                          }}
                          sx={{
                            width: '120px',
                            '& .MuiInputBase-input': {
                              padding: '4px 8px',
                            },
                          }}
                        />
                      );
                    }}
                  />
                </Box>

                <Box sx={{ display: 'flex', justifyContent: 'space-between', mb: 3, pt: 1, borderTop: `1px solid ${theme.palette.divider}` }}>
                  <Typography variant="h6" sx={{ fontWeight: 600 }}>Total:</Typography>
                  <Typography variant="h6" sx={{ fontWeight: 600 }}>{formatCurrency(totals.totalAmount)}</Typography>
                </Box>

                <Box sx={{ display: 'flex', gap: 2, mt: 'auto' }}>
                  <AppButton
                    variant="secondary"
                    fullWidth
                    onClick={() => navigate('/purchasing/orders')}
                    disabled={loading}
                  >
                    Cancel
                  </AppButton>
                  <AppButton
                    variant="primary"
                    type="submit"
                    fullWidth
                    disabled={loading}
                  >
                    {loading
                      ? (isEditMode ? 'Updating...' : 'Creating...')
                      : (isEditMode ? 'Update Order' : 'Create Order')
                    }
                  </AppButton>
                </Box>
              </CardContent>
            </Card>
          </Grid>
        </Grid>
      </TransactionForm>
      )}
      {UnsavedChangesDialog}
    </>
  );
}

export default CreatePurchaseOrderPage
