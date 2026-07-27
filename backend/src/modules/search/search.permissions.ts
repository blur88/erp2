import { UserRole } from '../../database/entities/user.entity';

/**
 * Roles that may see Accounting pages in global search.
 *
 * Currently identical to ALL_ROLES, mirroring the Accounting nav section in
 * frontend/src/config/navigation.tsx. It exists as its own constant so that
 * narrowing accounting search visibility is a single edit here rather than a
 * hunt through STATIC_PAGES for which ALL_ROLES usages meant "accounting".
 *
 * This governs search results only. Narrowing it does NOT restrict access —
 * the nav gate in navigation.tsx and any route guard must be changed in step.
 */
export const ACCOUNTING_ROLES: UserRole[] = [
  UserRole.ADMIN,
  UserRole.MANAGER,
  UserRole.SALES_STAFF,
  UserRole.INVENTORY_STAFF,
  UserRole.PROCUREMENT_STAFF,
];

export const ALL_ROLES: UserRole[] = [
  UserRole.ADMIN,
  UserRole.MANAGER,
  UserRole.SALES_STAFF,
  UserRole.INVENTORY_STAFF,
  UserRole.PROCUREMENT_STAFF,
];

export const SALES_ROLES: UserRole[] = [
  UserRole.ADMIN,
  UserRole.MANAGER,
  UserRole.SALES_STAFF,
];

export const PROCUREMENT_ROLES: UserRole[] = [
  UserRole.ADMIN,
  UserRole.MANAGER,
  UserRole.PROCUREMENT_STAFF,
];

export const INVENTORY_ROLES: UserRole[] = [
  UserRole.ADMIN,
  UserRole.MANAGER,
  UserRole.INVENTORY_STAFF,
];

export const ADMIN_ONLY: UserRole[] = [UserRole.ADMIN];

export function canSearchCustomers(role: UserRole): boolean {
  return SALES_ROLES.includes(role);
}

export function canSearchProducts(role: UserRole): boolean {
  return ALL_ROLES.includes(role);
}

export function canSearchSalesOrders(role: UserRole): boolean {
  return SALES_ROLES.includes(role);
}

export function canSearchPurchaseOrders(role: UserRole): boolean {
  return PROCUREMENT_ROLES.includes(role);
}

export function canSearchSuppliers(role: UserRole): boolean {
  return PROCUREMENT_ROLES.includes(role);
}
