# Price List API Documentation

**Version**: 1.0
**Base URL**: `/api/price-lists`
**Authentication**: JWT required for all endpoints
**Last Updated**: January 2026

---

## Table of Contents

1. [Overview](#overview)
2. [Data Models](#data-models)
3. [API Endpoints](#api-endpoints)
4. [Examples](#examples)
5. [Error Handling](#error-handling)
6. [Best Practices](#best-practices)

---

## Overview

The Price List API provides comprehensive management of pricing schemes in the ERP system. It supports multiple price lists, default price lists, time-based pricing, bulk operations, and customer assignments.

### Key Features

- Multiple price lists per system (unlimited)
- Default price list designation
- Effective date ranges for time-based pricing
- Cost basis and margin tracking
- Bulk price updates
- Percentage adjustments
- Price list duplication
- Soft delete support
- Customer-to-price-list assignment

---

## Data Models

### PriceList

```typescript
interface PriceList {
  id: string;                    // UUID
  code: string;                  // Unique alphanumeric code (e.g., "RETAIL", "WHOLESALE")
  name: string;                  // Display name (e.g., "Retail Price List")
  description?: string;          // Optional description
  isDefault: boolean;            // Whether this is the default price list
  isActive: boolean;             // Active status
  effectiveFrom?: Date;          // Optional start date for time-based pricing
  effectiveTo?: Date;            // Optional end date for time-based pricing
  createdAt: Date;               // Creation timestamp
  updatedAt: Date;               // Last update timestamp
  deletedAt?: Date;              // Soft delete timestamp (null if active)
  items?: PriceListItem[];       // Related price list items
}
```

### PriceListItem

```typescript
interface PriceListItem {
  id: string;                    // UUID
  priceListId: string;           // Foreign key to PriceList
  productId: string;             // Foreign key to Product
  price: number;                 // Selling price (decimal 12,4)
  costBasis?: number;            // Cost basis for margin calculation (decimal 12,4)
  marginPercent?: number;        // Calculated margin percentage (decimal 5,2)
  notes?: string;                // Optional notes about this pricing
  createdAt: Date;               // Creation timestamp
  updatedAt: Date;               // Last update timestamp
  priceList?: PriceList;         // Related price list (if populated)
  product?: Product;             // Related product (if populated)
}
```

---

## API Endpoints

### 1. List All Price Lists

**Endpoint**: `GET /api/price-lists`

**Description**: Retrieve all price lists with pagination and filtering.

**Query Parameters**:
- `page` (number, optional): Page number (default: 1)
- `limit` (number, optional): Items per page (default: 10, max: 100)
- `search` (string, optional): Search by code or name
- `isActive` (boolean, optional): Filter by active status
- `isDefault` (boolean, optional): Filter by default status

**Response**: `200 OK`
```json
{
  "data": [
    {
      "id": "uuid-1",
      "code": "RETAIL",
      "name": "Retail Price List",
      "description": "Standard retail pricing",
      "isDefault": true,
      "isActive": true,
      "effectiveFrom": null,
      "effectiveTo": null,
      "createdAt": "2026-01-12T10:00:00Z",
      "updatedAt": "2026-01-12T10:00:00Z",
      "deletedAt": null
    }
  ],
  "meta": {
    "total": 2,
    "page": 1,
    "limit": 10,
    "totalPages": 1
  }
}
```

---

### 2. Get Price List by ID

**Endpoint**: `GET /api/price-lists/:id`

**Description**: Retrieve a single price list with all its items.

**URL Parameters**:
- `id` (string, required): Price list UUID

**Response**: `200 OK`
```json
{
  "data": {
    "id": "uuid-1",
    "code": "RETAIL",
    "name": "Retail Price List",
    "description": "Standard retail pricing",
    "isDefault": true,
    "isActive": true,
    "effectiveFrom": null,
    "effectiveTo": null,
    "createdAt": "2026-01-12T10:00:00Z",
    "updatedAt": "2026-01-12T10:00:00Z",
    "deletedAt": null,
    "items": [
      {
        "id": "item-uuid-1",
        "priceListId": "uuid-1",
        "productId": "product-uuid-1",
        "price": 100.0000,
        "costBasis": 80.0000,
        "marginPercent": 25.00,
        "notes": null,
        "createdAt": "2026-01-12T10:00:00Z",
        "updatedAt": "2026-01-12T10:00:00Z",
        "product": {
          "id": "product-uuid-1",
          "name": "Product A",
          "barcode": "12345"
        }
      }
    ]
  }
}
```

**Errors**:
- `404 Not Found`: Price list not found

---

### 3. Get Price List by Code

**Endpoint**: `GET /api/price-lists/code/:code`

**Description**: Retrieve a price list by its unique code.

**URL Parameters**:
- `code` (string, required): Price list code (e.g., "RETAIL")

**Response**: `200 OK` (same structure as Get by ID)

**Errors**:
- `404 Not Found`: Price list with specified code not found

---

### 4. Create Price List

**Endpoint**: `POST /api/price-lists`

**Description**: Create a new price list.

**Request Body**:
```json
{
  "code": "WHOLESALE",
  "name": "Wholesale Price List",
  "description": "Pricing for wholesale customers",
  "isDefault": false,
  "isActive": true,
  "effectiveFrom": "2026-01-01T00:00:00Z",
  "effectiveTo": null
}
```

**Validation Rules**:
- `code`: Required, unique, alphanumeric with underscores/hyphens, max 50 chars
- `name`: Required, max 255 chars
- `description`: Optional, max 1000 chars
- `isDefault`: Optional, boolean (default: false)
- `isActive`: Optional, boolean (default: true)
- `effectiveFrom`: Optional, ISO 8601 date
- `effectiveTo`: Optional, ISO 8601 date

**Response**: `201 Created`
```json
{
  "data": {
    "id": "uuid-2",
    "code": "WHOLESALE",
    "name": "Wholesale Price List",
    "description": "Pricing for wholesale customers",
    "isDefault": false,
    "isActive": true,
    "effectiveFrom": "2026-01-01T00:00:00Z",
    "effectiveTo": null,
    "createdAt": "2026-01-13T10:00:00Z",
    "updatedAt": "2026-01-13T10:00:00Z",
    "deletedAt": null
  }
}
```

**Errors**:
- `400 Bad Request`: Validation error (duplicate code, invalid format)
- `409 Conflict`: Price list with code already exists

---

### 5. Update Price List

**Endpoint**: `PATCH /api/price-lists/:id`

**Description**: Update price list metadata (does not update items).

**URL Parameters**:
- `id` (string, required): Price list UUID

**Request Body**: (all fields optional)
```json
{
  "name": "Updated Wholesale Price List",
  "description": "Updated description",
  "isActive": true,
  "effectiveFrom": "2026-02-01T00:00:00Z",
  "effectiveTo": "2026-12-31T23:59:59Z"
}
```

**Response**: `200 OK` (returns updated price list)

**Errors**:
- `404 Not Found`: Price list not found
- `400 Bad Request`: Validation error

---

### 6. Delete Price List (Soft Delete)

**Endpoint**: `DELETE /api/price-lists/:id`

**Description**: Soft delete a price list. Items are preserved but price list becomes inactive.

**URL Parameters**:
- `id` (string, required): Price list UUID

**Response**: `200 OK`
```json
{
  "message": "Price list deleted successfully"
}
```

**Errors**:
- `404 Not Found`: Price list not found
- `400 Bad Request`: Cannot delete default price list (change default first)

---

### 7. Set Default Price List

**Endpoint**: `POST /api/price-lists/:id/set-default`

**Description**: Set a price list as the system default. Previous default is automatically unset.

**URL Parameters**:
- `id` (string, required): Price list UUID

**Response**: `200 OK`
```json
{
  "data": {
    "id": "uuid-1",
    "code": "RETAIL",
    "name": "Retail Price List",
    "isDefault": true,
    "isActive": true,
    ...
  }
}
```

**Errors**:
- `404 Not Found`: Price list not found
- `400 Bad Request`: Price list is inactive

---

### 8. Get Effective Price Lists

**Endpoint**: `GET /api/price-lists/effective`

**Description**: Get all currently effective price lists (active and within date range).

**Response**: `200 OK`
```json
{
  "data": [
    {
      "id": "uuid-1",
      "code": "RETAIL",
      "name": "Retail Price List",
      "isDefault": true,
      "isActive": true,
      ...
    },
    {
      "id": "uuid-2",
      "code": "WHOLESALE",
      "name": "Wholesale Price List",
      "isDefault": false,
      "isActive": true,
      ...
    }
  ]
}
```

---

### 9. Get Default Price List

**Endpoint**: `GET /api/price-lists/default`

**Description**: Get the current default price list.

**Response**: `200 OK`
```json
{
  "data": {
    "id": "uuid-1",
    "code": "RETAIL",
    "name": "Retail Price List",
    "isDefault": true,
    "isActive": true,
    ...
  }
}
```

**Errors**:
- `404 Not Found`: No default price list configured

---

### 10. Get Price List Items

**Endpoint**: `GET /api/price-lists/:id/items`

**Description**: Get all items in a price list.

**URL Parameters**:
- `id` (string, required): Price list UUID

**Response**: `200 OK`
```json
{
  "data": [
    {
      "id": "item-uuid-1",
      "priceListId": "uuid-1",
      "productId": "product-uuid-1",
      "price": 100.0000,
      "costBasis": 80.0000,
      "marginPercent": 25.00,
      "notes": null,
      "product": {
        "id": "product-uuid-1",
        "name": "Product A",
        "barcode": "12345"
      }
    }
  ]
}
```

**Errors**:
- `404 Not Found`: Price list not found

---

### 11. Get Price for Product

**Endpoint**: `GET /api/price-lists/:id/products/:productId`

**Description**: Get the price for a specific product in a price list.

**URL Parameters**:
- `id` (string, required): Price list UUID
- `productId` (string, required): Product UUID

**Response**: `200 OK`
```json
{
  "data": {
    "id": "item-uuid-1",
    "priceListId": "uuid-1",
    "productId": "product-uuid-1",
    "price": 100.0000,
    "costBasis": 80.0000,
    "marginPercent": 25.00,
    "notes": null
  }
}
```

**Errors**:
- `404 Not Found`: Price list or product not found, or no price set for product

---

### 12. Bulk Update Prices

**Endpoint**: `POST /api/price-lists/:id/items/bulk`

**Description**: Create or update multiple product prices in a price list.

**URL Parameters**:
- `id` (string, required): Price list UUID

**Request Body**:
```json
{
  "items": [
    {
      "productId": "product-uuid-1",
      "price": 110.00,
      "costBasis": 85.00,
      "notes": "Updated pricing"
    },
    {
      "productId": "product-uuid-2",
      "price": 95.50,
      "costBasis": 70.00,
      "notes": null
    }
  ]
}
```

**Validation Rules**:
- `items`: Required array, min 1 item, max 1000 items
- `productId`: Required UUID
- `price`: Required, positive decimal
- `costBasis`: Optional, positive decimal
- `notes`: Optional, max 500 chars

**Response**: `200 OK`
```json
{
  "data": {
    "updated": 2,
    "items": [
      {
        "id": "item-uuid-1",
        "priceListId": "uuid-1",
        "productId": "product-uuid-1",
        "price": 110.0000,
        "costBasis": 85.0000,
        "marginPercent": 29.41,
        "notes": "Updated pricing"
      },
      {
        "id": "item-uuid-2",
        "priceListId": "uuid-1",
        "productId": "product-uuid-2",
        "price": 95.5000,
        "costBasis": 70.0000,
        "marginPercent": 36.39,
        "notes": null
      }
    ]
  }
}
```

**Errors**:
- `404 Not Found`: Price list not found
- `400 Bad Request`: Validation error (invalid product ID, negative price, etc.)

---

### 13. Copy Price List

**Endpoint**: `POST /api/price-lists/:id/copy`

**Description**: Duplicate a price list with all its items.

**URL Parameters**:
- `id` (string, required): Price list UUID to copy

**Request Body**:
```json
{
  "newCode": "WHOLESALE_2026",
  "newName": "Wholesale 2026 Price List",
  "newDescription": "Wholesale pricing for 2026"
}
```

**Validation Rules**:
- `newCode`: Required, unique, alphanumeric with underscores/hyphens, max 50 chars
- `newName`: Required, max 255 chars
- `newDescription`: Optional, max 1000 chars

**Response**: `201 Created`
```json
{
  "data": {
    "id": "uuid-3",
    "code": "WHOLESALE_2026",
    "name": "Wholesale 2026 Price List",
    "description": "Wholesale pricing for 2026",
    "isDefault": false,
    "isActive": true,
    "itemCount": 21
  }
}
```

**Errors**:
- `404 Not Found`: Source price list not found
- `409 Conflict`: New code already exists

---

### 14. Apply Percentage Adjustment

**Endpoint**: `POST /api/price-lists/:id/adjust`

**Description**: Increase or decrease all prices in a price list by a percentage.

**URL Parameters**:
- `id` (string, required): Price list UUID

**Request Body**:
```json
{
  "percentageChange": 10.0,
  "adjustCostBasis": false
}
```

**Validation Rules**:
- `percentageChange`: Required, decimal between -100 and 1000
  - Positive values increase prices (e.g., 10 = 10% increase)
  - Negative values decrease prices (e.g., -5 = 5% decrease)
- `adjustCostBasis`: Optional boolean (default: false)
  - If true, also adjusts cost basis by the same percentage

**Response**: `200 OK`
```json
{
  "data": {
    "priceListId": "uuid-1",
    "itemsUpdated": 21,
    "percentageChange": 10.0,
    "adjustedCostBasis": false
  }
}
```

**Errors**:
- `404 Not Found`: Price list not found
- `400 Bad Request`: Invalid percentage (out of range)

---

## Examples

### Example 1: Creating a New Price List with Items

```bash
# Step 1: Create the price list
curl -X POST http://localhost:3000/api/price-lists \
  -H "Authorization: Bearer YOUR_JWT_TOKEN" \
  -H "Content-Type: application/json" \
  -d '{
    "code": "WHOLESALE",
    "name": "Wholesale Price List",
    "description": "Pricing for wholesale customers",
    "isDefault": false,
    "isActive": true
  }'

# Response: { "data": { "id": "uuid-2", ... } }

# Step 2: Add prices for multiple products
curl -X POST http://localhost:3000/api/price-lists/uuid-2/items/bulk \
  -H "Authorization: Bearer YOUR_JWT_TOKEN" \
  -H "Content-Type: application/json" \
  -d '{
    "items": [
      {
        "productId": "product-uuid-1",
        "price": 90.00,
        "costBasis": 80.00
      },
      {
        "productId": "product-uuid-2",
        "price": 85.00,
        "costBasis": 70.00
      }
    ]
  }'
```

---

### Example 2: Applying a Promotional Discount

```bash
# Apply a 15% discount to all prices in a price list
curl -X POST http://localhost:3000/api/price-lists/uuid-2/adjust \
  -H "Authorization: Bearer YOUR_JWT_TOKEN" \
  -H "Content-Type: application/json" \
  -d '{
    "percentageChange": -15.0,
    "adjustCostBasis": false
  }'
```

---

### Example 3: Copying a Price List for a New Year

```bash
# Copy current price list to create next year's pricing
curl -X POST http://localhost:3000/api/price-lists/uuid-1/copy \
  -H "Authorization: Bearer YOUR_JWT_TOKEN" \
  -H "Content-Type: application/json" \
  -d '{
    "newCode": "RETAIL_2027",
    "newName": "Retail Price List 2027",
    "newDescription": "Retail pricing for 2027"
  }'

# Then apply a 5% increase for inflation
curl -X POST http://localhost:3000/api/price-lists/NEW_UUID/adjust \
  -H "Authorization: Bearer YOUR_JWT_TOKEN" \
  -H "Content-Type: application/json" \
  -d '{
    "percentageChange": 5.0,
    "adjustCostBasis": false
  }'
```

---

## Error Handling

### Standard Error Response

```json
{
  "statusCode": 400,
  "message": "Validation failed",
  "error": "Bad Request",
  "details": [
    {
      "field": "code",
      "message": "Code must be unique"
    }
  ]
}
```

### Common HTTP Status Codes

- `200 OK`: Successful request
- `201 Created`: Resource created successfully
- `400 Bad Request`: Validation error or invalid input
- `401 Unauthorized`: Missing or invalid JWT token
- `403 Forbidden`: Insufficient permissions
- `404 Not Found`: Resource not found
- `409 Conflict`: Duplicate resource (e.g., code already exists)
- `500 Internal Server Error`: Unexpected server error

---

## Best Practices

### 1. Price List Management

- **Use descriptive codes**: Use clear, uppercase codes like "RETAIL", "WHOLESALE", "VIP"
- **Set one default**: Always have exactly one default price list for new customers
- **Use effective dates**: Set date ranges for seasonal or promotional pricing
- **Document changes**: Use the `notes` field in price list items to track price changes

### 2. Bulk Operations

- **Batch updates**: Use bulk update endpoint for multiple products instead of individual requests
- **Limit batch size**: Keep bulk updates under 500 items per request for performance
- **Validate before bulk**: Test with a small batch before updating all items

### 3. Price Adjustments

- **Copy before adjusting**: Always copy a price list before applying percentage changes
- **Document adjustments**: Update price list description to note adjustment dates
- **Audit trail**: Check audit logs after bulk operations to verify changes

### 4. Performance

- **Use pagination**: Always paginate when fetching price lists (default: 10 per page)
- **Filter effectively**: Use `isActive` and `isDefault` filters to reduce result sets
- **Fetch only needed data**: Use specific endpoints (e.g., get by code) instead of list all

### 5. Integration with Sales

- **Customer assignment**: Assign customers to appropriate price lists
- **Fallback logic**: System automatically falls back to default price list
- **Legacy support**: During transition, prices fall back to legacy JSONB if not in price list

### 6. Migration

- **Gradual transition**: Keep both systems running during transition period
- **Monitor usage**: Check logs for legacy fallback usage
- **Complete migration**: Ensure all products have prices in all relevant price lists
- **Clean up after 30 days**: Remove deprecated JSONB fields after successful transition

---

## Related Documentation

- [Price List Migration Plan](../PRICE_LIST_MIGRATION_PLAN.md) - Complete migration documentation
- [CLAUDE.md](../CLAUDE.md) - Project overview and system documentation
- [API Authentication](./AUTH_API.md) - JWT authentication documentation
- [Customer API](./CUSTOMER_API.md) - Customer management and price list assignment

---

**Support**: For issues or questions, contact the development team or create an issue in the repository.
