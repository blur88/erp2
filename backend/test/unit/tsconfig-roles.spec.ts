import * as path from "path";
import { fileURLToPath } from "node:url";
import { dirname } from "node:path";
import ts from "typescript";

const __dirname = dirname(fileURLToPath(import.meta.url));
const backendRoot = path.resolve(__dirname, "..", "..");

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
    // ts-node (admin:create) loads the root config
    // at runtime. While its files and checking options match
    // tsconfig.build.json's, the build gate already proves the program
    // type-checks. Widening the root's `include`, or overriding a checking
    // option in the build config, needs a gate of its own.
    const root = parseConfig("tsconfig.json");
    const build = parseConfig("tsconfig.build.json");
    expect(root.files).toEqual(build.files);
    // The only overrides tsconfig.build.json declares; neither affects checking.
    const { rootDir: _rootDir, incremental: _incremental, ...buildChecking } = build.options;
    const { incremental: _rootIncremental, ...rootChecking } = root.options;
    expect(rootChecking).toEqual(buildChecking);
  });

  it("root tsconfig.json stays CommonJS, the format ts-node CLIs load", () => {
    expect(parseConfig("tsconfig.json").options.module).toBe(ts.ModuleKind.CommonJS);
  });

  it("test/tsconfig.json gives editors the type-check:spec program", () => {
    // Editors use the nearest tsconfig.json. Without this file, test sources
    // fall back to the CommonJS root and editors flag every `import.meta`
    // (TS1343), errors Jest and type-check:spec never raise.
    expect(parseConfig("test/tsconfig.json")).toEqual(parseConfig("tsconfig.spec.json"));
  });
});
