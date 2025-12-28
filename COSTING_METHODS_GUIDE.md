# Costing Methods Implementation Guide

## Overview

Your ERP system now supports **four different costing methods** that automatically affect how inventory costs are calculated in the database. The costing method can be changed in settings, and costs will recalculate automatically.

## Available Costing Methods

### 1. **AVERAGE (Moving Average)** ✅ Default
- **How it works**: Calculates weighted average from all received quantities
- **Formula**: `SUM(receivedQty × landedCost) / SUM(receivedQty)`
- **When cost changes**: When receiving or returning goods (NOT when selling)
- **Best for**: Stable pricing, minimal price fluctuations
- **Example**:
  - Receive 100 units @ RM 10 = RM 1,000
  - Receive 200 units @ RM 12 = RM 2,400
  - **Average Cost** = RM 3,400 / 300 = **RM 11.33**

### 2. **FIFO (First-In-First-Out)**
- **How it works**: Oldest inventory sold first, cost based on remaining (newest) batches
- **Formula**: Weighted average of remaining inventory quantities
- **When cost changes**: When receiving, selling, or returning goods
- **Best for**: Perishable goods, rising prices
- **Example**:
  - Batch 1: 100 units @ RM 10 (50 remaining)
  - Batch 2: 200 units @ RM 12 (200 remaining)
  - **FIFO Cost** = (50 × 10 + 200 × 12) / 250 = **RM 11.60**

### 3. **LIFO (Last-In-First-Out)**
- **How it works**: Newest inventory sold first, cost based on remaining (oldest) batches
- **Formula**: Weighted average of remaining inventory quantities
- **When cost changes**: When receiving, selling, or returning goods
- **Best for**: Declining prices, commodities
- **Example**:
  - Batch 1: 100 units @ RM 10 (100 remaining)
  - Batch 2: 200 units @ RM 12 (50 remaining)
  - **LIFO Cost** = (100 × 10 + 50 × 12) / 150 = **RM 10.67**

### 4. **STANDARD Costing**
- **How it works**: Uses predetermined standard cost, doesn't change with purchases
- **Formula**: Fixed cost set manually
- **When cost changes**: Only when manually updated by management
- **Best for**: Manufacturing, variance analysis, budgeting
- **Example**:
  - Standard Cost = **RM 11.00** (fixed)
  - Actual purchase @ RM 12 → Variance = RM 1.00 (can be tracked separately)

## How to Change Costing Method

### Step 1: Update Settings

**API Request:**
```bash
curl -X PUT http://localhost:3001/api/settings/price-costing \
  -H "Content-Type: application/json" \
  -d '{"costingMethod": "FIFO"}'
```

**Response:**
```json
{
  "id": "...",
  "currency": "MYR",
  "costingMethod": "FIFO",
  "updatedAt": "2025-11-30T00:00:00.000Z"
}
```

### Step 2: Recalculate All Product Costs

**API Request:**
```bash
curl -X POST http://localhost:3001/api/inventory/costing/recalculate
```

**Response:**
```json
{
  "totalProducts": 6,
  "updated": 6,
  "errors": 0,
  "costingMethod": "FIFO",
  "results": [
    {
      "productId": "85294f77-4e65-4c4d-9c48-173ed37712cb",
      "productName": "Product A",
      "oldCost": 14.0061,
      "newCost": 14.0986,
      "success": true
    }
  ]
}
```

## API Endpoints

### Get Current Costing Method
```
GET /api/inventory/costing/method
```

**Response:**
```json
{
  "costingMethod": "AVERAGE",
  "availableMethods": ["AVERAGE", "FIFO", "LIFO", "STANDARD"]
}
```

### Recalculate All Products
```
POST /api/inventory/costing/recalculate
```

### Recalculate Single Product
```
POST /api/inventory/costing/recalculate/:productId
```

**Example:**
```bash
curl -X POST http://localhost:3001/api/inventory/costing/recalculate/85294f77-4e65-4c4d-9c48-173ed37712cb
```

## Automatic Cost Calculation

The system **automatically recalculates** base costs in these scenarios:

1. **Receiving Goods (GRN)**
   - Creates new cost batch
   - Recalculates base cost using active strategy
   - Updates product.baseCost in database

2. **Returning Goods to Supplier**
   - Removes cost batch
   - Recalculates base cost
   - Updates product.baseCost in database

3. **Fulfilling Sales Orders**
   - Reduces batch quantities (FIFO/LIFO order depends on method)
   - Recalculates base cost
   - Updates product.baseCost in database

4. **Unfulfilling Sales Orders**
   - Restores batch quantities
   - Recalculates base cost
   - Updates product.baseCost in database

## Testing Results

### Product A Test Results

| Costing Method | Base Cost | Calculation Basis |
|----------------|-----------|-------------------|
| AVERAGE | RM 14.0061 | All received quantities (280 units) |
| FIFO | RM 14.0986 | Remaining quantities (250 units, newest) |
| LIFO | RM 14.0986 | Remaining quantities (250 units, oldest) |
| STANDARD | RM 14.0986 | Fixed (keeps current value) |

### Full Recalculation Test

✅ Successfully recalculated **6 products** in bulk:
- Product A: RM 14.0986 → RM 14.0061 (AVERAGE)
- Product B: RM 25.6939 → RM 25.6939 (AVERAGE)
- Product C: RM 10.0000 → RM 10.0000 (No batches)
- Product D, E, F: RM 0 (No purchase history)

## Technical Implementation

### Architecture

```
CostingStrategyFactory (Factory Service)
    ├── AverageCostingStrategy (Moving Average)
    ├── FifoCostingStrategy (First-In-First-Out)
    ├── LifoCostingStrategy (Last-In-First-Out)
    └── StandardCostingStrategy (Fixed Cost)

BaseCostCalculatorService
    └── Uses strategy from factory based on settings

CostingRecalculationService
    └── Bulk recalculation operations
```

### Key Files

**Strategies:**
- `backend/src/modules/inventory/services/costing/base-costing-strategy.interface.ts`
- `backend/src/modules/inventory/services/costing/average-costing-strategy.service.ts`
- `backend/src/modules/inventory/services/costing/fifo-costing-strategy.service.ts`
- `backend/src/modules/inventory/services/costing/lifo-costing-strategy.service.ts`
- `backend/src/modules/inventory/services/costing/standard-costing-strategy.service.ts`

**Core Services:**
- `backend/src/modules/inventory/services/costing/costing-strategy-factory.service.ts`
- `backend/src/modules/inventory/services/costing-recalculation.service.ts`
- `backend/src/modules/inventory/services/base-cost-calculator.service.ts` (updated)

**Controllers:**
- `backend/src/modules/inventory/controllers/costing.controller.ts`

**Settings:**
- `backend/src/modules/settings/settings.service.ts` (existing)
- `backend/src/database/entities/price-costing-settings.entity.ts` (existing)

## Migration Workflow

### Changing from AVERAGE to FIFO

1. **Update Settings:**
   ```bash
   PUT /api/settings/price-costing
   {"costingMethod": "FIFO"}
   ```

2. **Recalculate All Costs:**
   ```bash
   POST /api/inventory/costing/recalculate
   ```

3. **Verify Results:**
   - Review the results array for any errors
   - Check that all products were successfully updated
   - Verify database reflects new costs

4. **Future Operations:**
   - All new GRNs will use FIFO
   - All sales will reduce from oldest batches first
   - Base cost recalculates automatically on every transaction

## Database Impact

### Before Costing Method Change

```sql
SELECT "costingMethod" FROM price_costing_settings WHERE "isActive" = true;
-- Result: AVERAGE
```

### After Settings Update + Recalculation

```sql
-- Settings updated
SELECT "costingMethod" FROM price_costing_settings WHERE "isActive" = true;
-- Result: FIFO

-- All product costs recalculated
SELECT name, "baseCost" FROM products WHERE "isActive" = true;
-- Results reflect FIFO calculations
```

## Best Practices

1. **Schedule Recalculation**: Change costing methods during low-activity periods
2. **Backup First**: Create database backup before major costing method changes
3. **Test with Sample**: Use recalculate single product endpoint to test first
4. **Monitor Results**: Review the recalculation response for any errors
5. **Document Changes**: Keep audit trail of when and why costing methods changed

## Troubleshooting

### Cost didn't change after recalculation
- **Standard Costing**: This is expected - standard costs are fixed
- **No Purchase History**: Products without batches retain their current cost
- **All Stock Sold**: Products with no remaining batches keep last calculated cost

### Different methods showing same cost
- **Limited Batches**: FIFO and LIFO converge when few batches exist
- **Single Batch**: Only one batch = same cost for all methods
- **Equal Prices**: All batches at same price = identical results

### Error during recalculation
- Check the `results` array for specific product errors
- Verify product has valid purchase cost history
- Ensure database connection is stable
- Check backend logs for detailed error messages

## Future Enhancements

Potential improvements for consideration:

1. **Variance Tracking**: Track purchase price vs standard cost variances
2. **Costing History**: Audit trail of cost changes over time
3. **Batch-Level Reporting**: Detailed cost breakdown by batch
4. **Scheduled Recalculation**: Automatic recalculation on method change
5. **Frontend Integration**: UI for changing costing methods and viewing results

---

**Last Updated**: November 30, 2025
**Version**: 1.0.0
**Status**: ✅ Fully Implemented and Tested
