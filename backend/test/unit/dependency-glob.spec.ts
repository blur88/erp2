import { execFile } from "node:child_process";
import { mkdir, mkdtemp, readFile, rm, writeFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import { dirname, join } from "node:path";
import { promisify } from "node:util";
import {
  resolveVia,
  requireVia,
  versionVia,
} from "../utils/resolve-dependency";

const runFile = promisify(execFile);

const archiverUtils = {
  "archiver-utils@2.1.0": ["exceljs", "archiver", "archiver-utils"],
  "archiver-utils@3.0.4": ["exceljs", "zip-stream", "archiver-utils"],
};
const consumers: Record<string, string[]> = {
  ...archiverUtils,
  "@jest/reporters": ["jest", "@jest/core", "@jest/reporters"],
  "jest-config": ["jest", "@jest/core", "jest-config"],
  "jest-runtime": ["jest", "@jest/core", "jest-runtime"],
  "test-exclude": ["babel-plugin-istanbul", "test-exclude"],
};

// The global `glob` override resolves these consumers to glob 14, outside
// their declared ranges. See the allowlist entries in
// scripts/dependency-override-allowlist.json.
describe("glob override resolutions", () => {
  it.each(Object.entries(consumers))(
    "%s resolves glob 14",
    (_consumer, chain) => {
      const version = versionVia(...chain, "glob");

      expect(version.split(".")[0]).toBe("14");
    },
  );
});

describe("glob consumer compatibility", () => {
  let root: string;

  beforeEach(async () => {
    root = await mkdtemp(join(tmpdir(), "dependency-glob-"));
  });

  afterEach(async () => {
    await rm(root, { recursive: true, force: true });
  });

  const files = async (entries: Record<string, string>) => {
    for (const [path, contents] of Object.entries(entries)) {
      await mkdir(dirname(join(root, path)), { recursive: true });
      await writeFile(join(root, path), contents);
    }
  };

  it.each(Object.entries(archiverUtils))(
    "%s file.expand matches, negates and filters through glob.sync",
    async (_consumer, chain) => {
      await files({ "a.json": "{}", "b.json": "{}", "sub/c.json": "{}" });
      await mkdir(join(root, "directory.json"));
      const { file } = requireVia(...chain) as {
        file: {
          expand(options: object, patterns: string[]): string[];
        };
      };

      expect(
        file
          .expand({ cwd: root, filter: "isFile" }, ["**/*.json", "!b.json"])
          .sort(),
      ).toEqual(["a.json", "sub/c.json"]);
    },
  );

  it("test-exclude lists instrumentable files with glob and glob.sync", async () => {
    await files({
      "src/a.js": "",
      "src/a.spec.js": "",
      "src/keep.spec.js": "",
      "node_modules/dependency/index.js": "",
    });
    const TestExclude = requireVia(...consumers["test-exclude"]) as new (
      options: object,
    ) => { glob(): Promise<string[]>; globSync(): string[] };
    const options = {
      cwd: root,
      include: ["src/**"],
      extension: [".js"],
    };

    // Without negated excludes, test-exclude passes them to glob as ignore.
    const ignoring = new TestExclude({ ...options, exclude: ["**/*.spec.js"] });
    expect(ignoring.globSync()).toEqual(["src/a.js"]);
    await expect(ignoring.glob()).resolves.toEqual(["src/a.js"]);

    // With a negated exclude, it globs everything and filters afterwards.
    const negating = new TestExclude({
      ...options,
      exclude: ["**/*.spec.js", "!src/keep.spec.js"],
    });
    expect(negating.globSync().sort()).toEqual([
      "src/a.js",
      "src/keep.spec.js",
    ]);
    await expect(negating.glob().then((list) => list.sort())).resolves.toEqual([
      "src/a.js",
      "src/keep.spec.js",
    ]);
  });

  // One real Jest run drives each Jest consumer's glob.sync call:
  // jest-config expands a `projects` glob, @jest/reporters matches a
  // coverageThreshold glob, and jest-runtime lists files with the same name
  // and another extension when a module is missing.
  it("Jest expands project globs, coverage threshold globs and sibling hints", async () => {
    const project = { jest: { testEnvironment: "node", transform: {} } };
    await files({
      "jest.config.json": JSON.stringify({
        projects: ["<rootDir>/pkg-*"],
        collectCoverage: true,
        coverageReporters: ["text-summary"],
        coverageThreshold: {
          [join(root, "pkg-*/lib/*.js")]: { functions: 100 },
        },
      }),
      "pkg-a/package.json": JSON.stringify(project),
      "pkg-a/lib/half.js":
        "exports.used = () => 1;\nexports.unused = () => 2;\n",
      "pkg-a/half.test.js":
        'test("used", () => expect(require("./lib/half").used()).toBe(1));\n',
      "pkg-b/package.json": JSON.stringify(project),
      "pkg-b/data.txt": "",
      "pkg-b/sibling.test.js": [
        'test("sibling hint", () => {',
        '  expect(() => require("./data")).toThrow(',
        "    /However, Jest was able to find:\\s+'\\.\\/data\\.txt'/,",
        "  );",
        "});",
        "",
      ].join("\n"),
    });
    const jestBin = join(dirname(resolveVia("jest")), "bin", "jest.js");
    const env = { ...process.env, NODE_OPTIONS: "" };

    const run = await runFile(
      process.execPath,
      [jestBin, "--ci", "--json", "--outputFile", join(root, "results.json")],
      { cwd: root, env },
    ).then(
      () => ({ code: 0, stderr: "" }),
      (error: { code: number; stderr: string }) => error,
    );
    const results = JSON.parse(
      await readFile(join(root, "results.json"), "utf8"),
    ) as { numPassedTests: number; numTotalTests: number };

    expect(results).toMatchObject({ numPassedTests: 2, numTotalTests: 2 });
    expect(run.code).toBe(1);
    expect(run.stderr).toContain(
      `Jest: Coverage for functions (50%) does not meet "${join(root, "pkg-a/lib/half.js")}" threshold (100%)`,
    );
  }, 60_000);
});
