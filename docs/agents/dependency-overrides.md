# Backend dependency overrides

Read this when reviewing backend dependency updates. The manifest is authoritative
for current versions; this document records why these five overrides exist and
when they can be removed. Other overrides are outside this inventory's scope.

| Override | Reason | Removal condition |
|---|---|---|
| `glob` | Reintroduced in #566 to eliminate deprecated glob 7 from transitive dependencies. The former `>=10` range allowed unrelated installs to cross majors. `>=14 <15` retains the locked major and prevents glob 15 from entering without review. | Upgrade or replace the parents requesting deprecated glob so their own supported ranges resolve maintained versions without a global override; check every consumer's API compatibility before removing it. |
| `multer` | Nest's platform-express historically pinned a vulnerable nested copy on the upload path; changing only the direct dependency left that copy installed. #1908 advanced the override to the patched version. | Platform-express and every other parent resolve an acceptable patched multer without the override. Check the full tree, including nested copies. Keep the direct pin and override aligned while it remains. |
| `body-parser` | Forces patched parsing code through Express/Nest's transitive tree; #1908 replaced an older override that blocked the audit fix. | All parents' own ranges and the resulting lockfile resolve patched versions without the override. |
| `qs` | Forces patched query parsing across Express, body-parser and superagent. The security override was advanced for GHSA-q8mj-m7cp-5q26 and again in #1908 when the previous pin blocked audit fixes. | Every parent's own range resolves a patched qs without the override, with no vulnerable nested copies remaining. |
| `@nestjs/mapped-types` | Added in #286 to resolve a class-validator 0.15.1 peer mismatch. The NestJS 12 migration moved it to the matching Nest major; #1908 aligned it with the updated direct pin. | The direct dependency and Swagger's transitive dependency resolve compatible mapped-types and class-validator peers without intervention. Confirm installation succeeds without peer-bypass flags. |

## Glob consumer compatibility

Use `cd backend && npm explain glob` to enumerate the current consumers; a
successful install alone does not prove their calls remain compatible. In the
current tree:

- `@jest/reporters`, `jest-config` and `jest-runtime` use `glob.sync` on the
  named `glob` export. Exercise Jest discovery, execution and coverage reporting
  when assessing compatibility.
- `test-exclude` uses both the named `glob` promise API and `glob.sync`.
- `archiver-utils` 2 (ExcelJS's archiver) and 3 (its zip-stream) use the top-level
  `glob.sync`; check both expansion paths and an ExcelJS XLSX write/read round trip.
- `rimraf` 2 (via ExcelJS → unzipper → fstream) uses `hasMagic` and `sync`, but
  its asynchronous wildcard branch calls the module itself as a callback function.
  Glob 14 exports an object, so that branch is incompatible. This predates the
  bounded range: retaining the same locked version does not repair it. Literal
  path removal and synchronous wildcard removal use different branches; successful
  application tests do not demonstrate the asynchronous wildcard branch works.
  Replacing the legacy parent chain is needed before claiming full compatibility.

Keep execution results and any compatibility limitations in the PR's verification
record; use [AGENTS.md](../../AGENTS.md#change-scoped-verification-required-before-pr)
for required checks.
