# Manual Test — Products Page Redesign (Issue #775)

**Scope:** Products list page, Product view page, Create/Edit product, Import
**Environment:** Frontend at `localhost:5173` (or deployed URL)
**Prerequisites:** At least 3 products in DB (1 active in-stock, 1 low-stock, 1 inactive). At least 1 product with price list items. At least 1 product with stock movements and order history.

---

## Section 1 — Products List Page

### Test 1.1 — Page Header & Action Buttons
| Step | Action | Expected |
|------|--------|----------|
| 1 | Navigate to `/inventory/products` | Page loads with title "Products" and subtitle |
| 2 | Check header actions area | **Import** button and **New Product** button are **both visible** in the header actions container, side by side |
| 3 | Check button order | Import comes **before** New Product (left to right) |
| 4 | Verify no Delete button anywhere | No Delete button in header or row actions |

### Test 1.2 — Import Button
| Step | Action | Expected |
|------|--------|----------|
| 1 | Click **Import** button | Import dialog opens |
| 2 | Close dialog | Dialog closes, returns to list |

### Test 1.3 — New Product Button
| Step | Action | Expected |
|------|--------|----------|
| 1 | Click **New Product** button | Navigates to `/inventory/products/create` |

### Test 1.4 — Product List Table Columns
| Step | Action | Expected |
|------|--------|----------|
| 1 | Observe table headers | Columns: Name, Category, Default Selling Price, Stock Qty, Active, Actions |
| 2 | Verify no "Price History" or "Cost History" column | These columns do **not** exist |
| 3 | Verify no "Delete" action | No Delete option anywhere |

### Test 1.5 — Row Action Menu
| Step | Action | Expected |
|------|--------|----------|
| 1 | Click the row action menu (⋮) on any product | Menu opens |
| 2 | Check menu items | Shows: **View Product**, **Edit Product**, **Set as Inactive** (or **Reactivate** if inactive) |
| 3 | Verify no Delete option | **Delete is NOT in the menu** |

### Test 1.6 — Row Click → View Product
| Step | Action | Expected |
|------|--------|----------|
| 1 | Click on a product **row** (not the action menu) | Navigates to `/inventory/products/{slug}/view` |

### Test 1.7 — Status Toggle (Active → Inactive)
| Step | Action | Expected |
|------|--------|----------|
| 1 | Open row action menu on an **active** product | Shows "Set as Inactive" |
| 2 | Click **Set as Inactive** | Product becomes inactive, success notification shown |
| 3 | Reopen the same row action | Now shows **"Reactivate"** instead |

### Test 1.8 — Status Toggle (Inactive → Active)
| Step | Action | Expected |
|------|--------|----------|
| 1 | Open row action menu on an **inactive** product | Shows "Reactivate" |
| 2 | Click **Reactivate** | Product becomes active, success notification shown |

### Test 1.9 — Filter: Search by Name or Barcode
| Step | Action | Expected |
|------|--------|----------|
| 1 | Type a product name in the search bar | List filters to matching products |
| 2 | Clear search | Full list returns |

### Test 1.10 — Filter: Status (Active / Inactive / All)
| Step | Action | Expected |
|------|--------|----------|
| 1 | Select **Active** status filter | Only active products shown |
| 2 | Select **Inactive** status filter | Only inactive products shown |
| 3 | Select **All** status filter | Both active and inactive products shown |

### Test 1.11 — Filter: Stock Status (In Stock / Low Stock / Out of Stock)
| Step | Action | Expected |
|------|--------|----------|
| 1 | Select **In Stock** filter | Only products with stock > threshold shown |
| 2 | Select **Low Stock** filter | Only products with 0 < stock ≤ threshold shown |
| 3 | Select **Out of Stock** filter | Only products with stock = 0 shown |

### Test 1.12 — Filter: Category
| Step | Action | Expected |
|------|--------|----------|
| 1 | Select a category from category filter | Only products in that category shown |

### Test 1.13 — Empty State
| Step | Action | Expected |
|------|--------|----------|
| 1 | Apply filters that match nothing (e.g. search "zzzzzzz") | Shows "No products found" empty state message |

### Test 1.14 — Pagination
| Step | Action | Expected |
|------|--------|----------|
| 1 | With >25 products, check pagination | Page shows 25 items per page by default |
| 2 | Change rows per page to 10 | List shows 10 items |
| 3 | Click next page | Next set of products loads |

### Test 1.15 — Sorting
| Step | Action | Expected |
|------|--------|----------|
| 1 | Click **Name** column header | Sorts by name ascending → descending on repeat click |
| 2 | Click **Stock Qty** column header | Sorts by stock quantity |

---

## Section 2 — Product View Page (3 Tabs)

### Test 2.1 — Page Header
| Step | Action | Expected |
|------|--------|----------|
| 1 | Navigate to a product view page | Page shows product **name** as title |
| 2 | Check title badge | Shows **Active** or **Inactive** status chip next to name |
| 3 | Check **Edit Product** button | Button is present in header |
| 4 | Click **Edit Product** | Navigates to `/inventory/products/{slug}/edit` |
| 5 | Click **back arrow** | Returns to `/inventory/products` |

### Test 2.2 — Tab Navigation
| Step | Action | Expected |
|------|--------|----------|
| 1 | Observe tabs | Three tabs visible: **Overview**, **Stock Movements**, **Order History** |
| 2 | Default tab is **Overview** | Overview content shown on page load |
| 3 | Click **Stock Movements** tab | Stock Movements content loads |
| 4 | Click **Order History** tab | Order History content loads |
| 5 | Check URL after tab switch | URL updates with `?tab=0`, `?tab=1`, `?tab=2` |

### Test 2.3 — No Price & Cost History Tabs
| Step | Action | Expected |
|------|--------|----------|
| 1 | Check all tabs | **No** "Price History" tab exists |
| 2 | Check all tabs | **No** "Cost History" tab exists |

---

## Section 3 — Overview Tab

### Test 3.1 — Basic Info Card
| Step | Action | Expected |
|------|--------|----------|
| 1 | View Overview tab | **Basic Info** card visible |
| 2 | Check fields | Shows: Barcode, Type, Category, Description |
| 3 | Check empty fields | Empty fields show **"—"** |

### Test 3.2 — Pricing Card
| Step | Action | Expected |
|------|--------|----------|
| 1 | View Overview tab | **Pricing** card visible |
| 2 | Check Cost Price | Shows formatted cost price |
| 3 | Check price list items | Shows each price list name + price, ordered by priority |
| 4 | Check MarginChip | Each price list shows a margin chip |
| 5 | Product with no price lists | Shows **"—"** in pricing area |

### Test 3.3 — Stock Card
| Step | Action | Expected |
|------|--------|----------|
| 1 | View Overview tab | **Stock** card visible |
| 2 | Check stock status chip | Shows **In Stock** / **Low Stock** / **Out of Stock** chip |
| 3 | Check stock quantity | Shows formatted number |
| 4 | Low stock product (qty ≤ threshold, > 0) | Chip shows **Low Stock** |
| 5 | Out of stock product (qty = 0) | Chip shows **Out of Stock** |

### Test 3.4 — Notes Card
| Step | Action | Expected |
|------|--------|----------|
| 1 | View Overview tab | **Notes** card visible |
| 2 | Product with notes | Notes text displayed |
| 3 | Product without notes | Shows **"—"** |

---

## Section 4 — Stock Movements Tab

### Test 4.1 — Stock Movements Table
| Step | Action | Expected |
|------|--------|----------|
| 1 | Click **Stock Movements** tab | Table loads with columns: Date, Type, Reference, Qty Change, Balance, Notes, Action |
| 2 | Check inward movement | Qty Change shows **"+"** prefix |
| 3 | Check outward movement | Qty Change shows **"-"** prefix |

### Test 4.2 — Navigate to Sales Order from Movement
| Step | Action | Expected |
|------|--------|----------|
| 1 | Find a row with `sales_order` reference | Row has a **View** button in the Action column |
| 2 | Click **View** | Navigates to the sales order detail page |

### Test 4.3 — Navigate to Purchase Order from Movement
| Step | Action | Expected |
|------|--------|----------|
| 1 | Find a row with `purchase_order` reference | Row has a **View** button in the Action column |
| 2 | Click **View** | Navigates to the purchase order detail page |

### Test 4.4 — Non-navigable Movement
| Step | Action | Expected |
|------|--------|----------|
| 1 | Find a row with non-order reference (e.g. adjustment) | **View** button is **disabled** |

### Test 4.5 — Empty State
| Step | Action | Expected |
|------|--------|----------|
| 1 | View Stock Movements for a product with no movements | Shows **"No stock movements recorded for this product"** |

### Test 4.6 — Pagination
| Step | Action | Expected |
|------|--------|----------|
| 1 | With >25 movements | Shows 25 per page, pagination controls visible |
| 2 | Change rows per page | Updates the displayed rows |

---

## Section 5 — Order History Tab

### Test 5.1 — Order History Table
| Step | Action | Expected |
|------|--------|----------|
| 1 | Click **Order History** tab | Table loads with columns: Type, Order #, Customer/Vendor, Date, Order Status, Quantity, Sub-Total, Action |
| 2 | Check Sales Order row | Type shows "Sales Order", status chips show Payment + Fulfillment |
| 3 | Check Purchase Order row | Type shows "Purchase Order", status chips show Payment + Received |

### Test 5.2 — Navigate to Order from History
| Step | Action | Expected |
|------|--------|----------|
| 1 | Click **View** on a Sales Order row | Navigates to `/sales/orders/{orderNumber}/view` |
| 2 | Click **View** on a Purchase Order row | Navigates to `/purchasing/orders/{orderNumber}/view` |

### Test 5.3 — Empty State
| Step | Action | Expected |
|------|--------|----------|
| 1 | View Order History for a product with no orders | Shows **"No order history found for this product"** |

---

## Section 6 — Create / Edit Product

### Test 6.1 — Create Product Page
| Step | Action | Expected |
|------|--------|----------|
| 1 | Click **New Product** from list page | Navigates to create page |
| 2 | Check form sections | Form shows fields: Name, Barcode, Type, Category, Description, Cost Price, Price List Prices, Stock Qty, Notes |
| 3 | Submit with valid data | Product created, navigates back to list, success notification |
| 4 | Submit with duplicate barcode | Shows validation error |

### Test 6.2 — Edit Product Page
| Step | Action | Expected |
|------|--------|----------|
| 1 | Click **Edit Product** from view page or row action | Navigates to edit page |
| 2 | Check form | Form pre-filled with existing product data |
| 3 | Modify a field and save | Product updated, success notification |
| 4 | Check form layout | Form is **in-place** (not split into separate sections/pages) |

### Test 6.3 — No Delete on Create/Edit
| Step | Action | Expected |
|------|--------|----------|
| 1 | View create page | **No Delete button** |
| 2 | View edit page | **No Delete button** |

---

## Section 7 — Product Not Found

### Test 7.1 — Invalid Slug
| Step | Action | Expected |
|------|--------|----------|
| 1 | Navigate to `/inventory/products/nonexistent/view` | Shows **"Product not found."** message |

---

## Section 8 — Import Dialog

### Test 8.1 — Import Flow
| Step | Action | Expected |
|------|--------|----------|
| 1 | Click **Import** on list page | Import dialog opens |
| 2 | Upload a valid CSV file | File accepted, import processes |
| 3 | Close dialog mid-import | Dialog closes |

---

## Sign-off

| Section | Pass | Fail | Notes |
|---------|------|------|-------|
| 1 — List Page | ☐ | ☐ | |
| 2 — View Page & Tabs | ☐ | ☐ | |
| 3 — Overview Tab | ☐ | ☐ | |
| 4 — Stock Movements Tab | ☐ | ☐ | |
| 5 — Order History Tab | ☐ | ☐ | |
| 6 — Create/Edit | ☐ | ☐ | |
| 7 — Not Found | ☐ | ☐ | |
| 8 — Import | ☐ | ☐ | |

**Tester:** _________________ **Date:** _________________
