import React, { useCallback, useEffect, useMemo, useRef, useState } from 'react'
import {
  Alert,
  Autocomplete,
  Box,
  Card,
  CardContent,
  Grid,
  IconButton,
  MenuItem,
  Paper,
  Table,
  TableBody,
  TableCell,
  TableContainer,
  TableHead,
  TableRow,
  TextField,
  Typography,
  useTheme,
} from '@mui/material'
import AddIcon from '@mui/icons-material/Add'
import DeleteIcon from '@mui/icons-material/Delete'
import { yupResolver } from '@hookform/resolvers/yup'
import { Controller, useFieldArray, useForm } from 'react-hook-form'
import { useLocation, useNavigate, useParams } from 'react-router-dom'
import * as yup from 'yup'

import { AppButton } from '@/components/common/AppButton'
import PageHeader from '@/components/common/PageHeader'
import { useCurrency } from '@/hooks/useCurrency'
import { useLineItemKeyNav } from '@/hooks/useLineItemKeyNav'
import { useNotification } from '@/hooks/useNotification'
import { useProductSearch } from '@/hooks/useProductSearch'
import { useAppDispatch } from '@/hooks/useRedux'
import { useUnsavedChangesGuard } from '@/hooks/useUnsavedChangesGuard'
import {
  useCreatePurchaseOrderMutation,
  useGetSuppliersQuery,
  useLazyGetPurchaseOrderByNumberQuery,
  useUpdatePurchaseOrderMutation,
} from '@/store/api/purchasingApi'
import { useGetDocumentNumberSettingsQuery } from '@/store/api/settingsApi'
import {
  setSelectedPurchaseOrder,
  updatePurchaseOrderInPlace,
} from '@/store/slices/purchasingSlice'
import { formatCurrency, getCurrentDate } from '@/utils/formatters'
import { rtkErrorMessage } from '@/utils/errorMessage'

interface PurchaseOrderItem {
  productId: string
  product?: any
  quantity: number
  unitPrice: number
  discountType: 'percentage' | 'amount'
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
  shipping: yup.number().min(0).optional().default(0),
  items: yup
    .array()
    .of(
      yup.object({
        productId: yup.string().required('Product is required'),
        quantity: yup
          .number()
          .integer('Quantity must be a whole number')
          .min(1, 'Quantity must be at least 1')
          .required('Quantity is required'),
        unitPrice: yup.number().min(0, 'Unit price must be 0 or more').required(),
        discountType: yup.string().oneOf(['percentage', 'amount']).required(),
        discountValue: yup
          .number()
          .min(0, 'Discount must be 0 or more')
          .when('discountType', {
            is: 'percentage',
            then: (s) => s.max(100, 'Percentage discount cannot exceed 100'),
          })
          .optional()
          .default(0),
        discountPercent: yup.number().min(0).optional().default(0),
        totalPrice: yup.number().min(0).required(),
      }),
    )
    .min(1, 'At least one item is required'),
})

const fieldSx = {
  '& .MuiInputBase-input': { fontSize: '0.875rem' },
  '& .MuiInputLabel-root': { fontSize: '0.875rem' },
}

const emptyItem = (): PurchaseOrderItem => ({
  productId: '',
  quantity: 1,
  unitPrice: 0,
  discountType: 'percentage',
  discountValue: 0,
  discountPercent: 0,
  totalPrice: 0,
})

function formatNum(value: number | string): string {
  if (value === '' || value === null || value === undefined) return ''
  const num = typeof value === 'string' ? parseFloat(value) : value
  if (isNaN(num)) return ''
  const fixed = num.toFixed(2)
  const [int, dec] = fixed.split('.')
  return `${int.replace(/\B(?=(\d{3})+(?!\d))/g, ',')}.${dec}`
}

function parseNum(value: string): number {
  return parseFloat(value.replace(/,/g, '')) || 0
}

const COL_COUNT = 4

const CreatePurchaseOrderPage: React.FC = () => {
  const { currency } = useCurrency()
  const theme = useTheme()
  const navigate = useNavigate()
  const location = useLocation()
  const dispatch = useAppDispatch()
  const { orderNumber } = useParams<{ orderNumber: string }>()
  const isEditMode = !!orderNumber
  const { showSuccess, showError } = useNotification()

  const { products, loadProducts, seedProducts } = useProductSearch()
  const [loading, setLoading] = useState(false)
  const [loadingOrder, setLoadingOrder] = useState(false)
  const [orderToLoad, setOrderToLoad] = useState<any>(null)
  const [editingOrderId, setEditingOrderId] = useState<string | null>(null)
  const preselectAppliedRef = useRef(false)

  const { data: suppliersResponse } = useGetSuppliersQuery({})
  const suppliers = useMemo(() => suppliersResponse?.data ?? [], [suppliersResponse])
  const { data: docNumberSettings, isLoading: loadingDocNumbers } =
    useGetDocumentNumberSettingsQuery()

  const [createPurchaseOrder] = useCreatePurchaseOrderMutation()
  const [updatePurchaseOrder] = useUpdatePurchaseOrderMutation()
  const [fetchPurchaseOrderByNumber] = useLazyGetPurchaseOrderByNumberQuery()

  const orderNumberPreview = useMemo(() => {
    if (isEditMode) return null
    if (loadingDocNumbers) return 'Loading...'
    const config = docNumberSettings?.configurations?.find(
      (c: any) => c.documentName === 'Purchase Orders',
    )
    if (!config) return 'Auto-generated'
    const yy = String(new Date().getFullYear() % 100).padStart(2, '0')
    const seq = String(config.nextNumber).padStart(config.paddingDigits, '0')
    return `${config.prefix}-${yy}-${seq}`
  }, [docNumberSettings, isEditMode, loadingDocNumbers])

  const {
    control,
    handleSubmit,
    watch,
    setValue,
    reset,
    formState: { errors, isDirty, isSubmitting },
  } = useForm<CreatePurchaseOrderFormData>({
    resolver: yupResolver(schema) as any,
    defaultValues: {
      supplierId: '',
      orderDate: getCurrentDate(),
      notes: '',
      shipping: 0,
      items: [emptyItem()],
    },
  })
  const { UnsavedChangesDialog } = useUnsavedChangesGuard(isDirty, isSubmitting)

  const { fields, append, remove } = useFieldArray({ control, name: 'items' })
  const watchedItems = watch('items')
  const watchedShipping = watch('shipping')

  const getKeyHandler = useLineItemKeyNav(COL_COUNT, fields.length, () => append(emptyItem()))

  const subtotal = watchedItems.reduce((sum, item) => sum + (Number(item.totalPrice) || 0), 0)
  const shippingAmt = Number(watchedShipping) || 0
  const totals = { subtotal, shipping: shippingAmt, total: subtotal + shippingAmt }

  useEffect(() => {
    loadProducts()
  }, [])

  // Apply preselectSupplierId after returning from "Add new supplier".
  useEffect(() => {
    const preselectId = (location.state as any)?.preselectSupplierId as string | undefined
    if (!preselectId || !suppliers.length || preselectAppliedRef.current) return
    const found = suppliers.find((s: any) => s.id === preselectId)
    if (found) {
      preselectAppliedRef.current = true
      setValue('supplierId', found.id, { shouldDirty: true })
    }
  }, [suppliers, location.state, setValue])

  // Load purchase order data in edit mode.
  useEffect(() => {
    if (isEditMode && orderNumber) {
      setLoadingOrder(true)
      fetchPurchaseOrderByNumber(orderNumber)
        .unwrap()
        .then((order: any) => {
          setEditingOrderId(order.id)
          if (order.items?.length) {
            seedProducts(order.items.filter((i: any) => i.product).map((i: any) => i.product))
          }
          setOrderToLoad(order)
        })
        .catch((err: any) => {
          showError(err?.response?.data?.message || 'Failed to load purchase order')
          setLoadingOrder(false)
        })
    }
  }, [isEditMode, orderNumber])

  // Reset form once products for the loaded order are present.
  useEffect(() => {
    if (!orderToLoad) return
    const needsProducts = orderToLoad.items?.some((i: any) => i.product)
    if (needsProducts && !products.length) return

    const itemsToReset = orderToLoad.items?.map((item: any) => {
      // Prefer the stored discountType; fall back to inferring from which
      // discount field is populated for older records that omit it.
      const discountType: 'percentage' | 'amount' =
        item.discountType === 'fixed_amount'
          ? 'amount'
          : item.discountType === 'percentage'
            ? 'percentage'
            : item.discountPercent > 0
              ? 'percentage'
              : 'amount'

      return {
        productId: item.productId || item.product?.id || '',
        product: item.product,
        quantity: parseInt(item.quantity) || 1,
        unitPrice: item.unitPrice || item.unitCost || 0,
        discountType,
        discountValue:
          discountType === 'percentage'
            ? item.discountPercent || 0
            : item.discountAmount || 0,
        discountPercent: item.discountPercent || 0,
        totalPrice: item.totalAmount || 0,
      }
    })

    reset({
      supplierId: orderToLoad.supplierId || orderToLoad.supplier?.id || '',
      orderDate: orderToLoad.orderDate
        ? new Date(orderToLoad.orderDate).toISOString().split('T')[0]
        : getCurrentDate(),
      notes: orderToLoad.notes || '',
      shipping: orderToLoad.shippingAmount || 0,
      items: itemsToReset?.length ? itemsToReset : [emptyItem()],
    })

    setOrderToLoad(null)
    setLoadingOrder(false)
  }, [orderToLoad, products, reset])

  // Recompute totals when items change. Must NOT mark the form dirty.
  useEffect(() => {
    watchedItems.forEach((item, index) => {
      const quantityValue = item.quantity as number | string | null | undefined
      if (quantityValue != null && quantityValue !== '' && item.unitPrice !== undefined) {
        const qty = Number(quantityValue)
        const price = Number(item.unitPrice)
        const unitDiscount =
          item.discountType === 'percentage'
            ? price * (Number(item.discountValue || 0) / 100)
            : Number(item.discountValue || 0)
        const total = (price - unitDiscount) * qty
        if (Math.abs((item.totalPrice || 0) - total) > 0.001) {
          setValue(`items.${index}.totalPrice`, Number(total.toFixed(2)))
        }
      }
    })
  }, [JSON.stringify(watchedItems), setValue])

  const handleProductSelect = useCallback(
    (index: number, product: any) => {
      if (!product) return
      seedProducts([product])
      const price = Number(product.baseCost || 0)
      const qty = Number(watchedItems[index]?.quantity) || 1
      setValue(`items.${index}.productId`, product.id, { shouldDirty: true })
      setValue(`items.${index}.unitPrice`, price, { shouldDirty: true })
      setValue(`items.${index}.totalPrice`, Number((price * qty).toFixed(2)), { shouldDirty: true })
      setValue(`items.${index}.product`, product, { shouldDirty: true })
    },
    [seedProducts, setValue, watchedItems],
  )

  const handleCancel = () => {
    navigate('/purchasing/orders')
  }

  const onSubmit = async (data: CreatePurchaseOrderFormData) => {
    setLoading(true)
    try {
      const orderData = {
        supplierId: data.supplierId,
        orderDate: data.orderDate,
        notes: data.notes || undefined,
        shippingAmount: Number(data.shipping) || 0,
        items: data.items.map((item, index) => {
          const discountValue = Number(item.discountValue) || 0
          return {
            lineNumber: index + 1,
            productId: item.productId,
            quantity: Number(item.quantity),
            unitPrice: Number(item.unitPrice),
            discountType: item.discountType === 'percentage' ? 'percentage' : 'fixed_amount',
            discountPercent: item.discountType === 'percentage' ? discountValue : 0,
            discountAmount: item.discountType === 'amount' ? discountValue : 0,
          }
        }),
      }

      if (isEditMode && editingOrderId) {
        const updated = await updatePurchaseOrder({
          id: editingOrderId,
          data: orderData as any,
        }).unwrap()
        dispatch(updatePurchaseOrderInPlace(updated))
        dispatch(setSelectedPurchaseOrder(updated as any))
        showSuccess('Purchase order updated successfully')
        navigate(`/purchasing/orders?highlight=${updated.id}`)
      } else {
        const created = await createPurchaseOrder(orderData as any).unwrap()
        dispatch(setSelectedPurchaseOrder(created as any))
        showSuccess('Purchase order created successfully')
        navigate(`/purchasing/orders?highlight=${(created as any).id}`)
      }
    } catch (err: any) {
      showError(
        rtkErrorMessage(err, `Failed to ${isEditMode ? 'update' : 'create'} purchase order`),
      )
    } finally {
      setLoading(false)
    }
  }

  if (loadingOrder) {
    return (
      <Box sx={{ display: 'flex', justifyContent: 'center', py: 8 }}>
        <Typography>Loading purchase order...</Typography>
      </Box>
    )
  }

  return (
    <>
      <PageHeader
        variant="workflow"
        title={isEditMode ? 'Edit Purchase Order' : 'Create Purchase Order'}
        subtitle={
          isEditMode
            ? 'Update order details, items, and pricing'
            : 'Fill in order details, add items, and set pricing'
        }
        backAction={handleCancel}
      />

      <form noValidate onSubmit={handleSubmit(onSubmit)}>
        <Grid container spacing={3}>
          <Grid size={12}>
            <Card>
              <CardContent>
                <Typography variant="h6" gutterBottom>
                  Order Info
                </Typography>
                <Grid container spacing={2}>
                  <Grid size={{ xs: 12, md: 4 }}>
                    <TextField
                      fullWidth
                      size="small"
                      label="Order Number"
                      value={isEditMode ? (orderNumber ?? '') : (orderNumberPreview ?? '')}
                      slotProps={{ input: { readOnly: true } }}
                      sx={fieldSx}
                    />
                  </Grid>

                  <Grid size={{ xs: 12, md: 4 }}>
                    <Controller
                      name="orderDate"
                      control={control}
                      render={({ field }) => (
                        <TextField
                          {...field}
                          fullWidth
                          size="small"
                          label="Order Date"
                          type="date"
                          required
                          disabled={loading}
                          error={!!errors.orderDate}
                          helperText={errors.orderDate?.message}
                          slotProps={{ inputLabel: { shrink: true } }}
                          sx={fieldSx}
                        />
                      )}
                    />
                  </Grid>

                  <Grid size={{ xs: 12, md: 4 }}>
                    <Box sx={{ display: 'flex', gap: 1, alignItems: 'flex-start' }}>
                      <Box sx={{ flexGrow: 1 }}>
                        <Controller
                          name="supplierId"
                          control={control}
                          render={({ field }) => (
                            <Autocomplete
                              options={suppliers}
                              getOptionLabel={(option) => option?.companyName ?? ''}
                              value={suppliers.find((s: any) => s.id === field.value) || null}
                              onChange={(_, value) => field.onChange(value?.id || '')}
                              size="small"
                              disabled={loading}
                              renderInput={(params) => (
                                <TextField
                                  {...params}
                                  label="Supplier"
                                  required
                                  size="small"
                                  error={!!errors.supplierId}
                                  helperText={errors.supplierId?.message}
                                  sx={fieldSx}
                                />
                              )}
                              slotProps={{
                                paper: {
                                  sx: { '& .MuiAutocomplete-option': { fontSize: '0.875rem' } },
                                },
                              }}
                            />
                          )}
                        />
                      </Box>
                      <IconButton
                        size="small"
                        title="Add new supplier"
                        disabled={loading}
                        onClick={() =>
                          navigate('/purchasing/suppliers/create', {
                            state: { returnTo: 'purchase-order' },
                          })
                        }
                        sx={{ mt: 0.5 }}
                      >
                        <AddIcon fontSize="small" />
                      </IconButton>
                    </Box>
                  </Grid>
                </Grid>
              </CardContent>
            </Card>
          </Grid>

          <Grid size={12}>
            <Card>
              <CardContent>
                <Typography variant="h6" gutterBottom>
                  Line Items
                </Typography>

                <TableContainer
                  component={Paper}
                  sx={{ border: `1px solid ${theme.palette.divider}` }}
                >
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
                      },
                      '& .MuiTableBody-root .MuiTableRow-root:hover': {
                        backgroundColor: theme.palette.action.hover,
                      },
                      '& .MuiTextField-root .MuiOutlinedInput-root': {
                        '& fieldset': { border: 'none' },
                        '&:hover fieldset': { border: `1px solid ${theme.palette.primary.main}` },
                        '&.Mui-focused fieldset': {
                          border: `1px solid ${theme.palette.primary.main}`,
                        },
                        backgroundColor: 'transparent',
                        fontSize: '0.875rem',
                      },
                      '& .MuiTextField-root .MuiInputBase-input': { padding: '6px 8px' },
                      '& .MuiAutocomplete-root .MuiOutlinedInput-root': {
                        paddingTop: 0,
                        paddingBottom: 0,
                      },
                    }}
                  >
                    <TableHead>
                      <TableRow>
                        <TableCell sx={{ width: '30%', minWidth: 200 }}>Product</TableCell>
                        <TableCell align="center" sx={{ width: '8%', minWidth: 70 }}>
                          Qty
                        </TableCell>
                        <TableCell align="center" sx={{ width: '13%', minWidth: 100 }}>
                          Unit Price
                        </TableCell>
                        <TableCell align="center" sx={{ width: '16%', minWidth: 120 }}>
                          Discount
                        </TableCell>
                        <TableCell align="center" sx={{ width: '13%', minWidth: 100 }}>
                          Subtotal
                        </TableCell>
                        <TableCell align="center" sx={{ width: '5%', minWidth: 40 }} />
                        <TableCell align="center" sx={{ width: '5%', minWidth: 40 }}>
                          #
                        </TableCell>
                      </TableRow>
                    </TableHead>
                    <TableBody>
                      {fields.map((field, index) => (
                        <LineItemRow
                          key={field.id}
                          index={index}
                          control={control}
                          errors={errors}
                          watchedItem={watchedItems[index]}
                          products={products}
                          currency={currency}
                          theme={theme}
                          isSaving={loading}
                          isOnlyRow={fields.length === 1}
                          getKeyHandler={getKeyHandler}
                          onProductSelect={handleProductSelect}
                          onRemove={() => remove(index)}
                          loadProducts={loadProducts}
                        />
                      ))}
                    </TableBody>
                  </Table>
                </TableContainer>

                <Box sx={{ mt: 2 }}>
                  <AppButton
                    variant="secondary"
                    startIcon={<AddIcon />}
                    onClick={() => append(emptyItem())}
                    disabled={loading}
                  >
                    Add Row / Add Item
                  </AppButton>
                </Box>

                {errors.items && !Array.isArray(errors.items) && (
                  <Alert severity="error" sx={{ mt: 1 }}>
                    {(errors.items as any).message}
                  </Alert>
                )}
              </CardContent>
            </Card>
          </Grid>

          <Grid size={12}>
            <Card>
              <CardContent>
                <Typography variant="h6" gutterBottom>
                  Shipping & Total
                </Typography>
                <Grid container spacing={2} sx={{ alignItems: 'center' }}>
                  <Grid size={{ xs: 12, md: 4 }}>
                    <ShippingField
                      control={control}
                      currency={currency}
                      theme={theme}
                      isSaving={loading}
                    />
                  </Grid>
                  <Grid size={{ xs: 12, md: 4 }}>
                    <TextField
                      fullWidth
                      size="small"
                      label="Total Amount"
                      value={formatNum(totals.total)}
                      slotProps={{
                        input: {
                          readOnly: true,
                          startAdornment: (
                            <span
                              style={{
                                marginRight: 4,
                                fontSize: '0.75rem',
                                color: theme.palette.text.secondary,
                              }}
                            >
                              {currency}
                            </span>
                          ),
                        },
                      }}
                      sx={fieldSx}
                    />
                  </Grid>
                </Grid>
              </CardContent>
            </Card>
          </Grid>

          <Grid size={12}>
            <Card>
              <CardContent>
                <Typography variant="h6" gutterBottom>
                  Additional
                </Typography>
                <Controller
                  name="notes"
                  control={control}
                  render={({ field }) => (
                    <TextField
                      {...field}
                      fullWidth
                      multiline
                      minRows={3}
                      size="small"
                      label="Notes"
                      disabled={loading}
                      sx={fieldSx}
                    />
                  )}
                />
              </CardContent>
            </Card>
          </Grid>

          <Grid size={12}>
            <Box sx={{ display: 'flex', gap: 2, justifyContent: 'flex-end' }}>
              <AppButton variant="secondary" onClick={handleCancel} disabled={loading}>
                Cancel
              </AppButton>
              <AppButton variant="primary" type="submit" disabled={loading}>
                {loading
                  ? isEditMode
                    ? 'Updating...'
                    : 'Creating...'
                  : isEditMode
                    ? 'Update Order'
                    : 'Create Order'}
              </AppButton>
            </Box>
          </Grid>
        </Grid>
      </form>

      {UnsavedChangesDialog}
    </>
  )
}

export default CreatePurchaseOrderPage

interface LineItemRowProps {
  index: number
  control: any
  errors: any
  watchedItem: PurchaseOrderItem
  products: any[]
  currency: string
  theme: any
  isSaving: boolean
  isOnlyRow: boolean
  getKeyHandler: (row: number, col: number) => React.KeyboardEventHandler<HTMLElement>
  onProductSelect: (index: number, product: any) => void
  onRemove: () => void
  loadProducts: (search?: string) => void
}

function LineItemRow({
  index,
  control,
  errors,
  watchedItem,
  products,
  currency,
  theme,
  isSaving,
  isOnlyRow,
  getKeyHandler,
  onProductSelect,
  onRemove,
  loadProducts,
}: LineItemRowProps) {
  const [qtyDisplay, setQtyDisplay] = useState(String(watchedItem?.quantity ?? 1))
  const [priceDisplay, setPriceDisplay] = useState(formatNum(watchedItem?.unitPrice ?? 0))
  const [discountDisplay, setDiscountDisplay] = useState(formatNum(watchedItem?.discountValue ?? 0))
  const [qtyFocused, setQtyFocused] = useState(false)
  const [priceFocused, setPriceFocused] = useState(false)
  const [discountFocused, setDiscountFocused] = useState(false)

  useEffect(() => {
    if (!qtyFocused) setQtyDisplay(String(watchedItem?.quantity ?? 1))
  }, [qtyFocused, watchedItem?.quantity])

  useEffect(() => {
    if (!priceFocused) setPriceDisplay(formatNum(watchedItem?.unitPrice ?? 0))
  }, [priceFocused, watchedItem?.unitPrice])

  useEffect(() => {
    if (!discountFocused) setDiscountDisplay(formatNum(watchedItem?.discountValue ?? 0))
  }, [discountFocused, watchedItem?.discountValue])

  return (
    <TableRow>
      <TableCell sx={{ padding: '2px !important' }} data-cell={`r${index}-c0`}>
        <Controller
          name={`items.${index}.productId`}
          control={control}
          render={({ field }) => (
            <Autocomplete
              options={products}
              getOptionLabel={(option) => option?.name || ''}
              isOptionEqualToValue={(option, value) => option.id === value.id}
              value={watchedItem?.product || products.find((p) => p.id === field.value) || null}
              onChange={(_, value) => onProductSelect(index, value)}
              onInputChange={(_, value, reason) => {
                if (reason === 'input') loadProducts(value.trim().length >= 1 ? value : '')
              }}
              filterOptions={(options) => options}
              size="small"
              disabled={isSaving}
              onKeyDown={getKeyHandler(index, 0)}
              renderInput={(params) => (
                <TextField
                  {...params}
                  placeholder="Search by name or barcode..."
                  variant="outlined"
                  error={!!errors.items?.[index]?.productId}
                  helperText={errors.items?.[index]?.productId?.message}
                  sx={{
                    '& .MuiInputBase-input': {
                      textAlign: 'left !important',
                      padding: '6px 8px !important',
                      fontSize: '0.875rem',
                    },
                  }}
                />
              )}
              slotProps={{
                paper: { sx: { '& .MuiAutocomplete-option': { fontSize: '0.875rem' } } },
              }}
            />
          )}
        />
      </TableCell>

      <TableCell sx={{ padding: '2px !important' }} data-cell={`r${index}-c1`}>
        <Controller
          name={`items.${index}.quantity`}
          control={control}
          render={({ field }) => (
            <TextField
              value={qtyFocused ? qtyDisplay : String(field.value ?? '')}
              onChange={(e) => {
                const v = e.target.value.replace(/[^0-9]/g, '')
                setQtyDisplay(v)
                field.onChange(parseInt(v) || 0)
              }}
              onFocus={() => {
                setQtyFocused(true)
                setQtyDisplay(String(field.value ?? ''))
              }}
              onBlur={() => {
                setQtyFocused(false)
                setQtyDisplay(String(field.value ?? ''))
              }}
              onKeyDown={getKeyHandler(index, 1)}
              variant="outlined"
              disabled={isSaving}
              error={!!errors.items?.[index]?.quantity}
              slotProps={{
                htmlInput: {
                  style: { textAlign: 'center', fontSize: '0.875rem' },
                  inputMode: 'numeric',
                },
              }}
            />
          )}
        />
      </TableCell>

      <TableCell sx={{ padding: '2px !important' }} data-cell={`r${index}-c2`}>
        <Controller
          name={`items.${index}.unitPrice`}
          control={control}
          render={({ field }) => (
            <TextField
              value={priceFocused ? priceDisplay : formatNum(field.value)}
              onChange={(e) => {
                const v = e.target.value.replace(/[^0-9.]/g, '')
                setPriceDisplay(v)
                field.onChange(parseNum(v))
              }}
              onFocus={() => {
                setPriceFocused(true)
                setPriceDisplay(String(field.value ?? ''))
              }}
              onBlur={() => {
                setPriceFocused(false)
                if (!priceDisplay || priceDisplay === '.') field.onChange(0)
              }}
              onKeyDown={getKeyHandler(index, 2)}
              variant="outlined"
              disabled={isSaving}
              error={!!errors.items?.[index]?.unitPrice}
              slotProps={{
                input: {
                  startAdornment: (
                    <span
                      style={{
                        marginRight: 4,
                        fontSize: '0.75rem',
                        color: theme.palette.text.secondary,
                      }}
                    >
                      {currency}
                    </span>
                  ),
                },
                htmlInput: { style: { textAlign: 'right', fontSize: '0.875rem' } },
              }}
            />
          )}
        />
      </TableCell>

      <TableCell sx={{ padding: '2px !important' }} data-cell={`r${index}-c3`}>
        <Box sx={{ display: 'flex', gap: '2px', alignItems: 'center' }}>
          <Controller
            name={`items.${index}.discountValue`}
            control={control}
            render={({ field }) => (
              <TextField
                value={discountFocused ? discountDisplay : formatNum(field.value)}
                onChange={(e) => {
                  const v = e.target.value.replace(/[^0-9.]/g, '')
                  setDiscountDisplay(v)
                  field.onChange(parseNum(v))
                }}
                onFocus={() => {
                  setDiscountFocused(true)
                  setDiscountDisplay(String(field.value ?? ''))
                }}
                onBlur={() => {
                  setDiscountFocused(false)
                  if (!discountDisplay || discountDisplay === '.') field.onChange(0)
                }}
                onKeyDown={getKeyHandler(index, 3)}
                variant="outlined"
                disabled={isSaving}
                error={!!errors.items?.[index]?.discountValue}
                sx={{ flex: 1 }}
                slotProps={{
                  htmlInput: { style: { textAlign: 'right', fontSize: '0.875rem' } },
                }}
              />
            )}
          />
          <Controller
            name={`items.${index}.discountType`}
            control={control}
            render={({ field }) => (
              <TextField
                {...field}
                select
                variant="outlined"
                disabled={isSaving}
                sx={{
                  width: '60px',
                  '& .MuiInputBase-input': { fontSize: '0.875rem', padding: '6px 4px' },
                }}
                slotProps={{
                  select: {
                    MenuProps: {
                      slotProps: {
                        paper: { sx: { '& .MuiMenuItem-root': { fontSize: '0.875rem' } } },
                      },
                    },
                  },
                }}
              >
                <MenuItem value="percentage">%</MenuItem>
                <MenuItem value="amount">{currency}</MenuItem>
              </TextField>
            )}
          />
        </Box>
      </TableCell>

      <TableCell align="right" sx={{ padding: '2px 8px !important' }}>
        <Typography variant="body2" sx={{ fontWeight: 600 }}>
          {formatCurrency(watchedItem?.totalPrice || 0)}
        </Typography>
      </TableCell>

      <TableCell align="center" sx={{ padding: '2px !important' }}>
        <IconButton
          size="small"
          onClick={onRemove}
          disabled={isOnlyRow || isSaving}
          sx={{
            color: theme.palette.error.main,
            '&.Mui-disabled': { color: theme.palette.action.disabled },
          }}
        >
          <DeleteIcon fontSize="small" />
        </IconButton>
      </TableCell>

      <TableCell sx={{ padding: '2px !important' }}>
        <Typography variant="caption" sx={{ color: theme.palette.text.secondary }}>
          {index + 1}
        </Typography>
      </TableCell>
    </TableRow>
  )
}

interface ShippingFieldProps {
  control: any
  currency: string
  theme: any
  isSaving: boolean
}

function ShippingField({ control, currency, theme, isSaving }: ShippingFieldProps) {
  const [display, setDisplay] = useState('0.00')
  const [focused, setFocused] = useState(false)

  return (
    <Controller
      name="shipping"
      control={control}
      render={({ field }) => (
        <TextField
          fullWidth
          size="small"
          label="Shipping Fee"
          value={focused ? display : formatNum(field.value ?? 0)}
          onChange={(e) => {
            const v = e.target.value.replace(/[^0-9.]/g, '')
            setDisplay(v)
            const num = parseFloat(v.replace(/,/g, ''))
            field.onChange(isNaN(num) ? 0 : num)
          }}
          onFocus={() => {
            setFocused(true)
            setDisplay(String(field.value ?? '0'))
          }}
          onBlur={() => {
            setFocused(false)
            if (!display || display === '.') field.onChange(0)
            setDisplay(formatNum(field.value ?? 0))
          }}
          disabled={isSaving}
          slotProps={{
            input: {
              startAdornment: (
                <span
                  style={{
                    marginRight: 4,
                    fontSize: '0.75rem',
                    color: theme.palette.text.secondary,
                  }}
                >
                  {currency}
                </span>
              ),
            },
            htmlInput: { style: { textAlign: 'right', fontSize: '0.875rem' } },
          }}
          sx={fieldSx}
        />
      )}
    />
  )
}
