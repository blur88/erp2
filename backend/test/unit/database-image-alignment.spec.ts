import { fileURLToPath } from "node:url";
import { readRepositorySources } from "../../../scripts/docker-image-pins.cjs";
import {
  findDatabaseImageMisalignment,
  isDatabaseImageSource,
} from "./database-image-alignment";

const repoRoot = fileURLToPath(new URL("../../../", import.meta.url));
const compose = `
services:
  postgres:
    image: postgres:18.6-alpine3.23
  redis:
    image: redis:8.6.7-alpine3.23
`;

function check(sources: Record<string, string>): string | undefined {
  return findDatabaseImageMisalignment({
    "docker-compose.yml": compose,
    ...sources,
  });
}

describe("Postgres and Redis image alignment", () => {
  it("rejects an untagged image after Docker run options", () => {
    expect(
      check({
        "scripts/start-cache.sh":
          'docker run --rm -e "MODE=local test" \\\n  docker.io/library/redis redis-server',
      }),
    ).toContain(
      "scripts/start-cache.sh: expected redis:8.6.7-alpine3.23, found docker.io/library/redis",
    );
  });

  it.each(['"image": "redis"', "image: >-\n  redis"])(
    "rejects an untagged image in YAML using %s",
    (content) => {
      expect(check({ "compose.yml": content })).toContain(
        "compose.yml: expected redis:8.6.7-alpine3.23, found redis",
      );
    },
  );

  it("rejects an untagged image when Docker uses an explicit context", () => {
    expect(
      check({
        "scripts/start-cache.sh": "docker --context local run --rm redis",
      }),
    ).toContain(
      "scripts/start-cache.sh: expected redis:8.6.7-alpine3.23, found redis",
    );
  });

  it("ignores image references in comments and private image names", () => {
    expect(
      check({
        "compose.test.yml":
          "image: postgres:18.6-alpine3.23 # replaces postgres:18.3-alpine",
        "scripts/start-cache.sh":
          "docker run --rm registry.example/redis:custom # replaced redis:latest\n" +
          "docker run --rm erp-backend psql -h postgres",
      }),
    ).toBeUndefined();
  });

  it("ignores connection URLs and plain diagnostic text", () => {
    expect(
      check({
        "setup.sh":
          'REDIS_URL=redis://localhost:6379\nDATABASE_URL="postgres://localhost/db"\necho "connect redis:6379"',
      }),
    ).toBeUndefined();
  });

  it.each([
    ['echo "  docker run -d redis:8.6.1-alpine3.23"', "redis:8.6.1-alpine3.23"],
    [
      "echo '  docker run -d postgres:18.3-alpine3.23'",
      "postgres:18.3-alpine3.23",
    ],
    ['printf "%s\\n" "Pull redis:8.6-alpine first"', "redis:8.6-alpine"],
  ])(
    "rejects stale image pins in printed instructions (%s)",
    (source, image) => {
      expect(check({ "setup.sh": source })).toContain(`found ${image}`);
    },
  );

  it("accepts aligned pins and private images in quoted instructions", () => {
    expect(
      check({
        "setup.sh":
          'echo "  docker run redis:8.6.7-alpine3.23"\necho "  docker run registry.example/redis:custom"',
      }),
    ).toBeUndefined();
  });

  it.each([
    [
      "compose.test.yml",
      "services:\n  db:\n    image: ${PG_IMAGE:-postgres:18.3-alpine}",
      "postgres:18.3-alpine",
    ],
    [
      "deploy.sh",
      "docker create --name db postgres:18.3-alpine",
      "postgres:18.3-alpine",
    ],
    [
      "maintain.sh",
      "docker image pull --platform linux/amd64 redis:8.6-alpine",
      "redis:8.6-alpine",
    ],
    [
      ".github/workflows/probe.yml",
      "jobs:\n  check:\n    services:\n      db:\n        image: postgres:${{ matrix.pg }}-alpine",
      "postgres:${{ matrix.pg }}-alpine",
    ],
  ])("reports the complete image reference in %s", (file, source, image) => {
    expect(check({ [file]: source })).toContain(`found ${image}`);
  });

  it("discovers root scripts and container entrypoints", () => {
    const sources = readRepositorySources(repoRoot, isDatabaseImageSource);
    expect(Object.keys(sources)).toEqual(
      expect.arrayContaining([
        "setup.sh",
        "deploy.sh",
        "maintain.sh",
        "backend/docker-entrypoint.sh",
        "frontend/docker-entrypoint.sh",
      ]),
    );
  });

  it("requires a fully specified Alpine reference in development Compose", () => {
    expect(
      check({
        "docker-compose.yml": compose.replace(
          "redis:8.6.7-alpine3.23",
          "redis:8.6-alpine",
        ),
      }),
    ).toContain(
      "docker-compose.yml: expected an exact Alpine tag for redis, found redis:8.6-alpine",
    );
  });

  it("holds for repository compose files, workflows, and scripts", () => {
    const sources = readRepositorySources(repoRoot, isDatabaseImageSource);
    expect(findDatabaseImageMisalignment(sources)).toBeUndefined();
  });
});
