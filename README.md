# 🏢 ERP System - Modern Business Management

A comprehensive ERP (Enterprise Resource Planning) system built with modern full-stack architecture, featuring JWT authentication, inventory management, sales, purchasing, user management, and real-time dashboard analytics. Production-ready with complete security and role-based access control.

## 🚀 Quick Start

### Prerequisites
- Docker and Docker Compose
- Node.js 24+ (for development)
- PostgreSQL 18+ (if running locally)

### One-Click Deployment
```bash
# Clone and navigate to the project
cd /home/blur/erp2

# Start all services with Docker Compose
docker-compose up -d

# Access the application
# Frontend: http://localhost:3000 (redirects to /login)
# Backend API: http://localhost:3001/api
# API Documentation: http://localhost:3001/api/docs

# Default admin credentials (CHANGE IMMEDIATELY after first login)
# Username: admin
# Password: Admin@123!
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

### ✅ Working Pages (Fully Functional - Authentication Required)
- **Login**: http://localhost:3000/login (JWT authentication)
- **Dashboard**: http://localhost:3000/ (with real-time WebSocket updates)
- **Inventory Management**: http://localhost:3000/inventory
- **Products**: http://localhost:3000/inventory/products (CRUD + soft-deleted management)
- **Categories**: http://localhost:3000/inventory/categories (simplified table view)
- **Sales**: http://localhost:3000/sales (customers, orders, invoices, payments)
- **Purchasing**: http://localhost:3000/purchasing (suppliers, purchase orders)
- **User Management**: http://localhost:3000/settings/users (admin only)
- **Role Management**: http://localhost:3000/settings/roles (admin/manager)
- **Security Settings**: http://localhost:3000/settings/security (admin only)

### 📊 Module-Embedded Reports (Active - December 2025)
- **Inventory Reports**: Product Cost, Price List, Summary, Historical, Movement Summary
- **Sales Reports**: Integrated within Sales module navigation
- **Purchasing Reports**: Vendor Product List and other purchasing reports


## 📋 System Overview

### Current Status - December 2025

**✅ PRODUCTION-READY: Complete JWT authentication system implemented**

- **Active Modules**: `AuthModule`, `UsersModule`, `InventoryModule`, `SalesModule`, `PurchasingModule`, `DashboardModule`, `SettingsModule`, `PrintSettingsModule`, `PriceListsModule`, `AuditLogsModule`, `BackupModule` (11 active)
- **Module-Embedded Reports**: Each business module (Inventory, Sales, Purchasing) has integrated reports
- **Authentication**: JWT-based with refresh tokens, role-based access control (5 roles)
- **Security**: bcrypt password hashing, account lockout, rate limiting
- **Test Coverage**: 81 tests (57 backend + 24 frontend) - 100% passing

### Core Features
- ✅ **Authentication & Authorization** - JWT with refresh tokens, RBAC with 5 roles, account lockout
- ✅ **Dashboard** - Real-time KPIs with WebSocket updates
- ✅ **Inventory Management** - Products with barcodes, simplified categories, soft-delete management
- ✅ **Sales Management** - Customers, orders, invoices, payments with flexible costing methods
- ✅ **Purchasing Management** - Suppliers, purchase orders, goods received notes
- ✅ **Module-Embedded Reports** - Comprehensive reporting in Inventory, Sales, Purchasing modules
- ✅ **Settings Management** - Company settings and print template configuration
- ✅ **Admin Settings UI** - User management, role management, security settings (admin only)
- ✅ **Audit Logging** - Comprehensive audit trails for all operations
- ✅ **Backup & Restore** - Database backup and restore functionality
- ✅ **Price Lists** - Multiple pricing schemes with time-based effective dates

### Technology Stack
- **Frontend**: React 18.3.1 + TypeScript + Material-UI v7 + Redux Toolkit + Vite
- **Backend**: NestJS 11 + TypeORM (PostgreSQL 18.1) + MongoDB + Redis 8.4 + Bull Queue
- **Infrastructure**: Docker + NGINX + Node.js 24
- **Testing**: Jest (backend) + Vitest (frontend) - 81 tests total
- **Security**: JWT authentication, bcrypt hashing, RBAC, rate limiting, input validation, security headers

## 🏗️ Architecture

### Backend Structure
```
backend/
├── src/
│   ├── modules/
│   │   ├── auth/           # ✅ JWT authentication, token refresh, password management (active)
│   │   ├── users/          # ✅ User management with RBAC (active)
│   │   ├── inventory/      # ✅ Product & stock management with integrated reports (active)
│   │   ├── sales/          # ✅ Sales & customer management with integrated reports (active)
│   │   ├── purchasing/     # ✅ Supplier & procurement with integrated reports (active)
│   │   ├── dashboard/      # ✅ Real-time analytics with WebSocket (active)
│   │   ├── settings/       # ✅ Company settings and configuration (active)
│   │   ├── print-settings/ # ✅ Print templates and settings (active)
│   │   ├── audit-logs/     # ✅ Comprehensive audit logging (active)
│   │   ├── backup/         # ✅ Database backup and restore (active)
│   │   └── price-lists/    # ✅ Price list management (active)
│   ├── database/
│   │   ├── entities/       # TypeORM entities (20+ entities including RefreshToken)
│   │   └── migrations/     # Database migrations
│   └── config/            # Configuration files
```

**Note**: Complete authentication system implemented (December 2025). 11 active modules. Reports embedded within business modules.

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

**✅ Production-Ready Security**: Complete JWT authentication system with comprehensive security features.

**Authentication & Authorization**:
- **JWT Tokens**: Access tokens (15 min) + Refresh tokens (7 days) with rotation
- **Password Security**: bcrypt hashing (12 rounds), complexity validation
- **Account Protection**: Lockout after 5 failed attempts (30 min), last login tracking
- **Role-Based Access Control**: 5 roles (Admin, Manager, Sales, Inventory, Procurement)
- **Global Guard**: All endpoints protected by default, public endpoints explicitly marked
- **Rate Limiting**: 5 req/min for login, 3 req/min for registration

**Additional Security Features**:
- **Input Validation**: Comprehensive validation using class-validator on all endpoints
- **Security Headers**: CORS, Content Security Policy (CSP), HTTP Strict Transport Security (HSTS)
- **Audit Logging**: Complete activity tracking for compliance
- **Token Cleanup**: Daily automated cleanup of expired tokens

**Default Admin Credentials** (⚠️ CHANGE IMMEDIATELY):
- Username: `admin`
- Password: `Admin@123!`

**Security Score**: A+ (100%) - See `SECURITY_AUDIT_PHASE4.md` for detailed audit report

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
- **Flexible Costing**: Support for AVERAGE, FIFO, LIFO, and STANDARD costing methods
- **Bulk Customer Operations**: Mass restore and delete functionality
- **Advanced Filtering**: Payment status and fulfillment status filters
- **Integrated Reports**: Sales analytics and reporting within module

### 🛒 Purchasing Management (✅ Re-enabled October 2025)
- **Suppliers**: Supplier database management
- **Purchase Orders**: PO creation and tracking with unique number generation
- **Goods Received**: Receiving and inventory updates
- **Overview Analytics**: Comprehensive purchasing dashboard
- **Costing Integration**: Automatic cost tracking with configurable costing methods
- **Auth Cleanup**: All authentication dependencies removed
- **Integrated Reports**: Vendor Product List and purchasing analytics

### 📈 Dashboard & Analytics (✅ Active)
- **Real-time Dashboard**: Live KPIs with WebSocket updates
- **Business Metrics**: Performance indicators and trends
- **Live Data Updates**: Instant updates without page refresh
- **Module Status**: Real-time system information

### 👥 User Management & Admin Settings (✅ Active)
- **User CRUD**: Complete user management with password security
- **Admin UI**: User management page with search, filters, bulk operations
- **Role Management**: Role documentation and permission display
- **Security Settings**: View security policies and active sessions
- **Account Lockout**: Automatic lockout after failed login attempts
- **Password Management**: Complexity validation, secure password changes

### ⚙️ Settings & Configuration (✅ Active - November 2025)
- **Company Settings**: Business configuration and preferences
- **Price & Costing Settings**: Configurable costing methods (AVERAGE, FIFO, LIFO, STANDARD)
- **Print Settings**: Print templates and printing configuration
- **System Configuration**: Application-wide settings management

## 🆕 Recent Changes & Modernization

### 🚀 Latest Updates (December 2025)

#### Complete Authentication System (December 2025)
- **JWT Authentication**: Access tokens (15 min) + refresh tokens (7 days) with rotation
- **Frontend Integration**: Protected routes, automatic token refresh, login/logout flows
- **Admin Settings UI**: User management, role management, security settings pages
- **Role-Based Access Control**: 5 roles with granular permissions
- **Comprehensive Testing**: 81 tests (57 backend + 24 frontend) - 100% passing
- **Security Audit**: A+ rating (100%) with OWASP Top 10 compliance
- **Production Ready**: Complete with deployment guide and security documentation
- **See Documentation**: `plan.md`, `SECURITY_AUDIT_PHASE4.md`, `DEPLOYMENT_GUIDE.md`

#### PostgreSQL 18.1 Upgrade (December 2025)
- **Complete Upgrade**: PostgreSQL 15.14 to 18.1-alpine3.23
- **Performance**: Enhanced query optimizer, better parallelism, faster VACUUM
- **Security**: Latest CVE patches and improved SSL/TLS support
- **Zero Downtime**: Automated migration with full backup and restore

#### Material-UI v7 Upgrade (December 2025)
- **Complete Upgrade**: Material-UI v5 to v7.3.6
- **React Compatibility**: Requires React 18.3.1 (upgraded simultaneously)
- **Breaking Changes**: Updated component APIs and theme structure
- **Benefits**: Enhanced performance, improved TypeScript support, new component features

#### Redis 8.4 Upgrade (December 2025)
- **Complete Upgrade**: Redis 8.2.2 to 8.4.0-alpine3.22
- **Built-in Modules**: Search, JSON, TimeSeries, Bloom, and VectorSet now available
- **Enhanced Performance**: Better performance and security with Redis 8.4.0
- **License**: RSALv2/SSPLv1/AGPLv3 tri-license model

### 🚀 Major Updates (October-November 2025)

#### Module-Embedded Reports (November 2025)
- **Architecture**: Reports integrated within Inventory, Sales, and Purchasing modules
- **Inventory Reports**: Product Cost, Price List, Summary, Historical, Movement Summary
- **Sales Reports**: Enhanced with subtotals and grand totals
- **Purchasing Reports**: Vendor Product List with weighted average pricing
- **Export**: Excel (ExcelJS) and PDF (jsPDF) generation

#### Flexible Costing Methods (November 2025)
- **Methods**: AVERAGE, FIFO, LIFO, and STANDARD costing
- **Automatic Calculation**: Real-time cost updates on GRN, sales, and returns
- **Switchable**: Change costing method with automatic recalculation
- **Settings Integration**: Configured via Settings module

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

#### Node.js 24 Update
- **Docker Base Images**: Updated to Node.js 24 Alpine for better performance
- **Enhanced Security**: Latest security patches and improvements
- **Performance Gains**: Better memory management and execution speed

#### Frontend Dependencies
- **Alpine Packages**: Comprehensive updates to all Alpine packages
- **OpenSSL Updates**: Latest security patches
- **Container Health**: Added curl to frontend nginx container for health checks

### 🔐 Authentication Implementation (September-December 2025)

#### Complete Auth System Implementation
- **Phase 1**: Backend foundation with JWT, guards, decorators, authentication middleware
- **Phase 2**: Frontend integration with Redux, protected routes, login page
- **Phase 3**: Admin Settings UI for user/role/security management
- **Phase 4**: Comprehensive testing (81 tests) and security audit (A+ rating)
- **Production Ready**: Full security with deployment documentation

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

# JWT Configuration (REQUIRED)
JWT_SECRET=your_secure_secret_min_128_chars
JWT_ACCESS_TOKEN_EXPIRY=15m
JWT_REFRESH_TOKEN_EXPIRY=7d
```

**⚠️ CRITICAL**: Generate a unique JWT_SECRET before production deployment:
```bash
node -e "console.log(require('crypto').randomBytes(64).toString('hex'))"
```

## 📋 API Documentation

**🔐 Note**: All endpoints require JWT authentication (except login/register). Include `Authorization: Bearer <token>` header.

### Authentication Endpoints
```
# Authentication (Public endpoints)
POST   /api/auth/login                      # Login with username/email + password
POST   /api/auth/register                   # Register new user (rate limited)
POST   /api/auth/refresh                    # Refresh access token
POST   /api/auth/logout                     # Logout and invalidate tokens
GET    /api/auth/me                         # Get current user (requires auth)
POST   /api/auth/change-password            # Change password (requires auth)
```

### Working API Endpoints (Authentication Required)
```
# Users (Admin only)
GET    /api/users                           # List users
POST   /api/users                           # Create user
GET    /api/users/:id                       # Get user
PATCH  /api/users/:id                       # Update user
DELETE /api/users/:id                       # Soft delete user
PATCH  /api/users/:id/admin                 # Admin actions (unlock account)
GET    /api/users/statistics                # User statistics

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

# Settings & Configuration
GET    /api/settings                        # Get company settings
PUT    /api/settings/price-costing          # Update costing method
GET    /api/print-settings                  # Get print settings

# Costing & Reports
GET    /api/inventory/costing/method        # Get current costing method
POST   /api/inventory/costing/recalculate   # Recalculate all product costs
GET    /api/inventory/reports/*             # Inventory reports (5 report types)
GET    /api/sales/reports/*                 # Sales reports
GET    /api/purchasing/reports/*            # Purchasing reports

# System
GET    /api/info                            # Module information
```

### Role-Based Access
- **Admin**: Full access to all endpoints including user management
- **Manager**: All operations except user management
- **Sales Staff**: Sales and customer management endpoints
- **Inventory Staff**: Inventory and stock management endpoints
- **Procurement Staff**: Purchasing and supplier management endpoints

Complete API documentation available at: `http://localhost:3001/api/docs`

**Authentication Required**: Use the login endpoint to obtain JWT tokens, then include in all subsequent requests:
```bash
# Login example
curl -X POST http://localhost:3001/api/auth/login \
  -H "Content-Type: application/json" \
  -d '{"usernameOrEmail":"admin","password":"Admin@123!"}'

# Use token in subsequent requests
curl -X GET http://localhost:3001/api/users \
  -H "Authorization: Bearer <your_access_token>"
```

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
- **Concurrent Users**: Supports hundreds of concurrent authenticated users
- **Data Volume**: Optimized for SME-level operations
- **Response Time**: < 200ms for typical operations
- **Real-time Updates**: WebSocket support for instant dashboard updates
- **Uptime**: 99.9% availability with proper deployment
- **Security**: JWT token validation with minimal performance overhead

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
- **Security Documentation**: See `SECURITY_AUDIT_PHASE4.md` for security audit and compliance
- **Deployment Guide**: See `DEPLOYMENT_GUIDE.md` for production deployment instructions
- **Implementation Plan**: See `plan.md` for complete authentication implementation details

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

- **Production Ready**: Complete JWT authentication with comprehensive security (A+ rating)
- **Modern Tech Stack**: React 18.3.1 + NestJS 11 + TypeORM + PostgreSQL 18.1 + Redis 8.4 + Node.js 24 + WebSocket
- **Active Modules**: Auth, Users, Inventory, Sales, Purchasing, Dashboard, Settings, Print Settings, Audit Logs, Backup (10 modules)
- **Module-Embedded Reports**: Comprehensive reporting in Inventory, Sales, and Purchasing modules
- **Admin Settings UI**: User management, role management, security settings (Phase 3 complete)
- **Comprehensive Testing**: 81 tests (57 backend + 24 frontend) - 100% passing
- **Flexible Costing**: AVERAGE, FIFO, LIFO, and STANDARD costing methods
- **Real-time Features**: WebSocket dashboard updates and live data
- **Latest Updates**: December 2025 - Complete authentication system, PostgreSQL 18.1, Material-UI v7, Redis 8.4

---

**✅ Production Ready** | **🔐 Secure Authentication** | **🔄 Real-time Updates** | **📦 10 Active Modules** | **📊 Integrated Reports** | **🧪 81 Tests Passing**

> 📄 **For developers**: Always refer to `CLAUDE.md` for the most current system state, commands, and development patterns.
>
> 🔐 **Security**: Change default admin password immediately after first login. See `DEPLOYMENT_GUIDE.md` for production deployment.
>
> ✅ **Note**: This README reflects the production-ready system as of December 30, 2025 with complete authentication implementation.