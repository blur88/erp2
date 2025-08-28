# CLAUDE.md

This file provides guidance to Claude Code (claude.ai/code) when working with code in this repository.

## Project Overview

This is a comprehensive ERP (Enterprise Resource Planning) system built with a modern full-stack architecture:
- **Backend**: NestJS + TypeORM + PostgreSQL + Redis + Bull Queue
- **Frontend**: React 18 + TypeScript + Material-UI + Redux Toolkit
- **Infrastructure**: Docker + NGINX for production deployment

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

# Frontend tests
cd frontend  
npm run test                   # Vitest unit tests
npm run test:ui                # Vitest UI
npm run test:coverage          # Coverage report
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
```bash
# Plugin development (from backend directory)
erp-plugin create my-plugin --type business
erp-plugin dev                             # Development server with hot reload
erp-plugin validate                        # Validate plugin structure and dependencies
erp-plugin build --production              # Build for production
erp-plugin package                         # Create installable plugin package

# Plugin marketplace operations
erp-plugin marketplace search <keyword>    # Search plugin marketplace
erp-plugin marketplace publish             # Publish plugin to marketplace
erp-plugin marketplace install <plugin>    # Install from marketplace

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

#### Backend Container
- Webpack-based production build for optimized Node.js bundle
- Supports both development (`npm run start:dev`) and production modes
- Volume mounts for uploads and logs persistence

#### NGINX Configurations
- **Main proxy** (`nginx/nginx.conf`): Reverse proxy for production deployment
- **Frontend container** (`frontend/nginx.conf`): Serves built React application
- Features: gzip compression, security headers, health checks, API routing

## Architecture Overview

### Backend Module Structure
The backend follows NestJS modular architecture with clear separation:
- **Core modules**: `auth/`, `users/` - Authentication, authorization, user management
- **Business modules**: `inventory/`, `sales/`, `purchasing/` - Core ERP functionality
- **Analytics modules**: `dashboard/`, `reports/` - Business intelligence and reporting
- **System modules**: `plugins/` - Extensibility framework

### Database Design
The system uses 20+ TypeORM entities with relationships:
- **Base entity**: `BaseEntity` provides UUID, timestamps, soft deletes, and audit fields
- **User management**: `User` with role-based access control (5 roles)
- **Inventory**: `Product`, `Category`, `StockMovement`, `StockAdjustment` with multi-level pricing
- **Sales**: `Customer`, `SalesOrder`, `Invoice`, `Payment` with credit management
- **Purchasing**: `Supplier`, `PurchaseOrder`, `GoodsReceivedNote` with approval workflows

### Frontend Architecture
React application with:
- **State management**: Redux Toolkit with persistence and async thunks
- **Routing**: React Router with protected routes
- **UI framework**: Material-UI v5 with custom theming
- **Data fetching**: Axios with interceptors for auth
- **Real-time**: WebSocket integration for live updates
- **Build system**: Vite with TypeScript and path aliases
- **State pattern**: Each slice follows fulfilled/pending/rejected pattern for async operations

### Security Implementation
Multi-layered security approach:
- **Authentication**: JWT with refresh tokens, Redis session storage
- **Authorization**: Role-based access control with guards
- **Input validation**: class-validator on all DTOs
- **Rate limiting**: Multiple tiers (per-second, per-minute, per-15min)
- **Security headers**: CORS, CSP, HSTS via Helmet
- **Audit logging**: Complete audit trail with user attribution

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

### Authentication Decorators
- `@Public()` - bypass JWT authentication entirely
- `@OptionalAuth()` - optional authentication (user context available if logged in)
- `@Auth(...roles)` - role-based authentication with specific roles
- `@AuthWithPermissions(...permissions)` - permission-based authorization
- `@AdminOnly()` - convenience decorator for admin-only endpoints
- `@ManagerOrAdmin()` - convenience decorator for manager or admin access
- `@Roles(Role.ADMIN, Role.MANAGER)` - traditional role-based authorization

### Redux State Management Patterns
Each Redux slice follows a consistent pattern:
- **Initial state**: Includes `loading`, `error`, and data properties with pagination
- **Async thunks**: Use `createAsyncThunk` for API calls with proper error handling
- **Reducers**: Handle pending/fulfilled/rejected states for each async operation
- **Type safety**: All payloads should be null-checked (e.g., `if (action.payload)` before using)
- **Data updates**: Use `unshift()` to add new items to the beginning of arrays

### Plugin Development
The plugin system supports multiple plugin types:
- **Business modules**: New ERP functionality (HR, CRM, Manufacturing)
- **Integrations**: Third-party services (payment gateways, shipping)
- **UI extensions**: Dashboard widgets, custom pages
- **Workflows**: Process automation and approvals

Plugins must extend `BasePlugin` class and use decorators like `@Plugin()`, `@Hook()`, `@ApiEndpoint()`.

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

**Demo accounts** (username/password):
- Admin: admin@erp.com / admin123
- Manager: manager@erp.com / manager123
- Sales Staff: sales@erp.com / sales123

## Known Issues & Troubleshooting

### TypeScript Configuration
- **Frontend**: Uses relaxed TypeScript settings (`"strict": false`) to avoid build failures. Redux slices may need null checks for `action.payload`
- **Backend**: Uses relaxed TypeScript settings for faster development. Build may fail with compilation errors in strict mode
- **Path aliases**: Both frontend and backend use extensive path alias configurations for clean imports
- **Development**: Run `npm run type-check` in frontend for TypeScript checking without building

### Docker Build Issues
- **Frontend**: May need `@rollup/rollup-linux-x64-musl` package for Alpine Linux builds
- **Backend**: Permission issues with `/app/dist` directory may require running as root (development only)
- **Material-UI Icons**: Some icon names may not exist; use alternatives like `Inventory2` instead of `Product`

### Common Fixes
```bash
# Fix frontend TypeScript issues
cd frontend
# Temporarily disable strict checking in tsconfig.json: "strict": false
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
- Backend must be healthy before frontend can authenticate
- NGINX configuration requires proper gzip directives (avoid "must-revalidate" in gzip_proxied)

### Docker Container Issues
- **Frontend blank page**: ~~This issue has been permanently fixed. The Docker build now properly copies the production-built index.html with correct asset references instead of the development version.~~ (RESOLVED)

## Key Files to Know

- `backend/src/app.module.ts` - Main NestJS module with global providers
- `backend/src/database/entities/base.entity.ts` - Base entity all others extend  
- `frontend/src/App.tsx` - Main React component with routing
- `frontend/src/hooks/useAuth.tsx` - Authentication context and state
- `frontend/src/store/slices/` - Redux slices (may need null checks for TypeScript)
- `docker-compose.yml` - Complete service orchestration
- `deploy.sh` - Production deployment automation
- `frontend/nginx.conf` - NGINX configuration for frontend container
# important-instruction-reminders
Do what has been asked; nothing more, nothing less.
NEVER create files unless they're absolutely necessary for achieving your goal.
ALWAYS prefer editing an existing file to creating a new one.
NEVER proactively create documentation files (*.md) or README files. Only create documentation files if explicitly requested by the User.