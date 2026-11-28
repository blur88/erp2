# Logo reference check (read-only, before enabling Backups)

Logo files are never deleted (#2107). A reference saved before that change can still point at a file that is no longer on disk. A Backup fails when an uploaded logo is missing from the uploads archive, so run this check once before Backups are enabled against real data.

The check lists every `company_settings` and `print_settings` logo reference whose local file is missing from `uploads/`. It reads both tables, including soft-deleted rows, and never writes, clears or changes a reference.

## Run it in production

The production image prunes dev dependencies, so run the compiled CLI inside the running backend container. Its working directory is `/app`, which is where the app writes `uploads/`:

```bash
docker compose exec backend node dist/database/cli/check-logo-references.js
echo "exit=$?"
```

## Run it from a development checkout

```bash
cd backend && npx ts-node -P tsconfig.json ./src/database/cli/check-logo-references.ts
```

## Reading the result

- Exit `0`: every local logo reference resolves to a file.
- Exit `1`: one or more references point at a missing file. Each is printed with its table, row id, stored URL and expected path.
- Exit `2`: the check could not connect to the database.

Resolve each dangling reference deliberately, for example by restoring the file or clearing the reference in the app. Do not clear references silently.

Record the outcome in the deployment notes: `[ ] 0 dangling   [ ] dangling references resolved: _______________`
