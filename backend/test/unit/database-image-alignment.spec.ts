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
  it("rejects an untagged image after Docker run options", () => {
    expect(
      findDatabaseImageMisalignment({
        "scripts/start-cache.sh":
          'docker run --rm -e "MODE=local test" \\\n  docker.io/library/redis redis-server',
      }),
    ).toContain(
      "scripts/start-cache.sh: expected redis:8.6.8-alpine3.23, found docker.io/library/redis",
    );
  });

  it.each(['"image": "redis"', "image: >-\n  redis"])(
    "rejects an untagged image in YAML using %s",
    (content) => {
      expect(
        findDatabaseImageMisalignment({ "compose.yml": content }),
      ).toContain("compose.yml: expected redis:8.6.8-alpine3.23, found redis");
    },
  );

  it("rejects an untagged image when Docker uses an explicit context", () => {
    expect(
      findDatabaseImageMisalignment({
        "scripts/start-cache.sh": "docker --context local run --rm redis",
      }),
    ).toContain(
      "scripts/start-cache.sh: expected redis:8.6.8-alpine3.23, found redis",
    );
  });

  it("ignores image references in comments and private image names", () => {
    expect(
      findDatabaseImageMisalignment({
        "compose.test.yml":
          "image: postgres:18.7-alpine3.23 # replaces postgres:18.3-alpine",
        "scripts/start-cache.sh":
          "docker run --rm registry.example/redis:custom # replaced redis:latest\n" +
          "docker run --rm erp-backend psql -h postgres",
      }),
    ).toBeUndefined();
  });

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
