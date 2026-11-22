import * as path from "path";
import { fileURLToPath } from "node:url";
import { dirname } from "node:path";
import ts from "typescript";

const __dirname = dirname(fileURLToPath(import.meta.url));
const backendRoot = path.resolve(__dirname, "..", "..");

const resolve = (configPath: string) => {
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
  it("root tsconfig.json compiles exactly the files type-check:build compiles", () => {
    // ts-node (admin:create, backup:reconcile-schedulers) loads the root config
    // at runtime. If its file set matches tsconfig.build.json's, the build gate
    // already proves the program type-checks. Widening the root's `include`
    // needs a gate of its own.
    expect(resolve("tsconfig.json").files).toEqual(resolve("tsconfig.build.json").files);
  });

  it("root tsconfig.json stays CommonJS, the format ts-node CLIs load", () => {
    expect(resolve("tsconfig.json").options.module).toBe(ts.ModuleKind.CommonJS);
  });

  it("test/tsconfig.json gives editors the type-check:spec program", () => {
    // Editors use the nearest tsconfig.json. Without this file, test sources
    // fall back to the CommonJS root and editors flag every `import.meta`
    // (TS1343), errors Jest and type-check:spec never raise.
    expect(resolve("test/tsconfig.json")).toEqual(resolve("tsconfig.spec.json"));
  });
});
