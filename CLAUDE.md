# CLAUDE.md

This file provides guidance to Claude Code (claude.ai/code) when working with code in this repository.

## Project Overview

Comprehensive ERP system with modern full-stack architecture:
- **Backend**: NestJS + TypeORM (PostgreSQL) + MongoDB + Redis + Bull Queue
- **Frontend**: React 18 + TypeScript + Material-UI + Redux Toolkit + Vite
- **Infrastructure**: Docker + NGINX
- **Testing**: Jest (backend) + Vitest (frontend)

## Current System Status

**⚠️ CRITICAL: Authentication system completely removed**

**Active Modules**: `UsersModule`, `InventoryModule`, `SalesModule`, `DashboardModule`  
**Disabled Modules**: `PurchasingModule`, `ReportsModule`, `PluginsModule` (commented out in `app.module.ts`)

- All API endpoints publicly accessible
- Frontend fully integrated with backend
- WebSocket support for real-time updates
- Categories simplified (name + hierarchy only)

## Key Commands

### Development Setup
```bash
# Complete system with Docker
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
- **Core**: `users/` - User management  
- **Business**: `inventory/` (✅), `sales/` (✅), `purchasing/` (❌)
- **Analytics**: `dashboard/` (✅ with WebSocket), `reports/` (❌)
- **System**: `plugins/` (❌ disabled)

### Architecture Patterns
- **Controllers**: Handle HTTP with Swagger decorators
- **Services**: Business logic and repository interaction  
- **DTOs**: Data validation with class-validator
- **Entities**: TypeORM models extending BaseEntity
- **Infrastructure**: Exception filters, logging, validation pipes

### Database Architecture
- **PostgreSQL**: Primary database with 20 entities, TypeORM
- **MongoDB**: Analytics and reports data, Mongoose
- **Redis**: Caching, queues, WebSocket state

**Key Entities:**
- **BaseEntity**: UUID, timestamps, soft deletes, audit fields
- **Inventory**: Product, Category (name + hierarchy), StockMovement
- **Sales**: Customer, SalesOrder, Invoice, Payment  
- **Purchasing**: Supplier, PurchaseOrder, GoodsReceivedNote

### Frontend Architecture
- **State**: Redux Toolkit with persistence
- **UI**: Material-UI v5, React Router
- **Build**: Vite with TypeScript and path aliases
- **Real-time**: Socket.IO WebSocket integration
- **Environment**: Runtime `window.__ENV__` configuration

### Security Status
**⚠️ Authentication completely removed - all endpoints public**

**Remaining security:**
- Input validation via class-validator
- Security headers (CORS, CSP, HSTS)
- Basic request logging

**Removed:**
- JWT authentication, guards, decorators
- Role-based access control
- Password security, account lockout

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

## Recent Changes (September 2025)

### Product Fields Modernization (September 2025)
- ✅ **LATEST**: Simplified product model to match frontend form (December 2025)
- **Final Product Fields**: name, description, barcode, type, categoryId, baseCost, retailPrice, wholesalePrice, specialPrice, stockQuantity, notes, isActive
- **Removed Fields**: status, unit, reservedQuantity, reorderLevel, optimalStockLevel, stockStatus, weight, dimensions, brand, model, imageUrl, additionalImages, attributes
- **CSV Import**: Updated template to match simplified fields only
- **Database Migration**: Created migration to remove unused columns from products table
- **Search**: Simplified to search only by name and barcode
- **Permanent Delete**: Added hard delete functionality for soft-deleted products

### Soft-Deleted Products Feature (September 2025)
- ✅ **COMPLETE**: Full soft-deleted products management system
- **Backend**: `GET /api/inventory/products/deleted` and `POST /api/inventory/products/:id/restore` endpoints
- **Frontend**: Enhanced `DeletedProductsDialog` with modern table design matching categories
- **UI Integration**: "View Deleted" button in Products page header opens comprehensive restore dialog
- **Route Fix**: Moved deleted products endpoint before `:id` route to prevent UUID validation conflicts
- **State Management**: Added Redux support for fetching and restoring deleted products

### Frontend Integration Fixed
- ✅ Inventory pages fully functional with real backend data
- ✅ Fixed API response extraction from `ApiResponse<PaginatedResponse<T>>`
- ✅ Added `isActive: true` filter to exclude soft-deleted records
- ✅ Category restore/undo functionality implemented
- ✅ WebSocket integration for dashboard real-time updates

### Categories Simplified (September 2025)
- Removed `code` and `description` fields entirely
- Now only contains: name, hierarchy, status, sort order, audit fields
- Tree view removed from categories page - now displays simple table view only

### Customer Management Bulk Operations (September 2025)
- ✅ **COMPLETE**: Bulk restore and bulk delete functionality for customers
- **Frontend**: Enhanced customer page with bulk operations matching products/categories pattern
- **UI Integration**: Bulk action buttons and "View Deleted" functionality
- **State Management**: Redux support for bulk operations on customer records

### Product API Endpoints Fixed (September 2025)
- ✅ **CRITICAL FIX**: Product listing endpoints were returning reversed data
- **Root Cause**: `remove()` method only set status flags but didn't use TypeORM's `softDelete()` for `deletedAt` timestamp
- **Fix**: Updated `remove()` to use `await this.productRepository.softDelete(id)` and `findAll()` to filter `WHERE product.deletedAt IS NULL`
- **Result**: 
  - `/api/inventory/products` now correctly returns only **active products**
  - `/api/inventory/products/deleted` now correctly returns only **soft-deleted products**
- **Frontend Impact**: Products page and "View Deleted" dialog now show correct data sets

### CategorySelector Data Fix (September 2025)
- ✅ **FIXED**: CategorySelector now properly displays all categories instead of just "Main Category"
- **Root Cause**: Component was incorrectly accessing `response.data?.data` instead of `response.data`
- **Fix**: Updated to `const categoryTree = (response.data as any) || []`
- **Result**: Parent category dropdown now shows hierarchical category tree with proper indentation
- Categories display as: "Main Category", "Electronics", "  Mobile Phones" (indented), etc.

### Category Form Validation Fixed (September 2025)
- Fixed yup schema validation for `parentId` to allow `null` values: `.nullable()`
- Updated TypeScript interfaces to support `parentId?: string | null`
- Root level categories properly created with `parentId: null`
- CategorySelector properly handles "Main Category" option (updated from "No Category (Root Level)")

### Sales Order Enhancements (September 2025)
- ✅ **COMPLETE**: Enhanced sales order management with advanced filtering and payment handling
- **Payment Features**: Overpayment handling with negative balance display and refund functionality
- **Filtering**: Added payment status and fulfillment status filters with standardized dropdown widths (120px)
- **UX Improvements**: Optimistic updates for payment operations with better visual feedback
- **API Optimization**: Removed unused filter parameters and added debugging for summary methods
- **Filter Layout**: Moved date range filters beside main date filter for improved user experience
- **Standardization**: Consistent filter dropdown values and labels across all sales pages

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
- API: `VITE_API_BASE_URL`, `VITE_SOCKET_URL`
- Runtime injection via `window.__ENV__` for Docker compatibility

## Access URLs

**Development:**
- Frontend: http://localhost:3000
- Backend API: http://localhost:3001/api
- API Docs: http://localhost:3001/api/docs

**✅ Functional Pages:**
- Inventory: http://localhost:3000/inventory
- Products: http://localhost:3000/inventory/products (full CRUD + soft-deleted products management)
- Categories: http://localhost:3000/inventory/categories (table view with restore/undo)

**Key API Endpoints:**
- Users: `/api/users`
- Inventory: `/api/inventory/products`, `/api/inventory/categories`  
- Soft-Deleted Products: `/api/inventory/products/deleted`, `/api/inventory/products/:id/restore`
- Sales: `/api/sales-orders`, `/api/invoices`, `/api/payments`, `/api/quotations`, `/api/credit`, `/api/sales/analytics` (consistent `/api` prefix)
- Module Info: `/api/info`

## Troubleshooting

### Common Issues
- **README.md outdated**: Use CLAUDE.md instead - README mentions authentication features that were completely removed
- **TypeScript**: Uses `"strict": false`, use `as any` assertions for TypeORM when needed
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

### Module Re-enabling
For disabled modules (Purchasing, Reports, Plugins):
1. Fix auth-related TypeScript errors using `'system'` default
2. Install missing dependencies: `npm install class-transformer @grpc/grpc-js @grpc/proto-loader --legacy-peer-deps`
3. Check compilation: `npx tsc --noEmit`

## Key Files

### Core Configuration
- `backend/src/app.module.ts` - Main module (4 active modules)
- `docker-compose.yml` - Service orchestration  
- `deploy.sh` - Production deployment
- `frontend/src/App.tsx` - Main React component

### Module Files
- `backend/src/modules/inventory/` - ✅ Fully functional
- `backend/src/modules/sales/` - ✅ Re-enabled after auth fixes
- `backend/src/modules/dashboard/` - ✅ WebSocket support
- `backend/src/modules/purchasing/` - ❌ Needs auth cleanup

### Key Inventory Components
- `frontend/src/components/inventory/DeletedProductsDialog.tsx` - Dialog for viewing and restoring soft-deleted products
- `frontend/src/components/inventory/CategorySelector.tsx` - Hierarchical category selection component
- `frontend/src/components/inventory/CategoryTreeView.tsx` - **UNUSED** Tree view component (exists but not imported anywhere)
- `frontend/src/components/inventory/CategoryBreadcrumb.tsx` - **UNUSED** Navigation breadcrumbs component (exists but not imported anywhere)

### Environment Config
- `frontend/docker-entrypoint.sh` - Runtime `window.__ENV__` injection  
- `frontend/vite.config.ts` - Socket.IO proxy configuration
- `backend/src/config/database.config.ts` - DB with IPv4 enforcement
