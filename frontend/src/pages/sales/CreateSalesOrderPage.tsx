import React, { useState, useEffect, useRef } from 'react'
import { useStore } from 'react-redux'
import { useLocation, useNavigate, useParams } from 'react-router-dom'
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
import { useCreateSalesOrderMutation, useUpdateSalesOrderMutation, useLazyGetSalesOrderByNumberQuery, useGetCustomersQuery } from '@/store/api/salesApi'
import { patchSalesOrderCaches } from '@/store/api/salesOrderCache'
import { formatCurrency, getCurrentDate } from '@/utils/formatters'
import { AppButton } from '@/components/common/AppButton'
import { useNotification } from '@/hooks/useNotification'
import { useProductSearch } from '@/hooks/useProductSearch'
import { useAppDispatch } from '@/hooks/useRedux'
import PageHeader from '@/components/common/PageHeader'
import TransactionForm from '@/components/common/TransactionForm'
import type { RootState } from '@/store'
import { setSelectedOrder } from '@/store/slices/salesSlice'
import { useCurrency } from '@/hooks/useCurrency'

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
  shipping: yup.number().min(0).optional(),
  items: yup.array().of(
    yup.object({
      productId: yup.string().required('Product is required'),
      quantity: yup.number().integer('Quantity must be a whole number').positive('Quantity must be positive').required(),
      unitPrice: yup.number().min(0).required(),
      discountType: yup.string().oneOf(['percentage', 'amount']).required(),
      discountValue: yup.number().min(0).optional(),
      discountPercent: yup.number().min(0).max(100).optional(),
      discountAmount: yup.number().min(0).optional(),
      totalPrice: yup.number().min(0).required(),
      description: yup.string().optional(),
    })
  ).min(1, 'At least one item is required'),
})

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
  const [createSalesOrder] = useCreateSalesOrderMutation()
  const [updateSalesOrder] = useUpdateSalesOrderMutation()
  const [triggerGetSalesOrderByNumber] = useLazyGetSalesOrderByNumberQuery()
  const { data: customersData } = useGetCustomersQuery({})
  const [customers, setCustomers] = useState<any[]>([])
  const { products, loadProducts, seedProducts } = useProductSearch()
  const [loading, setLoading] = useState(false)
  const [loadingOrder, setLoadingOrder] = useState(false)
  const [error, setError] = useState<string | null>(null)
  const [orderToLoad, setOrderToLoad] = useState<any>(null)
  const [editingOrderId, setEditingOrderId] = useState<string | null>(null)
  const [selectedCustomer, setSelectedCustomer] = useState<any>(null)
  const customerChangedByUserRef = useRef(false)

  const { control, handleSubmit, watch, setValue, reset, formState: { errors } } = useForm<CreateOrderFormData>({
    resolver: yupResolver(schema) as any,
    defaultValues: {
      customerId: '',
      orderDate: getCurrentDate(),
      notes: '',
      shipping: 0,
      items: [
        {
          productId: '',
          quantity: 1,
          unitPrice: 0,
          discountType: 'percentage' as const,
          discountValue: 0,
          discountPercent: 0,
          discountAmount: 0,
          totalPrice: 0,
          description: '',
        }
      ],
    },
  })

  const { fields, append, remove } = useFieldArray({
    control,
    name: 'items',
  })

  const watchedItems = watch('items')
  const watchedShipping = watch('shipping')
  const watchedCustomerId = watch('customerId')

  useEffect(() => {
    if (customersData?.data) {
      setCustomers(customersData.data)
    }
  }, [customersData])

  useEffect(() => {
    const preselectCustomerId = (location.state as any)?.preselectCustomerId as string | undefined
    if (!preselectCustomerId || !customers.length) {
      return
    }

    const foundCustomer = customers.find((customer) => customer.id === preselectCustomerId)
    if (foundCustomer) {
      setValue('customerId', foundCustomer.id)
      setSelectedCustomer(foundCustomer)
      customerChangedByUserRef.current = true
    }
  }, [customers, location.state, setValue])

  useEffect(() => {
    loadProducts()
  }, [])

  // Helper function to get price from priceListItems
  const getProductPrice = (product: any, customer: any): number => {
    if (!product) return 0

    // Check for priceListItems
    if (product.priceListItems && product.priceListItems.length > 0) {
      // If customer has a specific price list, try to find matching price
      if (customer?.priceListId) {
        const customerPrice = product.priceListItems.find(
          (item: any) => item.priceListId === customer.priceListId
        )
        if (customerPrice) {
          return Number(customerPrice.price)
        }
      }

      // Fallback to default price list
      const defaultPrice = product.priceListItems.find(
        (item: any) => item.priceList?.isDefault
      )
      if (defaultPrice) {
        return Number(defaultPrice.price)
      }

      // Use first available price
      return Number(product.priceListItems[0].price)
    }

    // Fallback to baseCost
    return Number(product.baseCost || 0)
  }

  // Update all product prices when customer changes
  useEffect(() => {
    // Skip price recalculation if in edit mode and still loading
    if (loadingOrder || orderToLoad) {
      return
    }

    if (!customerChangedByUserRef.current) {
      return
    }
    customerChangedByUserRef.current = false

    if (selectedCustomer && watchedItems && watchedItems.length > 0) {
      watchedItems.forEach((item, index) => {
        if (item.productId) {
          // Use the full product from the products list (has priceListItems/baseCost),
          // not item.product from the form which is the stripped SO-mapper version.
          const fullProduct = products.find((p) => p.id === item.productId) || item.product
          if (!fullProduct) return
          const productPrice = getProductPrice(fullProduct, selectedCustomer)
          if (Number(item.unitPrice) !== productPrice) {
            setValue(`items.${index}.unitPrice`, productPrice)
          }
        }
      })
    }
  }, [selectedCustomer, setValue, loadingOrder, orderToLoad])

  // Load sales order data in edit mode
  useEffect(() => {
    if (isEditMode && orderNumber) {
      loadSalesOrder(orderNumber)
    }
  }, [isEditMode, orderNumber])

  const loadSalesOrder = async (currentOrderNumber: string) => {
    setLoadingOrder(true)
    try {
      const order = await triggerGetSalesOrderByNumber(currentOrderNumber).unwrap()
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
      showError(err?.response?.data?.message || 'Failed to load sales order')
      setError('Failed to load sales order')
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
          quantity: parseInt(item.quantity) || 1,
          unitPrice: item.unitPrice || 0,
          discountType: (item.discountType || 'percentage') as 'percentage' | 'amount',
          discountValue: item.discountType === 'percentage' ? (item.discountPercent || 0) : (item.discountAmount || 0),
          discountPercent: item.discountPercent || 0,
          discountAmount: item.discountAmount || 0,
          totalPrice: item.totalAmount || item.totalPrice || 0,
          description: item.notes || item.description || '',
        }
      })

      // Map order data to form
      reset({
        customerId: orderToLoad.customerId || orderToLoad.customer?.id || '',
        orderDate: orderToLoad.orderDate ? new Date(orderToLoad.orderDate).toISOString().split('T')[0] : getCurrentDate(),
        notes: orderToLoad.notes || '',
        shipping: orderToLoad.shippingAmount || 0,
        items: itemsToReset || [
          {
            productId: '',
            quantity: 1,
            unitPrice: 0,
            discountType: 'percentage' as const,
            discountValue: 0,
            discountPercent: 0,
            discountAmount: 0,
            totalPrice: 0,
            description: '',
          }
        ],
      })

      setOrderToLoad(null)
      setLoadingOrder(false)

      const customer = customers.find(c => c.id === (orderToLoad.customerId || orderToLoad.customer?.id))
      if (customer) {
        setSelectedCustomer(customer)
      }
    }
  }, [orderToLoad, products, customers, reset])

  // Recalculate totals when items change
  useEffect(() => {
    watchedItems.forEach((item, index) => {
      if (item.quantity && item.unitPrice !== undefined) {
        const quantity = Number(item.quantity)
        const unitPrice = Number(item.unitPrice)
        let unitDiscount = 0

        if (item.discountType === 'percentage') {
          // Percentage discount: apply to unit price
          unitDiscount = unitPrice * (Number(item.discountValue || 0) / 100)
        } else {
          // Fixed amount discount: per unit
          unitDiscount = Number(item.discountValue || 0)
        }

        const discountedUnitPrice = unitPrice - unitDiscount
        const total = discountedUnitPrice * quantity

        if (Math.abs(item.totalPrice - total) > 0.01) {
          setValue(`items.${index}.totalPrice`, Number(total.toFixed(2)))
        }
      }
    })
  }, [JSON.stringify(watchedItems), setValue])

  const onSubmit = async (data: CreateOrderFormData) => {
    setLoading(true)
    setError(null)

    try {
      const orderData = {
        customerId: data.customerId,
        orderDate: data.orderDate,
        notes: data.notes || undefined,
        shippingAmount: Number(data.shipping) || 0,
        items: data.items.map((item) => {
          // Calculate discountPercent and discountAmount based on discountType and discountValue
          const discountValue = Number(item.discountValue) || 0
          const discountPercent = item.discountType === 'percentage' ? discountValue : 0
          const discountAmount = item.discountType === 'amount' ? discountValue : 0

          return {
            productId: item.productId,
            quantity: Number(item.quantity),
            unitPrice: Number(item.unitPrice),
            discountType: item.discountType,
            discountPercent: discountPercent,
            discountAmount: discountAmount,
            notes: item.description || undefined,
          }
        }),
      }



      if (isEditMode && editingOrderId) {
        const updatedOrder = await updateSalesOrder({ id: editingOrderId, data: orderData as any }).unwrap()

        patchSalesOrderCaches(dispatch, () => store.getState() as RootState, updatedOrder)
        dispatch(setSelectedOrder(updatedOrder))

        showSuccess('Sales order updated successfully')
        // Navigate to orders page with the updated order selected
        navigate(`/sales/orders?highlight=${updatedOrder.id}`)
      } else {
        const createdOrder = await createSalesOrder(orderData as any).unwrap()
        dispatch(setSelectedOrder(createdOrder as any))
        showSuccess('Sales order created successfully')
        // Navigate to orders page with the new order selected
        navigate(`/sales/orders?highlight=${(createdOrder as any).id}`)
      }
    } catch (err: any) {
      console.error('Error creating sales order:', err)
      setError(err.response?.data?.message || 'Failed to create sales order')
      showError(err.response?.data?.message || 'Failed to create sales order')
    } finally {
      setLoading(false)
    }
  }

  const handleProductSelect = async (index: number, product: any) => {
    if (product) {
      seedProducts([product])
      await Promise.resolve()
      setValue(`items.${index}.productId`, product.id)

      // Use price list system to determine the price
      const productPrice = getProductPrice(product, selectedCustomer)

      setValue(`items.${index}.unitPrice`, productPrice)
      setValue(`items.${index}.product`, product)
    }
  }

  const formatNumberWithCommas = (value: number | string): string => {
    if (value === '' || value === null || value === undefined) return ''
    const num = typeof value === 'string' ? parseFloat(value) : value
    if (isNaN(num)) return ''

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
      discountType: 'percentage' as const,
      discountValue: 0,
      discountPercent: 0,
      discountAmount: 0,
      totalPrice: 0,
      description: '',
    })
  }

  const totals = React.useMemo(() => {
    return calculateOrderTotals()
  }, [JSON.stringify(watchedItems), watchedShipping])

  return (
    <>
      {/* Header */}
      <PageHeader
        variant="workflow"
        title={isEditMode ? 'Edit Sales Order' : 'Create Sales Order'}
        subtitle={isEditMode ? 'Update order details, items, and pricing' : 'Fill in order details, add items, and set pricing'}
        backAction={() => navigate('/sales/orders')}
      />
      {loadingOrder ? (
        <Box sx={{ display: 'flex', justifyContent: 'center', py: 8 }}>
          <Typography>Loading sales order...</Typography>
        </Box>
      ) : (
        <TransactionForm
          mode="custom"
          entityLabel="Customer"
          entityOptions={customers.map((customer) => ({ id: customer.id, name: customer.name }))}
          lineItemColumns={[
            { key: 'product', label: 'Product' },
            { key: 'quantity', label: 'Qty' },
            { key: 'unitPrice', label: 'Price' },
            { key: 'discount', label: 'Discount' },
            { key: 'subtotal', label: 'Sub-total' },
          ]}
          onSubmit={handleSubmit(onSubmit)}
          onCancel={() => navigate('/sales/orders')}
          isSubmitting={loading}
          hideDefaultActions
          error={error ? (
            <Alert severity="error" sx={{ mb: 3 }}>
              {error}
            </Alert>
          ) : null}
        >
          <Grid container spacing={3}>
            {/* SO Information Card */}
            <Grid size={12}>
              <Card>
                <CardContent>
                  <Typography variant="h6" gutterBottom>SO Information</Typography>
                  <Grid container spacing={2}>
                    <Grid size={{ xs: 12, md: 6 }}>
                      <Box sx={{ display: 'flex', gap: 1, alignItems: 'flex-start' }}>
                        <Box sx={{ flexGrow: 1 }}>
                          <Controller
                            name="customerId"
                            control={control}
                            render={({ field }) => (
                              <Autocomplete
                                options={customers}
                                getOptionLabel={(option) => option.name}
                                value={customers.find(c => c.id === field.value) || null}
                                onChange={(_, value) => {
                                  field.onChange(value?.id || '')
                                  customerChangedByUserRef.current = true
                                  setSelectedCustomer(value)
                                }}
                                size="small"
                                renderInput={(params) => (
                                  <TextField
                                    {...params}
                                    label="Customer"
                                    error={!!errors.customerId}
                                    helperText={errors.customerId?.message}
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
                        </Box>
                        <IconButton
                          size="small"
                          title="Add new customer"
                          onClick={() => navigate('/sales/customers/create', { state: { returnTo: 'sales-order' } })}
                          sx={{ mt: 0.5 }}
                        >
                          <AddIcon fontSize="small" />
                        </IconButton>
                      </Box>
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

            {/* SO Items Card */}
            <Grid size={12}>
              <Card>
                <CardContent>
                  <Box sx={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', mb: 2 }}>
                    <Typography variant="h6">SO Items</Typography>
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
                                      slotProps={{
                                        htmlInput: {
                                          style: { textAlign: 'center', fontSize: '0.875rem' },
                                          inputMode: 'numeric',
                                          pattern: '[0-9]*'
                                        }
                                      }}
                                      error={!!errors.items?.[index]?.quantity}
                                      helperText={errors.items?.[index]?.quantity?.message}
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
                                        input: {
                                          startAdornment: <span style={{ marginRight: '4px', fontSize: '0.75rem', color: theme.palette.text.secondary }}>{currency}</span>
                                        },
                                        htmlInput: {
                                          style: { textAlign: 'right', fontSize: '0.875rem' }
                                        }
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
                                          htmlInput: {
                                            style: { textAlign: 'right', fontSize: '0.875rem' }
                                          }
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
                                      <MenuItem value="percentage">%</MenuItem>
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
                  <Typography variant="h6" gutterBottom>SO Summary</Typography>

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
                              const numValue = value === '' ? 0 : parseFloat(value.replace(/,/g, ''))
                              field.onChange(isNaN(numValue) ? 0 : numValue)
                            }}
                            onFocus={() => {
                              setIsFocused(true)
                              setDisplayValue(field.value === 0 ? '0' : (field.value?.toString() || '0'))
                            }}
                            onBlur={() => {
                              setIsFocused(false)
                              if (displayValue === '' || displayValue === '.') {
                                field.onChange(0)
                              }
                              setDisplayValue(formatNumberWithCommas(field.value || 0))
                            }}
                            variant="outlined"
                            size="small"
                            slotProps={{
                              input: {
                                startAdornment: <span style={{ marginRight: '4px', fontSize: '0.75rem', color: theme.palette.text.secondary }}>{currency}</span>
                              },
                              htmlInput: {
                                style: { textAlign: 'right', fontSize: '0.875rem' }
                              }
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
                      onClick={() => navigate('/sales/orders')}
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
    </>
  );
}

export default CreateSalesOrderPage
