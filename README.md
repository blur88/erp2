# ERP System

A full-stack Enterprise Resource Planning (ERP) system for small-to-medium businesses,
covering inventory, sales, purchasing, accounting, and reporting with JWT authentication
and role-based access control.

## Tech Stack

- **Frontend**: React 19 + TypeScript 6 + Material-UI v9 + Redux Toolkit + Vite
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
npm run test:redis      # Redis integration suite (see below)
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

### Running the Redis integration suite

`npm run test:redis` exercises the BullMQ scheduler-reconciliation logic against
a **real** Redis. It is the only gate that catches errors the unit tests cannot,
because those mock the Redis client.

The suite connects to `REDIS_TEST_HOST:REDIS_TEST_PORT`, defaulting to
`127.0.0.1:6399`. Start a disposable Redis there first:

```bash
docker run -d --name erp-redis-test-6399 -p 6399:6379 \
  redis:8.6-alpine redis-server --maxmemory-policy noeviction

npm run test:redis      # expects: 1 suite, 11 tests

docker rm -f erp-redis-test-6399
```

> **Warning**: Never point this suite at the application's Redis (the compose
> `redis` service on 6379), a shared instance, or anything production-like. It
> writes and flushes real BullMQ queue state and would destroy live schedulers.
> The separate port is the safeguard.

`npm run test:redis` runs a preflight probe first, so a missing Redis fails in
about a second with setup instructions. Without it, ioredis retries the
connection rather than failing, and the run hangs until Jest times out
(~10 minutes) — which looks like a broken suite instead of absent setup.

`Tests: 0 total` from this suite is a **failure**, not a pass: a suite that
fails to load reports zero. Check the exit code, not the summary line.

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

See [`docs/deployment/DEPLOYMENT_CHECKLIST.md`](docs/deployment/DEPLOYMENT_CHECKLIST.md) for production configuration and security hardening.

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
