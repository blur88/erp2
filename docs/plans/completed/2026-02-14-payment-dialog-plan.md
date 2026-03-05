# Payment Popup Dialog Implementation Plan

> **For Claude:** REQUIRED SUB-SKILL: Use superpowers:executing-plans to implement this plan task-by-task.

**Goal:** Replace inline payment controls on OrdersPage with a "Pay" button that opens a split-payment dialog, backed by an atomic batch API endpoint.

**Architecture:** New `POST /api/sales-orders/:id/record-payments` endpoint wraps existing Payment creation logic in a database transaction. New `PaymentDialog.tsx` component handles the multi-line payment UI. Existing `recordPayment` single-payment endpoint stays untouched for backward compatibility.

**Tech Stack:** NestJS (TypeORM transactions), React (MUI Dialog), class-validator DTOs

**Design Doc:** `docs/plans/completed/2026-02-14-payment-dialog-design.md`

---

### Task 1: Create RecordPaymentsDto

**Files:**
- Modify: `backend/src/modules/sales/dto/sales-order.dto.ts`

**Step 1: Add the DTO classes at the end of the file**

Add these classes at the bottom of `backend/src/modules/sales/dto/sales-order.dto.ts`:

```typescript
export class PaymentLineDto {
  @ApiProperty({ description: 'Payment method ID' })
  @IsUUID()
  paymentMethodId: string;

  @ApiProperty({ description: 'Payment amount', example: 500.00 })
  @IsNumber({ maxDecimalPlaces: 4 })
  @Min(0.01)
  @Transform(({ value }) => parseFloat(value))
  amount: number;

  @ApiPropertyOptional({ description: 'Payment reference (check number, transaction ID, etc.)' })
  @IsOptional()
  @IsString()
  reference?: string;
}

export class RecordPaymentsDto {
  @ApiProperty({ description: 'Array of payment lines', type: [PaymentLineDto] })
  @ValidateNested({ each: true })
  @Type(() => PaymentLineDto)
  @ArrayMinSize(1)
  payments: PaymentLineDto[];
}
```

Note: Add these imports at the top of the file if not already present: `ValidateNested`, `ArrayMinSize` from `class-validator`, and `Type` from `class-transformer`.

**Step 2: Verify the file compiles**

Run: `cd /home/blur/erp2/backend && npx tsc --noEmit --pretty 2>&1 | head -20`
Expected: No errors related to `sales-order.dto.ts`

**Step 3: Commit**

```bash
git add backend/src/modules/sales/dto/sales-order.dto.ts
git commit -m "feat: add RecordPaymentsDto for batch payment endpoint"
```

---

### Task 2: Add recordPayments method to SalesOrderService

**Files:**
- Modify: `backend/src/modules/sales/services/sales-order.service.ts`

**Context:** The existing `recordPayment` method (line 1883) creates payments inline with dynamic imports. The new `recordPayments` method should use a proper TypeORM transaction via `DataSource` to ensure atomicity. It reuses the same Payment creation pattern but loops over multiple lines.

**Step 1: Add DataSource injection**

In the constructor (line 38-62), add `DataSource` import and injection:

At the top imports, add:
```typescript
import { DataSource } from 'typeorm';
```

In the constructor, add after `accountingService`:
```typescript
    private readonly dataSource: DataSource,
```

**Step 2: Add the recordPayments method**

Add this method after the existing `recordPayment` method (after line 2094):

```typescript
  async recordPayments(id: string, payments: { paymentMethodId: string; amount: number; reference?: string }[]): Promise<SalesOrderResponseDto> {
    // Validate all amounts are positive
    for (const line of payments) {
      if (line.amount <= 0) {
        throw new BadRequestException('All payment amounts must be positive');
      }
    }

    const order = await this.salesOrderRepository.findOne({
      where: { id },
      relations: ['customer', 'items', 'items.product'],
    });

    if (!order) {
      throw new NotFoundException('Sales order not found');
    }

    if (order.isFulfilled) {
      throw new ConflictException('Cannot modify payment for fulfilled order');
    }

    const totalPayment = payments.reduce((sum, p) => sum + p.amount, 0);
    const newPaidAmount = Number(order.paidAmount || 0) + totalPayment;

    // Run everything in a transaction
    await this.dataSource.transaction(async (manager) => {
      const Payment = (await import('../../../database/entities/payment.entity')).Payment;
      const PaymentStatus = (await import('../../../database/entities/payment.entity')).PaymentStatus;
      const SettlementStatusEnum = (await import('../../../database/entities/payment.entity')).SettlementStatusEnum;
      const Invoice = (await import('../../../database/entities/invoice.entity')).Invoice;
      const PaymentMethodEntity = (await import('../../../database/entities/payment-method.entity')).PaymentMethodEntity;

      const paymentRepo = manager.getRepository(Payment);
      const invoiceRepo = manager.getRepository(Invoice);
      const paymentMethodRepo = manager.getRepository(PaymentMethodEntity);
      const orderRepo = manager.getRepository(SalesOrder);

      // Find invoice for this order
      const invoice = await invoiceRepo.findOne({ where: { salesOrderId: order.id } });

      for (const line of payments) {
        // Validate payment method
        const method = await paymentMethodRepo.findOne({ where: { id: line.paymentMethodId, isActive: true } });
        if (!method) {
          throw new BadRequestException(`Payment method ${line.paymentMethodId} not found or inactive`);
        }

        // Generate payment number
        let paymentNumber: string;
        try {
          paymentNumber = await this.settingsService.generateDocumentNumber('Payments');
        } catch {
          const allPayments = await paymentRepo.find({ select: ['paymentNumber'], withDeleted: true });
          let maxNum = 0;
          for (const p of allPayments) {
            const match = p.paymentNumber.match(/^PAY-(\d+)$/);
            if (match) maxNum = Math.max(maxNum, parseInt(match[1]));
          }
          paymentNumber = `PAY-${(maxNum + 1).toString().padStart(6, '0')}`;
        }

        const settlementStatus = method.requiresSettlement
          ? SettlementStatusEnum.PENDING
          : SettlementStatusEnum.NOT_APPLICABLE;

        const notes = line.reference
          ? `${line.reference} - Payment for ${order.orderNumber}${invoice ? ` (${invoice.invoiceNumber})` : ''}`
          : `Payment for ${order.orderNumber}${invoice ? ` (${invoice.invoiceNumber})` : ''}`;

        const payment = paymentRepo.create({
          paymentNumber,
          status: PaymentStatus.COMPLETED,
          paymentMethodId: method.id,
          settlementStatus,
          paymentDate: new Date(),
          amount: Number(line.amount),
          customerId: order.customerId,
          invoiceId: invoice ? invoice.id : null,
          notes,
        });

        const savedPayment = await paymentRepo.save(payment);

        // Post to accounting (don't fail the whole transaction on accounting errors)
        try {
          const fullPayment = await paymentRepo.findOne({
            where: { id: savedPayment.id },
            relations: ['customer', 'paymentMethodEntity'],
          });
          if (fullPayment) {
            await this.accountingService.postCustomerPaymentEntry(fullPayment, 'system');
          }
        } catch (error) {
          this.logger.error(`Failed to post accounting entry for payment ${savedPayment.paymentNumber}: ${error.message}`);
        }

        // Audit log
        await this.auditLogService.log('CREATE', 'Payment', `Created payment: ${paymentNumber} for ${order.orderNumber}`, {
          entityId: savedPayment.id,
          userId: 'system',
          newValues: { paymentNumber, amount: line.amount, paymentMethodId: method.id },
        });
      }

      // Update order paid amount
      await orderRepo.update(order.id, { paidAmount: newPaidAmount });

      // Update invoice if exists
      if (invoice) {
        invoice.paidAmount = newPaidAmount;
        invoice.calculateTotals();
        invoice.updateStatus();
        await invoiceRepo.save(invoice);
      }
    });

    return this.findById(id);
  }
```

**Step 3: Verify compilation**

Run: `cd /home/blur/erp2/backend && npx tsc --noEmit --pretty 2>&1 | head -30`
Expected: No errors related to `sales-order.service.ts`

**Step 4: Commit**

```bash
git add backend/src/modules/sales/services/sales-order.service.ts
git commit -m "feat: add recordPayments batch method with transaction support"
```

---

### Task 3: Add batch endpoint to controller

**Files:**
- Modify: `backend/src/modules/sales/controllers/sales-order.controller.ts`

**Step 1: Add import for the new DTO**

At the import from `../dto/sales-order.dto`, add `RecordPaymentsDto`:

```typescript
import {
  CreateSalesOrderDto,
  UpdateSalesOrderDto,
  QuerySalesOrdersDto,
  SalesOrderResponseDto,
  SalesOrderSummaryDto,
  RecordPaymentsDto,
} from '../dto/sales-order.dto';
```

**Step 2: Add the endpoint**

Add this method right **before** the existing `recordPayment` endpoint (before line 291). It must come before `:id/record-payment` to avoid route conflicts:

```typescript
  @Post(':id/record-payments')
  @ApiOperation({ summary: 'Record multiple split payments for a sales order (atomic)' })
  @ApiParam({ name: 'id', description: 'Sales order ID', type: 'string' })
  @ApiResponse({
    status: 200,
    description: 'Payments recorded successfully',
    type: SalesOrderResponseDto,
  })
  @ApiResponse({ status: 404, description: 'Sales order not found' })
  @ApiResponse({ status: 400, description: 'Invalid payment data' })
  async recordPayments(
    @Param('id', ParseUUIDPipe) id: string,
    @Body() body: RecordPaymentsDto,
  ) {
    const data = await this.salesOrderService.recordPayments(id, body.payments);
    return { data };
  }
```

**Step 3: Verify compilation**

Run: `cd /home/blur/erp2/backend && npx tsc --noEmit --pretty 2>&1 | head -20`
Expected: No errors

**Step 4: Commit**

```bash
git add backend/src/modules/sales/controllers/sales-order.controller.ts
git commit -m "feat: add POST record-payments batch endpoint"
```

---

### Task 4: Add frontend API method

**Files:**
- Modify: `frontend/src/services/salesApi.ts`

**Step 1: Add the batch payment API method**

Add this method right after `recordOrderPayment` (after line 137):

```typescript
  async recordOrderPayments(id: string, payments: { paymentMethodId: string; amount: number; reference?: string }[]) {
    return ApiService.post<{ data: SalesOrder }>(`sales-orders/${id}/record-payments`, { payments })
  },
```

**Step 2: Commit**

```bash
git add frontend/src/services/salesApi.ts
git commit -m "feat: add recordOrderPayments API method"
```

---

### Task 5: Create PaymentDialog component

**Files:**
- Create: `frontend/src/components/sales/PaymentDialog.tsx`

**Step 1: Create the component**

Create `frontend/src/components/sales/PaymentDialog.tsx` with the following content:

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

interface PaymentDialogProps {
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

export default function PaymentDialog({
  open,
  onClose,
  onSubmit,
  orderNumber,
  totalAmount,
  paidAmount,
}: PaymentDialogProps) {
  const outstandingBalance = Math.max(0, totalAmount - paidAmount)
  const [paymentMethods, setPaymentMethods] = useState<any[]>([])
  const [lines, setLines] = useState<PaymentLine[]>([])
  const [submitting, setSubmitting] = useState(false)
  const [error, setError] = useState<string | null>(null)

  // Load payment methods and initialize first line
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
    // Validate
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
        {/* Order Summary */}
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

        {/* Payment Lines */}
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

        {/* Totals */}
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

**Step 2: Commit**

```bash
git add frontend/src/components/sales/PaymentDialog.tsx
git commit -m "feat: create PaymentDialog component with split payment support"
```

---

### Task 6: Replace inline payment UI with Pay button + dialog on OrdersPage

**Files:**
- Modify: `frontend/src/pages/sales/OrdersPage.tsx`

**Step 1: Add state and import for PaymentDialog**

Near the top imports, add:
```typescript
import PaymentDialog from '@/components/sales/PaymentDialog'
```

In the state declarations (around line 163-165), replace:
```typescript
  const [paymentAmount, setPaymentAmount] = useState('')
  const [selectedPaymentMethodId, setSelectedPaymentMethodId] = useState<string>('')
  const [paymentMethods, setPaymentMethods] = useState<any[]>([])
```
with:
```typescript
  const [paymentDialogOpen, setPaymentDialogOpen] = useState(false)
```

**Step 2: Remove the payment methods loading useEffect**

Delete the useEffect block at lines 262-273 that loads payment methods:
```typescript
  // Load active payment methods for the payment dropdown
  useEffect(() => {
    paymentMethodsApi.getActive().then((methods: any) => {
      ...
    })
  }, [])
```

Also remove the `paymentMethodsApi` import at line 52 if no longer used elsewhere in the file.

**Step 3: Replace handleRecordPayment**

Replace the `handleRecordPayment` function (lines 484-531) with:

```typescript
  const handleRecordPayments = async (payments: { paymentMethodId: string; amount: number; reference?: string }[]) => {
    if (!selectedOrder) return

    const totalAdding = payments.reduce((sum, p) => sum + p.amount, 0)
    const newPaidAmount = (selectedOrder.paidAmount || 0) + totalAdding

    setIsLoading(true)
    try {
      // Optimistic update
      dispatch(updateOrderInPlace({ ...selectedOrder, paidAmount: newPaidAmount }))

      const response = await salesApi.recordOrderPayments(selectedOrder.id, payments)
      dispatch(updateOrderInPlace(response.data))
      dispatch(fetchOrderById(selectedOrder.id) as any)
      dispatch(fetchInvoices({ page: 1, limit: 20 }))
      showSuccess(`Payment of ${formatCurrency(totalAdding)} recorded successfully.`)
    } catch (error: any) {
      // Revert optimistic update
      dispatch(updateOrderInPlace(selectedOrder))
      throw error // Re-throw so PaymentDialog can show the error
    } finally {
      setIsLoading(false)
    }
  }
```

**Step 4: Replace inline payment controls in the Paid row**

Find the "Paid" table row (around line 1866-1936). Replace the inline `Select` dropdown and `TextField` with just the paid amount display. The payment method selection and amount input now live in the dialog.

Replace the block from `{!selectedOrder.isFulfilled && (` (line 1877) through the closing `</>` and `)}` (around line 1936) with nothing — just keep the paid amount Typography.

**Step 5: Replace the Balance row preview**

In the Balance row (around lines 1941-1966), remove the `paymentAmount` calculation logic. The balance is simply `totalAmount - paidAmount` now (no preview of pending payment).

Replace the balance calculation with:
```typescript
{(() => {
  const balance = (selectedOrder.totalAmount || 0) - (selectedOrder.paidAmount || 0)
  return balance < 0 ? `-${formatCurrency(Math.abs(balance))}` : formatCurrency(balance)
})()}
```

Remove the "(after payment)" conditional Typography.

**Step 6: Replace the Pay/Unpay button**

Find the button section (around lines 1967-1995). Replace the Record Payment / Pay Remaining button logic. The Pay button should now open the dialog:

Change the onClick from `handleRecordPayment` to `() => setPaymentDialogOpen(true)`.

Remove the `paymentAmount` check from button label logic — the button simply says "Pay" when unpaid, "Pay More" when partially paid.

**Step 7: Add PaymentDialog component render**

Add the PaymentDialog component at the end of the JSX, before the closing fragment or main container:

```tsx
{selectedOrder && (
  <PaymentDialog
    open={paymentDialogOpen}
    onClose={() => setPaymentDialogOpen(false)}
    onSubmit={handleRecordPayments}
    orderNumber={selectedOrder.orderNumber}
    totalAmount={selectedOrder.totalAmount || 0}
    paidAmount={selectedOrder.paidAmount || 0}
  />
)}
```

**Step 8: Clean up unused references**

Search the file for any remaining references to `paymentAmount`, `selectedPaymentMethodId`, or `paymentMethods` state and remove them. These may appear in:
- The `handleRecordPayment` error handler setting `setPaymentAmount`
- Any other places referencing the old state

**Step 9: Verify frontend compiles**

Run: `cd /home/blur/erp2/frontend && npx tsc --noEmit 2>&1 | head -30`
Expected: No errors (or only pre-existing unrelated warnings)

**Step 10: Commit**

```bash
git add frontend/src/pages/sales/OrdersPage.tsx
git commit -m "feat: replace inline payment controls with PaymentDialog"
```

---

### Task 7: Manual testing and polish

**Step 1: Start development servers**

Run: `cd /home/blur/erp2 && docker compose up -d`

**Step 2: Test the flow**

1. Navigate to http://localhost:3000/sales
2. Select an unpaid order
3. Verify the "Pay" button appears (no inline dropdown/amount)
4. Click "Pay" — dialog opens with order summary
5. Verify first line auto-fills with outstanding balance and CASH method
6. Click "Add Payment Line" — second line appears with remaining amount
7. Change method on second line to a different payment method
8. Add a reference to one of the lines
9. Click "Record Payment" — should succeed
10. Verify order shows updated paid amount
11. Verify the Payments page shows 2 new payment records
12. Verify accounting journal entries were created (check Accounting > Journal Entries)

**Step 3: Test edge cases**

- Overpayment: enter amount > outstanding balance → warning shown but allows submission
- Zero total: clear amounts → Record Payment button disabled
- Single line: delete second line → first line cannot be deleted
- Already paid order: verify Unpay/Refund buttons still work

**Step 4: Fix any issues found, then commit**

```bash
git add -A
git commit -m "fix: polish payment dialog after testing"
```
