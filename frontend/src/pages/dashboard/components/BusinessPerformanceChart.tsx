import React, { useRef, useMemo } from 'react'
import { DatePicker } from '@mui/x-date-pickers'
import {
    Box,
    Paper,
    Typography,
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
    useTheme,
} from '@mui/material'
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
import { Line } from 'react-chartjs-2'
import { format, parseISO, startOfWeek, startOfMonth, startOfYear, eachDayOfInterval, eachWeekOfInterval, eachMonthOfInterval, eachYearOfInterval, endOfDay, endOfWeek, endOfMonth, endOfYear, isWithinInterval, subDays } from 'date-fns'
import { formatCurrency, formatDate, isValidIsoDate, toMuiDatePickerFormat } from '@/utils/formatters'

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

interface ChartFilters {
    selectedLines: string[]
    dateFilter: string
    customFromDate: string
    customToDate: string
    groupBy: 'days' | 'weeks' | 'months' | 'years'
}

interface RawData {
    salesOrders: any[]
    purchaseOrders: any[]
    payments: any[]
    inventoryValue: number
}

interface BusinessPerformanceChartProps {
    rawData: RawData
}

// This toolbar runs at 0.75rem throughout; the theme's picker rule is
// 0.875rem, which would leave these two fields larger than their neighbours.
const DENSE_PICKER_SX = {
    minWidth: 130,
    '& .MuiPickersInputBase-root': { fontSize: '0.75rem' },
    '& .MuiInputLabel-root': { fontSize: '0.75rem' },
}

const BusinessPerformanceChart: React.FC<BusinessPerformanceChartProps> = ({ rawData }) => {
    const theme = useTheme()
    const chartRef = useRef<any>(null)

    // Regional format, memoised — dateFormat only changes via Settings, which
    // re-renders the app.
    const storedFormat = useMemo(() => localStorage.getItem('dateFormat') || 'DD/MM/YYYY', [])
    const pickerFormat = useMemo(() => toMuiDatePickerFormat(storedFormat), [storedFormat])

    const lineColors: Record<string, string> = {
        sales_completed: theme.palette.success.main,
        cogs: theme.palette.error.main,
        sales_profit: theme.palette.primary.main,
        sales_orders: theme.palette.secondary.main,
        purchase_orders: theme.palette.warning.main,
        cash_in: theme.palette.info.main,
        cash_out: theme.palette.secondary.light,
        net_cash_flow: theme.palette.primary.dark,
        inventory_value: theme.palette.warning.dark,
    }

    const [chartFilters, setChartFilters] = React.useState<ChartFilters>({
        selectedLines: ['sales_completed', 'cogs', 'sales_profit'],
        dateFilter: 'this_week',
        customFromDate: format(subDays(new Date(), 30), 'yyyy-MM-dd'),
        customToDate: format(new Date(), 'yyyy-MM-dd'),
        groupBy: 'days'
    })

    // Get date range based on filter selection
    const getDateRange = (filter: string) => {
        const today = new Date()
        const yesterday = new Date(today)
        yesterday.setDate(yesterday.getDate() - 1)

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

    // Generate chart data based on filters
    const chartData = useMemo(() => {
        if (!rawData) return { labels: [], datasets: [] }

        const { selectedLines, groupBy } = chartFilters
        const dateRange = getDateRange(chartFilters.dateFilter)
        const start = new Date(dateRange.startDate)
        const end = new Date(dateRange.endDate)

        // A cleared or partly typed custom bound reaches here as Invalid Date,
        // and date-fns interval helpers throw RangeError rather than returning
        // empty — which blanks the dashboard. A complete-but-implausible bound
        // (a first year keystroke commits e.g. 0002-07-01) would not throw but
        // would iterate hundreds of thousands of days. Produce no interval
        // until both bounds are real, plausible calendar dates.
        if (
            !isValidIsoDate(String(dateRange.startDate)) ||
            !isValidIsoDate(String(dateRange.endDate)) ||
            Number.isNaN(start.getTime()) ||
            Number.isNaN(end.getTime())
        ) {
            return { labels: [], datasets: [] }
        }

        const linesToShow = selectedLines.includes('all')
            ? LINE_OPTIONS.filter(o => o.value !== 'all').map(o => o.value)
            : selectedLines

        let periods: Date[] = []

        switch (groupBy) {
            case 'days':
                periods = eachDayOfInterval({ start, end })
                break
            case 'weeks':
                periods = eachWeekOfInterval({ start, end }, { weekStartsOn: 1 })
                break
            case 'months':
                periods = eachMonthOfInterval({ start, end })
                break
            case 'years':
                periods = eachYearOfInterval({ start, end })
                break
        }

        const labels = periods.map(p => p.getTime())

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
                        const filteredOrders = rawData.salesOrders.filter((o: any) => {
                            const orderDate = new Date(o.orderDate)
                            return isWithinInterval(orderDate, interval) && o.isFulfilled
                        })
                        return filteredOrders.reduce((sum: number, o: any) => sum + (o.totalAmount || 0), 0)
                    }
                    case 'cogs': {
                        const filteredOrders = rawData.salesOrders.filter((o: any) => {
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
                        const filteredOrders = rawData.salesOrders.filter((o: any) => {
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
                        const filteredOrders = rawData.salesOrders.filter((o: any) => {
                            const orderDate = new Date(o.orderDate)
                            return isWithinInterval(orderDate, interval)
                        })
                        return filteredOrders.reduce((sum: number, o: any) => sum + (o.totalAmount || 0), 0)
                    }
                    case 'purchase_orders': {
                        const filteredOrders = rawData.purchaseOrders.filter((o: any) => {
                            const orderDate = new Date(o.orderDate)
                            return isWithinInterval(orderDate, interval)
                        })
                        return filteredOrders.reduce((sum: number, o: any) => sum + (parseFloat(o.totalAmount) || 0), 0)
                    }
                    case 'cash_in': {
                        const filteredPayments = rawData.payments.filter((p: any) => {
                            const paymentDate = new Date(p.paymentDate)
                            return isWithinInterval(paymentDate, interval)
                        })
                        return filteredPayments.reduce((sum: number, p: any) => sum + (parseFloat(p.amount) || 0), 0)
                    }
                    case 'cash_out': {
                        const filteredOrders = rawData.purchaseOrders.filter((o: any) => {
                            const orderDate = new Date(o.orderDate)
                            return isWithinInterval(orderDate, interval) && o.isFullyReceived
                        })
                        return filteredOrders.reduce((sum: number, o: any) => sum + (parseFloat(o.totalAmount) || 0), 0)
                    }
                    case 'net_cash_flow': {
                        const cashIn = rawData.payments.filter((p: any) => {
                            const paymentDate = new Date(p.paymentDate)
                            return isWithinInterval(paymentDate, interval)
                        }).reduce((sum: number, p: any) => sum + (parseFloat(p.amount) || 0), 0)

                        const cashOut = rawData.purchaseOrders.filter((o: any) => {
                            const orderDate = new Date(o.orderDate)
                            return isWithinInterval(orderDate, interval) && o.isFullyReceived
                        }).reduce((sum: number, o: any) => sum + (parseFloat(o.totalAmount) || 0), 0)

                        return cashIn - cashOut
                    }
                    case 'inventory_value': {
                        return rawData.inventoryValue
                    }
                    default:
                        return 0
                }
            })

            const lineOption = LINE_OPTIONS.find(o => o.value === lineType)
            const color = lineColors[lineType] || theme.palette.primary.main

            return {
                label: lineOption?.label || lineType,
                data,
                borderColor: color,
                backgroundColor: `${color}20`,
                tension: 0,
                fill: false,
                total: data.reduce((sum: number, val: number) => sum + val, 0)
            }
        })

        return { labels, datasets }
    }, [rawData, chartFilters, theme])

    const handleLineChange = (event: any) => {
        const value = event.target.value as string[]

        if (value.includes('all') && !chartFilters.selectedLines.includes('all')) {
            setChartFilters(prev => ({ ...prev, selectedLines: ['all'] }))
        } else if (chartFilters.selectedLines.includes('all') && value.length > 1) {
            setChartFilters(prev => ({ ...prev, selectedLines: value.filter(v => v !== 'all') }))
        } else {
            setChartFilters(prev => ({ ...prev, selectedLines: value }))
        }
    }

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
                    title: function (context: any) {
                        if (!context?.length) return ''
                        return formatDate(new Date(context[0].parsed.x))
                    },
                    label: function (context: any) {
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
                },
            }
        },
        scales: {
            y: {
                beginAtZero: true,
                ticks: {
                    color: theme.palette.text.secondary,
                    callback: function (value: any) {
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
                        hour: 'dd/MM/yyyy HH:mm',
                        day: 'dd/MM/yyyy',
                        week: 'dd/MM/yyyy',
                        month: 'dd/MM/yyyy',
                        year: 'yyyy'
                    }
                },
                ticks: {
                    color: theme.palette.text.secondary,
                    maxRotation: 45,
                    minRotation: 0,
                    callback: function (value: any) {
                        return formatDate(new Date(value))
                    },
                },
                grid: {
                    color: theme.palette.divider
                }
            }
        }
    }

    return (
        <Paper sx={{ p: 3, mb: 4 }}>
            <Typography variant="tableHeader" sx={{ fontWeight: 600, mb: 2 }}>
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
                            slotProps: {
                                paper: {
                                    style: {
                                        maxHeight: 300,
                                    },
                                },
                            },
                        }}
                    >
                        {LINE_OPTIONS.map((option) => (
                            <MenuItem key={option.value} value={option.value} sx={{ fontSize: '0.75rem', py: 0.5 }}>
                                <Checkbox checked={chartFilters.selectedLines.includes(option.value)} size="small" sx={{ p: 0.5 }} />
                                <ListItemText primary={option.label} slotProps={{ primary: { sx: { fontSize: '0.75rem' } } }} />
                            </MenuItem>
                        ))}
                    </Select>
                </FormControl>

                {/* Date Filter */}
                <FormControl size="small" sx={{ minWidth: 130 }}>
                    <InputLabel id="chart-date-filter-label" sx={{ fontSize: '0.75rem' }}>Date Filter</InputLabel>
                    <Select
                        labelId="chart-date-filter-label"
                        id="chart-date-filter"
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

                {/* Custom Date Range */}
                {chartFilters.dateFilter === 'custom' && (
                    <>
                        <DatePicker
                            label="From Date"
                            value={chartFilters.customFromDate ? parseISO(chartFilters.customFromDate) : null}
                            format={pickerFormat}
                            onChange={(d) => {
                                // Null clears the bound; Invalid Date is a
                                // mid-entry transient and must not blank a
                                // populated range while the user retypes it.
                                if (d === null) {
                                    setChartFilters(prev => ({ ...prev, customFromDate: '' }))
                                    return
                                }
                                if (Number.isNaN(d.getTime())) return
                                setChartFilters(prev => ({
                                    ...prev,
                                    customFromDate: format(d, 'yyyy-MM-dd'),
                                }))
                            }}
                            slotProps={{
                                textField: { size: 'small', sx: DENSE_PICKER_SX },
                                field: { clearable: true },
                            }}
                        />
                        <DatePicker
                            label="To Date"
                            value={chartFilters.customToDate ? parseISO(chartFilters.customToDate) : null}
                            format={pickerFormat}
                            onChange={(d) => {
                                // Null clears the bound; Invalid Date is a
                                // mid-entry transient and must not blank a
                                // populated range while the user retypes it.
                                if (d === null) {
                                    setChartFilters(prev => ({ ...prev, customToDate: '' }))
                                    return
                                }
                                if (Number.isNaN(d.getTime())) return
                                setChartFilters(prev => ({
                                    ...prev,
                                    customToDate: format(d, 'yyyy-MM-dd'),
                                }))
                            }}
                            slotProps={{
                                textField: { size: 'small', sx: DENSE_PICKER_SX },
                                field: { clearable: true },
                            }}
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
                <Line ref={chartRef} data={chartData} options={chartOptions as any} />
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
    )
}

export default BusinessPerformanceChart
