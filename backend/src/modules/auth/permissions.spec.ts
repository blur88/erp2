import { UserRole } from "../../database/entities/user.entity";
import {
  hasPermission,
  Permission,
  PERMISSION_ROLES,
  VALUATION_PREPARER_ROLES,
} from "./permissions";

describe("inventory valuation permissions", () => {
  it("grants approval only to admins", () => {
    expect(
      hasPermission(UserRole.ADMIN, Permission.INVENTORY_VALUATION_APPROVE),
    ).toBe(true);
    for (const role of [
      UserRole.MANAGER,
      UserRole.SALES_STAFF,
      UserRole.INVENTORY_STAFF,
      UserRole.PROCUREMENT_STAFF,
    ]) {
      expect(hasPermission(role, Permission.INVENTORY_VALUATION_APPROVE)).toBe(
        false,
      );
    }
  });

  it("maps every permission and identifies the allowed preparer roles", () => {
    expect(Object.keys(PERMISSION_ROLES)).toEqual(Object.values(Permission));
    expect(PERMISSION_ROLES[Permission.INVENTORY_VALUATION_APPROVE]).toEqual([
      UserRole.ADMIN,
    ]);
    expect(VALUATION_PREPARER_ROLES).toEqual([
      UserRole.ADMIN,
      UserRole.MANAGER,
      UserRole.INVENTORY_STAFF,
    ]);
  });
});
