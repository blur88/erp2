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

## Coding Style & Naming Conventions
Primary language is TypeScript.
- Follow ESLint + Prettier in backend; ESLint + TypeScript checks in frontend.
- Use 2-space indentation and keep imports organized by feature/domain.
- Naming: `PascalCase` for React components/classes, `camelCase` for variables/functions, `kebab-case` for filenames where established.
- Keep DTOs/entities/services grouped by module in backend.

## Testing Guidelines
- Backend: Jest (`*.spec.ts`) and e2e under `backend/test/e2e`.
- Frontend: Vitest + Testing Library; co-locate tests in `__tests__` or `*.test.ts(x)`.

Add or update tests for any behavior change.

## Change-Scoped Verification (Required Before Merge)

Before opening the PR, pass applicable local-only checks locally: lint, type-check, `type-check:spec`, targeted regression tests, and `migration:run`.

Before merge, every applicable gate needs qualifying evidence on the exact final head SHA. Any new commit, including docs-only changes, invalidates earlier evidence. There is no “unrelated change” exemption. Rerun local-only checks and obtain fresh evidence for CI-eligible commands.

Matching rows are cumulative. Run a command shared by several rows once per qualifying SHA.

| Files changed | Commands (run from) | CI may supply |
|---|---|---|
| `backend/src/**` | `npm run lint && npm run type-check && npm run test && npm run test:e2e` (`backend/`) | `npm run test`: Backend - Lint, Type Check, Unit Tests, E2E Tests / Unit tests; `npm run test:e2e`: Backend - Lint, Type Check, Unit Tests, E2E Tests / E2E tests |
| `backend/test/**` | `npm run type-check:spec && npm run test:e2e` (`backend/`) | `npm run test:e2e`: Backend - Lint, Type Check, Unit Tests, E2E Tests / E2E tests |
| Backend entities/migrations | `npm run migration:run && npm run test:e2e` (`backend/`); local migration must pass before e2e | `npm run test:e2e`: Backend - Lint, Type Check, Unit Tests, E2E Tests / E2E tests |
| `frontend/src/**` | `npm run lint && npm run type-check && npm run test:coverage` (`frontend/`) | `npm run test:coverage`: Frontend - Lint, Type Check, Tests / Tests with coverage |
| Cross-app contracts (API DTOs/interfaces used by both apps) | Union of backend source and frontend source rows | As in those rows |
| `backend/scripts/**`, agent guidance (`AGENTS.md`, `CLAUDE.md`), or linked topic documentation | `npm run test:scripts` (`backend/`) | `npm run test:scripts`: Backend - Lint, Type Check, Unit Tests, E2E Tests / Gate script tests |
| `release.config.cjs`, root `scripts/**`, `.github/workflows/**` | `npm ci && node --test scripts/__tests__/*.test.js && sh scripts/tests/git-hooks.sh` (repo root); report the two suites separately | `node --test scripts/__tests__/*.test.js`: Root script tests / Test root scripts; `sh scripts/tests/git-hooks.sh`: Git hook integration tests / Test local main guards |

Frontend `npm run test:coverage` executes the full suite with coverage and satisfies both full-suite test and coverage requirements.

Backend `type-check:spec` catches `test/**`, excluded by the build configuration, and checks `src/**` under the test configuration. For guidance pointer rules and limitations, read [agent document pointer checks](docs/backend/testing.md#agent-document-pointer-checks).

Backend CI's `npm run test -- --no-coverage` is equivalent to backend `npm run test`; any other substitution needs an explicit equivalence rule. The local-only checks listed above always stay local. CI's fresh-database migration check does not replace the [disposable-clone migration procedure](docs/agents/development-reference.md#disposable-clone-migration-verification).

CI evidence qualifies only when the same command finished with status `success` on the exact SHA being reported or merged. Record the run/job link, head SHA, exact command, and result. A push alone is not evidence.

Every verification report (PR body, review-round ledger, or chat completion summary) must account for every applicable required command, with its exact command and one status per execution:

- **passed (local)**
- **passed (CI)** — include run/job URL and head SHA
- **failed**
- **pending**
- **cancelled**
- **not run** — include a reason

Only the two passed statuses satisfy a gate. Report cancelled duplicates as cancelled alongside the qualifying passing run.

When no row matches, report “No change-scoped gates apply” and list the changed files. This does not waive the main ruleset's required CI checks, which must still pass on the final head SHA.

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

## Agent Guidance
- Working with GitHub issues or PR issue-closing semantics → read [issue tracker guidance](docs/agents/issue-tracker.md).
- Defining domain terminology or recording architectural decisions → read [domain documentation guidance](docs/agents/domain.md).
