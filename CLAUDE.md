# CLAUDE.md

This file provides guidance to Claude Code (claude.ai/code) when working with code in this repository.

## Project Overview

This is a comprehensive ERP (Enterprise Resource Planning) system built with a modern full-stack architecture:
- **Backend**: NestJS + TypeORM (PostgreSQL) + Mongoose (MongoDB) + Redis + Bull Queue
- **Frontend**: React 18 + TypeScript + Material-UI + Redux Toolkit + Vite
- **Infrastructure**: Docker + NGINX for production deployment
- **Testing**: Jest (backend) + Vitest (frontend)

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

### Plugin System
**Status**: Plugin system is completely disabled and non-functional.

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

### Docker Configuration Details

#### Frontend Container
- Uses multi-stage build: Node.js build stage + NGINX production stage
- Runtime environment variable replacement via `docker-entrypoint.sh`
- Vite build with optimized chunk splitting and asset bundling
- NGINX configuration with gzip, security headers, and health checks
- **Important**: Frontend code uses `VITE_` prefixed environment variables, but docker-compose.yml currently uses `REACT_APP_API_URL` (inconsistency needs resolution)

#### Backend Container
- Development-focused build using `ts-node --transpile-only` for faster iteration
- Supports both development (`npm run start:dev`) and production modes
- Volume mounts for uploads and logs persistence
- **Important**: Use `ts-node --transpile-only` bypasses TypeScript compilation but errors can still cause silent module loading failures
- **Critical**: No source code volume mount in docker-compose.yml - backend uses code copied during build. Source changes require `docker compose build backend` and restart to apply

#### NGINX Configurations
- **Main proxy** (`nginx/nginx.conf`): Reverse proxy for production deployment
- **Frontend container** (`frontend/nginx.conf`): Serves built React application
- Features: gzip compression, security headers, health checks, API routing

## Architecture Overview

### Backend Module Structure
The backend follows NestJS modular architecture with clear separation:
- **Core modules**: `users/` - User management (authentication completely removed)
- **Business modules**: `inventory/` (active), `sales/` (active), `purchasing/` (disabled) - Core ERP functionality
- **Analytics modules**: `dashboard/` (active with WebSocket support), `reports/` (disabled) - Business intelligence and reporting
- **System modules**: `plugins/` (disabled) - Extensibility framework

**⚠️ CRITICAL: Current System Status (Updated August 2025)**
- **Authentication system completely removed**: AuthModule, auth guards, decorators, and strategies have been deleted
- **Currently active modules**: `UsersModule`, `InventoryModule`, `SalesModule`, and `DashboardModule` are loaded in `app.module.ts`
- **Frontend fully integrated**: All inventory module issues fixed - overview, products, and categories pages now show real backend data and are fully functional
- **WebSocket Support**: DashboardModule re-enabled with Socket.IO integration for real-time updates
- **Business modules still disabled**: `PurchasingModule`, `ReportsModule`, `PluginsModule` remain commented out
- **Database schema operational**: PostgreSQL with 20+ entities properly configured
- **Backend fully operational**: Core APIs working with all endpoints publicly accessible
- **Frontend sidebar**: Shows ALL modules without backend filtering (authentication removal pattern)
- **Module detection**: Backend `/api/info` endpoint returns active modules: `["users", "inventory", "sales", "dashboard"]`
- **Environment Configuration**: Frontend now uses runtime `window.__ENV__` pattern for Docker compatibility

**Module Loading Status (app.module.ts:40-46):**
```typescript
// Currently active:
UsersModule,        // ✅ Active - all endpoints publicly accessible
InventoryModule,    // ✅ Fully functional
SalesModule,        // ✅ Re-enabled after fixing auth compilation issues
DashboardModule,    // ✅ Re-enabled with WebSocket support

// Still disabled due to auth dependencies:
// PurchasingModule, // Re-enable after fixing compilation issues  
// ReportsModule, // Re-enable after fixing compilation issues
// PluginsModule, // Re-enable after fixing compilation issues
```

**Recent Key Changes:**
- Authentication system completely removed from codebase
- UsersModule, InventoryModule, SalesModule, and DashboardModule are active and functional
- DashboardModule re-enabled with Socket.IO WebSocket support for real-time updates
- Inventory frontend fully integrated with backend APIs
- WebSocket dependencies installed: `socket.io`, `@nestjs/websockets`, `@nestjs/platform-socket.io`
- All API endpoints publicly accessible without authentication
- Frontend loading performance optimized (reduced API calls on page reload)

**Remaining Tasks for Other Modules:**
- Other business modules may still have auth-related compilation errors
- Use `npx tsc --noEmit` to check for TypeScript compilation errors before enabling modules
- Follow same pattern as SalesModule: replace missing auth parameters with 'system' default

### Service-Controller-DTO Pattern
Each module follows consistent architecture:
- **Controllers**: Handle HTTP requests, use Swagger decorators (auth guards removed)
- **Services**: Implement business logic, interact with repositories
- **DTOs**: Data transfer objects with class-validator decorators
- **Entities**: TypeORM database models with proper relationships
- **Guards**: Authentication and authorization logic (disabled)
- **Strategies**: Passport authentication strategies (disabled)

### Global Infrastructure Components
- **Exception Filter**: `HttpExceptionFilter` for centralized error handling
- **Logging Interceptor**: `LoggingInterceptor` for request/response logging  
- **Validation Pipes**: Automatic DTO validation with class-validator
- **Transform Interceptor**: Response standardization across all endpoints

### Database Architecture
The system uses a hybrid database approach:
- **Primary Database**: PostgreSQL with TypeORM for core business modules (20+ entities)
- **Analytics Database**: MongoDB with Mongoose for reports and analytics data
- **Caching Layer**: Redis for sessions, queues, and performance optimization

**PostgreSQL Entities:**
- **Base entity**: `BaseEntity` provides UUID, timestamps, soft deletes, and audit fields
- **User management**: `User` with role-based access control (5 roles)
- **Inventory**: `Product`, `Category`, `StockMovement`, `StockAdjustment` with multi-level pricing
- **Sales**: `Customer`, `SalesOrder`, `Invoice`, `Payment` with credit management
- **Purchasing**: `Supplier`, `PurchaseOrder`, `GoodsReceivedNote` with approval workflows

### Frontend Architecture
React application with:
- **State management**: Redux Toolkit with persistence and async thunks
- **Routing**: React Router (protected routes removed)
- **UI framework**: Material-UI v5 with custom theming
- **Data fetching**: Axios (auth interceptors disabled)
- **Real-time**: WebSocket integration with Socket.IO for live updates (DashboardModule enabled)
- **Build system**: Vite with TypeScript and path aliases
- **State pattern**: Each slice follows fulfilled/pending/rejected pattern for async operations
- **Authentication**: All auth components and hooks disabled

### Security Implementation
**⚠️ SECURITY NOTICE: Authentication system has been completely removed**

Remaining security features:
- **Input validation**: class-validator on all DTOs with sanitization
- **Rate limiting**: Multiple tiers (per-second, per-minute, per-15min) via Throttler (may be disabled)
- **Security headers**: CORS, CSP, HSTS via Helmet middleware
- **Audit logging**: Basic request logging (user attribution removed)

**Removed Security Features:**
- **Authentication**: JWT authentication, guards, decorators, and strategies completely deleted from codebase
- **Authorization**: Role-based access control completely removed
- **Password Security**: bcrypt functionality removed along with auth system
- **Account Security**: Account lockout completely removed

**Current Security Status:**
- All API endpoints are publicly accessible without authentication
- Services use 'system' as default user context where userId is required
- Frontend auth components and interceptors have been removed

### Multi-Level Pricing System
Products support comprehensive pricing structure:
- **Base Cost**: Internal cost for margin calculations
- **Retail Price**: Standard customer pricing
- **Wholesale Price**: Bulk customer pricing  
- **Special Price**: Promotional or contract pricing
- **Dynamic Pricing**: Support for customer-specific pricing rules

## Unique Architectural Decisions

### TypeScript Configuration Strategy
- **Relaxed Settings**: Both frontend and backend use `"strict": false` for faster development
- **Path Aliases**: Extensive alias configuration for clean imports across layers
- **Development Mode**: `ts-node --transpile-only` bypasses compilation for rapid iteration
- **Incremental Compilation**: Optimized build performance for large codebase

### Database Connection Management  
- **Connection Pooling**: Limited to 10 connections to prevent resource exhaustion
- **IPv4 Enforcement**: `family: 4` config for Docker container compatibility in `extra` config
- **SSL Configuration**: Disabled (`ssl: false`) for Docker PostgreSQL compatibility
- **Environment-based Sync**: Database sync only enabled in development mode
- **Migration Strategy**: Separate migration files with rollback support
- **Docker Service Names**: Use `postgres` and `redis` as hosts, not `localhost` in Docker environment
- **Credential Matching**: Ensure `.env` credentials match `docker-compose.yml` service passwords

### Dual NGINX Architecture
- **Development Proxy** (`nginx/nginx.conf`): Production reverse proxy configuration
- **Container Serving** (`frontend/nginx.conf`): Optimized static file serving with SPA routing
- **Runtime Config Injection**: Environment variables injected at container startup
- **Security Headers**: Comprehensive CSP, HSTS, and XSS protection

### Redis Integration Patterns
- **Session Management**: JWT token blacklisting and refresh token storage  
- **Caching Strategy**: Bull queues for background job processing
- **Rate Limiting**: Distributed rate limiting across multiple service instances
- **WebSocket State**: Real-time connection state management

### Frontend Sidebar Architecture 
- **Frontend Sidebar**: Now shows ALL modules without filtering (as of latest update)
- **Module Detection**: Backend `/api/info` endpoint returns active modules: `["users", "inventory", "sales"]`
- **Backend Health Checks**: Real-time backend availability detection (still functional but not used for filtering)
- **Auto-refresh**: 30-second interval checks for backend status changes
- **Module Service**: `frontend/src/services/moduleApi.ts` handles backend communication
- **Status Indicators**: Visual feedback when backend is offline (displayed in sidebar header)

## Path Aliases and Import Structure

### Backend Path Aliases (TypeScript)
- `@/*` → `src/*` (general source files)
- `@modules/*` → `src/modules/*` (business modules)
- `@common/*` → `src/common/*` (shared utilities)
- `@config/*` → `src/config/*` (configuration files)
- `@database/*` → `src/database/*` (database entities and migrations)

### Frontend Path Aliases (Vite + TypeScript)
- `@/*` → `src/*` (general source files)
- `@/components/*` → `src/components/*` (React components)
- `@/pages/*` → `src/pages/*` (page components)
- `@/hooks/*` → `src/hooks/*` (React hooks)
- `@/services/*` → `src/services/*` (API services)
- `@/store/*` → `src/store/*` (Redux store and slices)
- `@/utils/*` → `src/utils/*` (utility functions)
- `@/types/*` → `src/types/*` (TypeScript type definitions)
- `@/styles/*` → `src/styles/*` (styling files)
- `@/assets/*` → `src/assets/*` (static assets)

## Development Patterns

### Adding New Modules
1. Create module directory in `backend/src/modules/`
2. Follow the pattern: `module.ts`, `controller.ts`, `service.ts`, `dto/` folder
3. Add TypeORM entities to `backend/src/database/entities/`
4. Register module in `app.module.ts`
5. Add corresponding frontend pages in `frontend/src/pages/`
6. Create Redux slices if needed for state management

### Entity Relationships
All entities extend `BaseEntity` which provides:
- `id`: UUID primary key
- `createdAt`/`updatedAt`: Timestamps
- `createdBy`/`updatedBy`: User audit fields  
- `deletedAt`: Soft delete support

### API Patterns
- All controllers use Swagger decorators for API documentation
- DTOs use class-validator for validation
- Services handle business logic, controllers handle HTTP concerns

### Post-Authentication Removal Pattern
**⚠️ All authentication-related code has been completely removed:**

**Deleted Files and Directories:**
- `src/modules/auth/` - Complete authentication module
- `src/common/guards/` - Authentication and authorization guards  
- `src/common/strategies/` - Passport authentication strategies
- `src/common/decorators/auth.decorator.ts` - Authentication decorators
- `src/common/decorators/user.decorator.ts` - User context extractors

**Service Method Signature Updates:**
When fixing modules after auth removal, follow this pattern:
```typescript
// Before (auth system):
service.create(dto, userId)
// After (auth removed):
service.create(dto, 'system') // Use 'system' as default userId
```

**Common Auth-Related Fixes:**
- Replace missing auth parameters with `'system'` string
- Remove `@UseGuards()`, `@Roles()`, `@Auth()` decorators from controllers
- Remove auth imports and update interface references
- Update property names: `sellingPrice` → `retailPrice`, `costPrice` → `baseCost`
- Replace missing enum values: `RESERVATION` → `ADJUSTMENT_DECREASE`

**Database Unique Constraint Fixes:**
- **Empty String vs NULL**: PostgreSQL unique constraints allow multiple `NULL` values but not multiple empty strings `""`
- **Service Layer Pattern**: Convert empty strings to `NULL` in service methods before database operations:
  ```typescript
  const code = dto.code?.trim() || null; // Convert empty string to null
  ```
- **Database Cleanup**: Update existing empty string values to `NULL`:
  ```sql
  UPDATE table_name SET field_name = NULL WHERE field_name = '';
  ```

### Redux State Management Patterns
Each Redux slice follows a consistent pattern:
- **Initial state**: Includes `loading`, `error`, and data properties with pagination
- **Async thunks**: Use `createAsyncThunk` for API calls with proper error handling
- **Reducers**: Handle pending/fulfilled/rejected states for each async operation
- **Type safety**: All payloads are null-checked (e.g., `if (action.payload)` before using) to prevent runtime errors
- **Data updates**: Use `unshift()` to add new items to the beginning of arrays
- **API Integration**: Pages should use Redux + API calls instead of local state for persistence
- **Available Slices**: `inventorySlice`, `salesSlice`, `purchasingSlice`, `dashboardSlice`, `notificationSlice`, `themeSlice`

**Critical API Response Pattern (Fixed August 2025):**
Backend returns `PaginatedResponse<T>` directly: `{data: T[], meta: {...}}`, not wrapped in `ApiResponse`. Redux reducers should use:
```typescript
.addCase(fetchEntity.fulfilled, (state, action) => {
  if (action.payload) {
    state.entities = (action.payload as any).data || []
    state.pagination = (action.payload as any).meta || defaultMeta
  }
})
```

### Plugin Development
The plugin system is currently disabled but architecturally supports:
- Business modules, integrations, UI extensions, and workflows
- BasePlugin class with lifecycle management
- Security policies and resource monitoring

## Critical Recent Architecture Changes

### Frontend Integration Fixes (August 2025)
**Problem Pattern**: After authentication removal, several frontend pages showed "demo mode" restrictions, hardcoded data, or failed to load real backend data despite working APIs.

**Critical Issues Resolved**:
1. **Overview Page Error**: "An unexpected error occurred" with zero values for all stats
2. **Product Deletion Bug**: Deleted products reappeared after browser refresh - FIXED by filtering `isActive: true` in fetchProducts
3. **Category Duplication**: "Duplicate entry detected" errors when adding categories

**Root Causes & Solutions**:
1. **API Response Structure Mismatch**: Fixed inconsistent data extraction from `ApiResponse<PaginatedResponse<T>>` - properly access `response.data.data` and `response.data.meta`
2. **Missing Backend Synchronization**: Added explicit `dispatch(fetchProducts({}))` after deletion operations with 500ms delay
3. **Soft Delete Confusion**: Backend performs soft delete (sets `isActive: false`) but frontend was fetching all products. FIXED by adding `isActive: true` filter to fetchProducts Redux action
4. **Poor Error Handling**: Implemented client-side duplicate validation and enhanced error messages for 409 conflicts
5. **Redux State Inconsistency**: Standardized response handling with proper null safety checks across all inventory reducers

**Files Fixed**:
- `frontend/src/pages/inventory/InventoryPage.tsx` - Fixed API response data extraction and added debugging
- `frontend/src/pages/inventory/ProductsPage.tsx` - Added deletion persistence with backend refresh  
- `frontend/src/pages/inventory/CategoriesPage.tsx` - Enhanced duplicate validation, error handling, and product count display
- `frontend/src/store/slices/inventorySlice.ts` - Fixed Redux state management consistency + added `isActive: true` filter to fetchProducts
- `frontend/src/services/inventoryApi.ts` - Added support for `includeProductCount` parameter in categories API
- `frontend/src/types/index.ts` - Added `productCount`, `isActive`, and `categoryId` fields to QueryParams interface

**Key Patterns for Module Fixes**:
- API responses: Use `response.data?.data` for `ApiResponse<PaginatedResponse<T>>`
- After mutations: Add backend refresh with `setTimeout(() => dispatch(fetchItems({})), 500)`
- Soft Delete Pattern: Always include `isActive: true` filter when fetching entities to exclude soft-deleted records
- Error handling: Check for 409 conflicts and show specific messages
- API methods: Match frontend calls to backend decorators (@Patch → patch())

### Authentication System Status
**⚠️ IMPORTANT: Authentication system completely removed**

- All auth files, guards, decorators, and strategies deleted
- All API endpoints are publicly accessible
- Service methods use 'system' as default userId
- Frontend auth components removed
- Sales API has double `/api` prefix: `/api/api/v1/sales-orders`

### Service Method Pattern After Auth Removal
```typescript
// Old pattern (with auth):
async create(dto: CreateDto, user: AuthenticatedUser)

// New pattern (auth removed):  
async create(dto: CreateDto, createdBy: string = 'system')
```

## Key Architectural Patterns

### Entity Design Pattern
All database entities follow a consistent pattern:
```typescript
@Entity('table_name')
@Index(['field1'], { unique: true })    // Strategic indexing
@Index(['status', 'isActive'])          // Composite indexes for performance
export class EntityName extends BaseEntity {
  @Column({ type: 'decimal', precision: 12, scale: 4 })  // Financial precision
  price: number;
  
  // Multi-level pricing pattern for products
  @Column({ type: 'decimal', precision: 12, scale: 4 })
  baseCost: number;
  
  @Column({ type: 'decimal', precision: 12, scale: 4 })
  retailPrice: number;
}
```

### Redux Async Pattern
Frontend Redux slices consistently implement null-safe async operations:
```typescript
// Critical: Always null-check action.payload and handle nested structure
.addCase(fetchEntity.fulfilled, (state, action) => {
  state.loading = false;
  if (action.payload && action.payload.data) {  // Essential null safety check
    state.data = action.payload.data.data || [];     // ApiResponse<PaginatedResponse<T>>
    state.pagination = action.payload.data.meta || {
      page: 1, limit: 20, total: 0, totalPages: 0
    };
  }
})
```

### Controller API Pattern
Controllers follow comprehensive documentation and validation:
```typescript
@ApiTags('ModuleName')
@Controller('api/path')
export class Controller {
  @Post()
  @ApiOperation({ summary: 'Action description' })
  @ApiResponse({ status: 201, type: ResponseDto })
  @ApiResponse({ status: 400, description: 'Validation failed' })
  async create(@Body() dto: CreateDto) {
    return this.service.create(dto);
  }
}
```

### Frontend Path Alias Usage
Import statements consistently use path aliases for clean code:
```typescript
// Frontend imports
import { Component } from '@/components/common/Component';
import { useAppDispatch } from '@/hooks/redux';
import { ApiService } from '@/services/api';

// Backend imports  
import { Service } from '@modules/domain/service';
import { Entity } from '@database/entities/entity';
import { Config } from '@config/config';
```

### Database Configuration Pattern
Docker-optimized database connections with IPv4 enforcement:
```typescript
// Critical for Docker environments
extra: {
  connectionLimit: 10,        // Prevent connection exhaustion
  family: 4,                 // Force IPv4 for Docker compatibility
}
```

## Environment Configuration

Copy `.env.example` to `.env` and configure:

### Backend Variables
- **Database**: `DATABASE_HOST`, `DATABASE_PORT`, `DATABASE_NAME`, `DATABASE_USER`, `DATABASE_PASSWORD`
- **Redis**: `REDIS_HOST`, `REDIS_PORT`, `REDIS_PASSWORD`
- **Upload**: `UPLOAD_PATH`, `MAX_FILE_SIZE`

### Frontend Variables 
**✅ Environment Variable Configuration (RESOLVED):**
- **Frontend Code Uses**: `VITE_API_BASE_URL`, `VITE_SOCKET_URL` (Vite standard)
- **Docker Compose Uses**: `VITE_API_BASE_URL`, `VITE_SOCKET_URL` (now standardized)
- **Runtime Configuration**: Environment variables injected via `window.__ENV__` object at container startup

**Standard Variables**:
- **API Configuration**: `VITE_API_BASE_URL`, `VITE_SOCKET_URL`
- **App Settings**: `VITE_APP_VERSION`, `VITE_APP_NAME`
- **Development**: `VITE_ENABLE_MOCK_DATA`, `VITE_ENABLE_DEBUG`
- **Theming**: `VITE_DEFAULT_THEME`, `VITE_PRIMARY_COLOR`, `VITE_SECONDARY_COLOR`
- **External Services**: `VITE_STRIPE_PUBLISHABLE_KEY`, `VITE_GOOGLE_MAPS_API_KEY`

## Access Information

**Development URLs**:
- Frontend: http://localhost:3000
- Backend API: http://localhost:3001/api  
- API Documentation: http://localhost:3001/api/docs

**Note**: All endpoints are publicly accessible without authentication.

**✅ Fully Functional Pages (Ready for Testing):**
- **Inventory Overview**: http://localhost:3000/inventory (shows real data, functional buttons)
- **Products Management**: http://localhost:3000/inventory/products (full CRUD with multi-pricing)
- **Categories Management**: http://localhost:3000/inventory/categories (full CRUD operations)
- **Sales Module**: Available but frontend integration may need similar fixes as inventory

**Working API Endpoints:**
- Users: `http://localhost:3001/api/users`
- Inventory Products: `http://localhost:3001/api/inventory/products`
- Inventory Categories: `http://localhost:3001/api/inventory/categories` 
- Inventory Stock: `http://localhost:3001/api/inventory/stock/movements`
- Sales Orders: `http://localhost:3001/api/api/v1/sales-orders` (note double `/api` prefix)
- Module Info: `http://localhost:3001/api/info`

## Known Issues & Troubleshooting

### README.md Discrepancy
**⚠️ IMPORTANT**: The README.md file contains outdated information and should NOT be used as reference:
- Still mentions authentication features that have been completely removed
- Lists demo accounts that don't exist (authentication removed)
- Claims features like "JWT-based authentication" and "Role-based access control" which are disabled
- **Use CLAUDE.md instead** - this file reflects the actual current system state

### TypeScript Configuration
- **Frontend**: Uses relaxed TypeScript settings (`"strict": false`) to avoid build failures. Redux slices include proper null checks for `action.payload`
- **Backend**: Uses relaxed TypeScript settings for faster development. **Note**: Even with `--transpile-only` mode, TypeScript compilation errors can still prevent module loading silently. Use type assertions `as any` when TypeORM repository operations fail TypeScript validation.
- **Path aliases**: Both frontend and backend use extensive path alias configurations for clean imports
- **Development**: Run `npm run type-check` in frontend for TypeScript checking without building
- **Form Resolvers**: Use `as any` type assertions for yup resolvers in forms to work with relaxed TypeScript settings
- **Critical Issue**: TypeScript errors in service files can cause silent module loading failures even in development mode

### Docker Build Issues
- **Frontend**: May need `@rollup/rollup-linux-x64-musl` package for Alpine Linux builds
- **Backend**: Permission issues with `/app/dist` directory may require running as root (development only)
- **Material-UI Icons**: Some icon names may not exist; use alternatives like `Inventory2` instead of `Product`

### Common Fixes
```bash
# Check frontend TypeScript issues (should pass without errors after recent fixes)
cd frontend
npm run type-check

# Build frontend with current TypeScript settings
npm run build

# Fix backend compilation issues
cd backend  
# Run in development mode to skip build step
npm run start:dev

# Frontend icon import fixes
# Replace non-existent imports like 'Product' with 'Inventory2' in src/components/common/Sidebar.tsx

# Check if categories are soft-deleted vs hard-deleted
docker compose exec postgres psql -U erp_user -d erp_db -c "SELECT name, \"isActive\", \"deletedAt\" FROM categories;"

# Fix empty string unique constraint violations (convert to NULL)
# In service files, use: const code = dto.code?.trim() || null;
```

### API Method Mismatch Issues
**Problem**: Frontend API calls fail with 404 errors despite backend endpoints existing
**Common Cause**: Mismatch between frontend HTTP method and backend controller decorator

**Debugging Steps**:
```bash
# 1. Check backend logs for 404 errors with method details
docker compose logs backend --tail=50 | grep "Cannot PUT\|Cannot GET\|Cannot POST\|Cannot PATCH"

# 2. Verify backend controller decorators
grep -r "@Patch\|@Put\|@Post\|@Get" backend/src/modules/*/controllers/

# 3. Check frontend API service methods
grep -r "ApiService\." frontend/src/services/
```

**Solution Pattern**:
- Backend `@Patch(':id')` → Frontend `ApiService.patch()`
- Backend `@Put(':id')` → Frontend `ApiService.put()`  
- Backend `@Post()` → Frontend `ApiService.post()`
- Backend `@Get()` → Frontend `ApiService.get()`

### Docker Development Workflow
```bash
# IMPORTANT: Backend source changes require rebuild (no volume mount for source code)
docker compose build backend   # Rebuild backend after source changes
docker compose up -d backend   # Restart with new build

# Alternative: Build and restart in one command
docker compose build backend && docker compose up -d backend

# Check if backend changes were applied
docker compose exec backend grep -A 5 "your search pattern" /app/src/path/to/file.ts
```

### Service Dependencies
- PostgreSQL and Redis must be running before backend starts
- Backend must be healthy before frontend can load (authentication removed)
- NGINX configuration requires proper gzip directives (avoid "must-revalidate" in gzip_proxied)

### Docker Container Issues
- **Frontend blank page**: ~~This issue has been permanently fixed. The Docker build now properly copies the production-built index.html with correct asset references instead of the development version.~~ (RESOLVED)

### Backend Module Loading Issues
**⚠️ IMPORTANT: Authentication has been completely removed from codebase**
- **AuthModule**: Completely deleted from filesystem - authentication system removed entirely
- **SalesModule**: Successfully re-enabled after fixing auth compilation errors
- **Missing Dependencies**: May need npm dependencies (`class-transformer`, `@grpc/grpc-js`, `@grpc/proto-loader`) for remaining disabled modules. Install with `npm install class-transformer @grpc/grpc-js @grpc/proto-loader --legacy-peer-deps`
- **Silent Module Loading Failures**: Remaining disabled modules may fail to load due to auth-related TypeScript compilation errors. Check startup logs for missing module initialization messages.
- **TypeScript Compilation Errors**: Use type assertions `as any` for repository operations if TypeScript validation fails.
- **Dependency Version Conflicts**: Use `--legacy-peer-deps` flag when installing dependencies to resolve NestJS version conflicts
- **IPv6 Connection Issues**: Add `family: 4` to Redis/PostgreSQL connection configs to force IPv4 in Docker environments

### Current System Status
**Working Features:**
- UsersModule, InventoryModule, SalesModule, and DashboardModule fully functional
- DashboardModule with WebSocket/Socket.IO support for real-time updates
- Inventory frontend completely integrated with backend
- Database with sample data (8 products, 4 categories)
- All containers running with proper networking
- **Category deletion with products**: Fixed foreign key constraint issues (August 2025)

**Still Disabled:** PurchasingModule, ReportsModule, PluginsModule

### Category Restore Functionality Status
**Missing Feature**: Categories page lacks restore/undo functionality despite soft delete implementation
- **Backend**: Supports soft delete (sets `deletedAt` timestamp) 
- **Frontend**: No restore UI implemented
- **Gap**: Deleted categories cannot be restored through the interface
- **Manual Restore**: `UPDATE categories SET deletedAt = NULL WHERE id = 'category-id'`

### Category Deletion Foreign Key Fix (August 2025)
**Problem**: Deleting categories with associated products caused foreign key constraint violations.

**Solution Implemented**:
1. **Soft Delete**: Changed `categoryRepository.remove()` to `categoryRepository.softRemove()` to preserve referential integrity
2. **Uncategorized Category Restoration**: Enhanced logic to find and restore existing soft-deleted "Uncategorized" categories instead of creating duplicates
3. **Null Safety**: Added proper null checks in product service when accessing category properties after soft deletion

**Key Changes**:
- `backend/src/modules/inventory/services/category.service.ts`: Uses `softRemove()` and restores existing "Uncategorized" categories
- `backend/src/modules/inventory/services/product.service.ts`: Added null safety for category field in response DTOs  
- Products are automatically moved to restored/created "Uncategorized" category when their category is deleted
- **Additional Safety Fix**: Empty string codes are converted to `NULL` before database operations to prevent unique constraint violations

### WebSocket/Socket.IO Integration
**Dependencies Installed:**
- `socket.io@^4.8.1` - Socket.IO server
- `@nestjs/websockets@^10.0.0` - NestJS WebSocket adapter
- `@nestjs/platform-socket.io@^10.0.0` - Socket.IO platform integration

**WebSocket Configuration:**
- **Frontend**: Vite proxy configuration routes `/socket.io` to backend
- **Backend**: DashboardWebSocketGateway handles real-time dashboard updates
- **Namespace**: Dashboard WebSocket uses `/dashboard` namespace
- **CORS**: Configured for development with `origin: '*'`

**Common WebSocket Issues:**
- **"Cannot GET /socket.io/"**: Ensure DashboardModule is enabled and Socket.IO dependencies are installed
- **Version Conflicts**: Use compatible versions (`^10.0.0` for NestJS v10) with `--legacy-peer-deps`
- **Docker Build Issues**: Socket.IO packages must be present during Docker build - rebuild with `docker compose build backend --no-cache`

## Critical Troubleshooting Commands

### Check Service Status
```bash
docker compose ps                    # Check all container statuses
docker compose logs backend --tail=20  # Check backend logs for errors
curl http://localhost:3001/api/health   # Test backend API health
```

### Database Operations
```bash
# Connect to database directly
docker compose exec postgres psql -U erp_user -d erp_db

# Check current inventory data
docker compose exec postgres psql -U erp_user -d erp_db -c "SELECT COUNT(*) FROM products; SELECT COUNT(*) FROM categories;"

# View sample products with pricing
docker compose exec postgres psql -U erp_user -d erp_db -c "SELECT name, sku, \"retailPrice\", \"stockQuantity\" FROM products ORDER BY name;"

# Calculate current inventory value
docker compose exec postgres psql -U erp_user -d erp_db -c "SELECT SUM(\"retailPrice\" * \"stockQuantity\") as total_inventory_value FROM products;"
```

### Module Debugging
```bash
# Check for compilation errors
docker compose exec backend npm run build

# Test API availability
curl http://localhost:3001/api/users -X GET
curl http://localhost:3001/api/inventory/products -X GET  
curl http://localhost:3001/api/info -X GET

# Test WebSocket/Socket.IO availability
curl http://localhost:3001/socket.io/ | head -1
# Should return Socket.IO response, not 404
```


## Key Files to Know

- `backend/src/app.module.ts` - Main NestJS module with global providers (SalesModule re-enabled, others still disabled)
- `backend/src/database/entities/base.entity.ts` - Base entity all others extend  
- `backend/src/database/entities/index.ts` - Entity exports (BaseEntity removed from ALL_ENTITIES array)
- `frontend/src/App.tsx` - Main React component with routing
- `frontend/src/components/common/Sidebar.tsx` - Dynamic sidebar with module detection
- `frontend/src/services/moduleApi.ts` - Backend module availability detection service
- `frontend/src/store/slices/` - Redux slices (include proper null checks for TypeScript)
- `docker-compose.yml` - Complete service orchestration
- `deploy.sh` - Production deployment automation
- `frontend/nginx.conf` - NGINX configuration for frontend container

### Critical Files for Module Re-enabling
- `backend/src/modules/sales/` - Successfully re-enabled after auth removal fixes
- `backend/src/modules/dashboard/` - Successfully re-enabled with WebSocket support and simplified service dependencies  
- `backend/src/modules/purchasing/purchasing.module.ts` - Next module to re-enable (auth imports need cleaning)
- `backend/src/modules/reports/` - Auth imports partially cleaned up but module still disabled
- `backend/src/database/entities/plugin.entity.ts` - Plugin entity (IsVersion fixed to IsString)
- `backend/src/config/database.config.ts` - Database configuration with sync settings

### WebSocket-Related Files
- `backend/src/modules/dashboard/gateways/dashboard-websocket-gateway.ts` - Socket.IO WebSocket gateway
- `backend/src/modules/dashboard/services/dashboard-service.ts` - Simplified dashboard service with mock data
- `backend/src/modules/dashboard/dashboard-module.ts` - Dashboard module with WebSocket gateway integration
- `frontend/vite.config.ts` - Socket.IO proxy configuration (lines 31-36)

### Authentication System Status
**⚠️ IMPORTANT: Authentication system completely deleted**

Deleted: auth module, guards, strategies, decorators. Cannot be restored without recreation.

## Recent System Changes (August 2025)

### Major Updates Completed:
1. **Authentication System Removal**: Complete removal of all authentication-related code, guards, and decorators
2. **Module Re-enablement**: Successfully re-enabled SalesModule and DashboardModule
3. **WebSocket Integration**: Full Socket.IO implementation with real-time dashboard updates
4. **Frontend Integration**: Complete integration of inventory module with backend APIs
5. **Docker Optimization**: Improved build processes and dependency management

### WebSocket Implementation Details:
- **Socket.IO Version**: v4.8.1 with NestJS v10 compatible adapters
- **Real-time Features**: Dashboard data updates, alerts, and notifications
- **Development Ready**: Vite proxy configuration and CORS setup completed
- **Production Considerations**: Namespace isolation and error handling implemented

### Frontend Environment Configuration Fix (Latest Update):
**Problem Resolved**: Frontend environment variables weren't working in Docker due to build-time vs runtime configuration mismatch.

**Solution Implemented**:
1. **Dynamic API Configuration**: API service now uses `window.__ENV__` for runtime configuration
2. **Runtime Injection**: `docker-entrypoint.sh` creates `env-config.js` with environment variables at container startup
3. **WebSocket Configuration**: WebSocket hook updated to use same dynamic pattern
4. **HTML Script Loading**: `index.html` loads `env-config.js` before React app initialization

**Critical Pattern for Docker Environment Variables**:
```typescript
// Frontend services now use dynamic runtime configuration
const getApiBaseUrl = () => {
  return (window as any).__ENV__?.VITE_API_BASE_URL || 'http://localhost:3001/api'
}

// WebSocket configuration
const getSocketUrl = () => {
  return (window as any).__ENV__?.VITE_SOCKET_URL || 'http://localhost:3001'
}
```

**Docker Entrypoint Script Pattern**:
```bash
# /frontend/docker-entrypoint.sh creates runtime config
cat > /usr/share/nginx/html/env-config.js << EOF
window.__ENV__ = {
  VITE_API_BASE_URL: '$VITE_API_BASE_URL',
  VITE_SOCKET_URL: '$VITE_SOCKET_URL'
};
EOF
```
# important-instruction-reminders
Do what has been asked; nothing more, nothing less.
NEVER create files unless they're absolutely necessary for achieving your goal.
ALWAYS prefer editing an existing file to creating a new one.
NEVER proactively create documentation files (*.md) or README files. Only create documentation files if explicitly requested by the User.