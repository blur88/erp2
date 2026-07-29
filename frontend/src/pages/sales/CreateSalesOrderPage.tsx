import React, { useCallback, useEffect, useMemo, useRef, useState } from 'react'
import {
  Alert,
  Autocomplete,
  Box,
  Card,
  CardContent,
  CircularProgress,
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
import { useStore } from 'react-redux'
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
  useCreateSalesOrderMutation,
  useGetCustomersQuery,
  useLazyGetSalesOrderByNumberQuery,
  useUpdateSalesOrderMutation,
} from '@/store/api/salesApi'
import { patchSalesOrderCaches } from '@/store/api/salesOrderCache'
import { useDocumentNumberPreview } from '@/hooks/useDocumentNumberPreview'
import { setSelectedOrder } from '@/store/slices/salesSlice'
import type { RootState } from '@/store'
import { LINE_ITEM_TABLE_SX } from '@/components/transactions/transactionTableStyles'
import { formatNum, parseNum } from '@/components/transactions/numberFormat'
import ShippingField from '@/components/transactions/ShippingField'
import OrderLineItemRow from '@/components/transactions/OrderLineItemRow'
import TransactionFormShell from '@/components/transactions/TransactionFormShell'
import { formatCurrency, getCurrentDate, toDateInputValue, toMuiDatePickerFormat } from '@/utils/formatters'
import { rtkErrorMessage } from '@/utils/errorMessage'
import { getStockOffenders } from '@/utils/stockStatus'
import { getOrderActionMetas } from './utils/orderActions'
import StockIndicatorChip from './components/StockIndicatorChip'

interface OrderItem {
  productId: string
  product?: any
  quantity: number
  unitPrice: number
  discountType: 'percentage' | 'amount'
  discountValue: number
  discountPercent: number
  discountAmount: number
  totalPrice: number
  description?: string
}

interface CreateOrderFormData {
  customerId: string
  orderDate: string
  notes?: string
  shipping: number
  items: OrderItem[]
}

const schema = yup.object({
  customerId: yup.string().required('Customer is required'),
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
        discountAmount: yup.number().min(0).optional().default(0),
        totalPrice: yup.number().min(0).required(),
        description: yup.string().optional(),
      }),
    )
    .min(1, 'At least one item is required'),
})

const fieldSx = {
  '& .MuiInputBase-input': { fontSize: '0.875rem' },
  '& .MuiInputLabel-root': { fontSize: '0.875rem' },
}

const emptyItem = (): OrderItem => ({
  productId: '',
  quantity: 1,
  unitPrice: 0,
  discountType: 'percentage',
  discountValue: 0,
  discountPercent: 0,
  discountAmount: 0,
  totalPrice: 0,
  description: '',
})

function getProductPrice(product: any, customer: any): number {
  if (!product) return 0
  const eligible = (product.priceListItems ?? [])
    .filter((item: any) => item.priceList && item.priceList.isActive)
    .sort((a: any, b: any) => {
      const pa = a.priceList.priority ?? Number.MAX_SAFE_INTEGER
      const pb = b.priceList.priority ?? Number.MAX_SAFE_INTEGER
      if (pa !== pb) return pa - pb
      return String(a.id).localeCompare(String(b.id))
    })
  if (eligible.length === 0) return 0

  if (customer?.priceListId) {
    const match = eligible.find((item: any) => item.priceListId === customer.priceListId)
    if (match) return Number(match.price)
  }
  const defaultItem = eligible.find((item: any) => item.priceList.isDefault)
  if (defaultItem) return Number(defaultItem.price)
  return Number(eligible[0].price)
}

const COL_COUNT = 4

const CreateSalesOrderPage: React.FC = () => {
  const theme = useTheme()
  const navigate = useNavigate()
  const location = useLocation()
  const dispatch = useAppDispatch()
  const store = useStore()
  const { orderNumber } = useParams<{ orderNumber: string }>()
  const isEditMode = !!orderNumber
  const { showSuccess, showError } = useNotification()
  const { currency } = useCurrency()

  const [loadingOrder, setLoadingOrder] = useState(false)
  const [loadError, setLoadError] = useState<string | null>(null)
  const [orderToLoad, setOrderToLoad] = useState<any>(null)
  const [editingOrderId, setEditingOrderId] = useState<string | null>(null)
  const [selectedCustomer, setSelectedCustomer] = useState<any>(null)
  const customerChangedByUserRef = useRef(false)
  const preselectAppliedRef = useRef(false)

  const { data: customersData } = useGetCustomersQuery({})
  const customers = useMemo(() => customersData?.data ?? [], [customersData])
  const [createSalesOrder, createState = { isLoading: false }] =
    useCreateSalesOrderMutation() as any
  const [updateSalesOrder, updateState = { isLoading: false }] =
    useUpdateSalesOrderMutation() as any
  const [triggerGetSalesOrderByNumber] = useLazyGetSalesOrderByNumberQuery()
  const isSaving = Boolean(createState.isLoading || updateState.isLoading)

  const { products, loadProducts, seedProducts } = useProductSearch({ onlyActive: true })

  const storedFormat = useMemo(() => localStorage.getItem('dateFormat') || 'DD/MM/YYYY', [])
  const pickerFormat = useMemo(() => toMuiDatePickerFormat(storedFormat), [storedFormat])

  const orderNumberPreview = useDocumentNumberPreview('Sales Orders', !isEditMode)

  const {
    control,
    handleSubmit,
    watch,
    setValue,
    reset,
    formState: { errors, isDirty, isSubmitting },
  } = useForm<CreateOrderFormData>({
    resolver: yupResolver(schema) as any,
    defaultValues: {
      customerId: '',
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
  const stockOffenders = getStockOffenders(
    (watchedItems ?? []).map((item) => ({
      product: item.product,
      quantity: Number(item.quantity ?? 0),
    })),
  )

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
          // Derived recompute — must NOT mark the form dirty, or loading an
          // existing order (backend stores unrounded totals; this rounds to 2dp)
          // would flip isDirty true with no user action and falsely block nav.
          setValue(`items.${index}.totalPrice`, Number(total.toFixed(2)))
        }
      }
    })
  }, [JSON.stringify(watchedItems), setValue])

  useEffect(() => {
    if (loadingOrder || orderToLoad || !customerChangedByUserRef.current) return
    customerChangedByUserRef.current = false
    if (!selectedCustomer || !watchedItems?.length) return
    watchedItems.forEach((item, index) => {
      if (!item.productId) return
      const fullProduct = products.find((p) => p.id === item.productId) || item.product
      if (!fullProduct) return
      const price = getProductPrice(fullProduct, selectedCustomer)
      if (Number(item.unitPrice) !== price) {
        setValue(`items.${index}.unitPrice`, price, { shouldDirty: true })
      }
    })
  }, [selectedCustomer, setValue, loadingOrder, orderToLoad, products, watchedItems])

  useEffect(() => {
    const preselectId = (location.state as any)?.preselectCustomerId as string | undefined
    if (!preselectId || !customers.length || preselectAppliedRef.current) return
    const found = customers.find((c: any) => c.id === preselectId)
    if (found) {
      preselectAppliedRef.current = true
      setValue('customerId', found.id, { shouldDirty: true })
      setSelectedCustomer(found)
      customerChangedByUserRef.current = true
    }
  }, [customers, location.state, setValue])

  useEffect(() => {
    loadProducts()
  }, [])

  useEffect(() => {
    if (isEditMode && orderNumber) {
      setLoadingOrder(true)
      setLoadError(null)
      triggerGetSalesOrderByNumber(orderNumber)
        .unwrap()
        .then((order: any) => {
          setEditingOrderId(order.id)
          if (order.items?.length) {
            seedProducts(order.items.filter((i: any) => i.product).map((i: any) => i.product))
          }

          const editMeta = getOrderActionMetas(order).find((meta) => meta.action === 'edit')
          if (!editMeta || editMeta.disabled) {
            setLoadingOrder(false)
            showError(editMeta?.tooltip ?? 'Cannot edit this sales order')
            navigate(`/sales/orders/${orderNumber}/view`, { replace: true })
            return
          }

          setOrderToLoad(order)
        })
        .catch((err: any) => {
          setLoadError(err?.data?.message || err?.response?.data?.message || 'Failed to load sales order')
          setLoadingOrder(false)
        })
    }
  }, [isEditMode, orderNumber])

  useEffect(() => {
    if (!orderToLoad) return
    const needsProducts = orderToLoad.items?.some((i: any) => i.product)
    if (needsProducts && !products.length) return
    reset({
      customerId: orderToLoad.customerId || orderToLoad.customer?.id || '',
      orderDate: orderToLoad.orderDate
        ? toDateInputValue(orderToLoad.orderDate)
        : getCurrentDate(),
      notes: orderToLoad.notes || '',
      shipping: orderToLoad.shippingAmount || 0,
      items:
        orderToLoad.items?.map((item: any) => ({
          productId: item.productId || item.product?.id || '',
          product: item.product,
          quantity: parseInt(item.quantity) || 1,
          unitPrice: item.unitPrice || 0,
          discountType: (item.discountType || 'percentage') as 'percentage' | 'amount',
          discountValue:
            item.discountType === 'percentage'
              ? item.discountPercent || item.discountValue || 0
              : item.discountAmount || item.discountValue || 0,
          discountPercent: item.discountPercent || 0,
          discountAmount: item.discountAmount || 0,
          totalPrice: item.totalAmount || item.totalPrice || 0,
          description: item.notes || item.description || '',
        })) ?? [emptyItem()],
    })
    const customer = customers.find(
      (c: any) => c.id === (orderToLoad.customerId || orderToLoad.customer?.id),
    )
    if (customer) setSelectedCustomer(customer)
    setOrderToLoad(null)
    setLoadingOrder(false)
  }, [orderToLoad, products, customers, reset])

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
      const price = getProductPrice(product, selectedCustomer)
      const qty = Number(watchedItems[index]?.quantity) || 1
      setValue(`items.${index}.productId`, product.id, { shouldDirty: true, shouldValidate: true })
      setValue(`items.${index}.unitPrice`, price, { shouldDirty: true })
      setValue(`items.${index}.totalPrice`, Number((price * qty).toFixed(2)), { shouldDirty: true })
      setValue(`items.${index}.product`, product, { shouldDirty: true })
    },
    [seedProducts, setValue, selectedCustomer, watchedItems],
  )

  const handleCancel = () => {
    navigate('/sales/orders')
  }

  const onSubmit = async (data: CreateOrderFormData) => {
    try {
      const payload = {
        customerId: data.customerId,
        orderDate: data.orderDate,
        notes: data.notes || undefined,
        shippingAmount: Number(data.shipping) || 0,
        items: data.items.map((item) => {
          const discountValue = Number(item.discountValue) || 0
          return {
            productId: item.productId,
            quantity: Number(item.quantity),
            unitPrice: Number(item.unitPrice),
            discountType: item.discountType,
            discountPercent: item.discountType === 'percentage' ? discountValue : 0,
            discountAmount: item.discountType === 'amount' ? discountValue : 0,
            notes: item.description || undefined,
          }
        }),
      }

      if (isEditMode && editingOrderId) {
        const updated = await updateSalesOrder({ id: editingOrderId, data: payload as any }).unwrap()
        patchSalesOrderCaches(dispatch, () => store.getState() as RootState, updated)
        dispatch(setSelectedOrder(updated))
        showSuccess('Sales order updated successfully')
        navigate(`/sales/orders?highlight=${updated.id}`)
      } else {
        const created = await createSalesOrder(payload as any).unwrap()
        dispatch(setSelectedOrder(created as any))
        showSuccess('Sales order created successfully')
        navigate(`/sales/orders?highlight=${(created as any).id}`)
      }
    } catch (err: any) {
      showError(
        rtkErrorMessage(err, `Failed to ${isEditMode ? 'update' : 'create'} sales order`),
      )
    }
  }

  if (loadingOrder) {
    return (
      <Box sx={{ display: 'flex', justifyContent: 'center', pt: 10 }}>
        <CircularProgress />
      </Box>
    )
  }

  if (loadError) {
    return (
      <>
        <PageHeader
          variant="workflow"
          title="Edit Sales Order"
          backAction={() => navigate('/sales/orders')}
        />
        <Alert severity="error">{loadError}</Alert>
      </>
    )
  }

  return (
    <>
      <TransactionFormShell
        title={isEditMode ? 'Edit Sales Order' : 'New Sales Order'}
        subtitle={isEditMode ? 'Update order details, items, and pricing' : 'Fill in the order details below'}
        backAction={handleCancel}
        onSubmit={handleSubmit(onSubmit)}
        isSaving={isSaving}
        showLoadingSpinner={false}
        submitLabel={isSaving ? (isEditMode ? 'Updating...' : 'Creating...') : isEditMode ? 'Update Order' : 'Create Order'}
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
                    sx={fieldSx}
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
                        disabled={isSaving}
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
                            sx: fieldSx,
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
                        name="customerId"
                        control={control}
                        render={({ field }) => (
                          <Autocomplete
                            options={customers}
                            getOptionLabel={(option) => option.name}
                            value={customers.find((c: any) => c.id === field.value) || null}
                            onChange={(_, value) => {
                              field.onChange(value?.id || '')
                              customerChangedByUserRef.current = true
                              setSelectedCustomer(value)
                            }}
                            size="small"
                            disabled={isSaving}
                            renderInput={(params) => (
                              <TextField
                                {...params}
                                label="Customer"
                                required
                                size="small"
                                error={!!errors.customerId}
                                helperText={errors.customerId?.message}
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
                      title="Add new customer"
                      disabled={isSaving}
                      onClick={() =>
                        navigate('/sales/customers/create', {
                          state: { returnTo: 'sales-order' },
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

              {stockOffenders.length > 0 && (
                <Alert severity="warning" sx={{ mb: 2 }}>
                  {`${stockOffenders.length} item(s) out of stock: `}
                  {stockOffenders
                    .map((o) => `${o.name} (Qty: ${o.quantity}, Stock: ${o.stock})`)
                    .join(', ')}
                </Alert>
              )}

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
                        isSaving={isSaving}
                        isOnlyRow={fields.length === 1}
                        getKeyHandler={getKeyHandler}
                        onProductSelect={handleProductSelect}
                        onRemove={() => remove(index)}
                        loadProducts={loadProducts}
                        renderProductAdornment={(item) =>
                          item?.product ? (
                            <StockIndicatorChip
                              stockQuantity={Number(item.product.stockQuantity ?? 0)}
                              quantity={Number(item.quantity ?? 0)}
                            />
                          ) : null
                        }
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
                  disabled={isSaving}
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
                    isSaving={isSaving}
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
                    disabled={isSaving}
                    sx={fieldSx}
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

export default CreateSalesOrderPage


