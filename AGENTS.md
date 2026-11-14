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
- Root `scripts/*.sh` changes (repo-root git and release tooling):
  - `cd backend && npm run test:scripts` runs the Bats specs in `backend/scripts/__tests__/`, including those for `scripts/git-cleanup-merged.sh`. CI runs it on every PR.
  - Run `git diff --check`.
- Scripts, hooks, CI workflows, and manifest or tooling config:
  - `backend/scripts/**` and `.githooks/**`: `cd backend && npm run test:scripts`. Root `scripts/*.sh` is covered above. `test:scripts` covers only scripts that have a Bats spec; for a script without one, name in the PR what you ran instead. Also run `git diff --check`.
  - Root release tooling (`release.config.cjs`, `scripts/*.cjs`, `scripts/__tests__/*.test.*`): run the commands of the "Root release-tooling tests" step in CI's Backend job, from the repository root. That step owns the pinned dependency install and the test command.
  - Root `package.json` and `package-lock.json`: no gate covers them. Check that the JSON parses and name in the PR what else you ran.
  - `.github/workflows/**`: verify the specific change (for example, the affected job's command) and name it in the PR. Do not run unrelated test suites.
  - `backend/package.json`, `frontend/package.json`, their lockfiles, and app config (`tsconfig*.json`, ESLint, Jest, Vitest) under `backend/` or `frontend/`: run that app's gate above. For metadata-only manifest edits (for example `license` or `description`), check that the JSON parses and run `git diff --check`, plus any other applicable gate.
- Cross-app contract changes (API DTOs/interfaces used by both apps):
  - `cd backend && npm run type-check && npm run test`
  - Run the coverage command from the frontend gate above. Frontend lint and type-check apply when `frontend/src/**` is touched.
- Documentation-only changes (every changed file is Markdown, and none is under `backend/src/**` or `frontend/src/**`):
  - Run `git diff --check`.
  - If the change edits the branch-naming line (`git switch -c <type>/<issue>-<slug>`) in `AGENTS.md` or `README.md`, also run `cd backend && npm run test:scripts`. A CI drift test checks that line.
  - If the change touches executable examples or generated content, also run the matching gate above.

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

### Merge routine

1. Merge the approved PR using GitHub or `gh pr merge`. For auto-merge or a merge queue, wait until GitHub confirms the PR is merged.
2. Immediately after confirmation, run `scripts/git-cleanup-merged.sh` from the repository root of the local clone used for that PR, before starting the next task or reporting the merge complete. This also applies to merges performed in the GitHub web UI; pulling `main` alone does not run cleanup.
3. Check the output. Resolve cleanup failures and rerun. If it reports "rerun from main", switch to `main` when available and rerun. Retain other skipped branches and report the script's stated reasons in the merge handoff.

GitHub deletes the remote head branch through the repository setting "Automatically delete head branches". Cleanup fetches and prunes origin and uses `git branch -d` to remove eligible local branches. It keeps branches with unmerged commits, no upstream, a live upstream, or a checkout in another worktree. From an unrelated checkout, it also keeps branches not merged into the current checkout, with a "rerun from main" hint.

Cleanup normally fast-forwards local `main` (or creates it if missing) and switches to it when deleting the current branch. If `main` is checked out in another worktree, it leaves `main` there untouched and skips the current branch when switching would be required.

To preview, use `scripts/git-cleanup-merged.sh --dry-run`. This still fetches and prunes origin but changes no local branch or working tree. Follow a preview with an actual run to complete step 2.

### Attribution

- Commits and PR bodies must not contain Claude session links, `Claude-Session` trailers, or "Generated with Claude Code" lines. `Co-Authored-By` lines are unaffected. See the [`.githooks/commit-msg` header](.githooks/commit-msg) for activation and local enforcement limits.

## Security & Configuration Tips
- Never commit real secrets; copy from `.env.example`.
- Rotate default credentials in non-dev environments.
- Validate DB changes with migrations (`npm run migration:run`) instead of manual schema edits.
