import * as fs from "fs";
import * as path from "path";
import { fileURLToPath } from "node:url";
import { dirname } from "node:path";

const __dirname = dirname(fileURLToPath(import.meta.url));

/**
 * Lockstep gate. The leak-check config must stay identical to the e2e config
 * apart from the two lifecycle hooks it removes.
 *
 * Deep equality, not key-set equality: comparing key sets alone passes when a
 * SHARED key's value drifts. Changing maxWorkers, testTimeout, the
 * moduleNameMapper entries, or testRegex in jest-e2e.json would leave the key
 * sets identical while the leak check silently stopped mirroring the real
 * gate — and a leak check that runs a different suite set, or with different
 * concurrency, is not measuring what it claims to.
 */
describe("jest-e2e-leakcheck.json", () => {
  const read = (f: string) =>
    JSON.parse(
      fs.readFileSync(path.resolve(__dirname, "..", f), "utf8"),
    ) as Record<string, unknown>;

  it("differs from jest-e2e.json by exactly the two lifecycle keys", () => {
    const e2e = read("jest-e2e.json");
    const leak = read("jest-e2e-leakcheck.json");

    expect(e2e).toHaveProperty("globalSetup");
    expect(e2e).toHaveProperty("globalTeardown");

    delete e2e.globalSetup;
    delete e2e.globalTeardown;

    expect(leak).toEqual(e2e);
  });

  it("does not itself define the lifecycle hooks", () => {
    const leak = read("jest-e2e-leakcheck.json");
    // Dropping the drop-and-recreate is the entire point: with it, every run
    // starts fresh and a leak is undetectable.
    expect(leak).not.toHaveProperty("globalSetup");
    expect(leak).not.toHaveProperty("globalTeardown");
  });

  it("never sets passWithNoTests", () => {
    // Zero-discovery must fail, not pass. See CLAUDE.md.
    const leak = read("jest-e2e-leakcheck.json");
    expect(leak).not.toHaveProperty("passWithNoTests");
  });
});
