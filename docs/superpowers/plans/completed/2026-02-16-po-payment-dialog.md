# PO Payment Dialog Implementation Plan

> **For Claude:** REQUIRED SUB-SKILL: Use superpowers:executing-plans to implement this plan task-by-task.

**Goal:** Add a multi-line vendor payment dialog to Purchase Orders, mirroring the sales order PaymentDialog, with auto journal posting on payment.

**Architecture:** Add a `recordOrderPayments` backend endpoint accepting multiple payment lines, create a `VendorPaymentDialog` frontend component mirroring `PaymentDialog`, and wire it into `PurchaseOrdersPage`.

**Tech Stack:** NestJS (backend), React + MUI v7 (frontend), TypeORM, Redux Toolkit

---

### Task 1: Backend — Add `recordOrderPayments` DTO

**Files:**
- Modify: `backend/src/modules/purchasing/dto/purchase-order.dto.ts`

**Step 1: Add the DTO class**

Open `backend/src/modules/purchasing/dto/purchase-order.dto.ts` and add at the end of the file:

```typescript
export class RecordOrderPaymentLineDto {
  @IsString()
  @IsNotEmpty()
  paymentMethodId: string;

  @IsNumber()
  @Min(0.01)
  amount: number;

  @IsOptional()
  @IsString()
  reference?: string;
}

export class RecordOrderPaymentsDto {
  @IsArray()
  @ValidateNested({ each: true })
  @Type(() => RecordOrderPaymentLineDto)
  payments: RecordOrderPaymentLineDto[];
}
```

Make sure the needed imports are present at the top of the file:
```typescript
import { IsString, IsNotEmpty, IsNumber, Min, IsOptional, IsArray, ValidateNested } from 'class-validator'
import { Type } from 'class-transformer'
```

**Step 2: Build to verify no TypeScript errors**

```bash
cd /home/blur/erp2/backend && npm run build 2>&1 | tail -20
```
Expected: No errors (or only pre-existing warnings).

**Step 3: Commit**

```bash
cd /home/blur/erp2
git add backend/src/modules/purchasing/dto/purchase-order.dto.ts
git commit -m "feat: add RecordOrderPaymentsDto for multi-line vendor payments"
```

---

### Task 2: Backend — Add `recordOrderPayments` service method

**Files:**
- Modify: `backend/src/modules/purchasing/services/purchase-order.service.ts`

**Step 1: Add the method after the existing `recordPayment` method (around line 1410)**

Find the end of `recordPayment()` method (around line 1410) and add after it:

```typescript
/**
 * Record multiple payment lines for a purchase order
 * Each line creates a separate VendorPayment with journal posting
 */
async recordOrderPayments(
  id: string,
  payments: { paymentMethodId: string; amount: number; reference?: string }[],
): Promise<PurchaseOrderResponseDto> {
  this.logger.log(`Recording ${payments.length} payment lines for purchase order: ${id}`);

  const purchaseOrder = await this.purchaseOrderRepository.findOne({
    where: { id },
    relations: ['supplier'],
  });

  if (!purchaseOrder) {
    throw new NotFoundException('Purchase order not found');
  }

  if (!payments || payments.length === 0) {
    throw new BadRequestException('At least one payment line is required');
  }

  const totalNewPayment = payments.reduce((sum, p) => sum + p.amount, 0);

  // Create a vendor payment for each line
  for (const line of payments) {
    await this.vendorPaymentService.create({
      supplierId: purchaseOrder.supplierId,
      purchaseOrderId: id,
      amount: line.amount,
      paymentDate: new Date().toISOString().split('T')[0],
      paymentMethodId: line.paymentMethodId,
      status: 'completed',
      notes: line.reference || undefined,
    });
  }

  // Update paidAmount on the order
  const newPaidAmount = (purchaseOrder.paidAmount || 0) + totalNewPayment;
  purchaseOrder.paidAmount = newPaidAmount;
  await this.purchaseOrderRepository.save(purchaseOrder);

  this.logger.log(`Purchase order ${purchaseOrder.orderNumber} paid amount updated to ${newPaidAmount}`);

  return this.findOne(id);
}
```

**Step 2: Build to verify**

```bash
cd /home/blur/erp2/backend && npm run build 2>&1 | tail -20
```
Expected: No new errors.

**Step 3: Commit**

```bash
cd /home/blur/erp2
git add backend/src/modules/purchasing/services/purchase-order.service.ts
git commit -m "feat: add recordOrderPayments service method for multi-line vendor payments"
```

---

### Task 3: Backend — Add `record-payments` controller endpoint

**Files:**
- Modify: `backend/src/modules/purchasing/controllers/purchase-order.controller.ts`

**Step 1: Import the new DTO**

Find the import line for DTOs at the top of the controller file. Add `RecordOrderPaymentsDto` to the import:

```typescript
import { ..., RecordOrderPaymentsDto } from '../dto/purchase-order.dto'
```

**Step 2: Add the endpoint**

Find the existing `@Post(':id/record-payment')` endpoint and add the new endpoint after it:

```typescript
@Post(':id/record-payments')
@ApiOperation({ summary: 'Record multiple payment lines for a purchase order' })
@ApiParam({ name: 'id', description: 'Purchase Order ID' })
async recordOrderPayments(
  @Param('id', ParseUUIDPipe) id: string,
  @Body() dto: RecordOrderPaymentsDto,
): Promise<PurchaseOrderResponseDto> {
  return this.purchaseOrderService.recordOrderPayments(id, dto.payments);
}
```

**Step 3: Build to verify**

```bash
cd /home/blur/erp2/backend && npm run build 2>&1 | tail -20
```
Expected: No new errors.

**Step 4: Test the endpoint manually**

```bash
# Get a token first
TOKEN=$(curl -s -X POST http://localhost:3001/api/auth/login \
  -H "Content-Type: application/json" \
  -d '{"username":"admin","password":"Admin@123!"}' | jq -r '.accessToken')

# Get a purchase order ID
PO_ID=$(curl -s http://localhost:3001/api/purchasing/orders \
  -H "Authorization: Bearer $TOKEN" | jq -r '.data[0].id')

echo "Testing with PO: $PO_ID"

# Test record-payments endpoint
curl -s -X POST http://localhost:3001/api/purchasing/orders/$PO_ID/record-payments \
  -H "Authorization: Bearer $TOKEN" \
  -H "Content-Type: application/json" \
  -d '{"payments":[{"paymentMethodId":"CASH_ID_HERE","amount":100}]}' | jq .
```
Expected: Returns updated purchase order with `paidAmount` increased.

**Step 5: Commit**

```bash
cd /home/blur/erp2
git add backend/src/modules/purchasing/controllers/purchase-order.controller.ts
git commit -m "feat: add POST /purchasing/orders/:id/record-payments endpoint"
```

---

### Task 4: Frontend — Add `recordOrderPayments` to purchasingApi

**Files:**
- Modify: `frontend/src/services/purchasingApi.ts`

**Step 1: Add the method**

Open `frontend/src/services/purchasingApi.ts`. Find the existing payment methods (around line 184). Add after `recordPurchaseOrderPayment`:

```typescript
recordOrderPayments: (
  id: string,
  payments: { paymentMethodId: string; amount: number; reference?: string }[]
) => api.post(`/purchasing/orders/${id}/record-payments`, { payments }),
```

**Step 2: Build frontend to verify types**

```bash
cd /home/blur/erp2/frontend && npm run type-check 2>&1 | tail -20
```
Expected: No new errors.

**Step 3: Commit**

```bash
cd /home/blur/erp2
git add frontend/src/services/purchasingApi.ts
git commit -m "feat: add recordOrderPayments API method to purchasingApi"
```

---

### Task 5: Frontend — Create VendorPaymentDialog component

**Files:**
- Create: `frontend/src/components/purchasing/VendorPaymentDialog.tsx`

**Step 1: Create the file**

This is a near-exact copy of `frontend/src/components/sales/PaymentDialog.tsx` with prop names updated for purchase orders:

```tsx
import React, { useState, useEffect, useCallback } from 'react'
import {
  Dialog,
  DialogTitle,
  DialogContent,
  DialogActions,
  Button,
  Box,
  Typography,
  TextField,
  Select,
  MenuItem,
  FormControl,
  IconButton,
  Divider,
  Alert,
  CircularProgress,
} from '@mui/material'
import { Delete as DeleteIcon, Add as AddIcon } from '@mui/icons-material'
import { paymentMethodsApi } from '@/services/paymentMethodsApi'

interface PaymentLine {
  paymentMethodId: string
  amount: number | string
  reference: string
}

interface VendorPaymentDialogProps {
  open: boolean
  onClose: () => void
  onSubmit: (payments: { paymentMethodId: string; amount: number; reference?: string }[]) => Promise<void>
  orderNumber: string
  totalAmount: number
  paidAmount: number
}

const formatCurrency = (amount: number) => {
  return new Intl.NumberFormat('en-MY', { style: 'currency', currency: 'MYR' }).format(amount)
}

export default function VendorPaymentDialog({
  open,
  onClose,
  onSubmit,
  orderNumber,
  totalAmount,
  paidAmount,
}: VendorPaymentDialogProps) {
  const outstandingBalance = Math.max(0, totalAmount - paidAmount)
  const [paymentMethods, setPaymentMethods] = useState<any[]>([])
  const [lines, setLines] = useState<PaymentLine[]>([])
  const [submitting, setSubmitting] = useState(false)
  const [error, setError] = useState<string | null>(null)

  useEffect(() => {
    if (!open) return
    setError(null)
    setSubmitting(false)
    paymentMethodsApi.getActive().then((methods: any) => {
      const list = Array.isArray(methods) ? methods : (methods as any)?.data || []
      setPaymentMethods(list)
      const cashMethod = list.find((m: any) => m.code === 'CASH')
      setLines([{
        paymentMethodId: cashMethod?.id || list[0]?.id || '',
        amount: outstandingBalance > 0 ? outstandingBalance : '',
        reference: '',
      }])
    }).catch(() => {
      setPaymentMethods([])
      setLines([{ paymentMethodId: '', amount: outstandingBalance > 0 ? outstandingBalance : '', reference: '' }])
    })
  }, [open, outstandingBalance])

  const totalEntered = lines.reduce((sum, l) => sum + (typeof l.amount === 'number' ? l.amount : parseFloat(l.amount as string) || 0), 0)
  const remaining = outstandingBalance - totalEntered

  const updateLine = useCallback((index: number, field: keyof PaymentLine, value: any) => {
    setLines(prev => {
      const updated = [...prev]
      updated[index] = { ...updated[index], [field]: value }
      return updated
    })
  }, [])

  const addLine = useCallback(() => {
    const cashMethod = paymentMethods.find((m: any) => m.code === 'CASH')
    setLines(prev => [...prev, {
      paymentMethodId: cashMethod?.id || paymentMethods[0]?.id || '',
      amount: remaining > 0 ? remaining : '',
      reference: '',
    }])
  }, [paymentMethods, remaining])

  const removeLine = useCallback((index: number) => {
    setLines(prev => prev.length > 1 ? prev.filter((_, i) => i !== index) : prev)
  }, [])

  const handleSubmit = async () => {
    setError(null)
    const validLines = lines.filter(l => {
      const amt = typeof l.amount === 'number' ? l.amount : parseFloat(l.amount as string)
      return l.paymentMethodId && amt > 0
    })
    if (validLines.length === 0) {
      setError('At least one payment line with a valid amount is required.')
      return
    }

    setSubmitting(true)
    try {
      await onSubmit(validLines.map(l => ({
        paymentMethodId: l.paymentMethodId,
        amount: typeof l.amount === 'number' ? l.amount : parseFloat(l.amount as string),
        reference: l.reference || undefined,
      })))
      onClose()
    } catch (err: any) {
      setError(err?.response?.data?.message || err?.message || 'Failed to record payments.')
    } finally {
      setSubmitting(false)
    }
  }

  const isOverpaying = totalEntered > outstandingBalance && outstandingBalance > 0

  return (
    <Dialog open={open} onClose={onClose} maxWidth="sm" fullWidth>
      <DialogTitle>Record Payment &mdash; {orderNumber}</DialogTitle>
      <DialogContent>
        <Box sx={{ display: 'flex', justifyContent: 'space-between', mb: 1, mt: 1 }}>
          <Typography variant="body2" color="text.secondary">Order Total</Typography>
          <Typography variant="body2">{formatCurrency(totalAmount)}</Typography>
        </Box>
        <Box sx={{ display: 'flex', justifyContent: 'space-between', mb: 1 }}>
          <Typography variant="body2" color="text.secondary">Previously Paid</Typography>
          <Typography variant="body2">{formatCurrency(paidAmount)}</Typography>
        </Box>
        <Box sx={{ display: 'flex', justifyContent: 'space-between', mb: 2 }}>
          <Typography variant="body2" fontWeight="bold">Outstanding Balance</Typography>
          <Typography variant="body2" fontWeight="bold">{formatCurrency(outstandingBalance)}</Typography>
        </Box>

        <Divider sx={{ mb: 2 }} />

        {lines.map((line, index) => (
          <Box key={index} sx={{ display: 'flex', gap: 1, mb: 1.5, alignItems: 'center' }}>
            <FormControl size="small" sx={{ minWidth: 130 }}>
              <Select
                value={line.paymentMethodId}
                onChange={(e) => updateLine(index, 'paymentMethodId', e.target.value)}
                displayEmpty
                sx={{ fontSize: '0.85rem' }}
              >
                <MenuItem value="" disabled>Method</MenuItem>
                {paymentMethods.map((pm: any) => (
                  <MenuItem key={pm.id} value={pm.id} sx={{ fontSize: '0.85rem' }}>
                    {pm.name}
                  </MenuItem>
                ))}
              </Select>
            </FormControl>

            <TextField
              size="small"
              type="number"
              placeholder="Amount"
              value={line.amount}
              onChange={(e) => updateLine(index, 'amount', e.target.value)}
              slotProps={{ htmlInput: { min: 0, step: 0.01 } }}
              sx={{
                width: 120,
                '& input[type=number]': { MozAppearance: 'textfield' },
                '& input[type=number]::-webkit-outer-spin-button, & input[type=number]::-webkit-inner-spin-button': { WebkitAppearance: 'none', margin: 0 },
              }}
            />

            <TextField
              size="small"
              placeholder="Reference"
              value={line.reference}
              onChange={(e) => updateLine(index, 'reference', e.target.value)}
              sx={{ flex: 1 }}
            />

            <IconButton
              size="small"
              onClick={() => removeLine(index)}
              disabled={lines.length <= 1}
              color="error"
            >
              <DeleteIcon fontSize="small" />
            </IconButton>
          </Box>
        ))}

        <Button
          startIcon={<AddIcon />}
          size="small"
          onClick={addLine}
          sx={{ mt: 0.5, mb: 2 }}
        >
          Add Payment Line
        </Button>

        <Divider sx={{ mb: 2 }} />

        <Box sx={{ display: 'flex', justifyContent: 'space-between', mb: 0.5 }}>
          <Typography variant="body2" fontWeight="bold">Total Payment</Typography>
          <Typography variant="body2" fontWeight="bold">{formatCurrency(totalEntered)}</Typography>
        </Box>
        <Box sx={{ display: 'flex', justifyContent: 'space-between' }}>
          <Typography variant="body2" color="text.secondary">Remaining</Typography>
          <Typography variant="body2" color={remaining < 0 ? 'error.main' : 'text.secondary'}>
            {formatCurrency(Math.abs(remaining))}{remaining < 0 ? ' (overpayment)' : ''}
          </Typography>
        </Box>

        {isOverpaying && (
          <Alert severity="warning" sx={{ mt: 2 }}>
            Total payment exceeds outstanding balance by {formatCurrency(Math.abs(remaining))}.
          </Alert>
        )}

        {error && (
          <Alert severity="error" sx={{ mt: 2 }}>{error}</Alert>
        )}
      </DialogContent>

      <DialogActions>
        <Button onClick={onClose} disabled={submitting}>Cancel</Button>
        <Button
          variant="contained"
          onClick={handleSubmit}
          disabled={submitting || totalEntered <= 0}
          startIcon={submitting ? <CircularProgress size={16} /> : undefined}
        >
          {submitting ? 'Recording...' : 'Record Payment'}
        </Button>
      </DialogActions>
    </Dialog>
  )
}
```

**Step 2: Type check**

```bash
cd /home/blur/erp2/frontend && npm run type-check 2>&1 | tail -20
```
Expected: No new errors.

**Step 3: Commit**

```bash
cd /home/blur/erp2
git add frontend/src/components/purchasing/VendorPaymentDialog.tsx
git commit -m "feat: add VendorPaymentDialog component for purchase order payments"
```

---

### Task 6: Frontend — Wire VendorPaymentDialog into PurchaseOrdersPage

**Files:**
- Modify: `frontend/src/pages/purchasing/PurchaseOrdersPage.tsx`

**Step 1: Find the imports section and add**

At the top of the file, add the import:
```typescript
import VendorPaymentDialog from '@/components/purchasing/VendorPaymentDialog'
```

**Step 2: Find the state declarations (around line 160-170) and add payment dialog state**

Find where other dialog states are declared (e.g., `const [deleteDialogOpen, setDeleteDialogOpen] = useState(false)`) and add:
```typescript
const [paymentDialogOpen, setPaymentDialogOpen] = useState(false)
const [paymentDialogOrder, setPaymentDialogOrder] = useState<any>(null)
```

**Step 3: Add the handler**

Find the section with other handlers (e.g., `handleUnpay`, around line 414) and add:

```typescript
const handleOpenPaymentDialog = useCallback((order: any) => {
  setPaymentDialogOrder(order)
  setPaymentDialogOpen(true)
}, [])

const handleRecordPayments = useCallback(async (payments: { paymentMethodId: string; amount: number; reference?: string }[]) => {
  if (!paymentDialogOrder) return
  const response = await purchasingApi.recordOrderPayments(paymentDialogOrder.id, payments)
  const updatedOrder = (response as any).data
  if (updatedOrder) {
    dispatch(updatePurchaseOrderInPlace(updatedOrder))
  }
  dispatch(fetchPurchaseOrderById(paymentDialogOrder.id))
}, [paymentDialogOrder, dispatch])
```

Note: Check if `updatePurchaseOrderInPlace` and `fetchPurchaseOrderById` exist in the purchasing Redux slice. If not, use `dispatch(fetchPurchaseOrders(currentQuery))` to refresh the list instead.

**Step 4: Find the "Pay" / action button area in the PO row or detail panel**

Look for where the "Unpay" button is rendered (search for `handleUnpay` in JSX). Add a "Pay" button nearby that is shown when the order is not fully paid:

```tsx
{/* Show Pay button when order has outstanding balance */}
{(order.totalAmount > (order.paidAmount || 0)) && (
  <Button
    size="small"
    variant="contained"
    color="primary"
    onClick={() => handleOpenPaymentDialog(order)}
  >
    Pay
  </Button>
)}
```

**Step 5: Add the dialog to the JSX at the bottom of the component (before the closing `</>`)**

Find where other dialogs are rendered (e.g., `<DeleteDialog ...`) and add:

```tsx
{paymentDialogOrder && (
  <VendorPaymentDialog
    open={paymentDialogOpen}
    onClose={() => setPaymentDialogOpen(false)}
    onSubmit={handleRecordPayments}
    orderNumber={paymentDialogOrder.orderNumber || ''}
    totalAmount={parseFloat(paymentDialogOrder.totalAmount) || 0}
    paidAmount={parseFloat(paymentDialogOrder.paidAmount) || 0}
  />
)}
```

**Step 6: Type check**

```bash
cd /home/blur/erp2/frontend && npm run type-check 2>&1 | tail -20
```
Expected: No new errors.

**Step 7: Commit**

```bash
cd /home/blur/erp2
git add frontend/src/pages/purchasing/PurchaseOrdersPage.tsx
git commit -m "feat: wire VendorPaymentDialog into PurchaseOrdersPage with Pay button"
```

---

### Task 7: Build and verify end-to-end

**Step 1: Build backend**

```bash
cd /home/blur/erp2/backend && npm run build 2>&1 | tail -20
```
Expected: No errors.

**Step 2: Build frontend**

```bash
cd /home/blur/erp2/frontend && npm run build 2>&1 | tail -20
```
Expected: No errors (TypeScript errors will surface here too).

**Step 3: Rebuild Docker containers**

```bash
cd /home/blur/erp2
docker compose build backend frontend && docker compose up -d backend frontend
```

**Step 4: Manual smoke test**

1. Open http://localhost:3000/purchasing
2. Open a purchase order that has an outstanding balance
3. Click "Pay" button — VendorPaymentDialog should open
4. Verify order total, previously paid, and outstanding balance are correct
5. Enter payment amount and select payment method
6. Click "Record Payment"
7. Verify the PO's `paidAmount` updates in the list
8. Verify journal entries were created: go to Accounting → Journal Entries, check for DR AP / CR Cash entry

**Step 5: Final commit if any fixes needed**

```bash
cd /home/blur/erp2
git add -A
git commit -m "fix: address any issues from smoke testing"
```
