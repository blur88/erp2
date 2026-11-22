import { readFileSync } from "node:fs";
import { mkdtemp, rm, writeFile } from "node:fs/promises";
import { createRequire } from "node:module";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { fileURLToPath } from "node:url";
import { Controller, Get, Module, type INestApplication } from "@nestjs/common";
import { NestFactory } from "@nestjs/core";
import { DocumentBuilder, SwaggerModule } from "@nestjs/swagger";
import request from "supertest";

// Resolve a package from a chain of parents, as Node would from inside them.
const resolveVia = (...chain: string[]) =>
  chain.reduce(
    (from, name) => createRequire(from).resolve(`${name}/package.json`),
    fileURLToPath(import.meta.url),
  );

const consumers: Record<string, string[]> = {
  "@istanbuljs/load-nyc-config": [
    "babel-plugin-istanbul",
    "@istanbuljs/load-nyc-config",
  ],
  "@nestjs/swagger": ["@nestjs/swagger"],
};

// The global `js-yaml` pin resolves 5.4.2: above NYC's declared ^3.13.1 and
// below Swagger's declared 5.5.0. See the allowlist entries in
// scripts/dependency-override-allowlist.json.
describe("js-yaml override resolutions", () => {
  it.each(Object.entries(consumers))(
    "%s resolves js-yaml 5.4.2",
    (_consumer, chain) => {
      const { version } = JSON.parse(
        readFileSync(resolveVia(...chain, "js-yaml"), "utf8"),
      ) as { version: string };

      expect(version).toBe("5.4.2");
    },
  );
});

describe("js-yaml consumer compatibility", () => {
  it("NYC loads a YAML configuration file with load(text)", async () => {
    const root = await mkdtemp(join(tmpdir(), "dependency-js-yaml-"));
    try {
      await writeFile(
        join(root, ".nycrc.yaml"),
        "all: true\nreporter:\n  - text\n  - lcov\n",
      );
      const { loadNycConfig } = createRequire(
        resolveVia(...consumers["@istanbuljs/load-nyc-config"]),
      )(".") as { loadNycConfig(options: object): Promise<object> };

      await expect(loadNycConfig({ cwd: root })).resolves.toMatchObject({
        all: true,
        reporter: ["text", "lcov"],
      });
    } finally {
      await rm(root, { recursive: true, force: true });
    }
  });

  describe("Swagger YAML document", () => {
    @Controller("items")
    class ItemsController {
      @Get()
      list() {
        return [];
      }
    }

    @Module({ controllers: [ItemsController] })
    class DocumentedModule {}

    let app: INestApplication;

    beforeEach(async () => {
      app = await NestFactory.create(DocumentedModule, { logger: false });
      const document = SwaggerModule.createDocument(
        app,
        new DocumentBuilder().setTitle("Items").build(),
      );
      const shared = { description: "shared" };
      SwaggerModule.setup("docs", app, document, {
        // A repeated object exercises noRefs; a function exercises skipInvalid.
        patchDocumentOnRequest: (_req, _res, doc) => ({
          ...doc,
          "x-shared": [shared, shared],
          "x-invalid": () => undefined,
        }),
      });
      await app.init();
    });

    afterEach(async () => {
      await app.close();
    });

    it("serves dump(document, { skipInvalid, noRefs }) output", async () => {
      const response = await request(app.getHttpServer())
        .get("/docs-yaml")
        .expect(200)
        .expect("Content-Type", /text\/yaml/);

      expect(response.text).toContain("title: Items");
      expect(response.text).toContain("/items:");
      expect(response.text).toContain(
        "x-shared:\n  - description: shared\n  - description: shared\n",
      );
      expect(response.text).not.toMatch(/[&*]ref_/);
      expect(response.text).not.toContain("x-invalid");
    });
  });
});
