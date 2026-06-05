import "reflect-metadata";
import { ChartOfAccountsController } from "./chart-of-accounts.controller";
import { JournalEntryController } from "./journal-entry.controller";
import { FiscalPeriodController } from "./fiscal-period.controller";
import { AccountMappingController } from "./account-mapping.controller";
import { AccountingReportsController } from "./accounting-reports.controller";
import { ReconciliationController } from "./reconciliation.controller";

function getAuthMetadata(controller: any, methodName: string): any {
  const guards =
    Reflect.getMetadata("__guards__", controller.prototype[methodName]) || [];
  const roles =
    Reflect.getMetadata("roles", controller.prototype[methodName]) || [];
  return { hasGuards: guards.length > 0, roles };
}

function getControllerAuthMetadata(controller: any): any {
  const guards = Reflect.getMetadata("__guards__", controller) || [];
  const roles = Reflect.getMetadata("roles", controller) || [];
  return { hasGuards: guards.length > 0, roles };
}

describe("Accounting RBAC", () => {
  describe("ChartOfAccountsController", () => {
    it("should have Auth() on class level for read access", () => {
      const meta = getControllerAuthMetadata(ChartOfAccountsController);
      expect(meta.hasGuards).toBe(true);
    });

    it("should require ADMIN role for seed endpoint", () => {
      const meta = getAuthMetadata(ChartOfAccountsController, "seedDefaults");
      expect(meta.roles).toContain("admin");
    });

    it("should require ADMIN or MANAGER role for create", () => {
      const meta = getAuthMetadata(ChartOfAccountsController, "create");
      expect(meta.roles).toEqual(expect.arrayContaining(["admin", "manager"]));
    });

    it("should require ADMIN role for delete", () => {
      const meta = getAuthMetadata(ChartOfAccountsController, "remove");
      expect(meta.roles).toContain("admin");
    });
  });

  describe("JournalEntryController", () => {
    it("should require ADMIN or MANAGER for create", () => {
      const meta = getAuthMetadata(JournalEntryController, "create");
      expect(meta.roles).toEqual(expect.arrayContaining(["admin", "manager"]));
    });

    it("should require ADMIN or MANAGER for post", () => {
      const meta = getAuthMetadata(JournalEntryController, "postEntry");
      expect(meta.roles).toEqual(expect.arrayContaining(["admin", "manager"]));
    });

    it("should require ADMIN for delete", () => {
      const meta = getAuthMetadata(JournalEntryController, "remove");
      expect(meta.roles).toContain("admin");
    });
  });

  describe("FiscalPeriodController", () => {
    it("should require ADMIN for close period", () => {
      const meta = getAuthMetadata(FiscalPeriodController, "closePeriod");
      expect(meta.roles).toContain("admin");
    });

    it("should require ADMIN for reopen period", () => {
      const meta = getAuthMetadata(FiscalPeriodController, "reopenPeriod");
      expect(meta.roles).toContain("admin");
    });

    it("should require ADMIN for generate periods", () => {
      const meta = getAuthMetadata(FiscalPeriodController, "generatePeriods");
      expect(meta.roles).toContain("admin");
    });
  });

  describe("AccountMappingController", () => {
    it("should require ADMIN for create mapping", () => {
      const meta = getAuthMetadata(AccountMappingController, "create");
      expect(meta.roles).toContain("admin");
    });

    it("should require ADMIN for update mapping", () => {
      const meta = getAuthMetadata(AccountMappingController, "update");
      expect(meta.roles).toContain("admin");
    });

    it("should require ADMIN for delete mapping", () => {
      const meta = getAuthMetadata(AccountMappingController, "remove");
      expect(meta.roles).toContain("admin");
    });
  });

  describe("AccountingReportsController", () => {
    it("should have Auth() on class level for read access", () => {
      const meta = getControllerAuthMetadata(AccountingReportsController);
      expect(meta.hasGuards).toBe(true);
    });
  });

  describe("ReconciliationController", () => {
    it("should require ADMIN or MANAGER for complete", () => {
      const meta = getAuthMetadata(ReconciliationController, "complete");
      expect(meta.roles).toEqual(expect.arrayContaining(["admin", "manager"]));
    });

    it("should require ADMIN for reopen", () => {
      const meta = getAuthMetadata(ReconciliationController, "reopen");
      expect(meta.roles).toContain("admin");
    });
  });
});
