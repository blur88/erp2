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

# Frontend development  
cd frontend
npm install
npm run dev             # Vite dev server with hot reload
npm run build           # Production build
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
erp-plugin build --production
erp-plugin validate

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
```

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
- **State management**: Redux Toolkit with persistence
- **Routing**: React Router with protected routes
- **UI framework**: Material-UI v5 with custom theming
- **Data fetching**: Axios with interceptors for auth
- **Real-time**: WebSocket integration for live updates

### Security Implementation
Multi-layered security approach:
- **Authentication**: JWT with refresh tokens, Redis session storage
- **Authorization**: Role-based access control with guards
- **Input validation**: class-validator on all DTOs
- **Rate limiting**: Multiple tiers (per-second, per-minute, per-15min)
- **Security headers**: CORS, CSP, HSTS via Helmet
- **Audit logging**: Complete audit trail with user attribution

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
- Use @Public() decorator to bypass JWT authentication
- Use @Roles() decorator for role-based authorization

### Plugin Development
The plugin system supports multiple plugin types:
- **Business modules**: New ERP functionality (HR, CRM, Manufacturing)
- **Integrations**: Third-party services (payment gateways, shipping)
- **UI extensions**: Dashboard widgets, custom pages
- **Workflows**: Process automation and approvals

Plugins must extend `BasePlugin` class and use decorators like `@Plugin()`, `@Hook()`, `@ApiEndpoint()`.

## Environment Configuration

Copy `.env.example` to `.env` and configure:
- **Database**: PostgreSQL connection settings
- **Redis**: Cache and session storage
- **JWT**: Secret keys and expiration times
- **Email**: SMTP settings for notifications
- **Upload**: File storage paths and limits

## Access Information

**Development URLs**:
- Frontend: http://localhost:3000
- Backend API: http://localhost:3001/api  
- API Documentation: http://localhost:3001/api/docs

**Demo accounts** (username/password):
- Admin: admin@erp.com / admin123
- Manager: manager@erp.com / manager123
- Sales Staff: sales@erp.com / sales123

## Key Files to Know

- `backend/src/app.module.ts` - Main NestJS module with global providers
- `backend/src/database/entities/base.entity.ts` - Base entity all others extend
- `frontend/src/App.tsx` - Main React component with routing
- `frontend/src/hooks/useAuth.tsx` - Authentication context and state
- `docker-compose.yml` - Complete service orchestration
- `deploy.sh` - Production deployment automation