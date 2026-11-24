import { officialImagePin } from "../../../scripts/docker-image-pins.cjs";

const expectedImages = new Map([
  ["postgres", "postgres:18.7-alpine3.23"],
  ["redis", "redis:8.6.8-alpine3.23"],
]);

// Match reference tokens in YAML and shell, including continued docker run
// commands and image variables. Keep private registries and namespaces out.
const taggedImage =
  /(?:^|[\s"'=,{\[])((?:(?:docker\.io\/)?library\/|docker\.io\/)?(?:postgres|redis)[:@][^\s"'\x60,}\];)]+)/g;
const untaggedImage =
  /(?:\bimage:\s*|\bdocker\s+(?:container\s+)?run\s+)["']?((?:(?:docker\.io\/)?library\/|docker\.io\/)?(?:postgres|redis))(?=$|[\s"',}\];)])/;

export function findDatabaseImageMisalignment(
  sources: Record<string, string>,
): string | undefined {
  for (const [file, content] of Object.entries(sources)) {
    for (const line of content.split("\n")) {
      if (line.trimStart().startsWith("#")) continue;

      const references = Array.from(
        line.matchAll(taggedImage),
        ([, image]) => image,
      );
      const untagged = untaggedImage.exec(line)?.[1];
      if (untagged) references.push(untagged);

      for (const image of references) {
        const repository =
          officialImagePin(image)?.repository ??
          image.split("/").at(-1)?.split(/[:@]/)[0];
        const expected = repository && expectedImages.get(repository);
        if (expected && image !== expected) {
          return `${file}: expected ${expected}, found ${image}`;
        }
      }
    }
  }
}
