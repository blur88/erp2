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
**Status**: Plugin system is architecturally complete but CLI is not fully integrated.

```bash
# Plugin CLI (from backend directory)
# Commands are not registered as npm scripts yet
npx ts-node src/modules/plugins/cli/plugin-cli.ts create my-plugin --type business
npx ts-node src/modules/plugins/cli/plugin-cli.ts validate
npx ts-node src/modules/plugins/cli/plugin-cli.ts build --production

# Install plugin via API
curl -X POST http://localhost:3001/api/plugins/install -F "file=@plugin.zip"
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

### Docker Configuration Details

#### Frontend Container
- Uses multi-stage build: Node.js build stage + NGINX production stage
- Runtime environment variable replacement via `docker-entrypoint.sh`
- Vite build with optimized chunk splitting and asset bundling
- NGINX configuration with gzip, security headers, and health checks
- **Important**: Use `VITE_` prefixed environment variables (not `REACT_APP_`)

#### Backend Container
- Development-focused build using `ts-node --transpile-only` for faster iteration
- Supports both development (`npm run start:dev`) and production modes
- Volume mounts for uploads and logs persistence
- **Important**: Use `ts-node --transpile-only` bypasses TypeScript compilation but errors can still cause silent module loading failures

#### NGINX Configurations
- **Main proxy** (`nginx/nginx.conf`): Reverse proxy for production deployment
- **Frontend container** (`frontend/nginx.conf`): Serves built React application
- Features: gzip compression, security headers, health checks, API routing

## Architecture Overview

### Backend Module Structure
The backend follows NestJS modular architecture with clear separation:
- **Core modules**: `users/` - User management (authentication completely removed)
- **Business modules**: `inventory/` (active), `sales/` (active), `purchasing/` (disabled) - Core ERP functionality
- **Analytics modules**: `dashboard/`, `reports/` (both disabled) - Business intelligence and reporting
- **System modules**: `plugins/` (disabled) - Extensibility framework

**⚠️ CRITICAL: Current System Status (Updated August 2025)**
- **Authentication system completely removed**: AuthModule, auth guards, decorators, and strategies have been deleted
- **Currently active modules**: `UsersModule`, `InventoryModule`, and `SalesModule` are loaded in `app.module.ts`
- **Business modules still disabled**: `PurchasingModule`, `ReportsModule`, `DashboardModule`, `PluginsModule` remain commented out
- **Database schema issues resolved**: Manual table creation required due to TypeORM sync issues
- **Backend fully operational**: Core APIs working with all endpoints publicly accessible

**Module Loading Status (app.module.ts:40-46):**
```typescript
// Currently active:
UsersModule,        // ✅ Active - all endpoints publicly accessible
InventoryModule,    // ✅ Fully functional
SalesModule,        // ✅ Re-enabled after fixing auth compilation issues

// Still disabled due to auth dependencies:
// PurchasingModule, // Re-enable after fixing compilation issues  
// ReportsModule, // Re-enable after fixing compilation issues
// DashboardModule, // Re-enable after fixing compilation issues
// PluginsModule, // Re-enable after fixing compilation issues
```

**Recent Fixes Completed:**
- ✅ AuthModule completely removed from codebase
- ✅ Auth guards and decorators deleted (`src/common/guards/`, `src/common/strategies/`, auth decorators)
- ✅ Auth imports cleaned up from all modules
- ✅ SalesModule TypeScript compilation errors fixed (method signatures, property names)
- ✅ Service method calls updated to use 'system' as default userId
- ✅ SalesModule successfully re-enabled in app.module.ts

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
- **Real-time**: WebSocket integration for live updates
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

### Dynamic Module Loading Architecture
- **Frontend Sidebar**: Dynamic module detection via `/api/info` endpoint
- **Backend Health Checks**: Real-time backend availability detection
- **Graceful Degradation**: Shows only available modules when backend is offline/limited
- **Auto-refresh**: 30-second interval checks for backend status changes
- **Module Service**: `frontend/src/services/moduleApi.ts` handles backend communication
- **Status Indicators**: Visual feedback when backend is offline or modules unavailable

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

### Redux State Management Patterns
Each Redux slice follows a consistent pattern:
- **Initial state**: Includes `loading`, `error`, and data properties with pagination
- **Async thunks**: Use `createAsyncThunk` for API calls with proper error handling
- **Reducers**: Handle pending/fulfilled/rejected states for each async operation
- **Type safety**: All payloads are null-checked (e.g., `if (action.payload)` before using) to prevent runtime errors
- **Data updates**: Use `unshift()` to add new items to the beginning of arrays
- **API Integration**: Pages should use Redux + API calls instead of local state for persistence
- **Available Slices**: `inventorySlice`, `salesSlice`, `purchasingSlice`, `dashboardSlice`, `notificationSlice`, `themeSlice`

### Plugin Development
The plugin system supports multiple plugin types:
- **Business modules**: New ERP functionality (HR, CRM, Manufacturing)
- **Integrations**: Third-party services (payment gateways, shipping)
- **UI extensions**: Dashboard widgets, custom pages
- **Workflows**: Process automation and approvals

**Plugin Architecture**:
- **BasePlugin Class**: Complete lifecycle management (initialize → start → stop → destroy)
- **Plugin Types**: Business, Integration, Reporting, UI Extension, Workflow, Authentication
- **Security System**: Multi-level security policies per plugin type with resource monitoring
- **Hook System**: Event-driven architecture with 20+ system hooks for integration
- **Database Integration**: Dynamic entity support and plugin-specific connections
- **Development Tools**: CLI for plugin creation, validation, and building
- **Production Features**: Health monitoring, auto-restart, security audit trails
- **Hot Reload**: Development mode plugin reloading with dependency injection

Plugins must extend `BasePlugin` class and use decorators like `@Plugin()`, `@Hook()`, `@ApiEndpoint()`. The plugin system includes comprehensive security policies, resource usage monitoring, and violation detection.

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
// Critical: Always null-check action.payload
.addCase(fetchEntity.fulfilled, (state, action) => {
  state.loading = false;
  if (action.payload) {  // Essential null safety check
    state.data = action.payload.data;
    state.pagination = action.payload.meta;
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
- **JWT**: `JWT_SECRET`, `JWT_EXPIRATION`, `JWT_REFRESH_SECRET`, `JWT_REFRESH_EXPIRATION`
- **Email**: `SMTP_HOST`, `SMTP_PORT`, `SMTP_USER`, `SMTP_PASS`
- **Upload**: `UPLOAD_PATH`, `MAX_FILE_SIZE`
- **External Services**: `STRIPE_SECRET_KEY`, `PAYPAL_CLIENT_ID`, `AWS_ACCESS_KEY`

### Frontend Variables (VITE_*)
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

**⚠️ Authentication has been removed - demo accounts are no longer functional:**
- Admin: admin@erp.com / admin123 (DISABLED)
- Manager: manager@erp.com / manager123 (DISABLED)
- Sales Staff: sales@erp.com / sales123 (DISABLED)

**Note**: All endpoints are now publicly accessible without authentication.

## Known Issues & Troubleshooting

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
**⚠️ Post-Authentication Removal Status:**
- Authentication system completely removed from codebase
- All API endpoints are publicly accessible without any authentication
- SalesModule successfully re-enabled and functional
- Remaining modules (Purchasing, Reports, Dashboard, Plugins) still disabled pending similar fixes
- Demo user creation is no longer needed
- Frontend auth components have been removed

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

# Check if demo users exist
docker compose exec postgres psql -U erp_user -d erp_db -c "SELECT email, role FROM users;"
```

### Module Debugging
```bash
# Check for compilation errors
docker compose exec backend npm run build

# Test individual module loading with ts-node (most effective for diagnosing module issues)
# Test currently active modules
docker compose exec backend npx ts-node -e "
  try { 
    const salesModule = require('./src/modules/sales/sales.module.ts'); 
    console.log('✓ SalesModule loaded successfully');
  } catch (error) { 
    console.error('✗ SalesModule failed:', error.message); 
  }
"

# Test disabled modules for auth-related errors
docker compose exec backend npx ts-node -e "
  try { 
    const purchasingModule = require('./src/modules/purchasing/purchasing.module.ts'); 
    console.log('✓ PurchasingModule loaded successfully');
  } catch (error) { 
    console.error('✗ PurchasingModule failed:', error.message); 
  }
"

# Check if missing dependencies are the issue
docker compose exec backend npm install class-transformer @grpc/grpc-js @grpc/proto-loader --legacy-peer-deps

# Verify which app module is being used
docker compose exec backend find src -name "*app.module*"

# Test API availability (all endpoints should be accessible without auth)
curl http://localhost:3001/api/users -X GET
curl http://localhost:3001/api/inventory -X GET  
curl http://localhost:3001/api/sales-orders -X GET
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
- `backend/src/modules/purchasing/purchasing.module.ts` - Next module to re-enable (auth imports need cleaning)
- `backend/src/modules/dashboard/` - Auth decorators and imports cleaned up but module still disabled
- `backend/src/modules/reports/` - Auth imports partially cleaned up but module still disabled
- `backend/src/database/entities/plugin.entity.ts` - Plugin entity (IsVersion fixed to IsString)
- `backend/src/config/database.config.ts` - Database configuration with sync settings

### Authentication System Status (COMPLETELY REMOVED)
**⚠️ IMPORTANT: Authentication system has been completely deleted from the codebase**

**Deleted Files and Directories:**
- `backend/src/modules/auth/` - ❌ DELETED - Complete auth module
- `backend/src/common/guards/` - ❌ DELETED - Authentication and authorization guards
- `backend/src/common/strategies/` - ❌ DELETED - Passport strategies
- `backend/src/common/decorators/auth.decorator.ts` - ❌ DELETED
- `backend/src/common/decorators/user.decorator.ts` - ❌ DELETED

**Authentication cannot be restored without recreating these files from scratch.**
# important-instruction-reminders
Do what has been asked; nothing more, nothing less.
NEVER create files unless they're absolutely necessary for achieving your goal.
ALWAYS prefer editing an existing file to creating a new one.
NEVER proactively create documentation files (*.md) or README files. Only create documentation files if explicitly requested by the User.