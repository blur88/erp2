import { readFileSync } from "node:fs";
import { createRequire } from "node:module";
import { fileURLToPath } from "node:url";
import * as ExcelJS from "exceljs";

// Resolve a package from a chain of parents, as Node would from inside them.
const resolveVia = (...chain: string[]) =>
  chain.reduce(
    (from, name) => createRequire(from).resolve(`${name}/package.json`),
    fileURLToPath(import.meta.url),
  );

type Zip = {
  file(path: string): { async(type: "string"): Promise<string> };
};
const JSZip = createRequire(resolveVia("exceljs", "jszip"))(".") as {
  loadAsync(data: Buffer): Promise<Zip>;
};

const UUID =
  "\\{[0-9A-F]{8}-[0-9A-F]{4}-4[0-9A-F]{3}-[89AB][0-9A-F]{3}-[0-9A-F]{12}\\}";

// The `exceljs → uuid` override resolves ExcelJS (declared ^8.3.0) to a
// maintained uuid release. See the allowlist entry in
// scripts/dependency-override-allowlist.json.
describe("uuid override resolution", () => {
  it("exceljs resolves uuid 11.1.1 or later", () => {
    const { version } = JSON.parse(
      readFileSync(resolveVia("exceljs", "uuid"), "utf8"),
    ) as { version: string };
    const [major, minor, patch] = version.split(".").map(Number);

    expect(
      major > 11 ||
        (major === 11 && (minor > 1 || (minor === 1 && patch >= 1))),
    ).toBe(true);
  });
});

describe("uuid consumer compatibility", () => {
  it("ExcelJS ids extended conditional-formatting rules with uuid v4()", async () => {
    const workbook = new ExcelJS.Workbook();
    const sheet = workbook.addWorksheet("Totals");
    sheet.addRows([[1], [2], [3]]);
    sheet.addConditionalFormatting({
      ref: "A1:A3",
      rules: [
        {
          type: "dataBar",
          priority: 1,
          gradient: false,
          cfvo: [{ type: "min" }, { type: "max" }],
          color: { argb: "FF638EC6" },
        } as ExcelJS.ConditionalFormattingRule,
        {
          type: "iconSet",
          priority: 2,
          iconSet: "3Triangles",
          cfvo: [
            { type: "percent", value: 0 },
            { type: "percent", value: 33 },
            { type: "percent", value: 67 },
          ],
        } as ExcelJS.ConditionalFormattingRule,
      ],
    });

    const buffer = Buffer.from(await workbook.xlsx.writeBuffer());
    const xml = await (
      await JSZip.loadAsync(buffer)
    )
      .file("xl/worksheets/sheet1.xml")
      .async("string");

    // Each extended rule gets a fresh id, referenced from the main rule.
    const extIds = [
      ...xml.matchAll(new RegExp(`<x14:cfRule [^>]*id="(${UUID})"`, "g")),
    ].map(([, id]) => id);
    const refIds = [
      ...xml.matchAll(new RegExp(`<x14:id>(${UUID})</x14:id>`, "g")),
    ].map(([, id]) => id);

    expect(extIds).toHaveLength(2);
    expect(new Set(extIds).size).toBe(2);
    expect(refIds).toEqual(extIds.slice(0, 1));

    // ExcelJS joins the extended rule back to its main rule by that id.
    const loaded = new ExcelJS.Workbook();
    await loaded.xlsx.load(Uint8Array.from(buffer).buffer);
    // Worksheet does not declare conditionalFormattings in ExcelJS's types.
    const { conditionalFormattings } = loaded.getWorksheet(
      "Totals",
    ) as unknown as {
      conditionalFormattings: ExcelJS.ConditionalFormattingOptions[];
    };
    expect(conditionalFormattings[0].rules.map(({ type }) => type)).toEqual([
      "dataBar",
      "iconSet",
    ]);
  });
});
