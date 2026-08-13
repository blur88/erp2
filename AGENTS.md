# Repository Guidelines

## Project Structure & Module Organization
This repository is a full-stack ERP monorepo.
- `backend/`: NestJS API, TypeORM entities/migrations, Jest unit + e2e tests (`backend/test`).
- `frontend/`: React + TypeScript + Vite app, Vitest tests, reusable UI in `frontend/src/components`.
- `docs/`: operational and feature documentation.
- Root infra: `docker-compose.yml`, `deploy.sh`, `.env.example`, `nginx/`.

Keep domain logic inside module folders (for example `backend/src/modules/auth`, `frontend/src/pages/*`).

## Build, Test, and Development Commands
Use Docker for full-stack runs, or run each app locally.
- `docker-compose up -d`: start full stack.
- `./deploy.sh restart|logs|status`: common operational workflows.
- `cd backend && npm run start:dev`: run API in watch mode.
- `cd frontend && npm run dev`: run Vite dev server.
- `cd backend && npm run build`: compile backend.
- `cd frontend && npm run build`: produce frontend production bundle.

Quality and checks:
- `cd backend && npm run lint && npm run format`
- `cd frontend && npm run lint && npm run type-check`

## Coding Style & Naming Conventions
Primary language is TypeScript.
- Follow ESLint + Prettier in backend; ESLint + TypeScript checks in frontend.
- Use 2-space indentation and keep imports organized by feature/domain.
- Naming: `PascalCase` for React components/classes, `camelCase` for variables/functions, `kebab-case` for filenames where established.
- Keep DTOs/entities/services grouped by module in backend.

## Testing Guidelines
- Backend: Jest (`*.spec.ts`) and e2e under `backend/test/e2e`.
- Frontend: Vitest + Testing Library; co-locate tests in `__tests__` or `*.test.ts(x)`.
- Run before PR:
  - `cd backend && npm run test && npm run test:e2e`
  - `cd frontend && npm run test && npm run test:coverage`

Add or update tests for any behavior change.

## Change-Scoped Verification (Required Before PR)
Run checks based on files touched (not just a default test set):
- Backend changes (`backend/src/**`):
  - `cd backend && npm run lint && npm run type-check && npm run test`
- Backend DB changes (entities/migrations):
  - `cd backend && npm run migration:run && npm run test:e2e`
- Frontend changes (`frontend/src/**`):
  - `cd frontend && npm run lint && npm run type-check && npm run test`
- Cross-app contract changes (API DTOs/interfaces used by both apps):
  - `cd backend && npm run type-check && npm run test`
  - `cd frontend && npm run test && npm run test:coverage`

If multiple areas are changed, run all relevant checks.
PRs must include the exact verification commands run and whether they passed.

## Commit & Pull Request Guidelines
Git history follows Conventional Commit style:
- Examples: `feat(accounting): ...`, `fix(accounting): ...`, `test(price-lists): ...`, `chore: ...`.

PRs should include:
- Clear summary and impacted modules.
- Linked issue/ticket.
- Test evidence (commands run and results).
- UI screenshots for frontend changes.
- Notes for migrations/env changes when applicable.

## Security & Configuration Tips
- Never commit real secrets; copy from `.env.example`.
- Rotate default credentials in non-dev environments.
- Validate DB changes with migrations (`npm run migration:run`) instead of manual schema edits.
