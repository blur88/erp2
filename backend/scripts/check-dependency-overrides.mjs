// Check npm override compatibility and documentation coverage (#1931).
import { execFileSync } from "node:child_process";
import { readFileSync } from "node:fs";
import { createRequire } from "node:module";
import { join, resolve } from "node:path";

function overrideKeys(overrides, ancestors = []) {
  return Object.entries(overrides).flatMap(([key, rule]) => {
    const path = [...ancestors, key];
    return [
      path.join(" → "),
      ...(typeof rule === "string" ? [] : overrideKeys(rule, path)),
    ];
  });
}

function documentedKeys(markdown) {
  const keys = new Set();
  for (const line of markdown.split(/\r?\n/)) {
    const [, label, reason, removal, end] = line
      .split(/(?<!\\)\|/u)
      .map((cell) => cell.trim());
    const key = label?.match(/^`([^`]+)`$/u)?.[1];
    if (key && reason && removal && end === "") {
      keys.add(key.replaceAll("\\|", "|"));
    }
  }
  return keys;
}

async function check(project, documentation, allowlist) {
  const path = resolve(project);
  const manifest = JSON.parse(readFileSync(join(path, "package.json"), "utf8"));
  const documented = documentedKeys(readFileSync(documentation, "utf8"));
  const exceptions = JSON.parse(readFileSync(allowlist, "utf8"));
  const exceptionFields = [
    "parent",
    "parentVersion",
    "dependency",
    "declared",
    "resolved",
    "reason",
  ];
  if (
    !Array.isArray(exceptions) ||
    exceptions.some(
      (entry) =>
        !entry ||
        exceptionFields.some(
          (field) => typeof entry[field] !== "string" || !entry[field].trim(),
        ),
    )
  ) {
    throw new Error(
      "Expected an allowlist array with a parent, parentVersion, dependency, declared, resolved and reason for each entry",
    );
  }

  const problems = overrideKeys(manifest.overrides ?? {})
    .filter((key) => !documented.has(key))
    .map(
      (key) =>
        `Undocumented override key "${key}": expected a reason and removal condition`,
    );

  // Use the Arborist, package spec parser and semver bundled with CI's npm.
  const npmRoot = execFileSync("npm", ["root", "--global"], {
    encoding: "utf8",
  }).trim();
  const fromNpm = createRequire(join(npmRoot, "npm", "package.json"));
  const Arborist = fromNpm("@npmcli/arborist");
  const parseSpec = fromNpm("npm-package-arg");
  const semver = fromNpm("semver");
  // npm ci installs this same graph. Loading it virtually also checks packages
  // locked for other platforms and allows fixtures to run without installing.
  const tree = await new Arborist({ path }).loadVirtual();
  for (const parent of tree.inventory.values()) {
    for (const edge of parent.edgesOut.values()) {
      const rule = edge.overrides;
      if (!edge.to || rule?.name !== edge.name || rule.value === "*") continue;

      const original = parseSpec.resolve(edge.name, edge.rawSpec || "*");
      const spec = original.subSpec ?? original;
      const samePackage = spec.name === edge.to.packageName;
      if (
        ["range", "version"].includes(spec.type) &&
        samePackage &&
        (spec.fetchSpec === "*" ||
          semver.satisfies(edge.to.version, spec.fetchSpec, { loose: true }))
      )
        continue;

      const match = {
        parent: parent.packageName,
        parentVersion: parent.version,
        dependency: edge.name,
        declared: edge.rawSpec,
        resolved: samePackage
          ? edge.to.version
          : `${edge.to.packageName}@${edge.to.version}`,
      };
      if (
        exceptions.some((entry) =>
          Object.entries(match).every(([key, value]) => entry[key] === value),
        )
      )
        continue;

      problems.push(
        `${match.parent}@${match.parentVersion} -> ${match.dependency}: declared ${match.declared}, resolved ${match.resolved} (${parent.location || "root"})`,
      );
    }
  }

  if (problems.length) {
    console.error(problems.join("\n"));
    process.exitCode = 1;
  } else {
    console.log(
      "Dependency override compatibility and documentation checks passed.",
    );
  }
}

try {
  const args = process.argv.slice(2);
  if (args.length !== 3) {
    throw new Error(
      "Usage: node check-dependency-overrides.mjs <project-dir> <documentation.md> <allowlist.json>",
    );
  }
  await check(...args);
} catch (error) {
  console.error(`Could not check dependency overrides: ${error.message}`);
  process.exitCode = 2;
}
