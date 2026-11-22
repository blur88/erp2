import { readFileSync } from "node:fs";
import { createRequire } from "node:module";
import { fileURLToPath } from "node:url";

// Resolve a package from a chain of parents, as Node would from inside them.
const resolveVia = (...chain: string[]) =>
  chain.reduce(
    (from, name) => createRequire(from).resolve(`${name}/package.json`),
    fileURLToPath(import.meta.url),
  );

const anymatchChain = ["jest", "@jest/core", "jest-haste-map", "anymatch"];
type Anymatch = {
  (matchers: unknown, testString: string): boolean;
  (matchers: unknown): (testString: string) => boolean;
};

// The global `picomatch` override resolves anymatch 3 (declared ^2.0.4) to
// picomatch 4. See the allowlist entry in
// scripts/dependency-override-allowlist.json.
describe("picomatch override resolution", () => {
  it("anymatch resolves picomatch 4.0.4 or later within major 4", () => {
    const { version } = JSON.parse(
      readFileSync(resolveVia(...anymatchChain, "picomatch"), "utf8"),
    ) as { version: string };
    const [major, minor, patch] = version.split(".").map(Number);

    expect(major).toBe(4);
    expect(minor > 0 || patch >= 4).toBe(true);
  });
});

describe("picomatch consumer compatibility", () => {
  const anymatch = createRequire(resolveVia(...anymatchChain))(".") as Anymatch;

  it("matches include patterns through picomatch(pattern, options)", () => {
    expect(anymatch("src/**/*.ts", "src/modules/item.ts")).toBe(true);
    expect(anymatch(["**/*.json", "src/**/*.ts"], "src/main.ts")).toBe(true);
    expect(anymatch("src/**/*.ts", "test/item.ts")).toBe(false);
  });

  it("rejects paths matched by negated patterns", () => {
    const matcher = anymatch(["src/**/*.ts", "!**/*.spec.ts"]);

    expect(matcher("src/item.ts")).toBe(true);
    expect(matcher("src/item.spec.ts")).toBe(false);
  });
});
