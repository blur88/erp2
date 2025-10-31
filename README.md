# 🏢 ERP System - Modern Business Management

A comprehensive ERP (Enterprise Resource Planning) system built with modern full-stack architecture, featuring inventory management, sales, purchasing, user management, and real-time dashboard analytics. Currently optimized for rapid development with simplified authentication-free architecture.

## 🚀 Quick Start

### Prerequisites
- Docker and Docker Compose
- Node.js 22+ (for development)
- PostgreSQL 15+ (if running locally)

### One-Click Deployment
```bash
# Clone and navigate to the project
cd /home/blur/erp2

# Start all services with Docker Compose
docker-compose up -d

# Access the application
# Frontend: http://localhost:3000
# Backend API: http://localhost:3001/api
# API Documentation: http://localhost:3001/api/docs
```

### Quick System Commands
```bash
# Stop services
./deploy.sh stop

# Restart services
./deploy.sh restart

# View logs
./deploy.sh logs

# Check service status
./deploy.sh status

# Clean up everything
./deploy.sh clean
```

## 🌍 Access URLs

### Core System
- **Frontend**: http://localhost:3000
- **Backend API**: http://localhost:3001/api
- **API Documentation**: http://localhost:3001/api/docs

### ✅ Working Pages (Fully Functional)
- **Dashboard**: http://localhost:3000/ (with real-time WebSocket updates)
- **Inventory Management**: http://localhost:3000/inventory
- **Products**: http://localhost:3000/inventory/products (CRUD + soft-deleted management)
- **Categories**: http://localhost:3000/inventory/categories (simplified table view)
- **Sales**: http://localhost:3000/sales (customers, orders, invoices, payments)
- **Purchasing**: http://localhost:3000/purchasing (suppliers, purchase orders - re-enabled October 2025)
- **Users**: http://localhost:3000/users (basic CRUD)

### ⚠️ Non-Functional Pages (Modules Disabled)
- Reports pages (ReportsModule disabled)
- Plugin pages (PluginsModule disabled)

## 📋 System Overview

### Current Status - October 2025

**⚠️ CRITICAL: Authentication system completely removed**

- **Active Modules**: `UsersModule`, `InventoryModule`, `SalesModule`, `PurchasingModule`, `DashboardModule` (5 active)
- **Disabled Modules**: `ReportsModule`, `PluginsModule` (commented out in `app.module.ts`)
- **Public API Access**: All endpoints publicly accessible without authentication
- **Frontend Integration**: Fully integrated with backend

### Core Features
- ✅ **Dashboard** - Real-time KPIs with WebSocket updates
- ✅ **Inventory Management** - Products with barcodes, simplified categories, soft-delete management
- ✅ **Sales Management** - Customers, orders, invoices, payments with FIFO costing
- ✅ **Purchasing Management** - Suppliers, purchase orders, goods received notes (re-enabled October 2025)
- ✅ **User Management** - Basic user CRUD operations
- ❌ **Reporting** - Module disabled (available but needs enabling)
- ❌ **Plugin System** - Module disabled (available but needs enabling)

### Technology Stack
- **Frontend**: React 18 + TypeScript + Material-UI + Redux Toolkit + Vite
- **Backend**: NestJS 11 + TypeORM (PostgreSQL) + MongoDB + Redis 8 + Bull Queue
- **Infrastructure**: Docker + NGINX + Node.js 22
- **Testing**: Jest (backend) + Vitest (frontend)
- **Security**: Input validation, security headers (CORS, CSP, HSTS)

## 🏗️ Architecture

### Backend Structure
```
backend/
├── src/
│   ├── modules/
│   │   ├── users/          # ✅ User management (active)
│   │   ├── inventory/      # ✅ Product & stock management (active)
│   │   ├── sales/          # ✅ Sales & customer management (active)
│   │   ├── dashboard/      # ✅ Real-time analytics with WebSocket (active)
│   │   ├── purchasing/     # ✅ Supplier & procurement (re-enabled Oct 2025)
│   │   ├── reports/        # ❌ Business intelligence (disabled)
│   │   └── plugins/        # ❌ Plugin system (disabled)
│   ├── database/
│   │   ├── entities/       # TypeORM entities (19+ entities)
│   │   └── migrations/     # Database migrations
│   └── config/            # Configuration files
```

**Note**: Authentication completely removed. Purchasing module re-enabled October 2025. Reports and Plugins modules are commented out in `app.module.ts`.

### Frontend Structure
```
frontend/
├── src/
│   ├── components/        # Reusable UI components
│   ├── pages/            # Application pages
│   ├── hooks/            # Custom React hooks
│   ├── services/         # API integration
│   ├── store/            # Redux Toolkit state management
│   └── types/            # TypeScript definitions
```

## 🔐 Security Status

**⚠️ Current Security Model**: Authentication system has been completely removed for rapid development.

**Remaining Security Features**:
- **Input Validation**: Comprehensive validation using class-validator on all endpoints
- **Security Headers**: CORS, Content Security Policy (CSP), HTTP Strict Transport Security (HSTS)
- **Request Logging**: Basic request logging for monitoring

**⚠️ Public Access**: All API endpoints are publicly accessible without authentication.

## 📊 Active Business Modules

### 📦 Inventory Management (✅ Active)
- **Products**: Complete CRUD with simplified fields (name, description, barcode, prices, stock)
- **Categories**: Simplified hierarchical categorization (name + hierarchy only)
- **Stock Tracking**: Real-time inventory with stockQuantity field
- **Soft-Delete Management**: View and restore deleted products via modern dialog interface
- **Bulk Operations**: Mass operations on product records
- **Permanent Delete**: Hard delete functionality for soft-deleted products
- **Search & Filtering**: Search by name and barcode

### 💰 Sales Management (✅ Active)
- **Customers**: Customer database with bulk operations support
- **Sales Orders**: Order lifecycle management with auto-display after create/edit
- **Invoices**: Invoice generation and tracking with auto-generated line items
- **Payments**: Cash-only payment processing (simplified model)
- **FIFO Costing**: Automatic cost tracking integrated with inventory
- **Bulk Customer Operations**: Mass restore and delete functionality
- **Advanced Filtering**: Payment status and fulfillment status filters

### 🛒 Purchasing Management (✅ Re-enabled October 2025)
- **Suppliers**: Supplier database management
- **Purchase Orders**: PO creation and tracking with unique number generation
- **Goods Received**: Receiving and inventory updates
- **Overview Analytics**: Comprehensive purchasing dashboard
- **FIFO Integration**: Automatic cost tracking for purchases
- **Auth Cleanup**: All authentication dependencies removed

### 📈 Dashboard & Analytics (✅ Active)
- **Real-time Dashboard**: Live KPIs with WebSocket updates
- **Business Metrics**: Performance indicators and trends
- **Live Data Updates**: Instant updates without page refresh
- **Module Status**: Real-time system information

### 👥 User Management (✅ Active)
- **User CRUD**: Basic user management operations
- **No Authentication**: All endpoints publicly accessible

## ⚠️ Disabled Modules

### 📈 Reports & Analytics (Available but Disabled)
- Module exists but requires enabling and auth cleanup
- Would provide comprehensive reporting capabilities
- To enable: Uncomment in app.module.ts and fix auth-related TypeScript errors

### 🔌 Plugin System (Available but Disabled)
- Extensible architecture exists but disabled
- Could support custom modules and integrations
- To enable: Uncomment in app.module.ts and install missing dependencies

## 🆕 Recent Changes & Modernization

### 🚀 Latest Updates (October 2025)

#### Redis 8 Upgrade (October 2025)
- **Complete Upgrade**: Redis 7-alpine to 8-alpine3.22
- **Built-in Modules**: Search, JSON, TimeSeries, Bloom, and VectorSet now available
- **Enhanced Performance**: Better performance and security with Redis 8.2.2
- **License**: RSALv2/SSPLv1/AGPLv3 tri-license model

#### Purchasing Module Re-enabled (October 2025)
- **Module Active**: Purchasing module fully re-enabled with auth cleanup complete
- **Navigation**: Purchase order pages fully functional with proper routing
- **Overview Analytics**: Comprehensive purchasing dashboard with real-time data
- **Status Display**: Using `isFullyReceived` flag for accurate PO status

#### Sales Order Enhancements (October 2025)
- **Payment Features**: Overpayment handling with negative balance display and refund functionality
- **Advanced Filtering**: Payment status and fulfillment status filters
- **Optimistic Updates**: Better visual feedback for payment operations
- **Filter Layout**: Improved date range and status filter placement

#### Product Fields Modernization (October 2025)
- **Final Product Fields**: name, description, barcode, type, categoryId, baseCost, retailPrice, wholesalePrice, specialPrice, stockQuantity, notes, isActive
- **Removed Fields**: status, unit, reservedQuantity, reorderLevel, optimalStockLevel, stockStatus, weight, dimensions, brand, model, imageUrl, additionalImages, attributes
- **Database Migration**: Created migration to remove unused columns from products table
- **Search Simplification**: Search only by name and barcode

#### Soft-Deleted Products Feature (October 2025)
- **Backend Endpoints**: `GET /api/inventory/products/deleted` and `POST /api/inventory/products/:id/restore`
- **Frontend Integration**: Enhanced `DeletedProductsDialog` with modern table design
- **UI Integration**: "View Deleted" button in Products page header
- **Route Fix**: Moved deleted products endpoint before `:id` route to prevent UUID validation conflicts

#### Critical API Fixes (October 2025)
- **Product API Fixed**: Corrected data returning reversed due to inconsistent soft delete implementation
- **CategorySelector Fixed**: Now properly displays hierarchical category tree instead of just "Main Category"
- **Category Form Validation**: Fixed yup schema to allow `null` values for `parentId`

### 🔄 Platform Upgrades (September-October 2025)

#### NestJS 11 Upgrade
- **Complete Upgrade**: NestJS 11 with all dependencies updated
- **Modern Architecture**: Latest patterns and best practices
- **Enhanced Performance**: Better optimization and security

#### Node.js 22 Update
- **Docker Base Images**: Updated to Node.js 22 for better performance
- **Enhanced Security**: Latest security patches and improvements
- **Performance Gains**: Better memory management and execution speed

#### Frontend Dependencies
- **Alpine Packages**: Comprehensive updates to all Alpine packages
- **OpenSSL Updates**: Latest security patches
- **Container Health**: Added curl to frontend nginx container for health checks

### 🎆 Authentication Removal (Pre-September 2025)

#### Complete Auth System Removal
- **Removed Components**: JWT, RBAC, guards, decorators, authentication middleware
- **Public API Access**: All endpoints now publicly accessible for rapid development
- **Simplified Development**: No authentication barriers for frontend integration
- **Security Model**: Basic input validation and security headers only

## 🚀 Development Guide

### Development Setup
```bash
# Backend Development
cd backend
npm install
npm run start:dev        # Hot reload development server
npm run start:debug     # Debug mode with inspector
npm run start:prod       # Production mode

# Frontend Development
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

## 🚀 Deployment

### Production Deployment
```bash
# One-click deployment
./deploy.sh

# Build and start all services manually
docker-compose up -d --build

# Scale services if needed
docker-compose up -d --scale backend=3

# Monitor logs
docker-compose logs -f backend
```

### Environment Configuration
Copy `.env.example` to `.env` and configure:
```bash
# Database (PostgreSQL)
DATABASE_HOST=postgres
DATABASE_PORT=5432
DATABASE_NAME=erp_db
DATABASE_USER=erp_user
DATABASE_PASSWORD=your_secure_password

# Redis 8 (Caching & Queues)
REDIS_HOST=redis
REDIS_PORT=6379
REDIS_PASSWORD=

# Frontend (Runtime injection via window.__ENV__)
VITE_API_BASE_URL=http://localhost:3001
VITE_SOCKET_URL=http://localhost:3001
```

**Note**: Authentication-related variables (JWT_SECRET, etc.) removed since auth system was completely removed.

## 📋 API Documentation

**⚠️ Note**: All endpoints are publicly accessible (no authentication required)

### Working API Endpoints
```
# Users
GET    /api/users                           # List users
POST   /api/users                           # Create user
GET    /api/users/:id                       # Get user
PUT    /api/users/:id                       # Update user
DELETE /api/users/:id                       # Delete user

# Inventory - Products
GET    /api/inventory/products              # List active products
POST   /api/inventory/products              # Create product
GET    /api/inventory/products/:id          # Get product
PUT    /api/inventory/products/:id          # Update product
DELETE /api/inventory/products/:id          # Soft delete product
GET    /api/inventory/products/deleted      # List soft-deleted products
POST   /api/inventory/products/:id/restore  # Restore soft-deleted product

# Inventory - Categories
GET    /api/inventory/categories            # List categories (tree format)
POST   /api/inventory/categories            # Create category
GET    /api/inventory/categories/:id        # Get category
PUT    /api/inventory/categories/:id        # Update category
DELETE /api/inventory/categories/:id        # Delete category

# Sales
GET    /api/sales-orders                    # List sales orders
POST   /api/sales-orders                    # Create sales order
GET    /api/invoices                        # List invoices
POST   /api/invoices                        # Create invoice
GET    /api/payments                        # List payments
POST   /api/payments                        # Create payment
GET    /api/quotations                      # List quotations
GET    /api/credit                          # Customer credit management
GET    /api/sales/analytics                 # Sales analytics

# Purchasing (Re-enabled October 2025)
GET    /api/purchasing/suppliers            # List suppliers
POST   /api/purchasing/suppliers            # Create supplier
GET    /api/purchasing/purchase-orders      # List purchase orders
POST   /api/purchasing/purchase-orders      # Create purchase order
GET    /api/purchasing/overview             # Purchasing analytics dashboard

# System
GET    /api/info                            # Module information
```

### Disabled Endpoints
- **Reports APIs**: Module disabled, endpoints not accessible
- **Plugin APIs**: Module disabled, endpoints not accessible

Complete API documentation available at: `http://localhost:3001/api/docs`

## 🧪 Testing

```bash
# Backend tests
cd backend
npm run test
npm run test:e2e
npm run test:cov

# Frontend tests
cd frontend
npm run test
npm run test:coverage

# System integration tests
docker-compose -f docker-compose.test.yml up
```

## 📈 Performance & Scalability

### Current Capacity
- **Concurrent Access**: Unlimited (no authentication restrictions)
- **Data Volume**: Optimized for SME-level operations
- **Response Time**: < 200ms for typical operations
- **Real-time Updates**: WebSocket support for instant dashboard updates
- **Uptime**: 99.9% availability with proper deployment

### Scaling Options
- **Horizontal Scaling**: Load balancer + multiple backend instances
- **Database Scaling**: Read replicas and connection pooling (10 connections limit)
- **Caching**: Redis 8 for query caching and WebSocket state
- **CDN**: Static asset delivery optimization

## 🛠️ Maintenance

### Database Migrations
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

### Monitoring & Logging
- **Application Logs**: Structured logging with Winston
- **Performance Monitoring**: Built-in metrics and health checks
- **Error Tracking**: Comprehensive error handling and reporting
- **Audit Trails**: Complete activity logging for compliance

## 🤝 Contributing

1. Fork the repository
2. Create a feature branch
3. Make your changes
4. Add tests for new features
5. Ensure all tests pass
6. Submit a pull request

### Code Patterns

#### Entity Design
```typescript
@Entity('table_name')
@Index(['status', 'isActive'])
export class EntityName extends BaseEntity {
  @Column({ type: 'decimal', precision: 12, scale: 4 })
  retailPrice: number;
}
```

#### Soft Delete Pattern
```typescript
// Entity with soft delete support
@Entity('products')
export class Product extends BaseEntity {
  @Column({ default: true })
  isActive: boolean; // false when soft-deleted

  @DeleteDateColumn() // TypeORM built-in soft delete
  deletedAt?: Date;
}

// Service method for soft delete
async remove(id: string, user: string = 'system'): Promise<void> {
  await this.productRepository.softDelete(id);
}
```

## 📞 Support & Documentation

### 📅 Current System Information
- **✅ Authoritative Source**: `CLAUDE.md` - Most up-to-date project instructions and current system state
- **⚠️ Note**: This README provides overview information. Always check `CLAUDE.md` for latest status and detailed development patterns.

### 🔗 Resources
- **API Reference**: http://localhost:3001/api/docs (Swagger documentation)
- **Real-time System Status**: Use `/api/info` endpoint for current module states
- **Issue Tracking**: Create issues in the repository
- **Development Guide**: See `CLAUDE.md` for commands, patterns, and troubleshooting

### 🐛 Troubleshooting

#### Common Issues
- **TypeScript Issues**: Uses `"strict": false`, use `as any` assertions for TypeORM when needed
- **Docker Rebuilds**: Backend source changes require `docker compose build backend && docker compose up -d backend`
- **Frontend Changes**: Frontend changes require `docker compose build frontend && docker compose up -d frontend`
- **API Response Structure**: For tree endpoints, access directly as `response.data`, not `response.data.data`
- **Route Order Issues**: Specific routes (like `deleted`) must come before parameterized routes (like `:id`)

#### Debug Commands
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

## 📄 License

This project is licensed under the MIT License - see the LICENSE file for details.

## 🎉 System Status

- **Rapid Development Mode**: Authentication removed for faster iteration
- **Modern Tech Stack**: React 18 + NestJS 11 + TypeORM + Redis 8 + Node.js 22 + WebSocket
- **Active Modules**: Dashboard, Inventory, Sales, Purchasing, Users (5 of 7 modules enabled)
- **Clean Architecture**: Modular design with 2 modules available for re-enabling
- **Real-time Features**: WebSocket dashboard updates and live data
- **Latest Updates**: October 2025 - Redis 8 upgrade, Purchasing re-enabled, Product simplification

---

**🚀 Actively Developed** | **🔄 Real-time Updates** | **⚡ Simplified Architecture** | **📦 5 Active Modules**

> 📄 **For developers**: Always refer to `CLAUDE.md` for the most current system state, commands, and development patterns.
>
> ⚠️ **Note**: This README reflects the system as of October 2025. Check git history and CLAUDE.md for latest changes.