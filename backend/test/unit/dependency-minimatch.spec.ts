import { execFile } from "node:child_process";
import { createWriteStream } from "node:fs";
import { mkdir, mkdtemp, rm, writeFile } from "node:fs/promises";
import { createRequire } from "node:module";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { pipeline } from "node:stream/promises";
import { promisify } from "node:util";
import type { TarArchive } from "archiver";

const runFile = promisify(execFile);

const requireDependency = createRequire(import.meta.url);
const TestExclude = requireDependency("test-exclude") as new (options: {
  cwd: string;
  include: string[];
  exclude: string[];
  extension: string[];
}) => {
  shouldInstrument(filename: string): boolean;
};

describe("minimatch consumer compatibility", () => {
  it.each([
    {
      operation: "backs up the source directory",
      append: (archive: TarArchive, source: string) =>
        archive.directory(source, false),
      entries: ["data/", "data/backup.json", "data/notes.txt"],
    },
    {
      operation: "filters archive entries by glob pattern",
      append: (archive: TarArchive, source: string) =>
        archive.glob("**/*.json", { cwd: source }),
      entries: ["data/backup.json"],
    },
  ])("$operation", async ({ append, entries }) => {
    const root = await mkdtemp(join(tmpdir(), "backup-archive-"));
    try {
      const source = join(root, "source");
      const output = join(root, "backup.tar.gz");
      await mkdir(join(source, "data"), { recursive: true });
      await writeFile(join(source, "data", "backup.json"), "{}");
      await writeFile(join(source, "data", "notes.txt"), "notes");

      const { TarArchive } = await import("archiver");
      const archive = new TarArchive({ gzip: true });
      const written = pipeline(archive, createWriteStream(output));
      append(archive, source);
      await Promise.all([archive.finalize(), written]);

      const { stdout } = await runFile("tar", ["-tzf", output]);
      expect(stdout.trim().split("\n").sort()).toEqual(entries);
    } finally {
      await rm(root, { recursive: true, force: true });
    }
  });

  it("selects coverage files using include, exclude and negated patterns", () => {
    const cwd = process.cwd();
    const filter = new TestExclude({
      cwd,
      include: ["src/**/*.ts"],
      exclude: ["**/*.spec.ts", "!src/keep.spec.ts"],
      extension: [".ts"],
    });

    expect(filter.shouldInstrument(join(cwd, "src", ".hidden.ts"))).toBe(true);
    expect(filter.shouldInstrument(join(cwd, "src", "skip.spec.ts"))).toBe(
      false,
    );
    expect(filter.shouldInstrument(join(cwd, "src", "keep.spec.ts"))).toBe(
      true,
    );
    expect(filter.shouldInstrument(join(cwd, "test", "fixture.ts"))).toBe(
      false,
    );
  });
});
