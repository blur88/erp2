# Repository Guidelines

## Project Structure & Module Organization
This repository is a full-stack ERP monorepo.
- `backend/`: NestJS API, TypeORM entities/migrations, Jest unit + e2e tests (`backend/test`).
- `frontend/`: React + TypeScript + Vite app, Vitest tests, reusable UI in `frontend/src/components`.
- `docs/`: operational and feature documentation.
- Root infra: `docker-compose.yml`, `deploy.sh` (development), `setup.sh` + `docker-compose.prod.yml` (production), `.env.example`, `nginx/`.

Keep domain logic inside module folders (for example `backend/src/modules/auth`, `frontend/src/pages/*`).

## Build, Test, and Development Commands
Use Docker for full-stack development runs, or run each app locally.
- `docker-compose up -d`: start full stack.
- `./deploy.sh restart|logs|status`: development stack operations.
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
- Add or update tests for any behavior change.

## Change-Scoped Verification (Required Before PR)
This section is the single source of truth for pre-PR verification. Select checks from the files touched; combine applicable rows and run each command only once. Documentation-only changes do not require application tests or type-checks.

| Files changed | Required commands (from repository root) |
|---|---|
| Backend source (`backend/src/**`) | `cd backend && npm run lint && npm run type-check && npm run test && npm run test:e2e` |
| Backend test sources (`backend/test/**`) | `cd backend && npm run type-check:spec && npm run test && npm run test:e2e` |
| Backend entities or migrations | Backend source checks, plus `cd backend && npm run migration:run && npm run test:e2e` |
| Frontend source (`frontend/src/**`) | `cd frontend && npm run lint && npm run type-check && npm run test:coverage` |
| Cross-app contracts (API DTOs/interfaces used by both apps) | `cd backend && npm run type-check && npm run test`; `cd frontend && npm run test:coverage`; also apply source checks for each app touched |

Backend `type-check` compiles `tsconfig.build.json` with `include: ["src"]`; it cannot see `test/**`. `type-check:spec` checks `test/**` and additionally `src/**` under the test TypeScript configuration. Unit-test transpilation does not replace either applicable type-check.

Frontend `npm run test:coverage` executes the complete test suite with coverage instrumentation, satisfying both frontend `test` and `test:coverage` requirements in one run. A successful full-suite `test:coverage` CI run on the PR's current head commit satisfies both requirements; do not repeat the same suite locally solely for documentation or review.

Completed successful CI evidence may satisfy the corresponding applicable commands. Evidence from older commits, incomplete runs, or unrelated checks does not satisfy verification requirements. PRs must record exact commands, actual results and CI links where used, plus checks not run and why. Use the [PR template](.github/pull_request_template.md) to collect current-head evidence. Keep the PR in draft while required checks are running; a PR ready for review must not describe required verification as "in progress".

## Commit & Pull Request Guidelines
Git history follows Conventional Commit style:
- Examples: `feat(accounting): ...`, `fix(accounting): ...`, `test(price-lists): ...`, `chore: ...`.

Commit messages and PR bodies must not contain AI attribution lines.

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
