# CLI and application bundle alias resolution

`backup:reconcile-schedulers` needs this; `admin:create` does not, only because it uses relative imports throughout. The failure is runtime-only — it passes `npm run type-check` and surfaces as an unresolvable module when the script actually runs — and it arrives transitively, so a script whose own imports are all relative can still need the flag via what it pulls in.

**The same trap reaches the application bundle, and there it is fatal.** The Docker build runs two compilers in sequence:

```
npm run build                  # nest build — DOES rewrite path aliases
npx tsc -p tsconfig.cli.json   # plain tsc — does NOT rewrite them
```

Both write to `dist/`. `tsconfig.cli.json` includes `src/database/cli/**/*`, so **any `src/` file reachable from a CLI entrypoint gets recompiled by the second pass and overwrites `nest build`'s correct output**. If that file imports via `@database/*`, the alias survives verbatim into `dist/` and Node throws `MODULE_NOT_FOUND`. When the file is also in `app.module`'s require chain, the *entire backend crash-loops* — this took production down on 2026-08-15 via `orphaned-scheduler-reconciler.service.ts`, which `reconcile-schedulers.ts` imports transitively.

Nothing in the normal gate catches it: the source is valid TypeScript, `npm run type-check` passes, and `npm run test` transpiles from `src/` with alias resolution. Only the built artifact is wrong. `backend/scripts/verify-dist-runtime.sh` (`npm run verify:dist`) is the gate — it scans `dist/` for surviving aliases and then loads `dist/main.js` to prove the require graph resolves. It runs inside the Dockerfile after the CLI compile, so a corrupt image fails the build instead of shipping.

Rule: **files reachable from `tsconfig.cli.json`'s `include` must use relative imports, never path aliases.** The CLI pass currently reaches 68 `src/` files. Check reach with `npx tsc -p tsconfig.cli.json --noEmit --listFiles`.
