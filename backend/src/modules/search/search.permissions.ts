import { UserRole } from '../../database/entities/user.entity';

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

export const FINANCE_ROLES: UserRole[] = [
  UserRole.ADMIN,
  UserRole.MANAGER,
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

export function canSearchCustomerPayments(role: UserRole): boolean {
  return SALES_ROLES.includes(role);
}

export function canSearchVendorPayments(role: UserRole): boolean {
  return PROCUREMENT_ROLES.includes(role);
}

export function canSearchJournalEntries(role: UserRole): boolean {
  return FINANCE_ROLES.includes(role);
}
