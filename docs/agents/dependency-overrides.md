# Backend dependency overrides

This document records the backend dependency overrides from
[#1909](https://github.com/blur88/erp2/issues/1909) and
[#1912](https://github.com/blur88/erp2/issues/1912), why each is needed, and when
it can be removed. See
[`backend/package.json`](../../backend/package.json) for authoritative versions
and ranges.

| Override | Reason | Removal condition |
|---|---|---|
| `glob` | Keeps deprecated transitive glob releases out of the tree and bounds future resolution to a reviewed major. | Parents' own supported ranges resolve maintained versions without a global override, with compatible APIs for every consumer. |
| `exceljs` → `unzipper@0.12.5` | ExcelJS 4.4.0 declares `unzipper@^0.10.11`, which pulls in fstream → rimraf@2. For wildcard removal, rimraf@2 calls glob as a function. The globally overridden glob lacks that API ([#1912](https://github.com/blur88/erp2/issues/1912)). `unzipper@0.12.5` drops fstream and supports the `Parse({ forceStream: true })` API used by ExcelJS's `WorkbookReader`. | Remove when ExcelJS's declared range resolves to an unzipper version without fstream and the export round-trip and streaming-read tests pass with the override removed. |
| `multer` | Forces the patched upload implementation into Nest's platform-express dependency tree, where a direct dependency bump alone can leave a vulnerable nested copy. | Every parent's own range resolves an acceptable patched multer without the override. Keep the direct pin and override aligned while it remains. |
| `body-parser` | Pins Express/Nest's transitive parser resolution. [#1908](https://github.com/blur88/erp2/pull/1908) records advancing the older override because it blocked audit fixes; the original addition was a version bump without a recorded advisory. | All parents' own ranges resolve acceptable patched versions without the override. |
| `qs` | Forces patched query parsing across Express, body-parser and superagent, including the fix for GHSA-q8mj-m7cp-5q26. | Every parent's own range resolves a patched qs without the override, with no vulnerable nested copies remaining. |
| `@nestjs/mapped-types` | Resolves the class-validator peer mismatch recorded in [#286](https://github.com/blur88/erp2/issues/286) and keeps direct and transitive Nest dependencies aligned. | The direct dependency and Swagger's transitive dependency resolve compatible mapped-types and class-validator peers without intervention or peer-bypass flags. |

See [AGENTS.md](../../AGENTS.md#change-scoped-verification-required-before-pr)
for verification requirements.
