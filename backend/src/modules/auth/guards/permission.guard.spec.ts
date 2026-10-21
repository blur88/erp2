import { ForbiddenException } from "@nestjs/common";
import { UserRole } from "../../../database/entities/user.entity";
import { Permission } from "../permissions";
import { PermissionGuard } from "./permission.guard";

describe("PermissionGuard", () => {
  const permission = Permission.INVENTORY_VALUATION_APPROVE;
  const reflector = { getAllAndOverride: () => permission };
  const contextFor = (role: UserRole) =>
    ({
      getHandler: () => ({}),
      getClass: () => ({}),
      switchToHttp: () => ({ getRequest: () => ({ user: { role } }) }),
    }) as any;

  it("allows an admin to approve valuation records", async () => {
    expect(
      await new PermissionGuard(reflector as any).canActivate(
        contextFor(UserRole.ADMIN),
      ),
    ).toBe(true);
  });

  it("forbids a manager with the missing permission name", () => {
    expect(() =>
      new PermissionGuard(reflector as any).canActivate(
        contextFor(UserRole.MANAGER),
      ),
    ).toThrow(
      new ForbiddenException("Missing permission: inventory.valuation.approve"),
    );
  });
});
