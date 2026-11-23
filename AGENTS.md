# Repository Guidelines

## Workflow Entry Points

- Before implementation, follow [Commit & Pull Request Guidelines](#commit--pull-request-guidelines).
- Before editing for a ticket or spec, follow [implementation verification planning](docs/agents/skill-verification.md#plan-before-editing).
- Before updating dependencies or reviewing manifest/lockfile changes, read [Dependency updates](docs/agents/dependency-updates.md).
- Before editing agent-facing documentation, read [CODING_STANDARDS.md](CODING_STANDARDS.md).
- Before running Docker from a Git worktree, read [Docker verification from Git worktrees](docs/agents/docker-from-worktrees.md).
- Before checking private registry tags, follow [Private tag inspection](docs/adr/0001-two-docker-repositories.md#private-tag-inspection).
- Before reviewing, read [acceptance-criterion evidence guidance](CODING_STANDARDS.md#acceptance-criterion-evidence-in-reviews). For delegated reviews, follow the [shared review handoff](docs/agents/skill-verification.md#hand-off-review-evidence) and require every reviewer to read the linked standards before assessment.

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
- Follow [CODING_STANDARDS.md](CODING_STANDARDS.md) for repository standards.

## Testing Guidelines
- Backend: Jest (`*.spec.ts`) and e2e under `backend/test/e2e`.
- Frontend: Vitest + Testing Library; co-locate tests in `__tests__` or `*.test.ts(x)`.
- Add or update tests for any behavior change.

## Change-Scoped Verification (Required Before PR)
This section is the single source of truth for pre-PR verification. Select checks from the files touched; combine applicable rows and run each command only once.

Before starting or waiting on long-running local verification or PR checks, read [Verification waits](docs/agents/verification-waits.md).

| Files changed | Required commands (from repository root) |
|---|---|
| GitHub Actions workflows (`.github/workflows/**`) or tracked shell scripts (`scripts/**/*.sh`, `backend/scripts/**/*.sh`) | `bash scripts/lint-workflows.sh` (pinned actionlint + ShellCheck) |
| Release workflow, release configuration, or root scripts and tests (`.github/workflows/release.yml`, `release.config.cjs`, `scripts/**`) | `npm run test:release` (root) |
| Published-image settings (tags, attestations, build-args in `.github/workflows/release.yml`) | Add or update a targeted assertion under `scripts/__tests__/`, covered by `npm run test:release` |
| Backend scripts (`backend/scripts/**`) | `cd backend && npm run test:scripts` (Bats) |
| Backend source (`backend/src/**`) | `cd backend && npm run lint && npm run type-check && npm run test` |
| Backend test sources (`backend/test/**`) | `cd backend && npm run type-check`; run `cd backend && npm run test` for unit-test changes and `cd backend && npm run test:e2e` for e2e-test changes |
| Backend entities or migrations | Backend source checks, plus `cd backend && npm run migration:run && npm run test:e2e` |
| Frontend source (`frontend/src/**`) | `cd frontend && npm run lint && npm run type-check && npm run test:coverage` |
| Dependency manifests or lockfiles (`package.json` / `package-lock.json` at root, `backend/`, or `frontend/`) | Apply the source checks above for each affected app and combine the applicable dependency rows below. |
| Backend dependency manifests or lockfiles (`backend/package.json`, `backend/package-lock.json`), override documentation (`docs/agents/dependency-overrides.md`), or the exception allowlist (`backend/scripts/dependency-override-allowlist.json`) | `cd backend && npm run check:overrides` |
| Backend dependency changes that can affect the production build or runtime | Also run in order: `cd backend && npm run build && npx tsc -p tsconfig.cli.json && npm run verify:dist`. |
| Root release-tooling dependency changes | `npm run test:release` |
| BullMQ or ioredis dependency changes, including changed resolved versions in lockfiles | `cd backend && npm run test:redis` |
| Cross-app contracts (API DTOs/interfaces used by both apps) | `cd backend && npm run type-check && npm run test`; `cd frontend && npm run test:coverage`; also apply source checks for each app touched |

Backend `npm run type-check` compiles both production sources (`type-check:build`, `tsconfig.build.json`) and test sources (`type-check:spec`, `tsconfig.spec.json`). Frontend `npm run type-check` compiles both the app (`tsconfig.json`) and the build-time config sources (`tsconfig.node.json`). Unit-test transpilation does not replace type-checking.

Frontend `npm run test:coverage` executes the complete test suite with coverage instrumentation, satisfying both frontend `test` and `test:coverage` requirements in one run. A successful full-suite `test:coverage` CI run on the PR's current head commit satisfies both requirements; do not repeat the same suite locally solely for documentation or review.

E2E verification is required for backend entity/migration changes and e2e-test changes; ordinary backend source changes retain the source checks above.

For dependency changes, decide E2E applicability from the behavior affected and the existing requirements above; a dependency change alone neither requires nor exempts E2E.

Completed successful CI evidence from the matching job on the current PR commit may satisfy the corresponding applicable commands, including production-image jobs that execute the full backend build, CLI compile, and distribution verification sequence. In the `Backend - Lint, Type Check, Unit Tests, E2E Tests` job defined in [ci.yml](.github/workflows/ci.yml), the matching steps are `Lint GitHub Actions workflows`, `Release validation`, `Gate script tests`, and `Check backend dependency overrides` for workflow lint, release tests, backend script tests, and the override check respectively; consult that workflow for current step names and commands. Evidence from older commits, incomplete runs, or unrelated checks does not satisfy verification requirements. PRs must record exact commands, actual results and CI links where used, including E2E as passed in CI when it succeeds on the current PR commit, plus checks not run and why. Use the [PR template](.github/pull_request_template.md) to collect current-head evidence.

For post-merge validation on the default branch, follow the manual dispatch guidance in [the CI workflow's trigger comments](.github/workflows/ci.yml). Merging does not trigger a CI run on `main`.

## Commit & Pull Request Guidelines

At the start of implementation, determine the current Git branch and the repository’s default branch. If starting on the default branch, create and switch to a topic branch before making implementation commits. For issue-linked changes, use `<type>/<issue>-<slug>` (e.g. `docs/1899-verification-waits`). Continue on an existing valid topic branch. Do not silently switch branches when the working tree contains existing uncommitted changes. Work directly on the default branch only when explicitly requested by the user.

A valid topic branch is a non-default branch for the current work that follows the issue-linked naming convention when applicable.

Git history follows Conventional Commit style:
- Examples: `feat(accounting): ...`, `fix(accounting): ...`, `test(price-lists): ...`, `chore: ...`.

Commit messages and PR bodies must not contain AI attribution lines.

Use the [PR template](.github/pull_request_template.md) for the summary, related issue, verification evidence, screenshots and migration/environment notes.

When merging a PR from its local topic branch, follow [Merge and branch cleanup](docs/agents/merge-and-branch-cleanup.md) through checkout and branch cleanup.

## Security & Configuration Tips
- Never commit real secrets; copy from `.env.example`.
- Rotate default credentials in non-dev environments.
- Validate DB changes with migrations (`npm run migration:run`) instead of manual schema edits.
