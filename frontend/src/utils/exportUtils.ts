import * as XLSX from 'xlsx'
import jsPDF from 'jspdf'
import { autoTable } from 'jspdf-autotable'
import type { Product } from '../types'
import { formatDate, formatDateTime } from './formatters'

interface ExportData {
  products: Product[]
  filters?: {
    search?: string
    category?: string
  }
}

// Format currency for export
const formatCurrencyForExport = (value: number | null | undefined): string => {
  if (value === null || value === undefined) return ''
  const currency = localStorage.getItem('defaultCurrency') || 'RM'
  return `${currency} ${value.toFixed(2)}`
}

// Get stock status text
const getStockStatusText = (product: Product): string => {
  const stock = product.stockQuantity || 0

  if (stock <= 0) return 'Out of Stock'
  if (stock <= 10) return 'Low Stock'
  return 'In Stock'
}

// Prepare data for export
const prepareExportData = (products: Product[]) => {
  return products.map((product, index) => {
    const row: any = {
      '#': index + 1,
      'Product Name': product.name || '',
      'Barcode': product.barcode || '',
      'Type': product.type === 'Stocked Product' ? 'Stocked Product' : 'Service',
      'Category': product.category?.name || 'No Category',
      'Description': product.description || '',
      'Base Cost': formatCurrencyForExport(product.baseCost),
    }

    // Add dynamic pricing tiers if available
    if (product.pricingTiers) {
      Object.entries(product.pricingTiers).forEach(([tierName, price]) => {
        row[`${tierName} Price`] = formatCurrencyForExport(price)
      })
    }

    // Add stock and status info
    row['Current Stock'] = product.stockQuantity || 0
    row['Stock Status'] = getStockStatusText(product)
    row['Status'] = product.isActive ? 'Active' : 'Inactive'
    row['Notes'] = product.notes || ''
    row['Created Date'] = formatDate(product.createdAt)
    row['Updated Date'] = formatDate(product.updatedAt)

    return row
  })
}

// Generate filename with timestamp
const generateFilename = (format: string, filters?: ExportData['filters']): string => {
  const timestamp = new Date().toISOString().slice(0, 19).replace(/[:-]/g, '')
  let filename = `products_export_${timestamp}`

  if (filters?.search) {
    filename += `_search_${filters.search.replace(/[^a-zA-Z0-9]/g, '_')}`
  }
  if (filters?.category) {
    filename += `_category_filtered`
  }

  return `${filename}.${format}`
}

// CSV Export
const exportToCSV = ({ products, filters }: ExportData): void => {
  try {
    const exportData = prepareExportData(products)

    if (exportData.length === 0) {
      throw new Error('No data to export')
    }

    // Convert to CSV format
    const headers = Object.keys(exportData[0])
    const csvContent = [
      headers.join(','),
      ...exportData.map(row =>
        headers.map(header => {
          const value = row[header as keyof typeof row]
          // Escape commas and quotes in CSV
          if (typeof value === 'string' && (value.includes(',') || value.includes('"') || value.includes('\n'))) {
            return `"${value.replace(/"/g, '""')}"`;
          }
          return value
        }).join(',')
      )
    ].join('\n')

    // Create and download file
    const blob = new Blob(['\ufeff' + csvContent], { type: 'text/csv;charset=utf-8;' })
    const link = document.createElement('a')
    const url = URL.createObjectURL(blob)

    link.setAttribute('href', url)
    link.setAttribute('download', generateFilename('csv', filters))
    link.style.visibility = 'hidden'

    document.body.appendChild(link)
    link.click()
    document.body.removeChild(link)

    URL.revokeObjectURL(url)
  } catch (error) {
    console.error('CSV Export Error:', error)
    throw error
  }
}

// Excel Export
const exportToExcel = ({ products, filters }: ExportData): void => {
  try {
    const exportData = prepareExportData(products)

    if (exportData.length === 0) {
      throw new Error('No data to export')
    }

    // Create workbook
    const wb = XLSX.utils.book_new()

    // Main products sheet
    const ws = XLSX.utils.json_to_sheet(exportData)

    // Set column widths
    const columnWidths = [
      { wch: 5 },   // #
      { wch: 25 },  // Product Name
      { wch: 15 },  // Barcode
      { wch: 12 },  // Type
      { wch: 20 },  // Category
      { wch: 30 },  // Description
      { wch: 12 },  // Base Cost
      { wch: 12 },  // Retail Price
      { wch: 12 },  // Wholesale Price
      { wch: 12 },  // Special Price
      { wch: 10 },  // Current Stock
      { wch: 12 },  // Stock Status
      { wch: 10 },  // Retail Margin
      { wch: 10 },  // Wholesale Margin
      { wch: 10 },  // Special Margin
      { wch: 8 },   // Status
      { wch: 25 },  // Notes
      { wch: 12 },  // Created Date
      { wch: 12 }   // Updated Date
    ]
    ws['!cols'] = columnWidths

    XLSX.utils.book_append_sheet(wb, ws, 'Products')

    // Add summary sheet
    const summaryData = [
      { Metric: 'Total Products', Value: products.length },
      { Metric: 'Active Products', Value: products.filter(p => p.isActive).length },
      { Metric: 'Inactive Products', Value: products.filter(p => !p.isActive).length },
      { Metric: 'Stocked Products', Value: products.filter(p => p.type === 'Stocked Product').length },
      { Metric: 'Services', Value: products.filter(p => p.type === 'Service').length },
      { Metric: 'Out of Stock Items', Value: products.filter(p => (p.stockQuantity || 0) <= 0).length },
      {
        Metric: 'Low Stock Items', Value: products.filter(p => {
          const stock = p.stockQuantity || 0
          return stock > 0 && stock <= 10
        }).length
      },
      { Metric: 'Export Date', Value: formatDate(new Date()) },
      { Metric: 'Export Time', Value: formatDateTime(new Date()).split(' ')[1] || '-' }
    ]

    if (filters?.search) {
      summaryData.push({ Metric: 'Search Filter', Value: filters.search })
    }
    if (filters?.category) {
      summaryData.push({ Metric: 'Category Filter', Value: 'Applied' })
    }

    const summaryWs = XLSX.utils.json_to_sheet(summaryData)
    summaryWs['!cols'] = [{ wch: 20 }, { wch: 20 }]
    XLSX.utils.book_append_sheet(wb, summaryWs, 'Summary')

    // Write file
    XLSX.writeFile(wb, generateFilename('xlsx', filters))
  } catch (error) {
    console.error('Excel Export Error:', error)
    throw error
  }
}

// PDF Export
const exportToPDF = ({ products, filters }: ExportData): void => {
  try {
    if (products.length === 0) {
      throw new Error('No data to export')
    }

    const doc = new jsPDF('l', 'mm', 'a4') // Landscape orientation

    // Header
    doc.setFontSize(20)
    doc.setTextColor(40, 40, 40)
    doc.text('Products Inventory Report', 20, 20)

    // Sub header with filters
    doc.setFontSize(10)
    doc.setTextColor(80, 80, 80)
    let yPos = 30

    doc.text(`Export Date: ${formatDateTime(new Date())}`, 20, yPos)
    yPos += 5

    doc.text(`Total Products: ${products.length}`, 20, yPos)
    yPos += 5

    if (filters?.search) {
      doc.text(`Search Filter: "${filters.search}"`, 20, yPos)
      yPos += 5
    }

    if (filters?.category) {
      doc.text(`Category Filter: Applied`, 20, yPos)
      yPos += 5
    }

    yPos += 5

    // Prepare table data - simplified for PDF
    const tableData = products.map((product, index) => [
      index + 1,
      product.name || '',
      product.barcode || '',
      product.type === 'Stocked Product' ? 'Product' : 'Service',
      product.category?.name || 'No Category',
      formatCurrencyForExport(product.baseCost),
      product.stockQuantity || 0,
      getStockStatusText(product),
      product.isActive ? 'Active' : 'Inactive'
    ])

    // Table
    autoTable(doc, {
      head: [['#', 'Name', 'Barcode', 'Type', 'Category', 'Cost', 'Stock', 'Status', 'Active']],
      body: tableData,
      startY: yPos,
      styles: {
        fontSize: 8,
        cellPadding: 2
      },
      headStyles: {
        fillColor: [66, 139, 202],
        textColor: 255,
        fontStyle: 'bold'
      },
      alternateRowStyles: {
        fillColor: [245, 245, 245]
      },
      columnStyles: {
        0: { halign: 'center', cellWidth: 10 },  // #
        1: { cellWidth: 40 },                    // Name
        2: { cellWidth: 25 },                    // Barcode
        3: { halign: 'center', cellWidth: 20 },  // Type
        4: { cellWidth: 30 },                    // Category
        5: { halign: 'right', cellWidth: 20 },   // Cost
        6: { halign: 'right', cellWidth: 20 },   // Price
        7: { halign: 'center', cellWidth: 15 },  // Stock
        8: { halign: 'center', cellWidth: 20 },  // Status
        9: { halign: 'center', cellWidth: 15 }   // Active
      },
      margin: { left: 20, right: 20 },
      didDrawPage: (data) => {
        // Footer
        const pageNumber = doc.getNumberOfPages()
        doc.setFontSize(8)
        doc.setTextColor(128, 128, 128)
        doc.text(
          `Page ${data.pageNumber} of ${pageNumber}`,
          data.settings.margin.left,
          doc.internal.pageSize.height - 10
        )
      }
    })

    // Summary section on last page or new page if needed
    const finalY = (doc as any).lastAutoTable.finalY + 10
    const pageHeight = doc.internal.pageSize.height

    if (finalY > pageHeight - 60) {
      doc.addPage()
      yPos = 20
    } else {
      yPos = finalY
    }

    // Summary statistics
    doc.setFontSize(12)
    doc.setTextColor(40, 40, 40)
    doc.text('Summary Statistics', 20, yPos)

    yPos += 10
    doc.setFontSize(9)
    doc.setTextColor(60, 60, 60)

    const summaryStats = [
      `Active Products: ${products.filter(p => p.isActive).length}`,
      `Inactive Products: ${products.filter(p => !p.isActive).length}`,
      `Stocked Products: ${products.filter(p => p.type === 'Stocked Product').length}`,
      `Services: ${products.filter(p => p.type === 'Service').length}`,
      `Out of Stock: ${products.filter(p => (p.stockQuantity || 0) <= 0).length}`,
      `Low Stock: ${products.filter(p => {
        const stock = p.stockQuantity || 0
        return stock > 0 && stock <= 10
      }).length}`
    ]

    summaryStats.forEach((stat, index) => {
      if (index % 2 === 0) {
        doc.text(stat, 20, yPos)
      } else {
        doc.text(stat, 120, yPos)
        yPos += 6
      }
    })

    // Save PDF
    doc.save(generateFilename('pdf', filters))
  } catch (error) {
    console.error('PDF Export Error:', error)
    throw error
  }
}

// Main export function
export const exportProducts = (format: 'csv' | 'excel' | 'pdf', data: ExportData): Promise<void> => {
  return new Promise((resolve, reject) => {
    try {
      switch (format) {
        case 'csv':
          exportToCSV(data)
          break
        case 'excel':
          exportToExcel(data)
          break
        case 'pdf':
          exportToPDF(data)
          break
        default:
          throw new Error(`Unsupported export format: ${format}`)
      }
      resolve()
    } catch (error) {
      reject(error)
    }
  })
}
