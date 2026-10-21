import { readdirSync, readFileSync, statSync } from "fs";
import { join, relative, resolve } from "path";

function sourceFiles(root: string): string[] {
  return readdirSync(root).flatMap((name) => {
    const path = join(root, name);
    if (statSync(path).isDirectory()) return sourceFiles(path);
    return path.endsWith(".ts") ? [path] : [];
  });
}

describe("inventory valuation stays inactive in stage 1", () => {
  it("contains no source path that activates valuation or pauses stock", () => {
    const srcRoot = resolve(process.cwd(), "src");
    // The state entity must declare the pausedAt column. Ignore that typed
    // declaration while still catching assignments and object writes.
    const activationWrite =
      /status\s*:\s*['"]active['"]|SET\s+"?status"?\s*=\s*'active'/i;
    const pausedAtWrite = /pausedAt\s*(?:=|:)/i;
    const stateEntityDeclaration = /^\s*pausedAt\s*:\s*Date\b/;
    const violations = sourceFiles(srcRoot)
      .filter(
        (path) =>
          !path.endsWith(".spec.ts") &&
          !path.includes(`${join("database", "migrations")}/`),
      )
      .filter((path) => {
        const source = readFileSync(path, "utf8");
        if (!/InventoryValuationState|inventory_valuation_state/.test(source))
          return false;
        if (activationWrite.test(source)) return true;
        return source
          .split(/\r?\n/)
          .some(
            (line) =>
              pausedAtWrite.test(line) && !stateEntityDeclaration.test(line),
          );
      })
      .map((path) => relative(srcRoot, path));

    expect(violations).toEqual([]);
  });
});
