# ERP System

A full-stack Enterprise Resource Planning (ERP) system for small-to-medium businesses,
covering inventory, sales, purchasing, accounting, and reporting with JWT authentication
and role-based access control.

## Tech Stack

- **Frontend**: React 18 + TypeScript + Material-UI v7 + Redux Toolkit + Vite
- **Backend**: NestJS 11 + TypeORM + PostgreSQL + Redis 8 + Bull Queue
- **Infrastructure**: Docker + NGINX + Node.js 24

## Features

- JWT authentication with refresh token rotation and account lockout
- Role-based access control (Admin, Manager, Sales, Inventory, Procurement)
- Inventory management with soft-delete and stock tracking
- Sales orders, invoices, and payment processing
- Purchasing with supplier and goods-received management
- Double-entry accounting with bank reconciliation and financial reports
- Price list management with effective dates and bulk operations
- Real-time dashboard with WebSocket updates
- Audit logging for all operations
- Excel and PDF report exports

## Prerequisites

- [Docker](https://www.docker.com/) and Docker Compose
- Node.js 24+ (for local development without Docker)

## Quick Start

```bash
# Clone the repository
git clone <repository-url>
cd erp2

# Start all services
docker compose up -d

# Access the application
# Frontend:     http://localhost:3000
# Backend API:  http://localhost:3000/api
# API Docs:     http://localhost:3000/api/docs
```

**Default credentials** — change immediately after first login:
- Username: `admin`
- Password: `Admin@123!`

## Configuration

Copy `.env.example` to `.env` and set the following:

```env
# Database
DATABASE_HOST=postgres
DATABASE_PORT=5432
DATABASE_NAME=erp_db
DATABASE_USER=erp_user
DATABASE_PASSWORD=your_secure_password

# Redis
REDIS_HOST=redis
REDIS_PORT=6379
REDIS_PASSWORD=

# JWT — generate with: node -e "console.log(require('crypto').randomBytes(64).toString('hex'))"
JWT_SECRET=your_secret_min_128_chars
JWT_ACCESS_TOKEN_EXPIRY=15m
JWT_REFRESH_TOKEN_EXPIRY=7d

# Frontend
VITE_API_BASE_URL=/api
VITE_SOCKET_URL=/
```

## Development

```bash
# Backend
cd backend
npm install
npm run start:dev       # hot reload
npm run test            # unit tests
npm run test:e2e        # end-to-end tests
npm run test:cov        # coverage report

# Frontend
cd frontend
npm install
npm run dev             # Vite dev server
npm run test            # Vitest unit tests
npm run type-check      # TypeScript check

# Database migrations
cd backend
npm run migration:generate --name=DescriptiveName
npm run migration:run
npm run migration:revert
```

> **Note**: Backend source changes in Docker require a rebuild:
> `docker compose build backend && docker compose up -d backend`

## API Reference

All endpoints require `Authorization: Bearer <token>` except `/api/auth/login` and `/api/auth/register`.

Interactive API documentation is available at `http://localhost:3000/api/docs`.

Key endpoint groups:
- `POST /api/auth/login` — obtain access + refresh tokens
- `/api/inventory/products` — product CRUD
- `/api/sales-orders` — sales order management
- `/api/purchasing/purchase-orders` — purchase order management
- `/api/accounting/journal-entries` — double-entry accounting
- `/api/price-lists` — pricing management

## Deployment

```bash
./deploy.sh          # start all services
./deploy.sh stop     # stop services
./deploy.sh restart  # restart services
./deploy.sh logs     # view logs
./deploy.sh status   # service status
./deploy.sh clean    # remove all containers and volumes
```

See `DEPLOYMENT_GUIDE.md` for production configuration and security hardening.

## Contributing

1. Fork the repository
2. Create a feature branch (`git checkout -b feature/my-feature`)
3. Write tests for new functionality
4. Ensure all tests pass (`npm run test`)
5. Submit a pull request

## License

Copyright (c) 2026 MF Global Network. All rights reserved.

This software is proprietary. Personal and internal business use is permitted.
Commercial use, resale, or redistribution is not permitted without written permission.

See [LICENSE](LICENSE) for full terms.
