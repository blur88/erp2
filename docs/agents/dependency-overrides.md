# Backend dependency overrides

This table records why each backend dependency override exists and when it can
be removed. Earlier override reviews are recorded in
[#1909](https://github.com/blur88/erp2/issues/1909) and
[#1912](https://github.com/blur88/erp2/issues/1912). Use the exact key from
[`backend/package.json`](../../backend/package.json) in backticks. For each nested
key, put the full path in backticks, with ` → ` between keys. Give every row a
reason and removal condition so the CI checker can validate coverage.

| Override | Reason | Removal condition |
|---|---|---|
| `glob` | Keeps deprecated transitive glob releases out of the tree and bounds future resolution to a reviewed major. | Parents' own supported ranges resolve maintained versions without a global override, with compatible APIs for every consumer. |
| `exceljs` | Scopes the ZIP reader and UUID overrides to ExcelJS's dependency tree. | Remove this scope once both nested overrides can be removed. |
| `exceljs → unzipper` | ExcelJS 4.4.0 declares `unzipper@^0.10.11`, which pulls in fstream → rimraf@2. For wildcard removal, rimraf@2 calls glob as a function. The globally overridden glob lacks that API ([#1912](https://github.com/blur88/erp2/issues/1912)). `unzipper@0.12.5` drops fstream and supports the `Parse({ forceStream: true })` API used by ExcelJS's `WorkbookReader`. | Remove when ExcelJS's declared range resolves to an unzipper version without fstream and the export round-trip and streaming-read tests pass with the override removed. |
| `exceljs → uuid` | Keeps the legacy UUID release declared by ExcelJS out of its dependency tree. The extended conditional-formatting transform uses the `v4()` export. | ExcelJS resolves a maintained, patched UUID release and its extended conditional-formatting transform still generates a UUID. |
| `multer` | Forces the patched upload implementation into Nest's platform-express dependency tree, where a direct dependency bump alone can leave a vulnerable nested copy. | Every parent's own range resolves an acceptable patched multer without the override. Keep the direct pin and override aligned while it remains. |
| `body-parser` | Pins Express/Nest's transitive parser resolution. [#1908](https://github.com/blur88/erp2/pull/1908) records advancing the older override because it blocked audit fixes; the original addition was a version bump without a recorded advisory. | All parents' own ranges resolve acceptable patched versions without the override. |
| `qs` | Forces patched query parsing across Express, body-parser and superagent, including the fix for GHSA-q8mj-m7cp-5q26. | Every parent's own range resolves a patched qs without the override, with no vulnerable nested copies remaining. |
| `@nestjs/mapped-types` | Resolves the class-validator peer mismatch recorded in [#286](https://github.com/blur88/erp2/issues/286) and keeps direct and transitive Nest dependencies aligned. | The direct dependency and Swagger's transitive dependency resolve compatible mapped-types and class-validator peers without intervention or peer-bypass flags. |
| `tar` | Pins a patched tar 7 release for transitive archive handling. | Every consumer's declared range resolves a patched tar release without the override. |
| `js-yaml` | The global pin resolves `5.4.2`, below Swagger's declared `5.5.0`. The override was kept to avoid restoring the `3.x` copy requested by NYC's config loader. [#1333](https://github.com/blur88/erp2/issues/1333) | Align with Swagger's declared version after checking NYC's YAML loader and Swagger's YAML output. Remove the global override when the tree can also avoid the legacy NYC copy without it. |
| `file-type` | The historical fix for a `21.x` advisory pins `21.3.2`, below Nest's declared `22.3.0`. The original change supplies no reason to prefer the old major over Nest's current version. [#97](https://github.com/blur88/erp2/issues/97) | Remove the pin once Nest's declared version is reviewed for current advisories and its file signature validation is verified. |
| `path-to-regexp` | Keeps a patched route parser in the Express dependency tree ([#205](https://github.com/blur88/erp2/issues/205)). | Every consumer resolves a patched release and the app's routes register and match without the override. |
| `lodash` | Requires a patched lodash release throughout the backend tree. | Every consumer's declared range resolves a patched lodash release without the override. |
| `@angular-devkit/core` | Scopes the Ajv pin to the Angular devkit used by Nest CLI. | Remove this scope when the Ajv override can be removed. |
| `@angular-devkit/core → ajv` | The historical Angular-scoped pin resolves `8.18.0`, below Angular devkit's declared `8.20.0`. The original pin and scoping commits give no reason to prefer `8.18.0` over the current declaration. [Original pin](https://github.com/blur88/erp2/commit/bf8cd7db3086b7350d70b8fd9f09a5f4e7e92e9b) | Remove the pin once Angular devkit's declared version is reviewed for current advisories and its schema compilation and validation are verified. |
| `picomatch` | Forces patched glob matching for transitive consumers ([#209](https://github.com/blur88/erp2/issues/209)). | Every consumer resolves a patched release and its pattern matching works without the override. |
| `ws` | Keeps a patched WebSocket implementation in the Socket.IO dependency tree. | Every consumer resolves a patched release and WebSocket upgrades and broadcasts work without the override. |
| `typeorm` | Scopes the ioredis override to TypeORM's optional query cache peer. | Remove this scope when the ioredis override can be removed. |
| `typeorm → ioredis` | Uses the backend's direct ioredis range for TypeORM's optional peer to keep production pruning compatible with the backend's ioredis major. | TypeORM's peer range accepts the backend's ioredis version and production pruning succeeds without the override. |

[The compatibility allowlist](../../backend/scripts/dependency-override-allowlist.json)
matches the parent name and version, dependency, original range and resolved
version. Use step 4 of the [dependency update workflow](dependency-updates.md#dependency-updates)
to verify each proposed exception, including scoped overrides. Record why the
parent's APIs remain compatible in the entry.

See [AGENTS.md](../../AGENTS.md#change-scoped-verification-required-before-pr)
for verification requirements.
