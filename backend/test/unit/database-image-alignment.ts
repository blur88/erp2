import { officialImagePin } from "../../../scripts/docker-image-pins.cjs";

const expectedImages = new Map([
  ["postgres", "postgres:18.7-alpine3.23"],
  ["redis", "redis:8.6.8-alpine3.23"],
]);

const officialDatabaseImage =
  /(?:(?:docker\.io\/)?library\/|docker\.io\/)?(postgres|redis)/;
const taggedImage = new RegExp(
  "(?:^|[\\s\"'=,{\\[])(" +
    officialDatabaseImage.source +
    "[:@][^\\s\"'\\x60,}\\];)]+)",
  "g",
);

const databaseImagePrefix = new RegExp(
  "^" + officialDatabaseImage.source + "(?=[:@]|$)",
);
const imageField =
  /(?:^|[\s,{])(?:image|"image"|'image'):\s*(?:[>|][+-]?\r?\n\s*)?["']?([^\s"',}\]]+)/g;
const quotedValue = /"(?:\\.|[^"\\])*"|'[^']*'/;
const comment = new RegExp(quotedValue.source + "|(^|\\s)#.*$", "g");
const shellWord = new RegExp(
  "(?:" + quotedValue.source + "|[^\\s\"'\\x60;&|()])+",
  "g",
);
const booleanDockerOptions = new Set([
  "--detach",
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
  "--tty",
  "--use-api-socket",
]);

function dockerRunImage(command: string): string | undefined {
  const args = command.match(shellWord) ?? [];
  for (let index = 0; index < args.length; index++) {
    const arg = args[index];
    if (arg === "--") return args[index + 1]?.replace(/^["']|["']$/g, "");
    if (!arg.startsWith("-")) return arg.replace(/^["']|["']$/g, "");
    // Long options take a separate value unless boolean or written as --key=value.
    // Short options can group boolean flags before an option that takes a value.
    if (
      (arg.startsWith("--") &&
        !arg.includes("=") &&
        !booleanDockerOptions.has(arg)) ||
      /^-[diPqt]*[acehlmpuvw]$/.test(arg)
    ) {
      index++;
    }
  }
}

export function findDatabaseImageMisalignment(
  sources: Record<string, string>,
): string | undefined {
  for (const [file, content] of Object.entries(sources)) {
    const source = content
      .split("\n")
      .map((line) =>
        line.replace(comment, (text, prefix) =>
          prefix === undefined ? text : "",
        ),
      )
      .join("\n")
      .replace(/\\\r?\n/g, "");

    const references = Array.from(
      source.matchAll(imageField),
      ([, image]) => image,
    );
    for (const line of source.split("\n")) {
      for (const [, image] of line.matchAll(taggedImage)) {
        references.push(image);
      }
      for (const [, command] of line.matchAll(
        /\bdocker\s+(?:(?:--context|-c)(?:=|\s+)\S+\s+)?(?:container\s+)?run[ \t]+(.+)/g,
      )) {
        const image = dockerRunImage(command);
        if (image) references.push(image);
      }
    }

    for (const image of references) {
      const repository =
        officialImagePin(image)?.repository ??
        databaseImagePrefix.exec(image)?.[1];
      const expected = repository && expectedImages.get(repository);
      if (expected && image !== expected) {
        return `${file}: expected ${expected}, found ${image}`;
      }
    }
  }
}
