import { UserRole } from "../../database/entities/user.entity";

export enum Permission {
  INVENTORY_VALUATION_APPROVE = "inventory.valuation.approve",
}

export const PERMISSION_ROLES: Record<Permission, readonly UserRole[]> = {
  [Permission.INVENTORY_VALUATION_APPROVE]: [UserRole.ADMIN],
};

export function hasPermission(role: UserRole, permission: Permission): boolean {
  return PERMISSION_ROLES[permission].includes(role);
}

export const VALUATION_PREPARER_ROLES = [
  UserRole.ADMIN,
  UserRole.MANAGER,
  UserRole.INVENTORY_STAFF,
] as const;
