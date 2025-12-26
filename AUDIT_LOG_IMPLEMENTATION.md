# Audit Log Implementation Guide

## Current Implementation Status

### ✅ **Fully Implemented:**

1. **Product Operations** (`backend/src/modules/inventory/services/product.service.ts`)
   - ✅ CREATE - Line 201-216
   - ❌ UPDATE - Not yet implemented
   - ❌ DELETE - Not yet implemented
   - ❌ RESTORE - Not yet implemented

2. **Customer Operations** (`backend/src/modules/sales/services/customer.service.ts`)
   - ✅ CREATE - Line 51-66
   - ✅ UPDATE - Line 215-231
   - ✅ DELETE - Line 296-310
   - ✅ RESTORE - Line 326-339

### 📝 **Ready for Implementation (imports added):**

The following services have the `AuditLogService` import added but need:
1. Constructor injection
2. Audit logging calls in create/update/delete/restore methods

- `sales-order.service.ts`
- `invoice.service.ts`
- `payment.service.ts`
- `supplier.service.ts`
- `purchase-order.service.ts`
- `goods-received-note.service.ts`
- `vendor-payment.service.ts`
- `category.service.ts`
- `stock-adjustment.service.ts`

## Implementation Pattern

### Step 1: Add Import (✅ DONE for all services)

```typescript
import { AuditLogService } from '../../audit-logs/services';
```

### Step 2: Inject in Constructor

```typescript
constructor(
  // ... existing dependencies
  private readonly auditLogService: AuditLogService,
) {}
```

### Step 3: Add Logging Calls

#### For CREATE operations:
```typescript
async create(dto: CreateDto): Promise<Entity> {
  const entity = await this.repository.save(dto);

  await this.auditLogService.log(
    'CREATE',
    'EntityName',
    `Created entity: ${entity.name}`,
    {
      entityId: entity.id,
      userId: 'system', // or get from request context
      newValues: {
        // Key fields that changed
        name: entity.name,
        // ... other important fields
      },
    }
  );

  return entity;
}
```

#### For UPDATE operations:
```typescript
async update(id: string, dto: UpdateDto): Promise<Entity> {
  const entity = await this.repository.findOne({ where: { id } });

  // Store old values BEFORE update
  const oldValues = {
    name: entity.name,
    // ... other tracked fields
  };

  Object.assign(entity, dto);
  const updated = await this.repository.save(entity);

  await this.auditLogService.log(
    'UPDATE',
    'EntityName',
    `Updated entity: ${updated.name}`,
    {
      entityId: id,
      userId: 'system',
      oldValues,
      newValues: {
        name: updated.name,
        // ... other tracked fields
      },
    }
  );

  return updated;
}
```

#### For DELETE operations (soft delete):
```typescript
async delete(id: string): Promise<void> {
  const entity = await this.repository.findOne({ where: { id } });

  await this.repository.softDelete(id);

  await this.auditLogService.log(
    'DELETE',
    'EntityName',
    `Deleted entity: ${entity.name}`,
    {
      entityId: id,
      userId: 'system',
      oldValues: {
        name: entity.name,
        // ... key fields
      },
    }
  );
}
```

#### For RESTORE operations:
```typescript
async restore(id: string): Promise<Entity> {
  const entity = await this.repository.findOne({
    where: { id },
    withDeleted: true
  });

  await this.repository.restore(id);

  await this.auditLogService.log(
    'RESTORE',
    'EntityName',
    `Restored entity: ${entity.name}`,
    {
      entityId: id,
      userId: 'system',
      newValues: {
        name: entity.name,
      },
    }
  );

  return entity;
}
```

## Entity-Specific Guidelines

### Sales Orders
Track: orderNumber, customerId, totalAmount, status, fulfilledDate

### Invoices
Track: invoiceNumber, customerId, totalAmount, paidAmount, status

### Payments
Track: paymentNumber, invoiceId, amount, paymentMethod, paymentDate

### Suppliers
Track: name, contactPerson, phone, email

### Purchase Orders
Track: orderNumber, supplierId, totalAmount, status, receivedDate

### Goods Received Notes
Track: grnNumber, purchaseOrderId, receivedDate, totalAmount

### Vendor Payments
Track: paymentNumber, supplierId, amount, paymentDate

### Categories
Track: name, parentId, hierarchyPath

### Stock Adjustments
Track: productId, adjustmentType, quantity, reason

## Testing the Implementation

After implementing audit logging for a service:

```bash
# Create a test record
curl -X POST http://localhost:3000/api/entity-endpoint \
  -H "Content-Type: application/json" \
  -d '{ "name": "Test" }'

# Check audit logs
curl http://localhost:3000/api/audit-logs | jq '.data[0]'

# Filter by entity type
curl "http://localhost:3000/api/audit-logs?entityType=EntityName" | jq '.data'
```

## Benefits of Current Implementation

1. ✅ **Non-intrusive** - Logging failures won't break the application
2. ✅ **Flexible** - Easy to add to any service
3. ✅ **Comprehensive** - Tracks who, what, when, and before/after values
4. ✅ **Searchable** - Rich filtering and query capabilities
5. ✅ **Performant** - Indexed database table with pagination
6. ✅ **Type-safe** - Full TypeScript support

## Quick Add Script

To quickly add audit logging to a service method:

1. Find the service file
2. Ensure `AuditLogService` is imported (✅ already done for listed services)
3. Add to constructor:
   ```typescript
   private readonly auditLogService: AuditLogService,
   ```
4. Add logging call after save/update/delete operations (see patterns above)

## Next Steps

To complete the full implementation:

1. Add constructor injection to the 9 services listed above
2. Add logging calls to create/update/delete/restore methods in each service
3. Test each implementation
4. Update Product service to include UPDATE, DELETE, RESTORE operations

Estimated time: ~2-3 hours for all services
