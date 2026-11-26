import { execFileSync } from "node:child_process";
import { readFileSync } from "node:fs";
import { createRequire } from "node:module";
import * as path from "node:path";
import { fileURLToPath } from "node:url";
import ts from "typescript";

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const backendRoot = path.resolve(__dirname, "..", "..");
const require = createRequire(import.meta.url);

const parseConfig = (configPath: string) => {
  const file = path.resolve(backendRoot, configPath);
  const { config, error } = ts.readConfigFile(file, ts.sys.readFile);
  if (error) throw new Error(ts.flattenDiagnosticMessageText(error.messageText, "\n"));
  const parsed = ts.parseJsonConfigFileContent(config, ts.sys, path.dirname(file));
  if (parsed.errors.length) {
    throw new Error(
      parsed.errors.map((d) => ts.flattenDiagnosticMessageText(d.messageText, "\n")).join("\n"),
    );
  }
  const { configFilePath: _ignored, ...options } = parsed.options;
  return { files: [...parsed.fileNames].sort(), options };
};

/**
 * Each backend TypeScript configuration must be compiled by a named gate
 * (#2030). The root tsconfig.json is not compiled by `npm run type-check`
 * directly; these assertions are the evidence that it doesn't need to be.
 */
describe("backend TypeScript configuration roles", () => {
  it("root tsconfig.json is the type-check:build program", () => {
    // The build gate covers the root config while both programs have the
    // same files and checking options. Widening the root's `include` or
    // overriding a checking option in the build config needs its own gate.
    const root = parseConfig("tsconfig.json");
    const build = parseConfig("tsconfig.build.json");
    expect(root.files).toEqual(build.files);
    // The only overrides tsconfig.build.json declares; neither affects checking.
    const { rootDir: _rootDir, incremental: _incremental, ...buildChecking } = build.options;
    const { incremental: _rootIncremental, ...rootChecking } = root.options;
    expect(rootChecking).toEqual(buildChecking);
  });

  it("root tsconfig.json stays CommonJS for scripts that select it", () => {
    expect(parseConfig("tsconfig.json").options.module).toBe(ts.ModuleKind.CommonJS);
  });

  it("direct ts-node scripts explicitly select the backend root config", () => {
    const { scripts }: { scripts: Record<string, string> } = JSON.parse(
      readFileSync(path.join(backendRoot, "package.json"), "utf8"),
    );
    // Match standalone ts-node tokens, including prefixed invocations.
    const tsNodeScripts = Object.entries(scripts).filter(([, command]) =>
      /(?:^|\s)ts-node(?:\s|$)/.test(command),
    );

    expect(tsNodeScripts.length).toBeGreaterThan(0);
    for (const [name, command] of tsNodeScripts) {
      expect({ name, command }).toEqual({
        name,
        command: expect.stringMatching(/^ts-node -P tsconfig\.json /),
      });

      // These scripts use plain arguments. Diagnostic mode exits before
      // running the entry point, including the seed under test/tsconfig.json.
      const [, ...args] = command.split(/\s+/);
      const output = execFileSync(
        process.execPath,
        [require.resolve("ts-node/dist/bin.js"), "--showConfig", ...args],
        { cwd: backendRoot, encoding: "utf8" },
      );
      expect({ name, config: JSON.parse(output) }).toMatchObject({
        name,
        config: {
          "ts-node": { project: path.join(backendRoot, "tsconfig.json") },
          compilerOptions: { module: "commonjs" },
        },
      });
    }
  });

  it("test/tsconfig.json gives editors the type-check:spec program", () => {
    // Editors use the nearest tsconfig.json. Without this file, test sources
    // fall back to the CommonJS root and editors flag every `import.meta`
    // (TS1343), errors Jest and type-check:spec never raise.
    expect(parseConfig("test/tsconfig.json")).toEqual(parseConfig("tsconfig.spec.json"));
  });
});
