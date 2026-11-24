import { execFileSync } from "node:child_process";
import { existsSync, readFileSync } from "node:fs";
import { basename, join } from "node:path";
import { fileURLToPath } from "node:url";
import { findDatabaseImageMisalignment } from "./database-image-alignment";

const repoRoot = fileURLToPath(new URL("../../../", import.meta.url));
const composeName = /^(?:docker-)?compose(?:[.-].+)?\.ya?ml$/;
const workflowPath = /^\.github\/workflows\/.+\.ya?ml$/;
const scriptPath =
  /^(?:backend\/)?scripts\/(?!__tests__\/).+\.(?:sh|bash|[cm]?js|ts)$/;

describe("Postgres and Redis image alignment", () => {
  it("holds for repository compose files, workflows, and scripts", () => {
    const files = execFileSync(
      "git",
      ["ls-files", "-z", "--cached", "--others", "--exclude-standard"],
      { cwd: repoRoot, encoding: "utf8" },
    ).split("\0");

    const sources = Object.fromEntries(
      files
        .filter(
          (file) =>
            (composeName.test(basename(file)) ||
              workflowPath.test(file) ||
              scriptPath.test(file)) &&
            existsSync(join(repoRoot, file)),
        )
        .map((file) => [file, readFileSync(join(repoRoot, file), "utf8")]),
    );

    expect(findDatabaseImageMisalignment(sources)).toBeUndefined();
  });
});
