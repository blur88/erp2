// Keep Compose, CI, and script image references aligned with development Compose (#2043).
import { load } from "js-yaml";
import {
  isComposeFile,
  officialImagePin,
  officialImageRepository,
} from "../../../scripts/docker-image-pins.cjs";

const canonicalCompose = "docker-compose.yml";
const exactTags = new Map([
  ["postgres", /^\d+\.\d+-alpine\d+\.\d+$/],
  ["redis", /^\d+\.\d+\.\d+-alpine\d+\.\d+$/],
]);
const workflowPath = /^\.github\/workflows\/.*\.ya?ml$/;

export function isDatabaseImageSource(file: string): boolean {
  return (
    !file.split("/").includes("__tests__") &&
    (isComposeFile(file) ||
      workflowPath.test(file) ||
      /\.(?:bash|sh)$/.test(file))
  );
}

function record(value: unknown): Record<string, unknown> {
  if (value && typeof value === "object" && !Array.isArray(value)) {
    return value as Record<string, unknown>;
  }
  return {};
}

// YAML loading resolves quoted fields, folded strings, and aliases. Traverse
// both Compose and Actions mappings, including nested service containers.
function* yamlImages(
  node: unknown,
  seen = new WeakSet<object>(),
): Generator<string> {
  if (!node || typeof node !== "object" || seen.has(node)) return;
  seen.add(node);
  for (const [key, value] of Object.entries(node)) {
    if (typeof value === "string") {
      if (key === "image") yield value;
      if (key === "run") yield* shellImages(value);
    } else {
      yield* yamlImages(value, seen);
    }
  }
}

const separator = /^[\n;&|()]$/;
const commandPrefix =
  /^(?:\w+=|!$|command$|do$|elif$|else$|exec$|if$|sudo$|then$)/;
const shellToken =
  /#[^\n]*|[\n;&|()]|(?:\$\{\{.*?\}\}|\$\{[^}\n]*\}|"[^"\n]*"|'[^'\n]*'|[^\s"';&|()$]|\$(?!\{))+/g;
const booleanDockerFlags = new Set([
  "--all-tags",
  "--debug",
  "--detach",
  "--disable-content-trust",
  "--help",
  "--init",
  "--interactive",
  "--no-healthcheck",
  "--oom-kill-disable",
  "--privileged",
  "--publish-all",
  "--quiet",
  "--read-only",
  "--rm",
  "--sig-proxy",
  "--tls",
  "--tlsverify",
  "--tty",
  "--use-api-socket",
]);

function positional(
  args: string[],
  start: number,
  shortValueFlags?: RegExp,
): number {
  let index = start;
  while (index < args.length) {
    const arg = args[index];
    if (!arg.startsWith("-")) break;
    if (arg === "--") return index + 1;
    const takesValue =
      (arg.startsWith("--") &&
        !arg.includes("=") &&
        !booleanDockerFlags.has(arg)) ||
      shortValueFlags?.test(arg);
    index += takesValue ? 2 : 1;
  }
  return index;
}

function dockerImage(args: string[]): string | undefined {
  let index = positional(args, 0, /^-[D]*[cHl]$/);
  if (args[index] === "container" || args[index] === "image") index++;
  const operation = args[index];
  if (operation !== "run" && operation !== "create" && operation !== "pull")
    return;
  const shortValueFlags =
    operation === "pull" ? undefined : /^-[diPqt]*[acehlmpuvw]$/;
  return args[positional(args, index + 1, shortValueFlags)];
}

function* quotedImagePins(token: string): Generator<string> {
  for (const [, doubleQuoted, singleQuoted] of token.matchAll(
    /"([^"]+)"|'([^']+)'/g,
  )) {
    const words = (doubleQuoted ?? singleQuoted).split(/[\s"'<>()[\],;&|]+/);
    for (const word of words) {
      const image = word.replace(/\.+$/, "");
      const pin = officialImagePin(image);
      // In prose, a numeric suffix alone can be a port, as in redis:6379.
      if (pin && !/^\d+$/.test(pin.tag)) yield image;
    }
  }
}

// Scan literal Docker commands without evaluating shell or Actions expressions.
function* shellImages(source: string): Generator<string> {
  const tokens = source.replace(/\\\r?\n/g, "").match(shellToken) ?? [];
  let command: string[] = [];
  for (const token of [...tokens, "\n"]) {
    if (token.startsWith("#")) continue;
    if (separator.test(token)) {
      const start = command.findIndex((word) => !commandPrefix.test(word));
      if (start >= 0 && command[start] === "docker") {
        const image = dockerImage(command.slice(start + 1));
        if (image) yield image.replace(/^["']|["']$/g, "");
      }
      command = [];
    } else {
      command.push(token);
      yield* quotedImagePins(token);
    }
  }
}

export function findDatabaseImageMisalignment(
  sources: Record<string, string>,
): string | undefined {
  const compose = load(sources[canonicalCompose] ?? "");
  const services = record(record(compose).services);
  const expected = new Map<string, string>();

  for (const [repository, tagPattern] of exactTags) {
    const image = record(services[repository]).image;
    const pin = typeof image === "string" ? officialImagePin(image) : undefined;
    if (
      !pin ||
      pin.repository !== repository ||
      !tagPattern.test(pin.tag) ||
      image !== repository + ":" + pin.tag
    ) {
      return `${canonicalCompose}: expected an exact Alpine tag for ${repository}, found ${String(image)}`;
    }
    expected.set(repository, image);
  }

  for (const [file, content] of Object.entries(sources)) {
    const references =
      isComposeFile(file) || workflowPath.test(file)
        ? yamlImages(file === canonicalCompose ? compose : load(content))
        : shellImages(content);
    for (const reference of references) {
      const image = reference
        .trim()
        .replace(/^\$\{[A-Za-z_]\w*:?-(.*?)\}$/, "$1");
      const repository = officialImageRepository(
        image.replace(/\$\{\{[\s\S]*?\}\}|\$\{[^}]*\}/g, "variable"),
      );
      const pin = repository && expected.get(repository);
      if (pin && image !== pin) {
        return `${file}: expected ${pin}, found ${image}`;
      }
    }
  }
}
