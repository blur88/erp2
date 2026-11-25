import { createRequire } from "node:module";
import { join } from "node:path";

const minimumPatchedVersion = "11.0.1";
const requireDependency = createRequire(import.meta.url);
const TestExclude = requireDependency("test-exclude") as new (options: {
  cwd: string;
  include: string[];
  exclude: string[];
  extension: string[];
}) => {
  shouldInstrument(filename: string): boolean;
};

describe("test-exclude minimatch compatibility", () => {
  it("resolves a patched minimatch for GHSA-g3hv-75wg-m249", () => {
    const requireFromTestExclude = createRequire(requireDependency.resolve("test-exclude"));
    const { version } = requireFromTestExclude("minimatch/package.json") as {
      version: string;
    };
    const [major, minor, patch] = version.split(".").map(Number);
    const [minimumMajor, minimumMinor, minimumPatch] = minimumPatchedVersion.split(".").map(Number);
    const firstDifference = [
      major - minimumMajor,
      minor - minimumMinor,
      patch - minimumPatch,
    ].find((difference) => difference !== 0);

    expect(firstDifference ?? 0).toBeGreaterThanOrEqual(0);
  });

  it("selects coverage files using include, exclude and negated patterns", () => {
    const cwd = process.cwd();
    const filter = new TestExclude({
      cwd,
      include: ["src/**/*.ts"],
      exclude: ["**/*.spec.ts", "!src/keep.spec.ts"],
      extension: [".ts"],
    });

    expect(filter.shouldInstrument(join(cwd, "src", ".hidden.ts"))).toBe(true);
    expect(filter.shouldInstrument(join(cwd, "src", "skip.spec.ts"))).toBe(
      false,
    );
    expect(filter.shouldInstrument(join(cwd, "src", "keep.spec.ts"))).toBe(
      true,
    );
    expect(filter.shouldInstrument(join(cwd, "test", "fixture.ts"))).toBe(
      false,
    );
  });
});
