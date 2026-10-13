import { readdirSync, readFileSync } from "node:fs";
import { join } from "node:path";
import { BaseCrudService } from "../../common/services/base-crud.service";
import { CustomerController } from "./controllers/customer.controller";
import { PaymentController } from "./controllers/payment.controller";
import { SalesOrderController } from "./controllers/sales-order.controller";
import { CustomerService } from "./services/customer.service";
import { PaymentService } from "./services/payment.service";
import { SalesOrderService } from "./services/sales-order.service";

/**
 * #1390: the sales module has no soft delete, restore or permanent delete, for
 * customers, sales orders or payments, in its routes or in its services. Other
 * modules keep theirs, through BaseCrudService, which is why the sales services
 * must not extend it: the capability would come back by inheritance, with no
 * line in this module to show for it.
 */
describe("the sales module cannot delete or restore (#1390)", () => {
  const classes = {
    CustomerService,
    SalesOrderService,
    PaymentService,
    CustomerController,
    SalesOrderController,
    PaymentController,
  };

  /** Every method a class has, its own and inherited. */
  function methodNames(target: { prototype: object }): string[] {
    const names = new Set<string>();
    for (
      let proto = target.prototype;
      proto && proto !== Object.prototype;
      proto = Object.getPrototypeOf(proto)
    ) {
      Object.getOwnPropertyNames(proto).forEach((name) => names.add(name));
    }
    return [...names];
  }

  it.each(Object.entries(classes))(
    "%s has no delete or restore method",
    (_name, target) => {
      const names = methodNames(target);

      // The class was really inspected: each of these has at least a create or a list.
      expect(names.some((name) => /^(create|findAll|get)/.test(name))).toBe(
        true,
      );
      expect(
        names.filter((name) => /delete|restore|remove/i.test(name)),
      ).toEqual([]);
    },
  );

  it.each(Object.entries(classes))(
    "%s does not extend BaseCrudService",
    (_name, target) => {
      expect(target.prototype instanceof BaseCrudService).toBe(false);
    },
  );

  it("the check sees the methods it forbids, on the shared base", () => {
    expect(
      methodNames(BaseCrudService as any)
        .filter((name) => /delete|restore|remove/i.test(name))
        .sort(),
    ).toEqual([
      "afterDelete",
      "bulkPermanentDelete",
      "bulkRestore",
      "findDeleted",
      "permanentDelete",
      "restore",
      "softDelete",
    ]);
  });

  describe("source", () => {
    const root = join(process.cwd(), "src/modules/sales");
    const files = (readdirSync(root, { recursive: true }) as string[])
      .filter((file) => file.endsWith(".ts") && !file.endsWith(".spec.ts"))
      .map((file) => ({ file, text: readFileSync(join(root, file), "utf8") }));

    const forbidden: Array<[string, RegExp]> = [
      [
        "a soft delete or restore on a repository",
        /\.(softDelete|softRemove|restore|recover)\(/,
      ],
      ["a DELETE route", /@Delete\(/],
      [
        "a restore, permanent-delete or deleted-list route",
        /@(Get|Post|Put|Patch)\(\s*['"][^'"]*(restore|permanent|deleted)/,
      ],
      ["the shared CRUD base", /BaseCrudService/],
    ];

    it("reads the module", () => {
      expect(files.length).toBeGreaterThanOrEqual(10);
      expect(files.map(({ file }) => file)).toContain(
        join("services", "customer.service.ts"),
      );
    });

    it.each(forbidden)("no file has %s", (_what, pattern) => {
      expect(
        files.filter(({ text }) => pattern.test(text)).map(({ file }) => file),
      ).toEqual([]);
    });
  });
});
