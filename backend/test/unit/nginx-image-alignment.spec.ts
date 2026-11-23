import { readFileSync } from "node:fs";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";
import { findNginxImageMisalignment } from "./nginx-image-alignment";

const repoRoot = join(
  dirname(fileURLToPath(import.meta.url)),
  "..",
  "..",
  "..",
);

describe("NGINX image alignment", () => {
  it("holds for the repository Dockerfiles", () => {
    expect(
      findNginxImageMisalignment(
        readFileSync(join(repoRoot, "frontend/Dockerfile"), "utf8"),
        readFileSync(join(repoRoot, "nginx/Dockerfile"), "utf8"),
      ),
    ).toBeUndefined();
  });

  it("resolves an aliased final stage to its external NGINX image", () => {
    expect(
      findNginxImageMisalignment(
        "FROM nginx:1.2.3-alpine3.24-slim AS runtime\nFROM runtime AS production",
        "FROM nginx:1.2.3-alpine3.24-slim",
      ),
    ).toBeUndefined();
  });

  it.each([
    ["1.2.4-alpine3.24-slim", "1.2.3-alpine3.24-slim"],
    ["1.2.3-alpine3.24-slim", "1.2.4-alpine3.24-slim"],
  ])(
    "reports divergence between frontend %s and proxy %s",
    (frontend, proxy) => {
      expect(
        findNginxImageMisalignment(
          `FROM node:example AS builder\nFROM nginx:${frontend} AS production`,
          `FROM nginx:${proxy}`,
        ),
      ).toContain(
        `nginx:${frontend} differs from nginx/Dockerfile nginx:${proxy}`,
      );
    },
  );
});
