# Backend Build and Runtime Loading

How the backend image is compiled, and the module-loading traps that pass every source-level check but fail in the built artifact.

## Two compilers write to `dist/`

The Docker build (`backend/Dockerfile`) runs, in order:

```
npm run build                  # nest build — DOES rewrite path aliases
npx tsc -p tsconfig.cli.json   # plain tsc — does NOT rewrite them
npm run verify:dist            # backend/scripts/verify-dist-runtime.sh
```

`tsconfig.cli.json` includes `src/config/**`, `src/database/entities/**`, `src/database/migrations/**` and `src/database/cli/**`. Every `src/` file **reachable** from those is recompiled by the second pass, which overwrites `nest build`'s correct output for that file. If the file imports through a path alias (`@database/*`, `@common/*`, …), the alias survives verbatim into `dist/` and Node throws `MODULE_NOT_FOUND`. If the file is also in `app.module`'s require chain, the whole backend crash-loops.

This has happened: a built image crash-looped on 2026-08-15 via `orphaned-scheduler-reconciler.service.ts`, which `reconcile-schedulers.ts` imports transitively.

### Rule

**Files reachable from `tsconfig.cli.json`'s `include` must use relative imports, never path aliases.**

Check the reach (it changes as imports change — do not record a count):

```bash
cd backend && npx tsc -p tsconfig.cli.json --noEmit --listFiles | grep /src/
```

Nothing in the normal gates catches a violation: the source is valid TypeScript, `npm run type-check` passes, and `npm run test` transpiles from `src/` with alias resolution. Only the built artifact is wrong. `npm run verify:dist` is the gate: it scans `dist/` for surviving aliases, then loads `dist/main.js` to prove the require graph resolves. It runs inside the Dockerfile after the CLI compile, so a corrupt image fails the build instead of shipping.

### Running CLI scripts from source

Separately from the build, a `ts-node` npm script whose entrypoint directly or transitively imports an alias must preload `tsconfig-paths/register` (e.g. `ts-node -r tsconfig-paths/register ...`). Type-checking resolves aliases; Node runtime loading does not. `backup:reconcile-schedulers` needs this; `admin:create` does not, only because everything it reaches is relative.

`tsconfig-paths/register` fixes source execution only. It does **not** make an alias safe in a CLI-reachable file, because the compiled `dist/` output is still wrong. The relative-imports rule above still applies.

Test-only boot entries (for example `test/e2e-leakcheck-boot.ts`) live under `test/`, never under `src/database/cli/`, so they stay out of the CLI pass.

## NestJS 12 is ESM-only; the app stays CommonJS

The backend relies on Node 24's `require(esm)` (`engines: >=24.0.0`). Two landmines surface only at runtime — not in ts-jest, not in `type-check`:

- **A package whose `exports` map lacks a `require`/`default` condition cannot be bare-`require`d.** `@nestjs/typeorm@12.0.0` was exactly this (`ERR_PACKAGE_PATH_NOT_EXPORTED` at boot); 12.0.1 added `default`. The exact pin (now 12.0.2) must stay on a release that has it.
- **The Dockerfile pins `node:24.16.0-alpine3.23`.** Older 24.x lacks the `require(esm)` export-condition fallback that the import-only maps of the remaining NestJS packages need.

`verify-dist-runtime.sh` fails on both `MODULE_NOT_FOUND` and `ERR_PACKAGE_PATH_NOT_EXPORTED`. A bare `node dist/main.js` boot remains the definitive check.

## Dependency overrides that must survive bumps

- `overrides.typeorm.ioredis: "$ioredis"` — TypeORM declares `peerOptional ioredis@^5.0.4`, which `npm install` tolerates but `npm prune --omit=dev` in the Dockerfile rejects against ioredis 6. See [Redis](redis.md).

## Related

- [Backend testing](testing.md) — why `type-check` and `type-check:spec` exist as separate gates.
