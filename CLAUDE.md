# CLAUDE.md

This file provides guidance to Claude Code (claude.ai/code) when working with code in this repository.

## Project Overview

Comprehensive ERP system with modern full-stack architecture:
- **Backend**: NestJS 11 + TypeORM (PostgreSQL) + MongoDB + Redis 8 + Bull Queue
- **Frontend**: React 18.3.1 + TypeScript + Material-UI v7 + Redux Toolkit + Vite
- **Infrastructure**: Docker + NGINX + Node.js 24
- **Testing**: Jest (backend) + Vitest (frontend)

**Last Updated**: December 2025

## Current System Status

**✅ PRODUCTION-READY: Complete JWT authentication system implemented (December 2025)**

**Active Modules**: `AuthModule`, `UsersModule`, `InventoryModule`, `SalesModule`, `PurchasingModule`, `DashboardModule`, `SettingsModule`, `PrintSettingsModule`, `PriceListsModule`, `AuditLogsModule`, `BackupModule` (11 active)
**Module-Embedded Reports**: Each active module (Inventory, Sales, Purchasing) has its own integrated reports (✅ Active)

**Authentication & Security:**
- ✅ JWT-based authentication with refresh tokens (access: 15min, refresh: 7 days)
- ✅ bcrypt password hashing (12 rounds)
- ✅ Account lockout after 5 failed attempts (30 min)
- ✅ Role-based access control (Admin, Manager, Sales, Inventory, Procurement Staff)
- ✅ Global authentication guard (all endpoints protected by default)
- ✅ Token rotation for enhanced security
- ✅ Complete frontend authentication with protected routes
- ✅ Default admin user: `admin / Admin@123!` (⚠️ CHANGE IMMEDIATELY)

**System Features:**
- All API endpoints protected with JWT authentication
- Frontend fully integrated with backend
- WebSocket support for real-time updates
- Categories simplified (name + hierarchy only)
- Purchasing module re-enabled (October 2025)
- Comprehensive test coverage (81 tests: 57 backend + 24 frontend)

## Key Commands

### Development Setup
```bash
# Complete system with Docker (recommended)
docker compose up -d

# Backend development
cd backend
npm install
npm run start:dev        # Hot reload development server
npm run start:debug     # Debug mode with inspector
npm run start:prod       # Production mode

# Frontend development
cd frontend
npm install
npm run dev             # Vite dev server with hot reload
npm run build           # Production build (may need TypeScript fixes)
npm run preview         # Preview production build
```

### Testing
```bash
# Backend tests
cd backend
npm run test                    # Unit tests
npm run test:watch             # Watch mode
npm run test:cov               # Coverage report
npm run test:e2e               # End-to-end tests
npm run test:debug             # Debug tests

# Frontend tests (Vitest)
cd frontend
npm run test                   # Vitest unit tests
npm run test:ui                # Vitest UI
npm run test:coverage          # Coverage report
npm run type-check             # TypeScript check without build
```

### Database Operations
```bash
cd backend
# Generate migration (replace MyMigration with descriptive name)
npm run migration:generate --name=MyMigration

# Run migrations
npm run migration:run

# Revert last migration
npm run migration:revert

# Drop entire schema (DANGEROUS - dev only)
npm run schema:drop

# Run database seeds
npm run seed:run
```

### Code Quality
```bash
# Backend
cd backend
npm run lint                   # ESLint check and fix
npm run format                 # Prettier formatting

# Frontend
cd frontend
npm run lint                   # ESLint check
npm run type-check             # TypeScript check without build
```

### Deployment
```bash
# One-click deployment
./deploy.sh

# Other deployment commands
./deploy.sh stop            # Stop services
./deploy.sh restart         # Restart services
./deploy.sh logs           # View logs
./deploy.sh clean          # Clean up everything
./deploy.sh status         # Show service status

# Manual Docker operations
docker compose build       # Build all containers
docker compose up -d       # Start all services in detached mode
docker compose ps          # Check container status
docker compose logs backend # Check specific service logs
```

## Architecture Overview

### Backend Module Structure
- **Authentication**: `auth/` - ✅ JWT authentication, token refresh, password management
- **Core**: `users/` - User management with RBAC
- **Business**: `inventory/` (✅ with embedded reports), `sales/` (✅ with embedded reports), `purchasing/` (✅ with embedded reports)
- **Analytics**: `dashboard/` (✅ with WebSocket)
- **Configuration**: `settings/` (✅ company settings), `print-settings/` (✅ print templates and settings), `price-lists/` (✅ pricing management)
- **System**: `audit-logs/` (✅ comprehensive audit logging), `backup/` (✅ backup and restore)

### Architecture Patterns
- **Controllers**: Handle HTTP with Swagger decorators
- **Services**: Business logic and repository interaction
- **DTOs**: Data validation with class-validator
- **Entities**: TypeORM models extending BaseEntity
- **Infrastructure**: Exception filters, logging, validation pipes

### Database Architecture
- **PostgreSQL**: Primary database with 21+ entities, TypeORM
- **MongoDB**: Analytics and reports data, Mongoose
- **Redis 8**: Caching, queues, WebSocket state, with built-in Search, JSON, TimeSeries, Bloom, and VectorSet modules

**Key Entities:**
- **BaseEntity**: UUID, timestamps, soft deletes, audit fields
- **Inventory**: Product, Category (name + hierarchy), StockMovement
- **Sales**: Customer, SalesOrder, Invoice, Payment
- **Purchasing**: Supplier, PurchaseOrder, GoodsReceivedNote
- **Pricing**: PriceList, PriceListItem (replaces legacy JSONB-based pricing)

### Frontend Architecture
- **State**: Redux Toolkit with persistence
- **UI**: Material-UI v7, React Router v6
- **Build**: Vite with TypeScript and path aliases
- **Real-time**: Socket.IO WebSocket integration
- **Environment**: Runtime `window.__ENV__` configuration

### Security & Authentication ✅
**Complete production-ready authentication system implemented (December 2025)**

**Authentication Features:**
- ✅ JWT-based authentication (access: 15min, refresh: 7 days)
- ✅ Refresh token rotation for enhanced security
- ✅ bcrypt password hashing (12 rounds)
- ✅ Password complexity validation (uppercase, lowercase, number, special char, min 8 chars)
- ✅ Account lockout after 5 failed login attempts (30 min lock)
- ✅ Last login tracking (timestamp + IP address)
- ✅ Daily automated token cleanup cron job

**Authorization & Access Control:**
- ✅ Global JWT authentication guard (all endpoints protected by default)
- ✅ Role-based access control (RBAC) with 5 roles:
  - **Admin**: Full system access, user management
  - **Manager**: All operations except user management
  - **Sales Staff**: Sales and customer management
  - **Inventory Staff**: Inventory and stock management
  - **Procurement Staff**: Purchasing and supplier management
- ✅ `@Public()` decorator for public endpoints (login, register)
- ✅ `@Auth(...roles)` decorator for protected endpoints
- ✅ Rate limiting on authentication endpoints (5 req/min login, 3 req/min register)

**Frontend Security:**
- ✅ Protected routes with authentication guards
- ✅ Automatic token refresh on 401 responses
- ✅ Token storage (access: Redux, refresh: localStorage)
- ✅ Request queue during token refresh (prevents concurrent refreshes)
- ✅ Secure logout (clears all tokens, invalidates refresh tokens)

**Additional Security:**
- Input validation via class-validator
- Security headers (CORS, CSP, HSTS)
- Comprehensive audit logging with real user IDs
- Refresh tokens hashed with SHA-256 before storage
- No sensitive data in URLs or logs

**Default Credentials:**
- Username: `admin`
- Password: `Admin@123!`
- ⚠️ **CRITICAL**: Change password immediately after first login!

**Test Coverage:**
- 57 backend tests (unit + E2E)
- 24 frontend tests (Redux + components)
- 81 total tests covering auth flows, security, and edge cases

### Price List System ✅
**Complete normalized pricing system implemented (January 2026)**

**Pricing Architecture:**
- ✅ Normalized relational model replacing legacy JSONB pricing
- ✅ PriceList entity for master pricing schemes (Retail, Wholesale, etc.)
- ✅ PriceListItem entity for product-specific prices per list
- ✅ Customer relationship to PriceList for automatic pricing
- ✅ Backward compatibility with legacy `pricingTiers` JSONB field

**Price List Features:**
- ✅ Multiple price lists per system (unlimited)
- ✅ Default price list support for new customers
- ✅ Effective date range (effectiveFrom, effectiveTo) for time-based pricing
- ✅ Cost basis tracking per product per price list
- ✅ Margin percentage calculation (calculated from cost vs price)
- ✅ Bulk price updates for multiple products
- ✅ Copy price list functionality for easy setup
- ✅ Percentage adjustments (increase/decrease all prices)
- ✅ Soft delete support for price lists

**Price Calculation:**
- ✅ Customer's assigned price list used first
- ✅ Falls back to default price list if customer has none
- ✅ Falls back to baseCost if no price list or price not found
- ✅ Comprehensive logging for price source tracking
- ✅ Sales orders automatically use customer's price list

**Frontend Management:**
- ✅ Price Lists management page under Settings
- ✅ Create, edit, and delete price lists
- ✅ Inline editing of price list items
- ✅ Filter by active/inactive status
- ✅ PriceListSelector component for customer forms
- ✅ Pagination and search support

**API Endpoints:**
- `/api/price-lists` - Full CRUD operations
- `/api/price-lists/effective` - Get all currently effective price lists
- `/api/price-lists/default` - Get default price list
- `/api/price-lists/:id/items` - Manage price list items
- `/api/price-lists/:id/items/bulk` - Bulk update prices
- `/api/price-lists/:id/copy` - Duplicate price list
- `/api/price-lists/:id/adjust` - Apply percentage adjustment
- `/api/price-lists/:id/set-default` - Set as default

**Data Migration:**
- ✅ Automated migration from JSONB to normalized tables
- ✅ Zero data loss migration (100% success rate)
- ✅ Rollback support for safety
- ✅ Legacy fields removed after successful 30-day transition (Phase 8 - January 2026)

**Database Schema:**
```sql
-- Price Lists table
price_lists (
  id UUID PRIMARY KEY,
  code VARCHAR(50) UNIQUE NOT NULL,
  name VARCHAR(255) NOT NULL,
  description TEXT,
  isDefault BOOLEAN DEFAULT FALSE,
  isActive BOOLEAN DEFAULT TRUE,
  effectiveFrom TIMESTAMP,
  effectiveTo TIMESTAMP,
  createdAt TIMESTAMP,
  updatedAt TIMESTAMP,
  deletedAt TIMESTAMP
)

-- Price List Items table
price_list_items (
  id UUID PRIMARY KEY,
  priceListId UUID REFERENCES price_lists(id) ON DELETE CASCADE,
  productId UUID REFERENCES products(id) ON DELETE CASCADE,
  price DECIMAL(12,4) NOT NULL,
  costBasis DECIMAL(12,4),
  marginPercent DECIMAL(5,2),
  notes TEXT,
  createdAt TIMESTAMP,
  updatedAt TIMESTAMP,
  UNIQUE(priceListId, productId)
)
```

**Test Coverage:**
- 50+ backend unit tests for price list service
- 15+ backend E2E tests for all API endpoints
- 30+ frontend unit tests for Redux slice
- Manual E2E testing completed and verified
- Performance testing with proper indexes validated

**Phase 8 Cleanup (January 2026):**
- ✅ Removed `pricingTiers` JSONB field from Product entity
- ✅ Removed `pricingScheme` string field from Customer entity
- ✅ Removed `customerPricingSchemes` JSONB from PriceCostingSettings entity
- ✅ Removed all legacy fallback code from PricingService
- ✅ Database migration created to drop deprecated columns
- ✅ Clean, maintainable codebase with no technical debt

## Key Configuration

### TypeScript
- **Relaxed settings**: `"strict": false` for faster development
- **Path aliases**: Extensive configuration for clean imports
- **Development**: `ts-node --transpile-only` for rapid iteration

### Database
- **Connection pooling**: Limited to 10 connections
- **IPv4 enforcement**: `family: 4` for Docker compatibility
- **SSL disabled**: For Docker PostgreSQL compatibility
- **Docker hosts**: Use `postgres`/`redis` service names

### Docker Architecture
- **Frontend**: Multi-stage build with NGINX serving
- **Backend**: Development build with `ts-node`
- **Environment**: Runtime injection via `docker-entrypoint.sh`
- **NGINX Proxy**: Routes `/api` to backend, `/` to frontend
- **Important**: Backend source changes require rebuild (no volume mount)

## Path Aliases

### Backend
- `@/*` → `src/*`, `@modules/*` → `src/modules/*`
- `@common/*` → `src/common/*`, `@config/*` → `src/config/*`
- `@database/*` → `src/database/*`

### Frontend
- `@/*` → `src/*`, `@/components/*` → `src/components/*`
- `@/pages/*` → `src/pages/*`, `@/hooks/*` → `src/hooks/*`
- `@/services/*` → `src/services/*`, `@/store/*` → `src/store/*`

## Development Patterns

### Adding New Modules
1. Create module in `backend/src/modules/` with standard structure
2. Add TypeORM entities to `backend/src/database/entities/`
3. Register in `app.module.ts`
4. Add frontend pages and Redux slices as needed

### Adding Reports to Modules
Reports are embedded within their business modules:
1. Create report service in `backend/src/modules/{module}/services/` (e.g., `inventory-report.service.ts`)
2. Add report endpoints to module controller or create dedicated report controller
3. Implement Excel export using ExcelJS with subtotal/grand total styling pattern
4. Implement PDF export using jsPDF/jsPDF-AutoTable as needed
5. Create frontend report page in `frontend/src/pages/{module}/reports/`
6. Add report navigation to module's sidebar section
7. **Pattern**: Each report should support filtering, sorting, Excel/PDF export

### Entity Pattern
All entities extend `BaseEntity` (UUID, timestamps, audit fields, soft delete)

### Post-Auth Removal Fixes
When enabling disabled modules:
- Replace auth parameters with `'system'` default
- Remove auth decorators: `@UseGuards()`, `@Roles()`, `@Auth()`
- Convert empty strings to `NULL`: `const code = dto.code?.trim() || null`

### Redux Pattern
- **State**: `loading`, `error`, data with pagination
- **Async thunks**: `createAsyncThunk` with error handling
- **Null safety**: Always check `if (action.payload)` before using
- **API Response**: Access `response.data.data` and `response.data.meta`
- **Soft Delete**: Include `isActive: true` filter when fetching

### Frontend Development Patterns
- **Docker rebuilds**: Frontend changes require `docker compose build frontend && docker compose up -d frontend`
- **Component testing**: Use browser dev tools console for debugging API responses
- **API Service**: All API calls go through `ApiService` which wraps responses in `{ data: T, meta?: {...} }`
- **TypeScript relaxed**: Project uses `"strict": false`, liberal use of `as any` when needed
- **Path aliases**: Use `@/` for src imports, configured in both Vite and TypeScript

## Recent Changes Timeline

### 💰 Price List System Migration (January 2026)
- ✅ **COMPLETE**: Comprehensive price list system with normalized database model
- **Architecture Change**: Migrated from JSONB-based pricing to relational PriceList/PriceListItem model
- **Database Migration**: Successfully migrated 2 price lists with 42 price list items from legacy system
- **Zero Data Loss**: 100% data integrity maintained during migration
- **Backward Compatibility**: Legacy JSONB fallback ensures smooth transition
- **PriceListsModule**: New dedicated module with 13 API endpoints
- **Frontend Implementation**: Complete UI for price list management under Settings
- **Key Features**:
  - Multiple price lists with default support
  - Effective date ranges for time-based pricing
  - Cost basis and margin tracking
  - Bulk price updates and percentage adjustments
  - Copy price list functionality
  - Customer-to-price-list assignment
  - Automatic pricing in sales orders
- **API Endpoints**: `/api/price-lists` with full CRUD, bulk operations, copy, adjust, and set default
- **Frontend Routes**:
  - `/settings/price-lists` - List view
  - `/settings/price-lists/:id` - Details view with editable items
- **Components Created**:
  - PriceListsPage (list view with filters)
  - PriceListDetailsPage (details with inline editing)
  - PriceListFormDialog (create/edit)
  - PriceListCopyDialog (copy dialog)
  - PriceListSelector (reusable dropdown component)
- **Test Coverage**: 95+ tests (50 backend unit, 15 E2E, 30 frontend)
- **Migration Documentation**: Complete migration plan in `PRICE_LIST_MIGRATION_PLAN.md`
- **Performance**: All queries optimized with proper indexes
- **Future Cleanup**: Legacy JSONB fields to be removed after 30-day transition period (Phase 8)

### 📊 Module-Integrated Reports (November 2025)
- ✅ **COMPLETE**: Comprehensive reporting system embedded in Inventory, Sales, and Purchasing modules
- **Architecture Note**: Each business module has its own integrated reports (generic reports module removed)
- **Inventory Reports**:
  - **Product Cost Report**: Running average cost calculations, proper order number resolution, negative cost changes for outward movements
  - **Product Price List**: Dynamic pricing with retail, wholesale, and special prices
  - **Inventory Summary**: Stock levels and movement summary with enhanced styling
  - **Historical Inventory**: Product-based summary with target date filtering (not movement-based)
  - **Inventory Movement Summary**: Date range filtered movement tracking
- **Sales Reports**: Enhanced with subtotals and grand totals across multiple report types
- **Purchasing Reports**:
  - **Vendor Product List**: Aggregated by product-supplier with weighted average pricing
  - Enhanced subtotal and grand total styling across all 5 purchasing reports
- **Report Styling Pattern**: Consistent subtotals and grand totals with blank row separators for visual clarity
- **Data Export**: ExcelJS for Excel exports, jsPDF for PDF generation
- **Report Removed**: Count Sheet Report and Inventory Details Report removed from navigation

### Recent Updates (October-December 2025)

### 📋 Comprehensive Audit Logging (December 2025)
- ✅ **COMPLETE**: System-wide audit logging for all CRUD operations
- **Coverage**: Automatic logging for inventory, sales, purchasing, and all module operations
- **Details**: Captures user actions, entity changes, timestamps, and operation context
- **API Access**: `/api/audit-logs` endpoint with filtering and pagination
- **Backend Implementation**: `AuditLogsModule` integrated into all business modules

### 🎨 Material-UI v7 Upgrade (December 2025)
- ✅ **COMPLETE**: Upgraded Material-UI from v5 to v7.3.6
- **Breaking Changes**: Updated component APIs and theme structure
- **React Compatibility**: Requires React 18.3.1 (upgraded simultaneously)
- **Benefits**: Enhanced performance, improved TypeScript support, new component features
- **Migration**: All existing components tested and working with new MUI v7 API

### 🚀 Redis 8.4 Upgrade (December 2025)
- ✅ **COMPLETE**: Upgraded Redis from 8.2.2 to 8.4.0-alpine3.22
- **New Features**: Built-in Redis modules now available - Search, JSON, TimeSeries, Bloom, and VectorSet
- **Compatibility**: All existing Redis client operations remain functional
- **Performance**: Enhanced performance and security with Redis 8.4.0
- **License**: Redis 8 uses RSALv2/SSPLv1/AGPLv3 tri-license model
- **Benefits**: Access to advanced data structures and query capabilities without external modules

### 🔄 Purchasing Module Re-enabled (October 2025)
- ✅ **COMPLETE**: PurchasingModule fully re-enabled and functional
- **Auth Cleanup**: Removed all authentication dependencies from purchasing endpoints
- **Frontend Integration**: Purchase orders page with comprehensive overview analytics
- **Navigation**: Proper routing and navigation between purchase order pages
- **Status Display**: Using `isFullyReceived` flag for accurate PO status
- **Analytics**: Comprehensive purchasing dashboard with real-time data

### 📦 Product Fields Modernization (October 2025)
- ✅ **LATEST**: Simplified product model to match frontend form
- **Final Product Fields**: name, description, barcode, type, categoryId, baseCost, retailPrice, wholesalePrice, specialPrice, stockQuantity, notes, isActive
- **Removed Fields**: status, unit, reservedQuantity, reorderLevel, optimalStockLevel, stockStatus, weight, dimensions, brand, model, imageUrl, additionalImages, attributes
- **CSV Import**: Updated template to match simplified fields only
- **Database Migration**: Created migration to remove unused columns from products table
- **Search**: Simplified to search only by name and barcode
- **Permanent Delete**: Added hard delete functionality for soft-deleted products

### 🗑️ Soft-Deleted Products Feature (October 2025)
- ✅ **COMPLETE**: Full soft-deleted products management system
- **Backend**: `GET /api/inventory/products/deleted` and `POST /api/inventory/products/:id/restore` endpoints
- **Frontend**: Enhanced `DeletedProductsDialog` with modern table design matching categories
- **UI Integration**: "View Deleted" button in Products page header opens comprehensive restore dialog
- **Route Fix**: Moved deleted products endpoint before `:id` route to prevent UUID validation conflicts
- **State Management**: Added Redux support for fetching and restoring deleted products

### 💰 Sales Order Enhancements (October 2025)
- ✅ **COMPLETE**: Enhanced sales order management with advanced filtering and payment handling
- **Payment Features**: Overpayment handling with negative balance display and refund functionality
- **Filtering**: Added payment status and fulfillment status filters with standardized dropdown widths (120px)
- **UX Improvements**: Optimistic updates for payment operations with better visual feedback
- **API Optimization**: Removed unused filter parameters and added debugging for summary methods
- **Filter Layout**: Moved date range filters beside main date filter for improved user experience
- **Standardization**: Consistent filter dropdown values and labels across all sales pages

### 🏷️ Categories Simplified (October 2025)
- Removed `code` and `description` fields entirely
- Now only contains: name, hierarchy, status, sort order, audit fields
- Tree view removed from categories page - now displays simple table view only

### 👥 Customer Management Bulk Operations (October 2025)
- ✅ **COMPLETE**: Bulk restore and bulk delete functionality for customers
- **Frontend**: Enhanced customer page with bulk operations matching products/categories pattern
- **UI Integration**: Bulk action buttons and "View Deleted" functionality
- **State Management**: Redux support for bulk operations on customer records

### 🔧 Critical API Fixes (October 2025)
- **Product API Fixed**: Product listing endpoints were returning reversed data due to inconsistent soft delete implementation
  - **Root Cause**: `remove()` method only set status flags but didn't use TypeORM's `softDelete()` for `deletedAt` timestamp
  - **Fix**: Updated `remove()` to use `await this.productRepository.softDelete(id)` and `findAll()` to filter `WHERE product.deletedAt IS NULL`
  - **Result**: `/api/inventory/products` now correctly returns only **active products**, `/api/inventory/products/deleted` now correctly returns only **soft-deleted products**
- **CategorySelector Fixed**: Now properly displays all categories instead of just "Main Category"
  - **Root Cause**: Component was incorrectly accessing `response.data?.data` instead of `response.data`
  - **Fix**: Updated to `const categoryTree = (response.data as any) || []`
  - **Result**: Parent category dropdown now shows hierarchical category tree with proper indentation
- **Category Form Validation**: Fixed yup schema validation for `parentId` to allow `null` values: `.nullable()`

### 🏗️ Platform Upgrades (September-October 2025)
- ✅ **NestJS v11 Upgrade**: Complete upgrade to NestJS 11 with all dependencies
- ✅ **Node.js 24**: Updated Docker base images to Node.js 24 Alpine for better performance
- ✅ **Frontend Dependencies**: Comprehensive updates to all Alpine packages and OpenSSL
- ✅ **Container Health**: Added curl to frontend nginx container for health checks
- ✅ **Security Enhancements**: Payment numbers now clickable in invoice details

## Code Patterns

### Entity Design
```typescript
@Entity('table_name')
@Index(['status', 'isActive'])
export class EntityName extends BaseEntity {
  @Column({ type: 'decimal', precision: 12, scale: 4 })
  retailPrice: number;
}
```

### Redux Async
```typescript
.addCase(fetchEntity.fulfilled, (state, action) => {
  if (action.payload) {
    state.data = action.payload.data || [];
    state.pagination = action.payload.meta || defaultMeta;
  }
})
```

### Material-UI
- Use Paper, Box, Typography hierarchy
- Theme colors: `warning.main`, `error.main`, `success.main`
- Icons from `@mui/icons-material` with consistent sizing

### Report Styling Pattern
```typescript
// Subtotal and grand total styling for Excel reports
// Add blank rows before subtotals for visual separation
worksheet.addRow({}); // Blank row before subtotal

// Subtotal row with distinct styling
const subtotalRow = worksheet.addRow([
  { formula: `SUBTOTAL(9, C${startRow}:C${endRow})` }, // Sum
  'Subtotal',
  // ... other columns
]);
subtotalRow.font = { bold: true };
subtotalRow.fill = { type: 'pattern', pattern: 'solid', fgColor: { argb: 'FFE0E0E0' } };

// Grand total follows similar pattern with stronger emphasis
const grandTotalRow = worksheet.addRow([...]);
grandTotalRow.font = { bold: true, size: 12 };
grandTotalRow.fill = { type: 'pattern', pattern: 'solid', fgColor: { argb: 'FFD0D0D0' } };
```

### Soft Delete Pattern
```typescript
// Entity with soft delete support
@Entity('products')
export class Product extends BaseEntity {
  @Column({ default: 'active' })
  status: string; // 'active' | 'discontinued'

  @Column({ default: true })
  isActive: boolean; // false when soft-deleted

  @DeleteDateColumn() // TypeORM built-in soft delete
  deletedAt?: Date;
}

// Service method for soft delete
async remove(id: string, user: string = 'system'): Promise<void> {
  await this.productRepository.softDelete(id);
}

// Service method for restore
async restore(id: string, user: string = 'system'): Promise<Product> {
  await this.productRepository.restore(id);
  return this.findOne(id);
}

// Query with soft delete awareness
async findAll(query: QueryProductsDto): Promise<PaginatedResponse<Product>> {
  return this.productRepository.find({
    where: { isActive: true }, // Exclude soft-deleted
    relations: ['category']
  });
}
```

### Form Validation Patterns
```typescript
// Yup schema for nullable foreign keys
const schema = yup.object({
  name: yup.string().required('Name is required'),
  parentId: yup.string().optional().nullable(), // Allows null for root level
  isActive: yup.boolean()
})

// TypeScript interface matching the schema
interface FormData {
  name: string
  parentId?: string | null  // Important: allow null
  isActive: boolean
}

// React Hook Form setup
const { control, handleSubmit } = useForm<FormData>({
  resolver: yupResolver(schema),
  defaultValues: {
    name: '',
    parentId: null, // Use null, not undefined
    isActive: true
  }
})
```

## Environment

### Backend
- Database: `DATABASE_HOST`, `DATABASE_PORT`, `DATABASE_NAME`, `DATABASE_USER`, `DATABASE_PASSWORD`
- Redis: `REDIS_HOST`, `REDIS_PORT`, `REDIS_PASSWORD`

### Frontend
- API: `VITE_API_BASE_URL` (uses `/api` for NGINX proxy compatibility)
- Socket: `VITE_SOCKET_URL` (uses `/` for NGINX proxy compatibility)
- Runtime injection via `window.__ENV__` for Docker compatibility

## Access URLs

### Development (via NGINX proxy)
- Frontend: http://localhost:3000
- Backend API: http://localhost:3000/api
- API Docs: http://localhost:3000/api/docs

### Direct Access (bypassing NGINX)
- Frontend: http://localhost:3000
- Backend API: http://localhost:3001/api
- API Docs: http://localhost:3001/api/docs

### ✅ Functional Pages
- Dashboard: http://localhost:3000/ (real-time updates)
- Inventory: http://localhost:3000/inventory
- Products: http://localhost:3000/inventory/products (full CRUD + soft-deleted products management)
- Categories: http://localhost:3000/inventory/categories (table view with restore/undo)
- Sales: http://localhost:3000/sales
- Purchasing: http://localhost:3000/purchasing (re-enabled October 2025)
- Price Lists: http://localhost:3000/settings/price-lists (pricing management - January 2026)
- Users: http://localhost:3000/users

### 📊 Inventory Reports (Active)
- Product Cost Report: http://localhost:3000/inventory/reports/product-cost
- Product Price List: http://localhost:3000/inventory/reports/price-list
- Inventory Summary: http://localhost:3000/inventory/reports/summary
- Historical Inventory: http://localhost:3000/inventory/reports/historical
- Inventory Movement Summary: http://localhost:3000/inventory/reports/movements

### 📊 Sales Reports (Active)
- Sales reports accessible via Sales module navigation

### 📊 Purchasing Reports (Active)
- Vendor Product List and other purchasing reports accessible via Purchasing module navigation

### Key API Endpoints
- Users: `/api/users`
- Inventory: `/api/inventory/products`, `/api/inventory/categories`
- Soft-Deleted Products: `/api/inventory/products/deleted`, `/api/inventory/products/:id/restore`
- Sales: `/api/sales-orders`, `/api/invoices`, `/api/payments`, `/api/quotations`, `/api/credit`, `/api/sales/analytics` (consistent `/api` prefix)
- Purchasing: `/api/purchasing/suppliers`, `/api/purchasing/purchase-orders`, `/api/purchasing/overview`
- Price Lists: `/api/price-lists` (pricing management with 13 endpoints)
- Settings: `/api/settings` (company settings and configuration)
- Print Settings: `/api/print-settings` (print templates and printing configuration)
- Audit Logs: `/api/audit-logs` (audit trail for all operations)
- Backup: `/api/backup` (database backup and restore)
- Module Info: `/api/info`

### 📊 Report Export Endpoints
- Inventory reports support Excel/PDF export via module-specific endpoints
- Sales reports support Excel/PDF export via module-specific endpoints
- Purchasing reports support Excel/PDF export via module-specific endpoints

## Troubleshooting

### Common Issues
- **README.md outdated**: Use CLAUDE.md instead - README mentions authentication features that were completely removed
- **deploy.sh mentions demo accounts**: Ignore demo account credentials in deploy.sh output - authentication system was completely removed
- **TypeScript**: Uses `"strict": false`, use `as any` assertions for TypeORM when needed
- **Backend tsconfig.json excludes active modules**: Backend `tsconfig.json` excludes `purchasing` and `reports` directories but both are actually active - this is a configuration artifact that doesn't affect runtime
- **Docker**: Backend source changes require `docker compose build backend && docker compose up -d backend`
- **Icons**: Use `Inventory2` instead of non-existent `Product` icon
- **Form validation fails silently**: Check yup schema allows `null` for optional foreign keys (use `.nullable()`)
- **CategorySelector only shows "Main Category"**: ✅ FIXED - Was accessing `response.data?.data` instead of `response.data`
- **Product API endpoints returning wrong data**: ✅ FIXED - Was caused by inconsistent soft delete implementation
- **API Response Structure**: For tree endpoints, API response is `{ data: Category[], meta: {...} }`, access directly as `response.data`
- **Route Order Issues**: In NestJS controllers, specific routes (like `deleted`) must come before parameterized routes (like `:id`)
- **Soft Delete Filtering**: Always use TypeORM's `softDelete()` method and filter `WHERE deletedAt IS NULL` for active records

### Debug Commands
```bash
# Check TypeScript issues
cd frontend && npm run type-check
cd backend && npm run build

# Check service status
docker compose ps
docker compose logs backend --tail=20
curl http://localhost:3001/api/health

# Database queries
docker compose exec postgres psql -U erp_user -d erp_db -c "SELECT COUNT(*) FROM products;"

# WebSocket test
curl http://localhost:3001/socket.io/ | head -1
```

### Module History
**Note**: Purchasing module was successfully re-enabled in October 2025 after auth cleanup.
**Note**: PluginsModule was permanently removed in January 2026 as it was not needed for core ERP functionality.
**Note**: Module-integrated reports (Inventory, Sales, Purchasing) are fully functional.

## Key Files

### Core Configuration
- `backend/src/app.module.ts` - Main module (11 active modules)
- `docker-compose.yml` - Service orchestration with NGINX proxy
- `deploy.sh` - Production deployment
- `frontend/src/App.tsx` - Main React component

### Module Files
- `backend/src/modules/inventory/` - ✅ Fully functional with integrated reports (5 report types)
- `backend/src/modules/sales/` - ✅ Re-enabled after auth fixes with integrated reports
- `backend/src/modules/dashboard/` - ✅ WebSocket support for real-time updates
- `backend/src/modules/purchasing/` - ✅ Re-enabled after auth cleanup (October 2025) with integrated reports (5 report types)
- `backend/src/modules/price-lists/` - ✅ Price list management (January 2026) with 13 API endpoints
- `backend/src/modules/settings/` - ✅ Company settings management
- `backend/src/modules/print-settings/` - ✅ Print templates and printing configuration
- `backend/src/modules/audit-logs/` - ✅ Comprehensive audit logging for all operations
- `backend/src/modules/backup/` - ✅ Database backup and restore functionality

### Key Inventory Components
- `frontend/src/components/inventory/DeletedProductsDialog.tsx` - Dialog for viewing and restoring soft-deleted products
- `frontend/src/components/inventory/CategorySelector.tsx` - Hierarchical category selection component
- `frontend/src/components/inventory/CategoryTreeView.tsx` - **UNUSED** Tree view component (exists but not imported anywhere)
- `frontend/src/components/inventory/CategoryBreadcrumb.tsx` - **UNUSED** Navigation breadcrumbs component (exists but not imported anywhere)

### Environment Config
- `frontend/docker-entrypoint.sh` - Runtime `window.__ENV__` injection
- `frontend/vite.config.ts` - Socket.IO proxy configuration
- `backend/src/config/database.config.ts` - DB with IPv4 enforcement