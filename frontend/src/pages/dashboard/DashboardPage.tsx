import React, { useState, useEffect, useMemo, useRef } from 'react'
import {
  Box,
  Grid,
  Paper,
  Typography,
  Card,
  CardContent,
  Table,
  TableBody,
  TableCell,
  TableContainer,
  TableHead,
  TableRow,
  Chip,
  useTheme,
  CircularProgress,
  Alert,
  FormControl,
  InputLabel,
  Select,
  MenuItem,
  OutlinedInput,
  Checkbox,
  ListItemText,
  TextField,
  Divider,
  Button,
} from '@mui/material'
import {
  TrendingUp as TrendingUpIcon,
  TrendingDown as TrendingDownIcon,
  Inventory2 as InventoryIcon,
  PointOfSale as SalesIcon,
  Assignment as PurchasingIcon,
  People as CustomersIcon,
  Warning as WarningIcon,
  Dashboard as DashboardIcon,
} from '@mui/icons-material'
import {
  Chart as ChartJS,
  CategoryScale,
  LinearScale,
  TimeScale,
  PointElement,
  LineElement,
  BarElement,
  Title,
  Tooltip,
  Legend,
  ArcElement,
  Filler
} from 'chart.js'
import 'chartjs-adapter-date-fns'
import zoomPlugin from 'chartjs-plugin-zoom'
import { Line, Doughnut } from 'react-chartjs-2'
import { format, startOfWeek, startOfMonth, startOfYear, eachDayOfInterval, eachWeekOfInterval, eachMonthOfInterval, eachYearOfInterval, endOfDay, endOfWeek, endOfMonth, endOfYear, isWithinInterval, subDays } from 'date-fns'
import { formatCurrency } from '@/utils/formatters'
import { TYPOGRAPHY_STYLES, TABLE_STYLES } from '@/constants/typography'
import { useNavigate } from 'react-router-dom'

ChartJS.register(
  CategoryScale,
  LinearScale,
  TimeScale,
  PointElement,
  LineElement,
  BarElement,
  Title,
  Tooltip,
  Legend,
  ArcElement,
  Filler,
  zoomPlugin
)

// Chart line options
const LINE_OPTIONS = [
  { value: 'all', label: 'All' },
  { value: 'sales_completed', label: 'Sales Completed' },
  { value: 'cogs', label: 'Cost of Goods Sold' },
  { value: 'sales_profit', label: 'Sales Profit' },
  { value: 'sales_orders', label: 'Sales Orders' },
  { value: 'purchase_orders', label: 'Purchase Orders' },
  { value: 'cash_in', label: 'Cash In' },
  { value: 'cash_out', label: 'Cash Out' },
  { value: 'net_cash_flow', label: 'Net Cash Flow' },
  { value: 'inventory_value', label: 'Cost Value of Inventory' },
]

// Group by options
const GROUP_BY_OPTIONS = [
  { value: 'days', label: 'Days' },
  { value: 'weeks', label: 'Weeks' },
  { value: 'months', label: 'Months' },
  { value: 'years', label: 'Years' },
]

// Line colors mapping
const LINE_COLORS: { [key: string]: string } = {
  sales_completed: '#4caf50',
  cogs: '#f44336',
  sales_profit: '#2196f3',
  sales_orders: '#9c27b0',
  purchase_orders: '#ff9800',
  cash_in: '#00bcd4',
  cash_out: '#e91e63',
  net_cash_flow: '#3f51b5',
  inventory_value: '#795548',
}

interface DashboardData {
  sales: {
    totalRevenue: number
    totalOrders: number
    uniqueCustomers: number
    revenueGrowth: number
    ordersGrowth: number
    recentOrders: any[]
    topProducts: any[]
    periodData: any[]
  }
  purchasing: {
    totalSpent: number
    totalOrders: number
    activeSuppliers: number
    spentGrowth: number
    recentOrders: any[]
    topSuppliers: any[]
    periodData: any[]
  }
  inventory: {
    totalProducts: number
    totalCategories: number
    inventoryValue: number
    outOfStockCount: number
    lowStockItems: any[]
    stockHealthMetrics: {
      inStockPercentage: number
      outOfStockPercentage: number
    }
  }
  rawData: {
    salesOrders: any[]
    purchaseOrders: any[]
    payments: any[]
    inventoryValue: number
  }
}

interface ChartFilters {
  selectedLines: string[]
  dateFilter: string
  customFromDate: string
  customToDate: string
  groupBy: 'days' | 'weeks' | 'months' | 'years'
}

// Date filter options
const DATE_FILTER_OPTIONS = [
  { value: 'all', label: 'All' },
  { value: 'today', label: 'Today' },
  { value: 'yesterday', label: 'Yesterday' },
  { value: 'this_week', label: 'This Week' },
  { value: 'this_month', label: 'This Month' },
  { value: 'this_year', label: 'This Year' },
  { value: 'custom', label: 'Custom Date Range' },
]

const DashboardPage: React.FC = () => {
  const theme = useTheme()
  const navigate = useNavigate()
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState<string | null>(null)
  const [dashboardData, setDashboardData] = useState<DashboardData | null>(null)

  // Chart filter states
  const [chartFilters, setChartFilters] = useState<ChartFilters>({
    selectedLines: ['sales_completed', 'cogs', 'sales_profit'],
    dateFilter: 'this_week',
    customFromDate: format(subDays(new Date(), 30), 'yyyy-MM-dd'),
    customToDate: format(new Date(), 'yyyy-MM-dd'),
    groupBy: 'days'
  })

  // Chart ref for zoom reset
  const chartRef = useRef<any>(null)

  // Get date range based on filter selection
  // Shows full date range including future dates for this_week, this_month, this_year
  const getDateRange = (filter: string) => {
    const today = new Date()
    const yesterday = new Date(today)
    yesterday.setDate(yesterday.getDate() - 1)

    // Use Monday as start of week
    const weekStart = startOfWeek(today, { weekStartsOn: 1 })
    const weekEnd = endOfWeek(today, { weekStartsOn: 1 })

    const monthStart = new Date(today.getFullYear(), today.getMonth(), 1)
    const monthEnd = endOfMonth(today)

    const yearStart = new Date(today.getFullYear(), 0, 1)
    const yearEnd = endOfYear(today)

    const formatDate = (date: Date) => format(date, 'yyyy-MM-dd')

    switch (filter) {
      case 'today':
        return { startDate: formatDate(today), endDate: formatDate(today) }
      case 'yesterday':
        return { startDate: formatDate(yesterday), endDate: formatDate(yesterday) }
      case 'this_week':
        return { startDate: formatDate(weekStart), endDate: formatDate(weekEnd) }
      case 'this_month':
        return { startDate: formatDate(monthStart), endDate: formatDate(monthEnd) }
      case 'this_year':
        return { startDate: formatDate(yearStart), endDate: formatDate(yearEnd) }
      case 'custom':
        return { startDate: chartFilters.customFromDate, endDate: chartFilters.customToDate }
      default: // 'all'
        return { startDate: format(subDays(today, 365), 'yyyy-MM-dd'), endDate: formatDate(today) }
    }
  }

  useEffect(() => {
    fetchDashboardData()
  }, [])

  const fetchDashboardData = async () => {
    try {
      setLoading(true)
      setError(null)

      // Fetch all data in parallel
      const [
        salesOrdersRes,
        purchaseOrdersRes,
        suppliersRes,
        inventoryStatsRes,
        outOfStockRes,
        paymentsRes
      ] = await Promise.all([
        fetch('/api/sales-orders?limit=100&sortBy=orderDate&sortOrder=desc'),
        fetch('/api/purchasing/orders?limit=100&sortBy=orderDate&sortOrder=DESC'),
        fetch('/api/purchasing/suppliers?limit=100'),
        fetch('/api/inventory/products/dashboard-stats'),
        fetch('/api/inventory/products/out-of-stock'),
        fetch('/api/payments?limit=100')
      ])

      // Process Sales Data
      let salesOrders: any[] = []
      if (salesOrdersRes.ok) {
        const result = await salesOrdersRes.json()
        salesOrders = result.data || []
      }

      // Process Purchasing Data
      let purchaseOrders: any[] = []
      if (purchaseOrdersRes.ok) {
        const result = await purchaseOrdersRes.json()
        purchaseOrders = result.orders || result.data || []
      }

      // Process Suppliers Data
      let suppliers: any[] = []
      if (suppliersRes.ok) {
        const result = await suppliersRes.json()
        suppliers = result.suppliers || result.data || []
      }

      // Process Inventory Stats
      let inventoryStats: any = null
      if (inventoryStatsRes.ok) {
        inventoryStats = await inventoryStatsRes.json()
      }

      // Process Out of Stock
      let outOfStock: any[] = []
      if (outOfStockRes.ok) {
        outOfStock = await outOfStockRes.json()
      }

      // Process Payments
      let payments: any[] = []
      if (paymentsRes.ok) {
        const result = await paymentsRes.json()
        payments = result.data || []
      }

      // Calculate Sales Metrics
      const today = new Date()
      const thirtyDaysAgo = new Date(today)
      thirtyDaysAgo.setDate(thirtyDaysAgo.getDate() - 30)
      const sixtyDaysAgo = new Date(today)
      sixtyDaysAgo.setDate(sixtyDaysAgo.getDate() - 60)

      // Sales: Current period
      const currentSalesOrders = salesOrders.filter((order: any) => {
        const orderDate = new Date(order.orderDate)
        return orderDate >= thirtyDaysAgo && orderDate <= today
      })
      const currentSalesRevenue = currentSalesOrders.reduce((sum: number, order: any) => sum + (order.totalAmount || 0), 0)

      // Sales: Previous period
      const previousSalesOrders = salesOrders.filter((order: any) => {
        const orderDate = new Date(order.orderDate)
        return orderDate >= sixtyDaysAgo && orderDate < thirtyDaysAgo
      })
      const previousSalesRevenue = previousSalesOrders.reduce((sum: number, order: any) => sum + (order.totalAmount || 0), 0)

      const salesRevenueGrowth = previousSalesRevenue > 0
        ? ((currentSalesRevenue - previousSalesRevenue) / previousSalesRevenue) * 100
        : currentSalesRevenue > 0 ? 100 : 0

      const salesOrdersGrowth = previousSalesOrders.length > 0
        ? ((currentSalesOrders.length - previousSalesOrders.length) / previousSalesOrders.length) * 100
        : currentSalesOrders.length > 0 ? 100 : 0

      // Calculate top products from sales
      const productStats: { [key: string]: { name: string, revenue: number, quantity: number } } = {}
      salesOrders.forEach((order: any) => {
        if (order.items && Array.isArray(order.items)) {
          order.items.forEach((item: any) => {
            const productId = item.product?.id || item.productId
            const productName = item.product?.name || 'Unknown Product'
            const revenue = parseFloat(item.totalAmount) || (parseFloat(item.quantity) * parseFloat(item.unitPrice)) || 0
            const quantity = parseInt(item.quantity) || 0

            if (productId && !productStats[productId]) {
              productStats[productId] = { name: productName, revenue: 0, quantity: 0 }
            }
            if (productId) {
              productStats[productId].revenue += revenue
              productStats[productId].quantity += quantity
            }
          })
        }
      })

      const topProducts = Object.entries(productStats)
        .map(([id, stats]) => ({
          productId: id,
          productName: stats.name,
          totalRevenue: stats.revenue,
          quantitySold: stats.quantity
        }))
        .sort((a, b) => b.totalRevenue - a.totalRevenue)
        .slice(0, 5)

      // Generate sales period data for chart
      const salesPeriodData: any[] = []
      for (let i = 29; i >= 0; i--) {
        const date = new Date(today)
        date.setDate(date.getDate() - i)
        date.setHours(0, 0, 0, 0)
        const nextDate = new Date(date)
        nextDate.setDate(nextDate.getDate() + 1)

        const dayOrders = salesOrders.filter((order: any) => {
          const orderDate = new Date(order.orderDate)
          return orderDate >= date && orderDate < nextDate
        })
        const revenue = dayOrders.reduce((sum: number, order: any) => sum + (order.totalAmount || 0), 0)

        salesPeriodData.push({
          period: date.toISOString(),
          revenue,
          orders: dayOrders.length
        })
      }

      // Purchasing metrics
      const currentPurchaseOrders = purchaseOrders.filter((order: any) => {
        const orderDate = new Date(order.orderDate)
        return orderDate >= thirtyDaysAgo && orderDate <= today
      })
      const currentPurchaseSpent = currentPurchaseOrders.reduce((sum: number, order: any) => sum + (parseFloat(order.totalAmount) || 0), 0)

      const previousPurchaseOrders = purchaseOrders.filter((order: any) => {
        const orderDate = new Date(order.orderDate)
        return orderDate >= sixtyDaysAgo && orderDate < thirtyDaysAgo
      })
      const previousPurchaseSpent = previousPurchaseOrders.reduce((sum: number, order: any) => sum + (parseFloat(order.totalAmount) || 0), 0)

      const purchaseSpentGrowth = previousPurchaseSpent > 0
        ? ((currentPurchaseSpent - previousPurchaseSpent) / previousPurchaseSpent) * 100
        : currentPurchaseSpent > 0 ? 100 : 0

      // Calculate top suppliers
      const supplierStats: { [key: string]: { name: string, totalSpent: number, orderCount: number } } = {}
      purchaseOrders.forEach((order: any) => {
        const supplierId = order.supplier?.id
        const supplierName = order.supplier?.companyName || 'Unknown Supplier'
        const amount = parseFloat(order.totalAmount) || 0

        if (supplierId) {
          if (!supplierStats[supplierId]) {
            supplierStats[supplierId] = { name: supplierName, totalSpent: 0, orderCount: 0 }
          }
          supplierStats[supplierId].totalSpent += amount
          supplierStats[supplierId].orderCount += 1
        }
      })

      const topSuppliers = Object.entries(supplierStats)
        .map(([id, stats]) => ({
          supplierId: id,
          supplierName: stats.name,
          totalSpent: stats.totalSpent,
          orderCount: stats.orderCount
        }))
        .sort((a, b) => b.totalSpent - a.totalSpent)
        .slice(0, 5)

      // Generate purchasing period data for chart
      const purchasePeriodData: any[] = []
      for (let i = 29; i >= 0; i--) {
        const date = new Date(today)
        date.setDate(date.getDate() - i)
        date.setHours(0, 0, 0, 0)
        const nextDate = new Date(date)
        nextDate.setDate(nextDate.getDate() + 1)

        const dayOrders = purchaseOrders.filter((order: any) => {
          const orderDate = new Date(order.orderDate)
          return orderDate >= date && orderDate < nextDate
        })
        const spent = dayOrders.reduce((sum: number, order: any) => sum + (parseFloat(order.totalAmount) || 0), 0)

        purchasePeriodData.push({
          period: date.toISOString(),
          spent,
          orders: dayOrders.length
        })
      }

      // Active suppliers count
      const activeSuppliers = suppliers.filter((s: any) => !s.deletedAt).length

      // Unique customers
      const uniqueCustomers = new Set(salesOrders.map((o: any) => o.customer?.id).filter(Boolean)).size

      setDashboardData({
        sales: {
          totalRevenue: salesOrders.reduce((sum: number, o: any) => sum + (o.totalAmount || 0), 0),
          totalOrders: salesOrders.length,
          uniqueCustomers,
          revenueGrowth: salesRevenueGrowth,
          ordersGrowth: salesOrdersGrowth,
          recentOrders: salesOrders.slice(0, 5),
          topProducts,
          periodData: salesPeriodData
        },
        purchasing: {
          totalSpent: purchaseOrders.reduce((sum: number, o: any) => sum + (parseFloat(o.totalAmount) || 0), 0),
          totalOrders: purchaseOrders.length,
          activeSuppliers,
          spentGrowth: purchaseSpentGrowth,
          recentOrders: purchaseOrders.slice(0, 5),
          topSuppliers,
          periodData: purchasePeriodData
        },
        inventory: {
          totalProducts: inventoryStats?.totalProducts || 0,
          totalCategories: inventoryStats?.totalCategories || 0,
          inventoryValue: inventoryStats?.inventoryValue || 0,
          outOfStockCount: inventoryStats?.outOfStockCount || outOfStock.length,
          lowStockItems: outOfStock.slice(0, 5),
          stockHealthMetrics: inventoryStats?.stockHealthMetrics || {
            inStockPercentage: 100,
            outOfStockPercentage: 0
          }
        },
        rawData: {
          salesOrders,
          purchaseOrders,
          payments,
          inventoryValue: inventoryStats?.inventoryValue || 0
        }
      })
    } catch (err) {
      console.error('Error fetching dashboard data:', err)
      setError('Failed to load dashboard data')
    } finally {
      setLoading(false)
    }
  }

  // Generate chart data based on filters
  const chartData = useMemo(() => {
    if (!dashboardData) return { labels: [], datasets: [] }

    const { selectedLines, groupBy } = chartFilters
    const dateRange = getDateRange(chartFilters.dateFilter)
    const start = new Date(dateRange.startDate)
    const end = new Date(dateRange.endDate)

    // If 'all' is selected, use all line types except 'all'
    const linesToShow = selectedLines.includes('all')
      ? LINE_OPTIONS.filter(o => o.value !== 'all').map(o => o.value)
      : selectedLines

    // Generate periods based on groupBy
    let periods: Date[] = []
    let formatPattern = 'MMM dd'

    switch (groupBy) {
      case 'days':
        periods = eachDayOfInterval({ start, end })
        formatPattern = 'MMM dd'
        break
      case 'weeks':
        periods = eachWeekOfInterval({ start, end }, { weekStartsOn: 1 })
        formatPattern = "'W'w MMM"
        break
      case 'months':
        periods = eachMonthOfInterval({ start, end })
        formatPattern = 'MMM yyyy'
        break
      case 'years':
        periods = eachYearOfInterval({ start, end })
        formatPattern = 'yyyy'
        break
    }

    // Use Date objects for time scale (enables hour-level zoom)
    const labels = periods.map(p => p.getTime())

    // Calculate data for each line type
    const datasets = linesToShow.map(lineType => {
      const data = periods.map(periodStart => {
        let periodEnd: Date
        switch (groupBy) {
          case 'days':
            periodEnd = endOfDay(periodStart)
            break
          case 'weeks':
            periodEnd = endOfWeek(periodStart, { weekStartsOn: 1 })
            break
          case 'months':
            periodEnd = endOfMonth(periodStart)
            break
          case 'years':
            periodEnd = endOfYear(periodStart)
            break
        }

        const interval = { start: periodStart, end: periodEnd }

        switch (lineType) {
          case 'sales_completed': {
            const filteredOrders = dashboardData.rawData.salesOrders.filter((o: any) => {
              const orderDate = new Date(o.orderDate)
              return isWithinInterval(orderDate, interval) && o.isFulfilled
            })
            return filteredOrders.reduce((sum: number, o: any) => sum + (o.totalAmount || 0), 0)
          }
          case 'cogs': {
            // Cost of goods sold - estimate based on sales items
            const filteredOrders = dashboardData.rawData.salesOrders.filter((o: any) => {
              const orderDate = new Date(o.orderDate)
              return isWithinInterval(orderDate, interval)
            })
            return filteredOrders.reduce((sum: number, o: any) => {
              const orderCost = o.items?.reduce((itemSum: number, item: any) => {
                const cost = parseFloat(item.product?.baseCost || item.costPrice || 0) * (parseInt(item.quantity) || 0)
                return itemSum + cost
              }, 0) || 0
              return sum + orderCost
            }, 0)
          }
          case 'sales_profit': {
            const filteredOrders = dashboardData.rawData.salesOrders.filter((o: any) => {
              const orderDate = new Date(o.orderDate)
              return isWithinInterval(orderDate, interval)
            })
            return filteredOrders.reduce((sum: number, o: any) => {
              const revenue = o.totalAmount || 0
              const cost = o.items?.reduce((itemSum: number, item: any) => {
                const itemCost = parseFloat(item.product?.baseCost || item.costPrice || 0) * (parseInt(item.quantity) || 0)
                return itemSum + itemCost
              }, 0) || 0
              return sum + (revenue - cost)
            }, 0)
          }
          case 'sales_orders': {
            const filteredOrders = dashboardData.rawData.salesOrders.filter((o: any) => {
              const orderDate = new Date(o.orderDate)
              return isWithinInterval(orderDate, interval)
            })
            return filteredOrders.reduce((sum: number, o: any) => sum + (o.totalAmount || 0), 0)
          }
          case 'purchase_orders': {
            const filteredOrders = dashboardData.rawData.purchaseOrders.filter((o: any) => {
              const orderDate = new Date(o.orderDate)
              return isWithinInterval(orderDate, interval)
            })
            return filteredOrders.reduce((sum: number, o: any) => sum + (parseFloat(o.totalAmount) || 0), 0)
          }
          case 'cash_in': {
            const filteredPayments = dashboardData.rawData.payments.filter((p: any) => {
              const paymentDate = new Date(p.paymentDate)
              return isWithinInterval(paymentDate, interval)
            })
            return filteredPayments.reduce((sum: number, p: any) => sum + (parseFloat(p.amount) || 0), 0)
          }
          case 'cash_out': {
            // Cash out - purchase order payments (simplified)
            const filteredOrders = dashboardData.rawData.purchaseOrders.filter((o: any) => {
              const orderDate = new Date(o.orderDate)
              return isWithinInterval(orderDate, interval) && o.isFullyReceived
            })
            return filteredOrders.reduce((sum: number, o: any) => sum + (parseFloat(o.totalAmount) || 0), 0)
          }
          case 'net_cash_flow': {
            // Cash in minus cash out
            const cashIn = dashboardData.rawData.payments.filter((p: any) => {
              const paymentDate = new Date(p.paymentDate)
              return isWithinInterval(paymentDate, interval)
            }).reduce((sum: number, p: any) => sum + (parseFloat(p.amount) || 0), 0)

            const cashOut = dashboardData.rawData.purchaseOrders.filter((o: any) => {
              const orderDate = new Date(o.orderDate)
              return isWithinInterval(orderDate, interval) && o.isFullyReceived
            }).reduce((sum: number, o: any) => sum + (parseFloat(o.totalAmount) || 0), 0)

            return cashIn - cashOut
          }
          case 'inventory_value': {
            // Show current inventory value (static for each period in this simplified version)
            return dashboardData.rawData.inventoryValue
          }
          default:
            return 0
        }
      })

      const lineOption = LINE_OPTIONS.find(o => o.value === lineType)
      const color = LINE_COLORS[lineType] || theme.palette.primary.main

      return {
        label: lineOption?.label || lineType,
        data,
        borderColor: color,
        backgroundColor: `${color}20`,
        tension: 0,
        fill: false
      }
    })

    // Calculate totals for each dataset
    const datasetsWithTotals = datasets.map(ds => ({
      ...ds,
      total: ds.data.reduce((sum: number, val: number) => sum + val, 0)
    }))

    return { labels, datasets: datasetsWithTotals }
  }, [dashboardData, chartFilters, theme])

  const handleLineChange = (event: any) => {
    const value = event.target.value as string[]

    // If 'all' is being selected, clear other selections
    if (value.includes('all') && !chartFilters.selectedLines.includes('all')) {
      setChartFilters(prev => ({ ...prev, selectedLines: ['all'] }))
    } else if (chartFilters.selectedLines.includes('all') && value.length > 1) {
      // If something else is selected while 'all' is active, remove 'all'
      setChartFilters(prev => ({ ...prev, selectedLines: value.filter(v => v !== 'all') }))
    } else {
      setChartFilters(prev => ({ ...prev, selectedLines: value }))
    }
  }

  const stockHealthData = {
    labels: ['In Stock', 'Out of Stock'],
    datasets: [
      {
        data: [
          dashboardData?.inventory.stockHealthMetrics.inStockPercentage || 100,
          dashboardData?.inventory.stockHealthMetrics.outOfStockPercentage || 0
        ],
        backgroundColor: [
          theme.palette.success.main,
          theme.palette.error.main
        ],
        borderWidth: 2,
        borderColor: theme.palette.background.paper
      }
    ]
  }

  // Calculate max value from chart data to determine if we need extra headroom for legend
  const chartMaxValue = useMemo(() => {
    if (!chartData.datasets.length) return 0
    const allValues = chartData.datasets.flatMap((ds: any) => ds.data)
    return Math.max(...allValues, 0)
  }, [chartData])

  const chartOptions = {
    responsive: true,
    maintainAspectRatio: false,
    layout: {
      padding: {
        top: 10,
        right: 10
      }
    },
    plugins: {
      legend: {
        position: 'chartArea' as const,
        align: 'start' as const,
        labels: {
          boxWidth: 10,
          boxHeight: 10,
          padding: 6,
          font: {
            size: 10
          },
          color: theme.palette.text.primary,
          generateLabels: (chart: any) => {
            const datasets = chart.data.datasets
            return datasets.map((dataset: any, i: number) => ({
              text: `${dataset.label}: ${formatCurrency(dataset.total || 0)}`,
              fillStyle: dataset.borderColor,
              strokeStyle: dataset.borderColor,
              fontColor: theme.palette.text.primary,
              lineWidth: 2,
              hidden: !chart.isDatasetVisible(i),
              index: i,
              datasetIndex: i
            }))
          }
        }
      },
      tooltip: {
        callbacks: {
          label: function(context: any) {
            const label = context.dataset.label || ''
            const value = context.parsed.y
            return `${label}: ${formatCurrency(value)}`
          }
        }
      },
      zoom: {
        pan: {
          enabled: true,
          mode: 'xy' as const,
        },
        zoom: {
          wheel: {
            enabled: true,
            speed: 0.1,
          },
          pinch: {
            enabled: true
          },
          drag: {
            enabled: false
          },
          mode: 'xy' as const,
          scaleMode: 'xy' as const,
          overScaleMode: undefined,
        },
      }
    },
    scales: {
      y: {
        beginAtZero: true,
        ticks: {
          color: theme.palette.text.secondary,
          callback: function(value: any) {
            return formatCurrency(value)
          }
        },
        grid: {
          color: theme.palette.divider
        }
      },
      x: {
        type: 'time' as const,
        time: {
          unit: chartFilters.groupBy === 'days' ? 'day' : chartFilters.groupBy === 'weeks' ? 'week' : chartFilters.groupBy === 'months' ? 'month' : 'year',
          displayFormats: {
            hour: 'MMM dd HH:mm',
            day: 'MMM dd',
            week: "'W'w MMM",
            month: 'MMM yyyy',
            year: 'yyyy'
          }
        },
        ticks: {
          color: theme.palette.text.secondary,
          maxRotation: 45,
          minRotation: 0
        },
        grid: {
          color: theme.palette.divider
        }
      }
    }
  }

  const doughnutOptions = {
    responsive: true,
    maintainAspectRatio: false,
    plugins: {
      legend: {
        position: 'bottom' as const,
      },
      tooltip: {
        callbacks: {
          label: function(context: any) {
            const label = context.label || ''
            const value = context.parsed || 0
            return `${label}: ${value.toFixed(1)}%`
          }
        }
      }
    }
  }

  // Stats for cards
  const stats = [
    {
      title: 'Total Sales',
      value: formatCurrency(dashboardData?.sales.totalRevenue || 0),
      change: dashboardData?.sales.revenueGrowth !== undefined
        ? `${dashboardData.sales.revenueGrowth > 0 ? '+' : ''}${dashboardData.sales.revenueGrowth.toFixed(1)}%`
        : '+0.0%',
      trend: (dashboardData?.sales.revenueGrowth || 0) >= 0 ? 'up' : 'down',
      icon: SalesIcon,
      color: 'success',
      onClick: () => navigate('/sales')
    },
    {
      title: 'Total Purchases',
      value: formatCurrency(dashboardData?.purchasing.totalSpent || 0),
      change: dashboardData?.purchasing.spentGrowth !== undefined
        ? `${dashboardData.purchasing.spentGrowth > 0 ? '+' : ''}${dashboardData.purchasing.spentGrowth.toFixed(1)}%`
        : '+0.0%',
      trend: (dashboardData?.purchasing.spentGrowth || 0) >= 0 ? 'up' : 'down',
      icon: PurchasingIcon,
      color: 'warning',
      onClick: () => navigate('/purchasing')
    },
    {
      title: 'Inventory Value',
      value: formatCurrency(dashboardData?.inventory.inventoryValue || 0),
      change: `${dashboardData?.inventory.totalProducts || 0} products`,
      trend: 'up',
      icon: InventoryIcon,
      color: 'primary',
      onClick: () => navigate('/inventory')
    },
    {
      title: 'Customers',
      value: dashboardData?.sales.uniqueCustomers || '0',
      change: `${dashboardData?.purchasing.activeSuppliers || 0} suppliers`,
      trend: 'up',
      icon: CustomersIcon,
      color: 'info',
      onClick: () => navigate('/sales/customers')
    }
  ]

  if (loading) {
    return (
      <Box sx={{ display: 'flex', justifyContent: 'center', alignItems: 'center', height: 400 }}>
        <CircularProgress size={60} />
      </Box>
    )
  }

  return (
    <Box>
      {/* Header */}
      <Box sx={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', mb: 4 }}>
        <Box>
          <Typography variant={TYPOGRAPHY_STYLES.pageHeader.variant} sx={{
            fontWeight: TYPOGRAPHY_STYLES.pageHeader.fontWeight,
            mb: 1,
            display: 'flex',
            alignItems: 'center',
            gap: 2
          }}>
            <DashboardIcon sx={{
              fontSize: TYPOGRAPHY_STYLES.pageHeader.icon.fontSize,
              color: TYPOGRAPHY_STYLES.pageHeader.icon.color
            }} />
            Dashboard
          </Typography>
          <Typography variant={TYPOGRAPHY_STYLES.pageSubtitle.variant} color={TYPOGRAPHY_STYLES.pageSubtitle.color}>
            Monitor your business performance across sales, purchasing, and inventory
          </Typography>
        </Box>
      </Box>

      {/* Error Alert */}
      {error && (
        <Alert severity="error" sx={{ mb: 4 }}>
          {error}
        </Alert>
      )}

      {/* Stats Cards */}
      <Grid container spacing={3} sx={{ mb: 4 }}>
        {stats.map((stat, index) => (
          <Grid item xs={12} sm={6} lg={3} key={index}>
            <Card
              sx={{
                cursor: 'pointer',
                transition: 'all 0.2s ease-in-out',
                '&:hover': {
                  transform: 'translateY(-4px)',
                  boxShadow: 6,
                }
              }}
              onClick={stat.onClick}
            >
              <CardContent>
                <Box sx={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', mb: 2 }}>
                  <Box
                    sx={{
                      p: 1.5,
                      borderRadius: 2,
                      bgcolor: `${stat.color}.light`,
                      color: `${stat.color}.contrastText`,
                      display: 'flex',
                      alignItems: 'center',
                      justifyContent: 'center',
                    }}
                  >
                    <stat.icon />
                  </Box>
                  <Box sx={{ display: 'flex', alignItems: 'center', gap: 0.5 }}>
                    {stat.trend === 'up' ? (
                      <TrendingUpIcon sx={{ fontSize: 16, color: 'success.main' }} />
                    ) : (
                      <TrendingDownIcon sx={{ fontSize: 16, color: 'error.main' }} />
                    )}
                    <Typography
                      variant={TYPOGRAPHY_STYLES.tableCell.caption.variant}
                      sx={{
                        color: stat.trend === 'up' ? 'success.main' : 'error.main',
                        fontWeight: TYPOGRAPHY_STYLES.tableCell.primary.fontWeight,
                        fontSize: TYPOGRAPHY_STYLES.tableCell.caption.fontSize
                      }}
                    >
                      {stat.change}
                    </Typography>
                  </Box>
                </Box>
                <Typography variant={TYPOGRAPHY_STYLES.pageHeader.variant} sx={{ fontWeight: TYPOGRAPHY_STYLES.pageHeader.fontWeight, mb: 0.5 }}>
                  {stat.value}
                </Typography>
                <Typography variant={TYPOGRAPHY_STYLES.tableCell.secondary.variant} color="text.secondary">
                  {stat.title}
                </Typography>
              </CardContent>
            </Card>
          </Grid>
        ))}
      </Grid>

      {/* Business Performance Chart - Full Width */}
      <Grid container spacing={3} sx={{ mb: 4 }}>
        <Grid item xs={12}>
          <Paper sx={{ p: 3 }}>
            <Typography variant={TYPOGRAPHY_STYLES.tableHeader.variant} sx={{ fontWeight: TYPOGRAPHY_STYLES.tableHeader.fontWeight, mb: 2 }}>
              Business Performance
            </Typography>

            {/* Chart Filters */}
            <Box sx={{ display: 'flex', gap: 1.5, mb: 2, flexWrap: 'wrap', alignItems: 'center' }}>
              {/* Lines Multi-Select */}
              <FormControl size="small" sx={{ minWidth: 180 }}>
                <InputLabel sx={{ fontSize: '0.75rem' }}>Lines</InputLabel>
                <Select
                  multiple
                  value={chartFilters.selectedLines}
                  onChange={handleLineChange}
                  input={<OutlinedInput label="Lines" sx={{ fontSize: '0.75rem' }} />}
                  renderValue={(selected) => {
                    if (selected.includes('all')) return 'All'
                    return selected.map(s => LINE_OPTIONS.find(o => o.value === s)?.label).join(', ')
                  }}
                  sx={{ fontSize: '0.75rem', '& .MuiSelect-select': { py: 0.75 } }}
                  MenuProps={{
                    PaperProps: {
                      style: {
                        maxHeight: 300,
                      },
                    },
                  }}
                >
                  {LINE_OPTIONS.map((option) => (
                    <MenuItem key={option.value} value={option.value} sx={{ fontSize: '0.75rem', py: 0.5 }}>
                      <Checkbox checked={chartFilters.selectedLines.includes(option.value)} size="small" sx={{ p: 0.5 }} />
                      <ListItemText primary={option.label} primaryTypographyProps={{ fontSize: '0.75rem' }} />
                    </MenuItem>
                  ))}
                </Select>
              </FormControl>

              {/* Date Filter */}
              <FormControl size="small" sx={{ minWidth: 130 }}>
                <InputLabel sx={{ fontSize: '0.75rem' }}>Date Filter</InputLabel>
                <Select
                  value={chartFilters.dateFilter}
                  onChange={(e) => setChartFilters(prev => ({ ...prev, dateFilter: e.target.value }))}
                  label="Date Filter"
                  sx={{ fontSize: '0.75rem', '& .MuiSelect-select': { py: 0.75 } }}
                >
                  {DATE_FILTER_OPTIONS.slice(0, 6).map((option) => (
                    <MenuItem key={option.value} value={option.value} sx={{ fontSize: '0.75rem' }}>
                      {option.label}
                    </MenuItem>
                  ))}
                  <Divider />
                  <MenuItem value="custom" sx={{ fontSize: '0.75rem' }}>
                    Custom Date Range
                  </MenuItem>
                </Select>
              </FormControl>

              {/* Custom Date Range - only show when custom is selected */}
              {chartFilters.dateFilter === 'custom' && (
                <>
                  <TextField
                    label="From Date"
                    type="date"
                    size="small"
                    value={chartFilters.customFromDate}
                    onChange={(e) => setChartFilters(prev => ({ ...prev, customFromDate: e.target.value }))}
                    InputLabelProps={{ shrink: true, sx: { fontSize: '0.75rem' } }}
                    InputProps={{ sx: { fontSize: '0.75rem', '& input': { py: 0.75 } } }}
                    sx={{ minWidth: 130 }}
                  />
                  <TextField
                    label="To Date"
                    type="date"
                    size="small"
                    value={chartFilters.customToDate}
                    onChange={(e) => setChartFilters(prev => ({ ...prev, customToDate: e.target.value }))}
                    InputLabelProps={{ shrink: true, sx: { fontSize: '0.75rem' } }}
                    InputProps={{ sx: { fontSize: '0.75rem', '& input': { py: 0.75 } } }}
                    sx={{ minWidth: 130 }}
                  />
                </>
              )}

              {/* Group By */}
              <FormControl size="small" sx={{ minWidth: 100 }}>
                <InputLabel sx={{ fontSize: '0.75rem' }}>Group By</InputLabel>
                <Select
                  value={chartFilters.groupBy}
                  onChange={(e) => setChartFilters(prev => ({ ...prev, groupBy: e.target.value as any }))}
                  label="Group By"
                  sx={{ fontSize: '0.75rem', '& .MuiSelect-select': { py: 0.75 } }}
                >
                  {GROUP_BY_OPTIONS.map((option) => (
                    <MenuItem key={option.value} value={option.value} sx={{ fontSize: '0.75rem' }}>
                      {option.label}
                    </MenuItem>
                  ))}
                </Select>
              </FormControl>
            </Box>

            <Box sx={{ height: 450, position: 'relative' }}>
              <Line ref={chartRef} data={chartData} options={chartOptions} />
              <Button
                size="small"
                variant="outlined"
                onClick={() => chartRef.current?.resetZoom()}
                sx={{
                  position: 'absolute',
                  top: 8,
                  right: 8,
                  fontSize: '0.7rem',
                  py: 0.25,
                  px: 1,
                  minWidth: 'auto',
                  opacity: 0.8,
                  '&:hover': { opacity: 1 }
                }}
              >
                Reset Zoom
              </Button>
            </Box>
          </Paper>
        </Grid>
      </Grid>

      {/* Tables Row */}
      <Grid container spacing={3} sx={{ mb: 4 }}>
        {/* Recent Sales Orders */}
        <Grid item xs={12} lg={6}>
          <Paper sx={{ overflow: 'hidden' }}>
            <Box sx={{ p: 3, borderBottom: 1, borderColor: 'divider', display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
              <Typography variant={TYPOGRAPHY_STYLES.tableHeader.variant} sx={{ fontWeight: TYPOGRAPHY_STYLES.tableHeader.fontWeight }}>
                Recent Sales Orders
              </Typography>
              <Chip
                label={`${dashboardData?.sales.totalOrders || 0} total`}
                color="success"
                size="small"
              />
            </Box>
            <TableContainer>
              <Table size={TABLE_STYLES.size}>
                <TableHead>
                  <TableRow sx={{ '& .MuiTableCell-head': { fontWeight: TYPOGRAPHY_STYLES.tableHeader.fontWeight, backgroundColor: TABLE_STYLES.header.backgroundColor, py: TABLE_STYLES.header.padding.py } }}>
                    <TableCell>
                      <Typography variant={TYPOGRAPHY_STYLES.tableHeader.variant} sx={{ fontWeight: TYPOGRAPHY_STYLES.tableHeader.fontWeight, fontSize: TYPOGRAPHY_STYLES.tableHeader.fontSize }}>
                        Order
                      </Typography>
                    </TableCell>
                    <TableCell>
                      <Typography variant={TYPOGRAPHY_STYLES.tableHeader.variant} sx={{ fontWeight: TYPOGRAPHY_STYLES.tableHeader.fontWeight, fontSize: TYPOGRAPHY_STYLES.tableHeader.fontSize }}>
                        Customer
                      </Typography>
                    </TableCell>
                    <TableCell align="right">
                      <Typography variant={TYPOGRAPHY_STYLES.tableHeader.variant} sx={{ fontWeight: TYPOGRAPHY_STYLES.tableHeader.fontWeight, fontSize: TYPOGRAPHY_STYLES.tableHeader.fontSize }}>
                        Amount
                      </Typography>
                    </TableCell>
                    <TableCell>
                      <Typography variant={TYPOGRAPHY_STYLES.tableHeader.variant} sx={{ fontWeight: TYPOGRAPHY_STYLES.tableHeader.fontWeight, fontSize: TYPOGRAPHY_STYLES.tableHeader.fontSize }}>
                        Status
                      </Typography>
                    </TableCell>
                  </TableRow>
                </TableHead>
                <TableBody>
                  {dashboardData?.sales.recentOrders && dashboardData.sales.recentOrders.length > 0 ? (
                    dashboardData.sales.recentOrders.map((order: any) => (
                      <TableRow
                        key={order.id}
                        hover
                        sx={{
                          cursor: 'pointer',
                          '& .MuiTableCell-root': {
                            borderBottom: TABLE_STYLES.cell.border,
                            py: TABLE_STYLES.cell.padding.py,
                            px: TABLE_STYLES.cell.padding.px
                          },
                          height: TABLE_STYLES.row.height
                        }}
                        onClick={() => navigate('/sales/orders', { state: { highlightOrderId: order.id } })}
                      >
                        <TableCell>
                          <Typography variant={TYPOGRAPHY_STYLES.tableCell.primary.variant} sx={{ fontSize: TYPOGRAPHY_STYLES.tableCell.primary.fontSize }}>
                            {order.orderNumber}
                          </Typography>
                        </TableCell>
                        <TableCell>
                          <Typography variant={TYPOGRAPHY_STYLES.tableCell.primary.variant} sx={{ fontSize: TYPOGRAPHY_STYLES.tableCell.primary.fontSize }}>
                            {order.customer?.name || 'Unknown'}
                          </Typography>
                        </TableCell>
                        <TableCell align="right">
                          <Typography variant={TYPOGRAPHY_STYLES.tableCell.primary.variant} color="success.main" sx={{ fontSize: TYPOGRAPHY_STYLES.tableCell.primary.fontSize }}>
                            {formatCurrency(order.totalAmount)}
                          </Typography>
                        </TableCell>
                        <TableCell>
                          <Chip
                            label={order.isFulfilled ? 'Fulfilled' : 'Pending'}
                            color={order.isFulfilled ? 'success' : 'warning'}
                            size="small"
                            variant="outlined"
                            sx={{
                              fontSize: TYPOGRAPHY_STYLES.chip.small.fontSize,
                              fontWeight: TYPOGRAPHY_STYLES.chip.small.fontWeight,
                              height: TYPOGRAPHY_STYLES.chip.small.height
                            }}
                          />
                        </TableCell>
                      </TableRow>
                    ))
                  ) : (
                    <TableRow>
                      <TableCell colSpan={4} align="center">
                        <Typography variant={TYPOGRAPHY_STYLES.tableCell.secondary.variant} color="text.secondary">
                          No recent orders
                        </Typography>
                      </TableCell>
                    </TableRow>
                  )}
                </TableBody>
              </Table>
            </TableContainer>
          </Paper>
        </Grid>

        {/* Recent Purchase Orders */}
        <Grid item xs={12} lg={6}>
          <Paper sx={{ overflow: 'hidden' }}>
            <Box sx={{ p: 3, borderBottom: 1, borderColor: 'divider', display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
              <Typography variant={TYPOGRAPHY_STYLES.tableHeader.variant} sx={{ fontWeight: TYPOGRAPHY_STYLES.tableHeader.fontWeight }}>
                Recent Purchase Orders
              </Typography>
              <Chip
                label={`${dashboardData?.purchasing.totalOrders || 0} total`}
                color="warning"
                size="small"
              />
            </Box>
            <TableContainer>
              <Table size={TABLE_STYLES.size}>
                <TableHead>
                  <TableRow sx={{ '& .MuiTableCell-head': { fontWeight: TYPOGRAPHY_STYLES.tableHeader.fontWeight, backgroundColor: TABLE_STYLES.header.backgroundColor, py: TABLE_STYLES.header.padding.py } }}>
                    <TableCell>
                      <Typography variant={TYPOGRAPHY_STYLES.tableHeader.variant} sx={{ fontWeight: TYPOGRAPHY_STYLES.tableHeader.fontWeight, fontSize: TYPOGRAPHY_STYLES.tableHeader.fontSize }}>
                        PO Number
                      </Typography>
                    </TableCell>
                    <TableCell>
                      <Typography variant={TYPOGRAPHY_STYLES.tableHeader.variant} sx={{ fontWeight: TYPOGRAPHY_STYLES.tableHeader.fontWeight, fontSize: TYPOGRAPHY_STYLES.tableHeader.fontSize }}>
                        Supplier
                      </Typography>
                    </TableCell>
                    <TableCell align="right">
                      <Typography variant={TYPOGRAPHY_STYLES.tableHeader.variant} sx={{ fontWeight: TYPOGRAPHY_STYLES.tableHeader.fontWeight, fontSize: TYPOGRAPHY_STYLES.tableHeader.fontSize }}>
                        Amount
                      </Typography>
                    </TableCell>
                    <TableCell>
                      <Typography variant={TYPOGRAPHY_STYLES.tableHeader.variant} sx={{ fontWeight: TYPOGRAPHY_STYLES.tableHeader.fontWeight, fontSize: TYPOGRAPHY_STYLES.tableHeader.fontSize }}>
                        Status
                      </Typography>
                    </TableCell>
                  </TableRow>
                </TableHead>
                <TableBody>
                  {dashboardData?.purchasing.recentOrders && dashboardData.purchasing.recentOrders.length > 0 ? (
                    dashboardData.purchasing.recentOrders.map((order: any) => (
                      <TableRow
                        key={order.id}
                        hover
                        sx={{
                          cursor: 'pointer',
                          '& .MuiTableCell-root': {
                            borderBottom: TABLE_STYLES.cell.border,
                            py: TABLE_STYLES.cell.padding.py,
                            px: TABLE_STYLES.cell.padding.px
                          },
                          height: TABLE_STYLES.row.height
                        }}
                        onClick={() => navigate(`/purchasing/orders?poId=${order.id}`)}
                      >
                        <TableCell>
                          <Typography variant={TYPOGRAPHY_STYLES.tableCell.primary.variant} sx={{ fontSize: TYPOGRAPHY_STYLES.tableCell.primary.fontSize }}>
                            {order.orderNumber}
                          </Typography>
                        </TableCell>
                        <TableCell>
                          <Typography variant={TYPOGRAPHY_STYLES.tableCell.primary.variant} sx={{ fontSize: TYPOGRAPHY_STYLES.tableCell.primary.fontSize }}>
                            {order.supplier?.companyName || 'Unknown'}
                          </Typography>
                        </TableCell>
                        <TableCell align="right">
                          <Typography variant={TYPOGRAPHY_STYLES.tableCell.primary.variant} color="warning.main" sx={{ fontSize: TYPOGRAPHY_STYLES.tableCell.primary.fontSize }}>
                            {formatCurrency(order.totalAmount)}
                          </Typography>
                        </TableCell>
                        <TableCell>
                          <Chip
                            label={order.isFullyReceived ? 'Received' : 'Pending'}
                            color={order.isFullyReceived ? 'success' : 'warning'}
                            size="small"
                            variant="outlined"
                            sx={{
                              fontSize: TYPOGRAPHY_STYLES.chip.small.fontSize,
                              fontWeight: TYPOGRAPHY_STYLES.chip.small.fontWeight,
                              height: TYPOGRAPHY_STYLES.chip.small.height
                            }}
                          />
                        </TableCell>
                      </TableRow>
                    ))
                  ) : (
                    <TableRow>
                      <TableCell colSpan={4} align="center">
                        <Typography variant={TYPOGRAPHY_STYLES.tableCell.secondary.variant} color="text.secondary">
                          No recent purchase orders
                        </Typography>
                      </TableCell>
                    </TableRow>
                  )}
                </TableBody>
              </Table>
            </TableContainer>
          </Paper>
        </Grid>
      </Grid>

      {/* Bottom Row - Top Products, Top Suppliers, Stock Health, Low Stock */}
      <Grid container spacing={3}>
        {/* Top Products */}
        <Grid item xs={12} sm={6} lg={3}>
          <Paper sx={{ p: 3, height: '100%' }}>
            <Typography variant={TYPOGRAPHY_STYLES.tableHeader.variant} sx={{ fontWeight: TYPOGRAPHY_STYLES.tableHeader.fontWeight, mb: 3 }}>
              Top Selling Products
            </Typography>
            <Box sx={{ display: 'flex', flexDirection: 'column', gap: 2 }}>
              {dashboardData?.sales.topProducts && dashboardData.sales.topProducts.length > 0 ? (
                dashboardData.sales.topProducts.map((product: any, index: number) => (
                  <Box key={product.productId || index}>
                    <Box sx={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', mb: 1 }}>
                      <Box sx={{ display: 'flex', alignItems: 'center', gap: 1 }}>
                        <Typography
                          variant="h6"
                          sx={{
                            width: 24,
                            height: 24,
                            borderRadius: '50%',
                            bgcolor: index === 0 ? 'success.main' : index === 1 ? 'primary.main' : 'grey.400',
                            color: 'white',
                            display: 'flex',
                            alignItems: 'center',
                            justifyContent: 'center',
                            fontSize: TYPOGRAPHY_STYLES.tableCell.caption.fontSize,
                            fontWeight: TYPOGRAPHY_STYLES.tableCell.primary.fontWeight
                          }}
                        >
                          {index + 1}
                        </Typography>
                        <Box>
                          <Typography variant={TYPOGRAPHY_STYLES.tableCell.primary.variant} sx={{ fontSize: TYPOGRAPHY_STYLES.tableCell.primary.fontSize }}>
                            {product.productName}
                          </Typography>
                          <Typography variant="caption" color="text.secondary">
                            {product.quantitySold || 0} sold
                          </Typography>
                        </Box>
                      </Box>
                      <Typography variant="body2" color="success.main">
                        {formatCurrency(product.totalRevenue || 0)}
                      </Typography>
                    </Box>
                  </Box>
                ))
              ) : (
                <Typography variant={TYPOGRAPHY_STYLES.tableCell.secondary.variant} color="text.secondary" align="center">
                  No sales data available
                </Typography>
              )}
            </Box>
          </Paper>
        </Grid>

        {/* Top Suppliers */}
        <Grid item xs={12} sm={6} lg={3}>
          <Paper sx={{ p: 3, height: '100%' }}>
            <Typography variant={TYPOGRAPHY_STYLES.tableHeader.variant} sx={{ fontWeight: TYPOGRAPHY_STYLES.tableHeader.fontWeight, mb: 3 }}>
              Top Suppliers
            </Typography>
            <Box sx={{ display: 'flex', flexDirection: 'column', gap: 2 }}>
              {dashboardData?.purchasing.topSuppliers && dashboardData.purchasing.topSuppliers.length > 0 ? (
                dashboardData.purchasing.topSuppliers.map((supplier: any, index: number) => (
                  <Box key={supplier.supplierId || index}>
                    <Box sx={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', mb: 1 }}>
                      <Box sx={{ display: 'flex', alignItems: 'center', gap: 1 }}>
                        <Typography
                          variant="h6"
                          sx={{
                            width: 24,
                            height: 24,
                            borderRadius: '50%',
                            bgcolor: index === 0 ? 'warning.main' : index === 1 ? 'secondary.main' : 'grey.400',
                            color: 'white',
                            display: 'flex',
                            alignItems: 'center',
                            justifyContent: 'center',
                            fontSize: TYPOGRAPHY_STYLES.tableCell.caption.fontSize,
                            fontWeight: TYPOGRAPHY_STYLES.tableCell.primary.fontWeight
                          }}
                        >
                          {index + 1}
                        </Typography>
                        <Box>
                          <Typography variant={TYPOGRAPHY_STYLES.tableCell.primary.variant} sx={{ fontSize: TYPOGRAPHY_STYLES.tableCell.primary.fontSize }}>
                            {supplier.supplierName}
                          </Typography>
                          <Typography variant="caption" color="text.secondary">
                            {supplier.orderCount || 0} orders
                          </Typography>
                        </Box>
                      </Box>
                      <Typography variant="body2" color="warning.main">
                        {formatCurrency(supplier.totalSpent || 0)}
                      </Typography>
                    </Box>
                  </Box>
                ))
              ) : (
                <Typography variant={TYPOGRAPHY_STYLES.tableCell.secondary.variant} color="text.secondary" align="center">
                  No supplier data available
                </Typography>
              )}
            </Box>
          </Paper>
        </Grid>

        {/* Stock Health */}
        <Grid item xs={12} sm={6} lg={3}>
          <Paper sx={{ p: 3, height: '100%' }}>
            <Typography variant={TYPOGRAPHY_STYLES.tableHeader.variant} sx={{ fontWeight: TYPOGRAPHY_STYLES.tableHeader.fontWeight, mb: 2 }}>
              Stock Health
            </Typography>
            <Box sx={{ height: 150 }}>
              <Doughnut data={stockHealthData} options={doughnutOptions} />
            </Box>
            <Box sx={{ mt: 1, textAlign: 'center' }}>
              <Typography variant="caption" color="text.secondary">
                {dashboardData?.inventory.totalProducts || 0} products • {dashboardData?.inventory.totalCategories || 0} categories
              </Typography>
            </Box>
          </Paper>
        </Grid>

        {/* Low Stock Alerts */}
        <Grid item xs={12} sm={6} lg={3}>
          <Paper sx={{ p: 3, height: '100%' }}>
            <Box sx={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', mb: 3 }}>
              <Typography variant={TYPOGRAPHY_STYLES.tableHeader.variant} sx={{ fontWeight: TYPOGRAPHY_STYLES.tableHeader.fontWeight }}>
                Stock Alerts
              </Typography>
              {(dashboardData?.inventory.outOfStockCount || 0) > 0 && (
                <Chip
                  icon={<WarningIcon sx={{ fontSize: 14 }} />}
                  label={`${dashboardData?.inventory.outOfStockCount} items`}
                  color="error"
                  size="small"
                />
              )}
            </Box>
            <Box sx={{ display: 'flex', flexDirection: 'column', gap: 2 }}>
              {dashboardData?.inventory.lowStockItems && dashboardData.inventory.lowStockItems.length > 0 ? (
                dashboardData.inventory.lowStockItems.map((item: any, index: number) => (
                  <Box
                    key={item.id || index}
                    sx={{
                      p: 1.5,
                      borderRadius: 1,
                      bgcolor: 'error.light',
                      border: '1px solid',
                      borderColor: 'error.main',
                    }}
                  >
                    <Box sx={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between' }}>
                      <Typography variant={TYPOGRAPHY_STYLES.tableCell.primary.variant} sx={{ fontSize: TYPOGRAPHY_STYLES.tableCell.primary.fontSize }}>
                        {item.name || 'Unknown Product'}
                      </Typography>
                      <Chip
                        label="Out of Stock"
                        color="error"
                        size="small"
                        sx={{
                          fontSize: TYPOGRAPHY_STYLES.chip.small.fontSize,
                          fontWeight: TYPOGRAPHY_STYLES.chip.small.fontWeight,
                          height: TYPOGRAPHY_STYLES.chip.small.height
                        }}
                      />
                    </Box>
                  </Box>
                ))
              ) : (
                <Box sx={{ textAlign: 'center', py: 3 }}>
                  <Typography variant={TYPOGRAPHY_STYLES.tableCell.secondary.variant} color="success.main">
                    All products are in stock
                  </Typography>
                </Box>
              )}
            </Box>
          </Paper>
        </Grid>
      </Grid>
    </Box>
  )
}

export default DashboardPage
