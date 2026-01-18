# Price List User Guide

**Version**: 1.0
**Target Audience**: ERP System Users and Administrators
**Last Updated**: January 2026

---

## Table of Contents

1. [Introduction](#introduction)
2. [Getting Started](#getting-started)
3. [Managing Price Lists](#managing-price-lists)
4. [Managing Product Prices](#managing-product-prices)
5. [Customer Price Assignment](#customer-price-assignment)
6. [Advanced Features](#advanced-features)
7. [Best Practices](#best-practices)
8. [Troubleshooting](#troubleshooting)
9. [FAQs](#faqs)

---

## Introduction

### What are Price Lists?

Price lists are collections of product prices that can be assigned to different customer groups. They allow you to maintain multiple pricing strategies simultaneously, such as retail, wholesale, VIP customer pricing, or seasonal promotional pricing.

### Benefits

- **Multiple Pricing Tiers**: Create unlimited price lists for different customer segments
- **Automatic Pricing**: Customers automatically get their assigned price list pricing
- **Easy Management**: Update prices in bulk, apply percentage changes, or copy entire price lists
- **Time-Based Pricing**: Set effective dates for seasonal or promotional pricing
- **Margin Tracking**: Track cost basis and profit margins for each product in each price list

### Key Concepts

- **Price List**: A named collection of prices (e.g., "Retail", "Wholesale", "VIP")
- **Price List Item**: Individual product price within a price list
- **Default Price List**: The price list used for customers without a specific assignment
- **Effective Dates**: Optional date range when a price list is active

---

## Getting Started

### Accessing Price Lists

1. Log in to the ERP system
2. Navigate to **Settings** in the main sidebar
3. Click on **Price Lists**

You'll see a list of all existing price lists with their status and details.

### Understanding the Price List Interface

The main price list page shows:
- **Code**: Unique identifier (e.g., "RETAIL", "WHOLESALE")
- **Name**: Display name of the price list
- **Status**: Active or Inactive
- **Default**: Indicator showing which is the default price list
- **Effective Dates**: When the price list is valid (if set)
- **Actions**: Buttons to edit, copy, or delete the price list

---

## Managing Price Lists

### Creating a New Price List

1. Click the **"+ Create Price List"** button in the top-right corner
2. Fill in the required information:
   - **Code**: Unique identifier (e.g., "WHOLESALE_2026")
     - Use uppercase letters, numbers, underscores, and hyphens
     - Must be unique across all price lists
   - **Name**: Display name (e.g., "Wholesale Price List 2026")
   - **Description**: Optional detailed description
   - **Active**: Check to make the price list immediately active
   - **Set as Default**: Check to make this the default price list
   - **Effective From**: Optional start date
   - **Effective To**: Optional end date
3. Click **"Create"** to save

**Tips**:
- Use descriptive codes that clearly identify the price list purpose
- Only one price list can be the default at a time
- Leave effective dates blank for permanent price lists

### Editing a Price List

1. Click the **Edit** button (pencil icon) next to the price list
2. Modify any of the following:
   - Name
   - Description
   - Active status
   - Effective dates
3. Click **"Save"** to apply changes

**Note**: You cannot change the code after creation.

### Deleting a Price List

1. Click the **Delete** button (trash icon) next to the price list
2. Confirm the deletion in the dialog

**Important**:
- Deletion is a "soft delete" - the price list is marked as deleted but data is preserved
- You cannot delete the default price list - set another price list as default first
- Customers assigned to this price list will fall back to the default price list

### Setting a Default Price List

**Option 1**: When creating or editing a price list
- Check the **"Set as Default"** checkbox

**Option 2**: From the price list details page
- Click the **"Set as Default"** button in the top-right corner

**Note**: The previous default price list will automatically lose its default status.

---

## Managing Product Prices

### Viewing Product Prices

1. Click on a price list name to open the details page
2. You'll see a table of all products with prices in this price list
3. The table shows:
   - Product name and barcode
   - Current price
   - Cost basis (if set)
   - Margin percentage (automatically calculated)
   - Notes

### Adding Prices to a Price List

**Method 1: Inline Adding (Single Product)**

1. Open the price list details page
2. Scroll to the product table
3. Click **"+ Add Product"** button
4. Select the product from the dropdown
5. Enter the price (required)
6. Optionally enter:
   - Cost basis (for margin calculation)
   - Notes (e.g., "Promotional pricing")
7. Click **"Save"** or press Enter

**Method 2: Bulk Update (Multiple Products)**

1. Open the price list details page
2. Click the **"Bulk Update"** button
3. In the dialog:
   - Select multiple products
   - Enter prices for each product
   - Optionally enter cost basis and notes
4. Click **"Update Prices"**

**Tips**:
- Margin percentage is automatically calculated from: `((price - costBasis) / price) * 100`
- You can update existing prices using the same methods

### Editing Product Prices

**Inline Editing**:
1. Click directly on any price, cost basis, or notes field in the table
2. Edit the value
3. Press Enter or click outside the field to save
4. Changes are saved immediately

**Bulk Editing**:
1. Use the bulk update feature (see above)
2. Update multiple products at once

### Removing Product Prices

1. Find the product in the price list details table
2. Click the **Delete** button (trash icon) in the row
3. Confirm the deletion

**Note**: This removes the price from this specific price list only. The product itself is not affected.

---

## Customer Price Assignment

### Assigning a Price List to a Customer

1. Navigate to **Sales** > **Customers**
2. Create a new customer or edit an existing one
3. In the customer form, find the **"Price List"** dropdown
4. Select the appropriate price list
5. Save the customer

**Effect**: When creating sales orders for this customer, prices will automatically come from their assigned price list.

### Default Price List Behavior

- Customers without an assigned price list automatically use the **default price list**
- If no price exists in the assigned price list, the system falls back to the default price list
- During the migration period, the system may fall back to legacy pricing (this is temporary)

---

## Advanced Features

### Copying a Price List

Copying is useful for:
- Creating next year's pricing based on current prices
- Creating a promotional price list based on retail prices
- Testing price changes without affecting the original

**Steps**:
1. Open the price list you want to copy
2. Click the **"Copy Price List"** button in the top-right corner
3. In the dialog:
   - Enter a new **Code** (must be unique)
   - Enter a new **Name**
   - Optionally add a **Description**
4. Click **"Copy"**

**Result**: A new price list is created with all the same product prices as the original.

### Applying Percentage Adjustments

Use this feature to increase or decrease all prices in a price list by a percentage.

**Common Use Cases**:
- Annual price increase for inflation
- Promotional discounts
- Quick pricing strategy changes

**Steps**:
1. Open the price list details page
2. Click the **"Adjust Prices"** button
3. In the dialog:
   - Enter the **Percentage Change**:
     - Positive number = increase (e.g., 10 = 10% increase)
     - Negative number = decrease (e.g., -15 = 15% discount)
   - Check **"Adjust Cost Basis"** if you want to adjust costs too (usually unchecked)
4. Click **"Apply Adjustment"**

**Example**: If a product price is $100 and you apply a 10% increase, the new price will be $110.

**Warning**: This action cannot be undone. It's recommended to copy the price list first if you're unsure.

### Using Effective Dates

Effective dates allow you to schedule when a price list becomes active or expires.

**Setting Up Time-Based Pricing**:
1. Create or edit a price list
2. Set **Effective From** date (when prices become active)
3. Set **Effective To** date (when prices expire)
4. Save the price list

**Use Cases**:
- Holiday promotional pricing (Dec 1 - Dec 31)
- Seasonal pricing (Summer prices vs Winter prices)
- Contract-based pricing with specific date ranges

**System Behavior**:
- Before the "Effective From" date: Price list is not used
- Between dates: Price list is active
- After "Effective To" date: Price list expires and system falls back to default

---

## Best Practices

### Naming Conventions

**Recommended Code Format**:
- `RETAIL` - Standard retail pricing
- `WHOLESALE` - Wholesale pricing
- `VIP` - VIP customer pricing
- `PROMO_2026_SUMMER` - Promotional pricing with year and season

**Recommended Name Format**:
- Clear, descriptive names that users can understand
- Include year if relevant: "Wholesale Price List 2026"
- Include purpose: "Summer Promotional Pricing"

### Price List Setup Workflow

1. **Create the price list**: Start with a clear code and name
2. **Copy from existing** (optional): If similar to another price list
3. **Add product prices**: Use bulk update for efficiency
4. **Review margins**: Check that margins are acceptable
5. **Test with a customer**: Assign to one customer and create a test sales order
6. **Roll out**: Assign to all relevant customers

### Maintaining Price Lists

**Regular Tasks**:
- **Monthly**: Review margins and compare to costs
- **Quarterly**: Update prices based on cost changes
- **Annually**: Create next year's price lists with inflation adjustments
- **As needed**: Update promotional or seasonal pricing

**Audit Checklist**:
- [ ] All active products have prices in default price list
- [ ] All customers have an assigned price list or rely on default
- [ ] Effective dates are current and accurate
- [ ] Margins meet business requirements
- [ ] Inactive price lists are archived (soft deleted)

### Data Integrity

**Ensure Complete Coverage**:
- Every active product should have a price in the default price list
- Before making a price list the default, verify it has prices for all products
- Regularly check for products without prices

**Backup Before Major Changes**:
- Copy price lists before bulk adjustments
- Test percentage adjustments on a copy first
- Document the reason for price changes in the notes field

---

## Troubleshooting

### Issue: Wrong Price Shows in Sales Order

**Possible Causes**:
1. Customer is assigned to wrong price list
2. Product doesn't have a price in customer's price list
3. Price list is inactive or outside effective date range

**Solutions**:
1. Check customer's assigned price list in customer details
2. Verify product has a price in that price list
3. Check price list status and effective dates
4. If still incorrect, check the audit logs for recent price changes

### Issue: Cannot Set Price List as Default

**Error Message**: "Price list must be active to set as default"

**Solution**:
1. Edit the price list
2. Check the "Active" checkbox
3. Save the price list
4. Try setting as default again

### Issue: Bulk Update Fails

**Common Errors**:
- "Product not found" - Product ID is invalid or product was deleted
- "Price must be positive" - Price is zero or negative
- "Duplicate product" - Same product appears twice in the update

**Solutions**:
1. Verify all product IDs are valid
2. Ensure all prices are greater than zero
3. Remove duplicate products from the bulk update
4. Try updating in smaller batches (max 500 products)

### Issue: Price List Shows as Empty

**Possible Causes**:
1. No prices have been added yet
2. All prices were deleted
3. Viewing a newly copied price list

**Solutions**:
1. Use the "Add Product" or "Bulk Update" feature to add prices
2. If prices were accidentally deleted, contact system administrator for recovery
3. After copying, verify that items were copied successfully

---

## FAQs

### Q1: How many price lists can I create?

**A**: There is no limit. You can create as many price lists as needed for your business.

### Q2: Can a customer have multiple price lists?

**A**: No, each customer can only be assigned to one price list at a time. However, the system can fall back to the default price list if a product doesn't have a price in the customer's assigned list.

### Q3: What happens if I delete a price list that customers are using?

**A**: The price list is soft-deleted (marked inactive but data preserved). Customers assigned to this price list will automatically fall back to the default price list for pricing.

### Q4: Can I import prices from a CSV file?

**A**: This feature is planned for a future release (Phase 9). Currently, use the bulk update feature for efficient price updates.

### Q5: How do I see price history?

**A**: Price change history is tracked in the audit logs. Navigate to **System** > **Audit Logs** and filter by "PriceListItem" entity to see price changes.

### Q6: Can I schedule future price changes?

**A**: Yes, create a new price list with effective dates. Set the "Effective From" date to when you want the new prices to take effect.

### Q7: What's the difference between deactivating and deleting a price list?

**A**:
- **Deactivate**: Price list remains visible but cannot be used for new transactions
- **Delete**: Price list is soft-deleted and hidden from most views

Both preserve historical data.

### Q8: Can I export price lists to Excel?

**A**: This feature is planned for a future release. For now, you can view all prices in the price list details page.

### Q9: How do I bulk update prices from a supplier price change?

**A**:
1. Get the supplier's new pricing
2. Open the relevant price list
3. Use the bulk update feature or percentage adjustment
4. If it's a specific percentage, use "Adjust Prices" feature
5. If it's specific products, use the bulk update with the new prices

### Q10: What's the margin percentage calculation?

**A**: Margin % = ((Price - Cost Basis) / Price) × 100

Example: If price is $100 and cost is $80, margin = (($100 - $80) / $100) × 100 = 20%

---

## Additional Resources

- **API Documentation**: [PRICE_LIST_API.md](./PRICE_LIST_API.md) - For developers integrating with the API
- **Migration Guide**: [PRICE_LIST_MIGRATION_PLAN.md](../PRICE_LIST_MIGRATION_PLAN.md) - Technical migration details
- **System Documentation**: [CLAUDE.md](../CLAUDE.md) - Complete system documentation
- **Support**: Contact your system administrator or development team for assistance

---

## Change Log

- **v1.0** (January 2026): Initial release with complete price list management system

---

**Document Maintained By**: ERP Development Team
**Last Review Date**: January 13, 2026
**Next Review Date**: April 13, 2026
