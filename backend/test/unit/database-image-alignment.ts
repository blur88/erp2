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
const imageVariable = /(?:^|_)(?:image|img)$/i;
const shellDefault = /^\$\{([A-Za-z_]\w*):?-(.*?)\}$/;
const imageTagInText =
  /^(?:\d+[.-]\w|latest$|alpine$|(?:bookworm|bullseye|trixie)(?:-slim)?$)/;

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
  scanText = false,
  seen = new WeakSet<object>(),
): Generator<string> {
  if (!node || typeof node !== "object" || seen.has(node)) return;
  seen.add(node);
  for (const [key, value] of Object.entries(node)) {
    if (typeof value === "string") {
      if (key === "image") yield value;
      else if (key === "run") yield* shellImages(value);
      else if (scanText) {
        if (imageVariable.test(key)) yield value;
        yield* imagePinsInText(value);
      }
    } else {
      yield* yamlImages(value, scanText, seen);
    }
  }
}

function* workflowImages(node: unknown): Generator<string> {
  for (const job of Object.values(record(record(node).jobs))) {
    const { container, steps } = record(job);
    if (typeof container === "string") yield container;
    if (!Array.isArray(steps)) continue;
    for (const step of steps) {
      const { uses } = record(step);
      if (typeof uses === "string" && uses.startsWith("docker://")) {
        yield uses.slice("docker://".length);
      }
    }
  }
  yield* yamlImages(node, true);
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

function dockerImage(tokens: string[], start: number): string | undefined {
  if (tokens[start] !== "docker") return;
  const args = tokens.slice(start + 1);
  let index = positional(args, 0, /^-[D]*[cHl]$/);
  if (args[index] === "container" || args[index] === "image") index++;
  const operation = args[index];
  if (operation !== "run" && operation !== "create" && operation !== "pull")
    return;
  const shortValueFlags =
    operation === "pull" ? undefined : /^-[diPqt]*[acehlmpuvw]$/;
  return args[positional(args, index + 1, shortValueFlags)]?.replace(
    /^["']|["']$/g,
    "",
  );
}

function resolveImageDefault(reference: string) {
  const [, variable, image = reference] = shellDefault.exec(reference) ?? [];
  return { image, variable };
}

function* imagePinsInText(text: string): Generator<string> {
  // Printed Docker commands carry the same image argument as executable ones.
  const tokens = text.match(shellToken) ?? [];
  for (const index of tokens.keys()) {
    const image = dockerImage(tokens, index);
    if (image) yield image.replace(/[.,]+$/, "");
  }

  for (const word of text.split(/[\s"'<>()[\],;&|]+/)) {
    const { image, variable } = resolveImageDefault(word.replace(/\.+$/, ""));
    if (variable && imageVariable.test(variable)) {
      yield image;
      continue;
    }
    const pin = officialImagePin(image);
    // Version tags and common aliases help distinguish image pins from
    // ports, owner specs, and credentials in free text.
    if (pin && imageTagInText.test(pin.tag)) yield image;
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
      const isChown = /(?:^|\/)chown$/.test(command[start] ?? "");
      // chown operands are ownership specs and paths, even when they look like pins.
      const textTokens = isChown ? command.slice(0, start) : command;
      for (const word of textTokens) {
        for (const [, doubleQuoted, singleQuoted] of word.matchAll(
          /"([^"]+)"|'([^']+)'/g,
        )) {
          yield* imagePinsInText(doubleQuoted ?? singleQuoted);
        }
      }
      const image = dockerImage(command, start);
      if (image) yield image;
      command = [];
    } else {
      command.push(token);
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
    const references = workflowPath.test(file)
      ? workflowImages(load(content))
      : isComposeFile(file)
        ? yamlImages(file === canonicalCompose ? compose : load(content))
        : shellImages(content);
    for (const reference of references) {
      const { image } = resolveImageDefault(reference.trim());
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
