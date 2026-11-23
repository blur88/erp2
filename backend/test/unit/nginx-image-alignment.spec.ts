import { readFileSync } from "node:fs";
import { findNginxImageMisalignment } from "./nginx-image-alignment";

describe("NGINX image alignment", () => {
  it("holds for the repository Dockerfiles", () => {
    expect(
      findNginxImageMisalignment(
        readFileSync(
          new URL("../../../frontend/Dockerfile", import.meta.url),
          "utf8",
        ),
        readFileSync(
          new URL("../../../nginx/Dockerfile", import.meta.url),
          "utf8",
        ),
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
