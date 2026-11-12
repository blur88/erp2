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

### Theme

- Use `frontend/src/styles/theme.ts` as the single source of truth for typography, palette, spacing and border radius.
- Use typography variants, including `bodySmall` (0.8rem, weight 400, line height 1.5), instead of hand-set text `fontSize`.
- When migrating text, compare weight and line height too; preserve differing values as explicit overrides on the variant.
- Use palette tokens instead of hex colours, and theme spacing and radius for layout and corners.
- Every page uses `PageHeader`; use the existing list/detail shells where appropriate.
- The text-size rule applies to text only. Prefer MUI's built-in icon sizes; numeric icon sizes are allowed when needed.
- Justified hand-set exceptions need a specific one-line comment explaining the reason.
- Apply this standard to new and modified code only; leave untouched legacy styling for gradual migration.
- Enforce through normal code review.

## Testing Guidelines
- Backend: Jest (`*.spec.ts`) and e2e under `backend/test/e2e`.
- Frontend: Vitest + Testing Library; co-locate tests in `__tests__` or `*.test.ts(x)`.
- Before a PR, run the applicable gates in [Change-Scoped Verification](#change-scoped-verification-required-before-pr).

Add or update tests for any behavior change.

## Change-Scoped Verification (Required Before PR)
Run checks based on files touched (not just a default test set):
- Backend changes (`backend/src/**`):
  - `cd backend && npm run lint && npm run type-check && npm run test`
- Backend test-source changes (`backend/test/**`):
  - `cd backend && npm run type-check:spec`
  - Catches errors in `test/**`, which `npm run type-check` cannot see at all —
    `tsconfig.build.json` has `include: ["src"]`. It additionally checks
    `src/**` under the test TypeScript configuration.
- Backend DB changes (entities/migrations):
  - `cd backend && npm run migration:run && npm run test:e2e`
- Frontend changes (`frontend/src/**`):
  - `cd frontend && npm run lint && npm run type-check && npm run test:coverage`
  - This matches CI: run the full suite once with coverage, without a separate `npm run test` pass.
- Cross-app contract changes (API DTOs/interfaces used by both apps):
  - `cd backend && npm run type-check && npm run test`
  - Run the coverage command from the frontend gate above. Frontend lint and type-check apply when `frontend/src/**` is touched.
- Documentation-only changes outside `backend/` and `frontend/`:
  - `git diff --check` is sufficient by default.
  - No application test suite is required unless the documentation change affects executable examples, generated content, or another explicitly required check.

If multiple areas are changed, run all relevant checks.
PRs must include the exact verification commands run and whether they passed.

## Commit & Pull Request Guidelines
Start implementation on a feature branch cut from `origin/main` (`git switch -c <type>/<issue>-<slug>`).

Git history follows Conventional Commit style:
- Examples: `feat(accounting): ...`, `fix(accounting): ...`, `test(price-lists): ...`, `chore: ...`.

PRs should include:
- Clear summary and impacted modules.
- Linked issue/ticket.
- Test evidence (commands run and results).
- UI screenshots for frontend changes.
- Notes for migrations/env changes when applicable.

Attribution:
- Commits and PR bodies must not contain Claude session links, `Claude-Session` trailers, or "Generated with Claude Code" lines. Project `.claude/settings.json` enforces this; `Co-Authored-By` lines are unaffected.

## Security & Configuration Tips
- Never commit real secrets; copy from `.env.example`.
- Rotate default credentials in non-dev environments.
- Validate DB changes with migrations (`npm run migration:run`) instead of manual schema edits.
