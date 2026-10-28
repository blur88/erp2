import path from "node:path";
import { fileURLToPath } from "node:url";
import { readFileSync } from "node:fs";
import { describe, expect, it } from "vitest";
import { appStoreLoads } from "../appStoreLoads";

const SRC = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "../..");
const cases: {
  name: string;
  source: string;
  file: string;
  flagged: boolean;
}[] = [
  {
    name: "baseline",
    source: "",
    file: "test/__tests__/fixture.test.ts",
    flagged: false,
  },
  {
    name: "value import",
    source: "import { store } from '@\u002fstore'",
    file: "test/__tests__/fixture.test.ts",
    flagged: true,
  },
  {
    name: "relative import",
    source: "import { store } from '..\u002f..\u002fstore'",
    file: "test/__tests__/fixture.test.ts",
    flagged: true,
  },
  {
    name: "dynamic import",
    source: "await import('@\u002fstore')",
    file: "test/__tests__/fixture.test.ts",
    flagged: true,
  },
  {
    name: "mixed import",
    source: "import { type RootState, store } from '@\u002fstore'",
    file: "test/__tests__/fixture.test.ts",
    flagged: true,
  },
  {
    name: "importActual",
    source: "vi.mock('@\u002fstore', async () => vi.importActual('@\u002fstore'))",
    file: "test/__tests__/fixture.test.ts",
    flagged: true,
  },
  {
    name: "standalone actual",
    source: "vi.importActual('@\u002fstore')",
    file: "test/__tests__/fixture.test.ts",
    flagged: true,
  },
  {
    name: "importMock",
    source: "vi.importMock('@\u002fstore')",
    file: "test/__tests__/fixture.test.ts",
    flagged: true,
  },
  {
    name: "typed importMock",
    source: "vi.importMock<typeof import('@\u002fstore')>('@\u002fstore')",
    file: "test/__tests__/fixture.test.ts",
    flagged: true,
  },
  {
    name: "index.js alias",
    source: "import { store } from '@\u002fstore/index.js'",
    file: "test/__tests__/fixture.test.ts",
    flagged: true,
  },
  {
    name: "index.js relative",
    source: "import { store } from '..\u002f..\u002fstore/index.js'",
    file: "test/__tests__/fixture.test.ts",
    flagged: true,
  },
  {
    name: "side-effect import at top",
    source: "import '@\u002fstore'\nimport { x } from './other'",
    file: "test/__tests__/fixture.test.ts",
    flagged: true,
  },
  {
    name: "multiline value import",
    source: "import {\n store\n} from '@\u002fstore'",
    file: "test/__tests__/fixture.test.ts",
    flagged: true,
  },
  {
    name: "type import",
    source: "import type { RootState } from '@\u002fstore'",
    file: "test/__tests__/fixture.test.ts",
    flagged: false,
  },
  {
    name: "inline type import",
    source: "import { type RootState } from '@\u002fstore'",
    file: "test/__tests__/fixture.test.ts",
    flagged: false,
  },
  {
    name: "typeof import",
    source: "type Store = typeof import('@\u002fstore')",
    file: "test/__tests__/fixture.test.ts",
    flagged: false,
  },
  {
    name: "side-effect import then import type",
    source: "import './nothing'\nimport type { RootState } from '@\u002fstore'",
    file: "test/__tests__/fixture.test.ts",
    flagged: false,
  },
  {
    name: "importOriginal",
    source: "vi.mock('@\u002fstore', async (original) => ({ ...await original() }))",
    file: "test/__tests__/fixture.test.ts",
    flagged: true,
  },
  {
    name: "unparenthesized loader",
    source: "vi.mock('@\u002fstore', async original => original())",
    file: "test/__tests__/fixture.test.ts",
    flagged: true,
  },
  {
    name: "function loader",
    source:
      "vi.mock('@\u002fstore', async function (original) { return original() })",
    file: "test/__tests__/fixture.test.ts",
    flagged: true,
  },
  {
    name: "typed loader",
    source: "vi.mock('@\u002fstore', async (original: any) => original())",
    file: "test/__tests__/fixture.test.ts",
    flagged: true,
  },
  {
    name: "typed function loader",
    source:
      "vi.mock('@\u002fstore', async function (original: any) { return original() })",
    file: "test/__tests__/fixture.test.ts",
    flagged: true,
  },
  {
    name: "dollar loader",
    source: "vi.mock('@\u002fstore', async ($original) => $original())",
    file: "test/__tests__/fixture.test.ts",
    flagged: true,
  },
  {
    name: "typed loader $orig",
    source: "vi.mock('@\u002fstore', async ($orig: any) => $orig())",
    file: "test/__tests__/fixture.test.ts",
    flagged: true,
  },
  {
    name: "typed loader orig$",
    source: "vi.mock('@\u002fstore', async (orig$: any) => orig$())",
    file: "test/__tests__/fixture.test.ts",
    flagged: true,
  },
  {
    name: "loader",
    source:
      "vi.mock('@\u002fstore', async (original) => original())\nawait import('@\u002fstore')",
    file: "test/__tests__/fixture.test.ts",
    flagged: true,
  },
  {
    name: "importActual",
    source:
      "vi.mock('@\u002fstore', async () => vi.importActual('@\u002fstore'))\nawait import('@\u002fstore')",
    file: "test/__tests__/fixture.test.ts",
    flagged: true,
  },
  {
    name: "promise loader",
    source:
      "vi.mock(import('@\u002fstore'), async (original) => original())\nawait import('@\u002fstore')",
    file: "test/__tests__/fixture.test.ts",
    flagged: true,
  },
  {
    name: "promise stub",
    source:
      "vi.mock(import('@\u002fstore'), () => ({ store: {} }))\nawait import('@\u002fstore')",
    file: "test/__tests__/fixture.test.ts",
    flagged: false,
  },
  {
    name: "stub",
    source:
      "vi.mock('@\u002fstore', () => ({ store: {} }))\nawait import('@\u002fstore')",
    file: "test/__tests__/fixture.test.ts",
    flagged: false,
  },
  {
    name: "doMock loader",
    source:
      "vi.doMock('@\u002fstore', async (original) => original())\nawait import('@\u002fstore')",
    file: "test/__tests__/fixture.test.ts",
    flagged: true,
  },
  {
    name: "doMock importActual",
    source:
      "vi.doMock('@\u002fstore', async () => vi.importActual('@\u002fstore'))\nawait import('@\u002fstore')",
    file: "test/__tests__/fixture.test.ts",
    flagged: true,
  },
  {
    name: "doMock promise loader",
    source:
      "vi.doMock(import('@\u002fstore'), async (original) => original())\nawait import('@\u002fstore')",
    file: "test/__tests__/fixture.test.ts",
    flagged: true,
  },
  {
    name: "doMock promise stub",
    source:
      "vi.doMock(import('@\u002fstore'), () => ({ store: {} }))\nawait import('@\u002fstore')",
    file: "test/__tests__/fixture.test.ts",
    flagged: true,
  },
  {
    name: "doMock stub",
    source:
      "vi.doMock('@\u002fstore', () => ({ store: {} }))\nawait import('@\u002fstore')",
    file: "test/__tests__/fixture.test.ts",
    flagged: true,
  },
  {
    name: "spy options",
    source: "vi.mock('@\u002fstore', { spy: true })",
    file: "test/__tests__/fixture.test.ts",
    flagged: true,
  },
  {
    name: "promise spy options",
    source: "vi.mock(import('@\u002fstore'), { spy: true })",
    file: "test/__tests__/fixture.test.ts",
    flagged: true,
  },
  {
    name: "unrelated actual",
    source:
      "vi.mock('@\u002fstore', async () => { await vi.importActual('./other'); return {} })\nimport { store } from '@\u002fstore'",
    file: "test/__tests__/fixture.test.ts",
    flagged: false,
  },
  {
    name: "stub static import",
    source: "vi.mock('@\u002fstore', () => ({}))\nimport { store } from '@\u002fstore'",
    file: "test/__tests__/fixture.test.ts",
    flagged: false,
  },
  {
    name: "doMock stub + static import",
    source: "vi.doMock('@\u002fstore', () => ({}))\nimport { store } from '@\u002fstore'",
    file: "test/__tests__/fixture.test.ts",
    flagged: true,
  },
  {
    name: "dynamic import before doMock",
    source: "await import('@\u002fstore')\nvi.doMock('@\u002fstore', () => ({}))",
    file: "test/__tests__/fixture.test.ts",
    flagged: true,
  },
  {
    name: "beforeAll dynamic import + later doMock stub",
    source:
      "beforeAll(async () => { await import('@\u002fstore') })\nvi.doMock('@\u002fstore', () => ({}))",
    file: "test/__tests__/fixture.test.ts",
    flagged: true,
  },
  {
    name: "Accepted false positive (#1479): untyped RootState",
    source: "import { RootState } from '@\u002fstore'",
    file: "test/__tests__/fixture.test.ts",
    flagged: true,
  },
  {
    name: "Accepted false positive (#1479): loader-named stub method",
    source: "vi.mock('@\u002fstore', (original) => ({ original() {} }))",
    file: "test/__tests__/fixture.test.ts",
    flagged: true,
  },
  {
    name: "Accepted false positive (#1479): named factory",
    source: "vi.mock('@\u002fstore', factory)",
    file: "test/__tests__/fixture.test.ts",
    flagged: true,
  },
  {
    name: "Accepted residual (#1479), target of #1501: line comment",
    source:
      "// vi.mock('@\u002fstore', () => ({}))\nimport { store } from '@\u002fstore'",
    file: "test/__tests__/fixture.test.ts",
    flagged: false,
  },
  {
    name: "Accepted residual (#1479), target of #1501: block comment",
    source:
      "/* vi.mock('@\u002fstore', () => ({})) */\nimport { store } from '@\u002fstore'",
    file: "test/__tests__/fixture.test.ts",
    flagged: false,
  },
  {
    name: "Accepted residual (#1479), target of #1501: template literal",
    source: "await import(`@\u002fstore`)",
    file: "test/__tests__/fixture.test.ts",
    flagged: false,
  },
  {
    name: "Accepted residual (#1479), target of #1501: transitive component",
    source: "import Sidebar from '@/components/Sidebar'",
    file: "test/__tests__/fixture.test.ts",
    flagged: false,
  },
];

describe("application store loads", () => {
  it('standalone doMock original loader', () => {
    const source = "vi.doMock('@" + "/store', async (original) => original())"
    expect(appStoreLoads(source, path.join(SRC, 'test/fixture.test.ts'))).toBe(true)
  })
  it.each(cases)("$name", ({ source, file, flagged }) => {
    expect(appStoreLoads(source, path.join(SRC, file))).toBe(flagged);
  });
  it("unchanged router.test.tsx shape", () => {
    const file = path.join(SRC, "__tests__/router.test.tsx");
    expect(appStoreLoads(readFileSync(file, "utf8"), file)).toBe(false);
  });
});
