import {
  dockerStageImages,
  officialImagePin,
} from "../../../scripts/docker-image-pins.cjs";

/**
 * Node runtime version alignment across the files a Node bump must touch
 * (#2031). The authoritative pin is the first Node `FROM` in
 * `backend/Dockerfile`; every other location is checked against it.
 */
export const NODE_VERSION_FILES = [
  "backend/Dockerfile",
  "frontend/Dockerfile",
  ".nvmrc",
  ".github/workflows/e2e-leakcheck.yml",
  "backend/package.json",
  "frontend/package.json",
] as const;

export type NodeVersionSources = Record<
  (typeof NODE_VERSION_FILES)[number],
  string
>;

const AUTHORITATIVE_DOCKERFILE = "backend/Dockerfile";
const EXACT_VERSION = /^\d+\.\d+\.\d+$/;

function nodeImageTags(dockerfile: string): string[] {
  return dockerStageImages(dockerfile).flatMap((image) => {
    const pin = officialImagePin(image);
    return pin?.repository === "node" ? [pin.tag] : [];
  });
}

/** `26.13.1-alpine3.24` → `26.13.1` */
function versionOfTag(tag: string): string {
  return tag.split("-")[0];
}

function majorOf(version: string): string {
  return version.replace(/^v/, "").split(".")[0];
}

export function findNodeVersionMisalignments(
  sources: NodeVersionSources,
): string[] {
  const problems: string[] = [];
  const pin = nodeImageTags(sources[AUTHORITATIVE_DOCKERFILE])[0];
  if (!pin || !EXACT_VERSION.test(versionOfTag(pin))) {
    // Every other check compares against this pin, so stop here.
    return [
      `${AUTHORITATIVE_DOCKERFILE}: first Node FROM must pin an exact version (node:X.Y.Z-...), found ${pin ? `node:${pin}` : "no Node FROM"}`,
    ];
  }

  for (const file of ["backend/Dockerfile", "frontend/Dockerfile"] as const) {
    const tags = nodeImageTags(sources[file]);
    if (tags.length === 0) {
      problems.push(
        `${file}: no Node FROM instruction found; expected node:${pin}`,
      );
    }
    for (const tag of tags) {
      if (tag !== pin) {
        problems.push(
          `${file}: Node image tag node:${tag} differs from the ${AUTHORITATIVE_DOCKERFILE} pin node:${pin}`,
        );
      }
    }
  }

  const pinVersion = versionOfTag(pin);
  const nvmrc = sources[".nvmrc"].trim();
  if (majorOf(nvmrc) !== majorOf(pinVersion)) {
    problems.push(
      `.nvmrc: ${nvmrc} does not match the Node image major ${majorOf(pinVersion)} (node:${pin})`,
    );
  }

  const workflow = ".github/workflows/e2e-leakcheck.yml";
  const workflowVersions = [
    ...sources[workflow].matchAll(/^\s*node-version:\s*["']?([^"'\s#]+)/gm),
  ].map((match) => match[1]);
  if (workflowVersions.length === 0) {
    problems.push(
      `${workflow}: no exact node-version found; expected ${pinVersion} (node:${pin})`,
    );
  }
  for (const version of workflowVersions) {
    if (version !== pinVersion) {
      problems.push(
        `${workflow}: node-version ${version} differs from the Node image version ${pinVersion} (node:${pin})`,
      );
    }
  }

  for (const file of [
    "backend/package.json",
    "frontend/package.json",
  ] as const) {
    const range: string | undefined = JSON.parse(sources[file]).engines?.node;
    const floor = /^>=\s*(\d+\.\d+\.\d+)$/.exec(range?.trim() ?? "")?.[1];
    if (!floor) {
      problems.push(
        `${file}: engines.node ${JSON.stringify(range)} is not a ">=X.Y.Z" floor this check can verify against the Node image version ${pinVersion}`,
      );
    } else if (compareVersions(pinVersion, floor) < 0) {
      problems.push(
        `${file}: engines.node "${range}" is not satisfied by the Node image version ${pinVersion} (node:${pin})`,
      );
    }
  }

  return problems;
}

function compareVersions(a: string, b: string): number {
  const [pa, pb] = [a, b].map((v) => v.split(".").map(Number));
  for (let i = 0; i < 3; i++) {
    if (pa[i] !== pb[i]) return pa[i] - pb[i];
  }
  return 0;
}
