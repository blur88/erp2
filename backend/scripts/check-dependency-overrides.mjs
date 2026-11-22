// Check npm override compatibility and documentation coverage (#1931).
import { execFileSync } from "node:child_process";
import { readFileSync, realpathSync, statSync } from "node:fs";
import { createRequire } from "node:module";
import { isAbsolute, join, relative, resolve, sep } from "node:path";

const exceptionIdentityFields = [
  "parent",
  "parentVersion",
  "dependency",
  "declared",
  "resolved",
];

function overrideKeys(overrides, ancestors = []) {
  return Object.entries(overrides).flatMap(([key, override]) => {
    const overridePath = [...ancestors, key];
    return [
      overridePath.join(" → "),
      ...(typeof override === "string"
        ? []
        : overrideKeys(override, overridePath)),
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

function describeIncompatibility({
  parent,
  parentVersion,
  dependency,
  declared,
  resolved,
}) {
  return `${parent}@${parentVersion} -> ${dependency}: declared ${declared}, resolved ${resolved}`;
}

function isWithin(directory, path) {
  const fromDirectory = relative(directory, path);
  return (
    fromDirectory !== ".." &&
    !fromDirectory.startsWith(`..${sep}`) &&
    !isAbsolute(fromDirectory)
  );
}

// Mirror the parts of the project's Jest config that select test files.
function jestSuite(projectDirectory, { jest = {} }) {
  const rootDir = resolve(projectDirectory, jest.rootDir ?? ".");
  const roots = (jest.roots ?? ["<rootDir>"]).map((root) =>
    realpathSync(resolve(rootDir, root.replace("<rootDir>", rootDir))),
  );
  const patterns = [jest.testRegex].flat().filter(Boolean);
  if (!patterns.length) {
    throw new Error("Expected a Jest testRegex in the project's package.json");
  }
  return (path) =>
    roots.some((root) => isWithin(root, path)) &&
    patterns.some((pattern) => new RegExp(pattern).test(path));
}

function gitRepository(projectDirectory) {
  const root = realpathSync(
    execFileSync("git", ["rev-parse", "--show-toplevel"], {
      cwd: projectDirectory,
      encoding: "utf8",
    }).trim(),
  );
  return {
    contains: (path) => isWithin(root, path),
    tracks: (path) =>
      execFileSync(
        "git",
        ["ls-files", "--", `:(literal)${relative(root, path)}`],
        {
          cwd: root,
          encoding: "utf8",
        },
      ) !== "",
  };
}

// Each exception must name the committed compatibility spec that exercises the
// consumer against the resolved dependency (#1935, #2025).
function specReferenceProblem(
  { spec },
  projectDirectory,
  { inSuite, repository },
) {
  if (spec === undefined) return "Missing spec reference";
  if (typeof spec !== "string" || !spec.trim() || isAbsolute(spec))
    return `Invalid spec reference ${JSON.stringify(spec)}, expected a path relative to the project`;
  const path = resolve(projectDirectory, spec);
  if (!statSync(path, { throwIfNoEntry: false })?.isFile())
    return `Nonexistent spec "${spec}"`;
  const realPath = realpathSync(path);
  if (!repository.contains(realPath))
    return `Spec "${spec}" is outside the repository`;
  if (!repository.tracks(realPath)) return `Untracked spec "${spec}"`;
  if (!inSuite(realPath)) return `Spec "${spec}" is not in the Jest test suite`;
  return null;
}

async function checkDependencyOverrides(project, documentation, allowlist) {
  const projectDirectory = resolve(project);
  const manifest = JSON.parse(
    readFileSync(join(projectDirectory, "package.json"), "utf8"),
  );
  const documented = documentedKeys(readFileSync(documentation, "utf8"));
  const exceptions = JSON.parse(readFileSync(allowlist, "utf8"));
  const requiredFields = [...exceptionIdentityFields, "reason"];
  if (
    !Array.isArray(exceptions) ||
    exceptions.some(
      (entry) =>
        !entry ||
        requiredFields.some(
          (field) => typeof entry[field] !== "string" || !entry[field].trim(),
        ),
    )
  ) {
    throw new Error(
      `Expected an allowlist array with these fields for each entry: ${requiredFields.join(", ")}`,
    );
  }

  const configured = new Set(overrideKeys(manifest.overrides ?? {}));
  const problems = [...configured]
    .filter((key) => !documented.has(key))
    .map(
      (key) =>
        `Undocumented override key "${key}": expected a reason and removal condition`,
    );

  for (const key of documented) {
    if (!configured.has(key)) {
      problems.push(
        `Stale documented override key "${key}": no matching override`,
      );
    }
  }

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
  const tree = await new Arborist({ path: projectDirectory }).loadVirtual();
  const unusedExceptions = new Set(exceptions);
  for (const parent of tree.inventory.values()) {
    for (const edge of parent.edgesOut.values()) {
      const overrideRule = edge.overrides;
      if (
        !edge.to ||
        overrideRule?.name !== edge.name ||
        overrideRule.value === "*"
      )
        continue;

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

      const incompatibility = {
        parent: parent.packageName,
        parentVersion: parent.version,
        dependency: edge.name,
        declared: edge.rawSpec,
        resolved: samePackage
          ? edge.to.version
          : `${edge.to.packageName}@${edge.to.version}`,
      };
      const matchingExceptions = exceptions.filter((entry) =>
        exceptionIdentityFields.every(
          (field) => entry[field] === incompatibility[field],
        ),
      );
      for (const entry of matchingExceptions) {
        unusedExceptions.delete(entry);
      }
      if (!matchingExceptions.length) {
        problems.push(
          `${describeIncompatibility(incompatibility)} (${parent.location || "root"})`,
        );
      }
    }
  }

  // A stale entry must be removed, so only matched exceptions need a spec.
  const matched = exceptions.filter((entry) => !unusedExceptions.has(entry));
  if (matched.length) {
    const specContext = {
      inSuite: jestSuite(projectDirectory, manifest),
      repository: gitRepository(projectDirectory),
    };
    for (const entry of matched) {
      const problem = specReferenceProblem(
        entry,
        projectDirectory,
        specContext,
      );
      if (problem)
        problems.push(`${problem}: ${describeIncompatibility(entry)}`);
    }
  }

  for (const entry of unusedExceptions) {
    problems.push(`Stale allowlist entry: ${describeIncompatibility(entry)}`);
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
  await checkDependencyOverrides(...args);
} catch (error) {
  console.error(`Could not check dependency overrides: ${error.message}`);
  process.exitCode = 2;
}
