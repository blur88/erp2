import { formatCurrency, formatDate } from './formatters'

export interface PDFTemplateOptions {
  documentType: 'salesOrder' | 'invoice' | 'paymentReceipt' | 'purchaseOrder' | 'grn' | 'vendorPayment'
  documentNumber: string
  documentDate: string | Date
  printSettings: any
  customerInfo?: {
    name: string
    address?: string
    city?: string
    state?: string
    postalCode?: string
    country?: string
    phone?: string
    email?: string
  }
  items: Array<{
    description: string
    quantity: number
    unitPrice: number
    discount?: number
    discountType?: 'percentage' | 'amount'
    discountPercent?: number
    amount: number
  }>
  subtotal: number
  tax?: number
  shipping?: number
  discount?: number
  total: number
  notes?: string
  additionalInfo?: Array<{ label: string; value: string }>
  // Invoice-specific fields
  paidAmount?: number
  balanceDue?: number
  salesOrderNumber?: string
}

const DOCUMENT_TITLES: Record<PDFTemplateOptions['documentType'], string> = {
  salesOrder: 'SALES ORDER',
  invoice: 'INVOICE',
  paymentReceipt: 'PAYMENT RECEIPT',
  purchaseOrder: 'PURCHASE ORDER',
  grn: 'GOODS RECEIVED NOTE',
  vendorPayment: 'VENDOR PAYMENT',
}

export function generatePDFTemplate(options: PDFTemplateOptions): string {
  const {
    documentType,
    documentNumber,
    documentDate,
    printSettings,
    customerInfo,
    items,
    subtotal,
    tax,
    shipping,
    discount,
    total,
    notes,
    additionalInfo,
    paidAmount,
    balanceDue,
    salesOrderNumber,
  } = options

  // Get footer text based on document type
  const getFooterText = () => {
    switch (documentType) {
      case 'salesOrder':
      case 'invoice':
      case 'paymentReceipt':
        return {
          perPage: printSettings?.salesPerPageFooter || '',
          endOfDoc: printSettings?.salesEndOfDocFooter || '',
        }
      case 'purchaseOrder':
      case 'grn':
      case 'vendorPayment':
        return {
          perPage: printSettings?.purchasingPerPageFooter || '',
          endOfDoc: printSettings?.purchasingEndOfDocFooter || '',
        }
      default:
        return { perPage: '', endOfDoc: '' }
    }
  }

  const footers = getFooterText()
  const documentTitle = DOCUMENT_TITLES[documentType]

  // Check if any item has a discount (only for sales orders and invoices)
  const hasAnyDiscount = (documentType === 'salesOrder' || documentType === 'invoice') &&
    items.some(item => (item.discount && item.discount > 0) || (item.discountPercent && item.discountPercent > 0))

  // Build item rows
  let itemRows = ''
  items.forEach((item) => {
    // Format discount display based on type
    let discountDisplay = '-'
    if (item.discountType === 'percentage' && item.discountPercent && item.discountPercent > 0) {
      discountDisplay = `${item.discountPercent}%`
    } else if (item.discount && item.discount > 0) {
      discountDisplay = formatCurrency(item.discount)
    }

    itemRows += `
      <tr>
        <td style="padding: 8px; border: 1px solid #000000; color: #000000;">${item.description}</td>
        <td style="padding: 8px; border: 1px solid #000000; text-align: right; color: #000000;">${item.quantity}</td>
        <td style="padding: 8px; border: 1px solid #000000; text-align: right; color: #000000;">${formatCurrency(item.unitPrice)}</td>
        ${hasAnyDiscount ? `<td style="padding: 8px; border: 1px solid #000000; text-align: right; color: #000000;">${discountDisplay}</td>` : ''}
        <td style="padding: 8px; border: 1px solid #000000; text-align: right; color: #000000;">${formatCurrency(item.amount)}</td>
      </tr>
    `
  })

  // Build customer info section
  const buildCustomerInfo = () => {
    if (!customerInfo) return ''

    return `
      <div class="customer-box">
        <div style="font-weight: 600; margin-bottom: 5px;">${customerInfo.name}</div>
        ${customerInfo.address ? `<div>${customerInfo.address}</div>` : ''}
        ${customerInfo.postalCode || customerInfo.city ? `<div>${customerInfo.postalCode || ''} ${customerInfo.city || ''}</div>` : ''}
        ${customerInfo.state || customerInfo.country ? `<div>${customerInfo.state || ''}, ${customerInfo.country || ''}</div>` : ''}
        ${customerInfo.phone ? `<div>Phone: ${customerInfo.phone}</div>` : ''}
        ${customerInfo.email ? `<div>Email: ${customerInfo.email}</div>` : ''}
      </div>
    `
  }

  // Build additional info rows (for extra fields in document info section)
  const buildAdditionalInfo = () => {
    if (!additionalInfo || additionalInfo.length === 0) return ''

    return additionalInfo.map(info =>
      `<div><span class="info-label">${info.label}:</span> ${info.value}</div>`
    ).join('\n')
  }

  // Build totals rows
  const buildTotalsRows = () => {
    let rows = `
      <div class="totals-row">
        <span>Subtotal:</span>
        <span>${formatCurrency(subtotal)}</span>
      </div>
    `

    if (discount !== undefined && discount > 0) {
      rows += `
        <div class="totals-row">
          <span>Discount:</span>
          <span>-${formatCurrency(discount)}</span>
        </div>
      `
    }

    if (tax !== undefined && tax > 0) {
      rows += `
        <div class="totals-row">
          <span>Tax:</span>
          <span>${formatCurrency(tax)}</span>
        </div>
      `
    }

    if (shipping !== undefined && shipping > 0) {
      rows += `
        <div class="totals-row">
          <span>Shipping Cost:</span>
          <span>${formatCurrency(shipping)}</span>
        </div>
      `
    }

    rows += `
      <div class="totals-divider"></div>
      <div class="totals-row totals-total">
        <span>Total:</span>
        <span>${formatCurrency(total)}</span>
      </div>
    `

    // Add paid amount and balance for invoices
    if (documentType === 'invoice' && paidAmount !== undefined) {
      rows += `
        <div class="totals-row">
          <span>Paid Amount:</span>
          <span>${formatCurrency(paidAmount)}</span>
        </div>
      `

      if (balanceDue !== undefined) {
        rows += `
          <div class="totals-row" style="font-weight: 600;">
            <span>Balance Due:</span>
            <span>${formatCurrency(balanceDue)}</span>
          </div>
        `
      }
    }

    return rows
  }

  const html = `
    <!DOCTYPE html>
    <html>
      <head>
        <title>${documentTitle} - ${documentNumber}</title>
        <style>
          * {
            margin: 0;
            padding: 0;
            box-sizing: border-box;
          }
          body {
            font-family: Arial, sans-serif;
            padding: 40px;
            background-color: #ffffff;
            color: #000000;
          }
          .header-section {
            display: flex;
            align-items: flex-start;
            margin-bottom: 30px;
          }
          .logo-container {
            flex-shrink: 0;
            margin-right: 30px;
          }
          .logo-container img {
            width: 100px;
            height: 100px;
            object-fit: contain;
          }
          .company-info {
            flex-grow: 1;
          }
          .company-name {
            font-size: 20px;
            font-weight: 700;
            margin-bottom: 10px;
            color: #000000;
          }
          .company-details {
            font-size: 12px;
            line-height: 1.6;
            color: #000000;
          }
          .document-header-box {
            text-align: right;
            min-width: 200px;
          }
          .document-header-title {
            font-size: 28px;
            font-weight: 700;
            color: #000000;
            margin-bottom: 10px;
          }
          .document-header-info {
            font-size: 12px;
            line-height: 1.8;
            color: #000000;
          }
          .divider {
            border: none;
            border-top: 1px solid #000000;
            margin: 20px 0;
          }
          .info-label {
            font-weight: 600;
          }
          .customer-section {
            display: grid;
            grid-template-columns: 1fr 1fr;
            gap: 30px;
            margin-bottom: 30px;
          }
          .customer-box {
            border: 1px solid #000000;
            padding: 15px;
            border-radius: 4px;
            font-size: 12px;
            line-height: 1.6;
            color: #000000;
          }
          .items-table {
            width: 100%;
            border-collapse: collapse;
            margin-bottom: 30px;
            border: 1px solid #000000;
          }
          .items-table th {
            background-color: #f0f0f0;
            padding: 10px 8px;
            text-align: left;
            font-weight: 600;
            border: 1px solid #000000;
            color: #000000;
          }
          .items-table td {
            padding: 8px;
            border: 1px solid #000000;
            color: #000000;
          }
          .totals-section {
            display: flex;
            justify-content: flex-end;
            margin-bottom: 30px;
          }
          .totals-box {
            width: 300px;
            border: 1px solid #000000;
            padding: 15px;
          }
          .totals-row {
            display: flex;
            justify-content: space-between;
            margin-bottom: 8px;
            font-size: 12px;
            color: #000000;
          }
          .totals-divider {
            border-top: 1px solid #000000;
            margin: 10px 0;
          }
          .totals-total {
            font-weight: 700;
            font-size: 14px;
          }
          .notes-section {
            margin-bottom: 30px;
          }
          .notes-title {
            font-weight: 600;
            margin-bottom: 8px;
            font-size: 12px;
            color: #000000;
          }
          .notes-content {
            font-size: 12px;
            line-height: 1.6;
            color: #000000;
          }
          .footer-section {
            margin-top: 50px;
            padding-top: 20px;
            border-top: 1px solid #000000;
            font-size: 11px;
            text-align: center;
            color: #000000;
          }
          .end-footer {
            margin-top: 30px;
            padding: 15px;
            background-color: #f0f0f0;
            border: 1px solid #000000;
            border-radius: 4px;
            font-size: 12px;
            text-align: center;
            color: #000000;
          }
          @page {
            size: A4 portrait;
            margin: 20mm;
          }
          @media print {
            body {
              padding: 0;
              margin: 0;
            }
            .footer-section {
              position: fixed;
              bottom: 0;
              left: 0;
              right: 0;
              padding: 10px;
              border-top: 1px solid #000000;
              background-color: #ffffff;
            }
          }
        </style>
      </head>
      <body>
        <!-- Header Section -->
        <div class="header-section">
          ${printSettings?.logoUrl ? `
          <div class="logo-container">
            <img src="${printSettings.logoUrl}" alt="Company Logo" />
          </div>
          ` : ''}
          <div class="company-info">
            <div class="company-name">${printSettings?.companyName || 'Company Name'}</div>
            <div class="company-details">
              ${printSettings?.address || 'Company Address'}<br>
              ${printSettings?.postalCode || ''} ${printSettings?.city || ''}<br>
              ${printSettings?.state || ''}, ${printSettings?.country || ''}<br>
              ${printSettings?.phone ? `Tel: ${printSettings.phone}` : ''}${printSettings?.email ? ` | Email: ${printSettings.email}` : ''}<br>
              ${printSettings?.website ? `Website: ${printSettings.website}` : ''}
            </div>
          </div>
          <div class="document-header-box">
            <div class="document-header-title">${documentTitle}</div>
            <div class="document-header-info">
              <div><span class="info-label">Document No:</span> ${documentNumber}</div>
              <div><span class="info-label">Date:</span> ${formatDate(documentDate)}</div>
              ${documentType === 'invoice' && salesOrderNumber ? `<div><span class="info-label">SO No:</span> ${salesOrderNumber}</div>` : ''}
              ${buildAdditionalInfo()}
            </div>
          </div>
        </div>

        <hr class="divider">

        <!-- Customer Details -->
        ${customerInfo ? `
        <div class="customer-section">
          <div>
            <!-- Empty space for alignment -->
          </div>
          ${buildCustomerInfo()}
        </div>
        ` : ''}

        <!-- Items Table -->
        <table class="items-table">
          <thead>
            <tr>
              <th>Product</th>
              <th style="width: 80px; text-align: right;">Qty</th>
              <th style="width: 120px; text-align: right;">Unit Price</th>
              ${hasAnyDiscount ? '<th style="width: 100px; text-align: right;">Discount</th>' : ''}
              <th style="width: 120px; text-align: right;">Amount</th>
            </tr>
          </thead>
          <tbody>
            ${itemRows}
          </tbody>
        </table>

        <!-- Totals Section -->
        <div class="totals-section">
          <div class="totals-box">
            ${buildTotalsRows()}
          </div>
        </div>

        <!-- Notes Section -->
        ${notes ? `
        <div class="notes-section">
          <div class="notes-title">Notes:</div>
          <div class="notes-content">${notes}</div>
        </div>
        ` : `
        <div class="notes-section">
          <div class="notes-title">Notes:</div>
          <div class="notes-content">Thank you for your business. Please contact us if you have any questions.</div>
        </div>
        `}

        <!-- Per-page Footer -->
        ${footers.perPage ? `
        <div class="footer-section">
          ${footers.perPage}
        </div>
        ` : ''}

        <!-- End of Document Footer -->
        ${footers.endOfDoc ? `
        <div class="end-footer">
          ${footers.endOfDoc}
        </div>
        ` : ''}

        <script>
          window.onload = function() {
            setTimeout(function() {
              window.print();
            }, 250);
          }
        </script>
      </body>
    </html>
  `

  return html
}

/**
 * Open a new window and print the PDF
 */
export function printPDF(html: string, onError?: (message: string) => void): void {
  const printWindow = window.open('', '_blank')
  if (!printWindow) {
    onError?.('Unable to open print window. Please check your popup blocker settings.')
    return
  }

  printWindow.document.write(html)
  printWindow.document.close()
}
