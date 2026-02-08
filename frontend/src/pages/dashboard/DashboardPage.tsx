import React, { useState, useEffect } from 'react'
import {
  Box,
  Grid,
  Typography,
  CircularProgress,
  Alert,
} from '@mui/material'
import {
  Inventory2 as InventoryIcon,
  PointOfSale as SalesIcon,
  Assignment as PurchasingIcon,
  People as CustomersIcon,
  Dashboard as DashboardIcon,
} from '@mui/icons-material'
import { formatCurrency } from '@/utils/formatters'
import { TYPOGRAPHY_STYLES } from '@/constants/typography'
import { useNavigate } from 'react-router-dom'
import { useCurrency } from '@/hooks/useCurrency'
import { ApiService } from '@/services/api'

import {
  DashboardStats,
  QuickActions,
  BusinessPerformanceChart,
  RecentSalesTable,
  RecentPurchasesTable,
  TopPerformers,
  InventoryOverview,
} from './components'

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

const DashboardPage: React.FC = () => {
  const navigate = useNavigate()
  const { currency } = useCurrency()
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState<string | null>(null)
  const [dashboardData, setDashboardData] = useState<DashboardData | null>(null)

  useEffect(() => {
    fetchDashboardData()
  }, [])

  const fetchDashboardData = async () => {
    try {
      setLoading(true)
      setError(null)

      const [
        salesOrdersRes,
        purchaseOrdersRes,
        suppliersRes,
        inventoryStatsRes,
        outOfStockRes,
        paymentsRes
      ] = await Promise.all([
        ApiService.get<any>('/sales-orders?limit=100&sortBy=orderDate&sortOrder=desc'),
        ApiService.get<any>('/purchasing/orders?limit=100&sortBy=orderDate&sortOrder=DESC'),
        ApiService.get<any>('/purchasing/suppliers?limit=100'),
        ApiService.get<any>('/inventory/products/dashboard-stats'),
        ApiService.get<any>('/inventory/products/out-of-stock'),
        ApiService.get<any>('/payments?limit=100')
      ])

      const salesOrders: any[] = salesOrdersRes.data || []
      const purchaseOrders: any[] = purchaseOrdersRes.orders || purchaseOrdersRes.data || []
      const suppliers: any[] = suppliersRes.suppliers || suppliersRes.data || []
      const inventoryStats: any = inventoryStatsRes
      const outOfStock: any[] = Array.isArray(outOfStockRes) ? outOfStockRes : []
      const payments: any[] = paymentsRes.data || []

      // Calculate Sales Metrics
      const today = new Date()
      const thirtyDaysAgo = new Date(today)
      thirtyDaysAgo.setDate(thirtyDaysAgo.getDate() - 30)
      const sixtyDaysAgo = new Date(today)
      sixtyDaysAgo.setDate(sixtyDaysAgo.getDate() - 60)

      const currentSalesOrders = salesOrders.filter((order: any) => {
        const orderDate = new Date(order.orderDate)
        return orderDate >= thirtyDaysAgo && orderDate <= today
      })
      const currentSalesRevenue = currentSalesOrders.reduce((sum: number, order: any) => sum + (order.totalAmount || 0), 0)

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

      const activeSuppliers = suppliers.filter((s: any) => !s.deletedAt).length
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

  // Stats for cards
  const stats = [
    {
      title: 'Total Sales',
      value: formatCurrency(dashboardData?.sales.totalRevenue || 0),
      change: dashboardData?.sales.revenueGrowth !== undefined
        ? `${dashboardData.sales.revenueGrowth > 0 ? '+' : ''}${dashboardData.sales.revenueGrowth.toFixed(1)}%`
        : '+0.0%',
      trend: (dashboardData?.sales.revenueGrowth || 0) >= 0 ? 'up' as const : 'down' as const,
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
      trend: (dashboardData?.purchasing.spentGrowth || 0) >= 0 ? 'up' as const : 'down' as const,
      icon: PurchasingIcon,
      color: 'warning',
      onClick: () => navigate('/purchasing')
    },
    {
      title: 'Inventory Value',
      value: formatCurrency(dashboardData?.inventory.inventoryValue || 0),
      change: `${dashboardData?.inventory.totalProducts || 0} products`,
      trend: 'up' as const,
      icon: InventoryIcon,
      color: 'primary',
      onClick: () => navigate('/inventory')
    },
    {
      title: 'Customers',
      value: dashboardData?.sales.uniqueCustomers || '0',
      change: `${dashboardData?.purchasing.activeSuppliers || 0} suppliers`,
      trend: 'up' as const,
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

      {/* Quick Actions */}
      <QuickActions />

      {/* Stats Cards */}
      <DashboardStats stats={stats} />

      {/* Business Performance Chart */}
      {dashboardData?.rawData && (
        <BusinessPerformanceChart rawData={dashboardData.rawData} />
      )}

      {/* Recent Orders Tables */}
      <Grid container spacing={3} sx={{ mb: 4 }}>
        <Grid size={{ xs: 12, lg: 6 }}>
          <RecentSalesTable
            orders={dashboardData?.sales.recentOrders || []}
            totalOrders={dashboardData?.sales.totalOrders || 0}
          />
        </Grid>
        <Grid size={{ xs: 12, lg: 6 }}>
          <RecentPurchasesTable
            orders={dashboardData?.purchasing.recentOrders || []}
            totalOrders={dashboardData?.purchasing.totalOrders || 0}
          />
        </Grid>
      </Grid>

      {/* Top Performers */}
      <Box sx={{ mb: 4 }}>
        <TopPerformers
          topProducts={dashboardData?.sales.topProducts || []}
          topSuppliers={dashboardData?.purchasing.topSuppliers || []}
        />
      </Box>

      {/* Inventory Overview */}
      <InventoryOverview
        stockHealthMetrics={dashboardData?.inventory.stockHealthMetrics || { inStockPercentage: 100, outOfStockPercentage: 0 }}
        lowStockItems={dashboardData?.inventory.lowStockItems || []}
        totalProducts={dashboardData?.inventory.totalProducts || 0}
        totalCategories={dashboardData?.inventory.totalCategories || 0}
        outOfStockCount={dashboardData?.inventory.outOfStockCount || 0}
      />
    </Box>
  )
}

export default DashboardPage
