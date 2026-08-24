import React, { useCallback, useEffect, useMemo, useRef, useState } from 'react'
import {
  Alert,
  Autocomplete,
  Box,
  Card,
  CardContent,
  Grid,
  IconButton,
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
import { yupResolver } from '@hookform/resolvers/yup'
import { DatePicker } from '@mui/x-date-pickers'
import { parseISO, format, isValid } from 'date-fns'
import { Controller, useFieldArray, useForm } from 'react-hook-form'
import { useLocation, useNavigate, useParams } from 'react-router-dom'
import * as yup from 'yup'

import { AppButton } from '@/components/common/AppButton'
import { useCurrency } from '@/hooks/useCurrency'
import { useDocumentNumberPreview } from '@/hooks/useDocumentNumberPreview'
import { useLineItemKeyNav } from '@/hooks/useLineItemKeyNav'
import { useNotification } from '@/hooks/useNotification'
import { useProductSearch } from '@/hooks/useProductSearch'
import { useUnsavedChangesGuard } from '@/hooks/useUnsavedChangesGuard'
import {
  useCreatePurchaseOrderMutation,
  useGetSuppliersQuery,
  useLazyGetPurchaseOrderByNumberQuery,
  useUpdatePurchaseOrderMutation,
} from '@/store/api/purchasingApi'
import { LINE_ITEM_TABLE_SX } from '@/components/transactions/transactionTableStyles'
import { formatNum, parseNum } from '@/components/transactions/numberFormat'
import ShippingField from '@/components/transactions/ShippingField'
import OrderLineItemRow from '@/components/transactions/OrderLineItemRow'
import TransactionFormShell from '@/components/transactions/TransactionFormShell'
import { formatCurrency, getCurrentDate, toDateInputValue, toMuiDatePickerFormat } from '@/utils/formatters'
import { rtkErrorMessage } from '@/utils/errorMessage'
import { currentListPath } from '@/utils/listQuery'

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

const emptyItem = (): PurchaseOrderItem => ({
  productId: '',
  quantity: 1,
  unitPrice: 0,
  discountType: 'percentage',
  discountValue: 0,
  discountPercent: 0,
  totalPrice: 0,
})

const COL_COUNT = 4

const CreatePurchaseOrderPage: React.FC = () => {
  const { currency } = useCurrency()
  const theme = useTheme()
  const navigate = useNavigate()
  const location = useLocation()
  // Same-module list returns rebuild the list URL from the carried ticket.
  const listPath = currentListPath('/purchasing/orders')
  const { orderNumber } = useParams<{ orderNumber: string }>()
  const isEditMode = !!orderNumber
  const { showSuccess, showError } = useNotification()

  const { products, loadProducts, seedProducts } = useProductSearch({ onlyActive: true })
  const [loading, setLoading] = useState(false)
  const [loadingOrder, setLoadingOrder] = useState(false)
  const [orderToLoad, setOrderToLoad] = useState<any>(null)
  const [editingOrderId, setEditingOrderId] = useState<string | null>(null)
  const preselectAppliedRef = useRef(false)

  const { data: suppliersResponse } = useGetSuppliersQuery({})
  const suppliers = useMemo(() => suppliersResponse?.data ?? [], [suppliersResponse])
  const [createPurchaseOrder] = useCreatePurchaseOrderMutation()
  const [updatePurchaseOrder] = useUpdatePurchaseOrderMutation()
  const [fetchPurchaseOrderByNumber] = useLazyGetPurchaseOrderByNumberQuery()

  const storedFormat = useMemo(() => localStorage.getItem('dateFormat') || 'DD/MM/YYYY', [])
  const pickerFormat = useMemo(() => toMuiDatePickerFormat(storedFormat), [storedFormat])

  const orderNumberPreview = useDocumentNumberPreview('Purchase Orders', !isEditMode)

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
        ? toDateInputValue(orderToLoad.orderDate)
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
      if (!product) {
        // Clearing the product (X button) must erase the row's product —
        // follow the Stock Adjustment pattern instead of no-op leaving it stale.
        setValue(`items.${index}.productId`, '', { shouldDirty: true, shouldValidate: true })
        setValue(`items.${index}.product`, undefined, { shouldDirty: true })
        setValue(`items.${index}.unitPrice`, 0, { shouldDirty: true })
        setValue(`items.${index}.totalPrice`, 0, { shouldDirty: true })
        return
      }
      seedProducts([product])
      const price = Number(product.baseCost || 0)
      const qty = Number(watchedItems[index]?.quantity) || 1
      setValue(`items.${index}.productId`, product.id, { shouldDirty: true, shouldValidate: true })
      setValue(`items.${index}.unitPrice`, price, { shouldDirty: true })
      setValue(`items.${index}.totalPrice`, Number((price * qty).toFixed(2)), { shouldDirty: true })
      setValue(`items.${index}.product`, product, { shouldDirty: true })
    },
    [seedProducts, setValue, watchedItems],
  )

  const handleCancel = () => {
    navigate(listPath)
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
        await updatePurchaseOrder({
          id: editingOrderId,
          data: orderData as any,
        }).unwrap()
        showSuccess('Purchase order updated successfully')
        navigate(listPath)
      } else {
        await createPurchaseOrder(orderData as any).unwrap()
        showSuccess('Purchase order created successfully')
        navigate(listPath)
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
      <TransactionFormShell
        title={isEditMode ? 'Edit Purchase Order' : 'Create Purchase Order'}
        subtitle={isEditMode ? 'Update order details, items, and pricing' : 'Fill in order details, add items, and set pricing'}
        backAction={handleCancel}
        onSubmit={handleSubmit(onSubmit)}
        isSaving={loading}
        showLoadingSpinner={false}
        submitLabel={loading ? (isEditMode ? 'Updating...' : 'Creating...') : isEditMode ? 'Update Order' : 'Create Order'}
        onCancel={handleCancel}
      >
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
                  />
                </Grid>

                <Grid size={{ xs: 12, md: 4 }}>
                  <Controller
                    name="orderDate"
                    control={control}
                    render={({ field }) => (
                      <DatePicker
                        label="Order Date"
                        value={field.value ? parseISO(field.value) : null}
                        format={pickerFormat}
                        disabled={loading}
                        onChange={(date) =>
                          field.onChange(date && isValid(date) ? format(date, 'yyyy-MM-dd') : '')
                        }
                        slotProps={{
                          textField: {
                            required: true,
                            fullWidth: true,
                            size: 'small',
                            error: !!errors.orderDate,
                            helperText: errors.orderDate?.message,
                          },
                        }}
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
                <Table size="small" sx={LINE_ITEM_TABLE_SX(theme)}>
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
                      <OrderLineItemRow
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
                  Add Item
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
                  />
                )}
              />
            </CardContent>
          </Card>
        </Grid>
      </TransactionFormShell>

      {UnsavedChangesDialog}
    </>
  )
}

export default CreatePurchaseOrderPage


