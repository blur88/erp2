import { readFileSync } from "node:fs";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";
import {
  findNodeVersionMisalignments,
  NODE_VERSION_FILES,
  NodeVersionSources,
} from "./node-version-alignment";

const repoRoot = join(
  dirname(fileURLToPath(import.meta.url)),
  "..",
  "..",
  "..",
);

const alignedSources = (): NodeVersionSources => ({
  "backend/Dockerfile": [
    "FROM node:26.13.1-alpine3.24 AS deps",
    "FROM node:26.13.1-alpine3.24 AS builder",
    "FROM node:26.13.1-alpine3.24 AS production",
  ].join("\n"),
  "frontend/Dockerfile": [
    "FROM node:26.13.1-alpine3.24 AS builder",
    "FROM nginx:example AS production",
  ].join("\n"),
  ".nvmrc": "26\n",
  ".github/workflows/e2e-leakcheck.yml": [
    "      - uses: actions/setup-node@v4",
    "        with:",
    "          node-version: 26.13.1",
  ].join("\n"),
  "backend/package.json": JSON.stringify({ engines: { node: ">=26.13.1" } }),
  "frontend/package.json": JSON.stringify({
    engines: { node: ">=26.13.1", npm: ">=9.0.0" },
  }),
});

describe("Node version alignment", () => {
  it("holds for the repository's current Node pin", () => {
    const sources = Object.fromEntries(
      NODE_VERSION_FILES.map((file) => [
        file,
        readFileSync(join(repoRoot, file), "utf8"),
      ]),
    ) as NodeVersionSources;

    expect(findNodeVersionMisalignments(sources)).toEqual([]);
  });

  it("accepts sources that agree on one Node runtime", () => {
    expect(findNodeVersionMisalignments(alignedSources())).toEqual([]);
  });

  it("reports a Dockerfile whose Node image tag disagrees with the others", () => {
    const sources = alignedSources();
    sources["frontend/Dockerfile"] = sources["frontend/Dockerfile"].replace(
      "node:26.13.1-alpine3.24",
      "node:26.12.0-alpine3.24",
    );

    const problems = findNodeVersionMisalignments(sources);

    expect(problems).toHaveLength(1);
    expect(problems[0]).toContain("frontend/Dockerfile");
    expect(problems[0]).toContain("26.12.0-alpine3.24");
    expect(problems[0]).toContain("26.13.1-alpine3.24");
  });

  it("reports an .nvmrc whose major differs from the image's", () => {
    const sources = alignedSources();
    sources[".nvmrc"] = "24\n";

    const problems = findNodeVersionMisalignments(sources);

    expect(problems).toHaveLength(1);
    expect(problems[0]).toContain(".nvmrc");
    expect(problems[0]).toContain("24");
    expect(problems[0]).toContain("26");
  });

  it("reports an E2E leak-check workflow pinned to a different exact version", () => {
    const sources = alignedSources();
    sources[".github/workflows/e2e-leakcheck.yml"] = sources[
      ".github/workflows/e2e-leakcheck.yml"
    ].replace("node-version: 26.13.1", "node-version: 26.12.0");

    const problems = findNodeVersionMisalignments(sources);

    expect(problems).toHaveLength(1);
    expect(problems[0]).toContain(".github/workflows/e2e-leakcheck.yml");
    expect(problems[0]).toContain("26.12.0");
    expect(problems[0]).toContain("26.13.1");
  });

  it("reports an E2E leak-check workflow with no exact Node version", () => {
    const sources = alignedSources();
    sources[".github/workflows/e2e-leakcheck.yml"] = sources[
      ".github/workflows/e2e-leakcheck.yml"
    ].replace("node-version: 26.13.1", "node-version-file: .nvmrc");

    const problems = findNodeVersionMisalignments(sources);

    expect(problems).toHaveLength(1);
    expect(problems[0]).toContain(".github/workflows/e2e-leakcheck.yml");
    expect(problems[0]).toContain("26.13.1");
  });

  it("reports an engines.node minimum the image's Node version does not satisfy", () => {
    const sources = alignedSources();
    sources["backend/package.json"] = JSON.stringify({
      engines: { node: ">=26.14.0" },
    });

    const problems = findNodeVersionMisalignments(sources);

    expect(problems).toHaveLength(1);
    expect(problems[0]).toContain("backend/package.json");
    expect(problems[0]).toContain(">=26.14.0");
    expect(problems[0]).toContain("26.13.1");
  });

  it.each([["^26.13.1"], [undefined]])(
    "reports an engines.node of %p that it cannot verify rather than skipping it",
    (range) => {
      const sources = alignedSources();
      sources["frontend/package.json"] = JSON.stringify({
        engines: { node: range, npm: ">=9.0.0" },
      });

      const problems = findNodeVersionMisalignments(sources);

      expect(problems).toHaveLength(1);
      expect(problems[0]).toContain("frontend/package.json");
      expect(problems[0]).toContain("engines.node");
    },
  );

  it("reports a Dockerfile with no Node FROM instruction", () => {
    const sources = alignedSources();
    sources["frontend/Dockerfile"] =
      "FROM nginx:example AS production";

    const problems = findNodeVersionMisalignments(sources);

    expect(problems).toEqual([
      expect.stringMatching(/frontend\/Dockerfile.*no Node FROM/),
    ]);
  });

  it("reports a Node image pin that is not an exact version", () => {
    const sources = alignedSources();
    for (const file of ["backend/Dockerfile", "frontend/Dockerfile"] as const) {
      sources[file] = sources[file].replaceAll(
        "node:26.13.1-alpine3.24",
        "node:26-alpine3.24",
      );
    }

    const problems = findNodeVersionMisalignments(sources);

    expect(problems).toEqual([
      expect.stringMatching(/backend\/Dockerfile.*node:26-alpine3\.24/),
    ]);
  });
});
