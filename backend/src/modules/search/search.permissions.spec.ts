import { UserRole } from '../../database/entities/user.entity';
import {
  canSearchCustomers,
  canSearchProducts,
  canSearchSalesOrders,
  canSearchPurchaseOrders,
  ACCOUNTING_ROLES,
  ALL_ROLES,
  SALES_ROLES,
  PROCUREMENT_ROLES,
  INVENTORY_ROLES,
  ADMIN_ONLY,
} from './search.permissions';

describe('search.permissions', () => {
  describe('role-set constants', () => {
    it('ALL_ROLES contains all 5 roles', () => {
      expect(ALL_ROLES).toHaveLength(5);
      expect(ALL_ROLES).toContain(UserRole.ADMIN);
      expect(ALL_ROLES).toContain(UserRole.MANAGER);
      expect(ALL_ROLES).toContain(UserRole.SALES_STAFF);
      expect(ALL_ROLES).toContain(UserRole.INVENTORY_STAFF);
      expect(ALL_ROLES).toContain(UserRole.PROCUREMENT_STAFF);
    });

    it('SALES_ROLES contains admin, manager, sales_staff only', () => {
      expect(SALES_ROLES).toEqual(
        expect.arrayContaining([
          UserRole.ADMIN,
          UserRole.MANAGER,
          UserRole.SALES_STAFF,
        ]),
      );
      expect(SALES_ROLES).not.toContain(UserRole.INVENTORY_STAFF);
      expect(SALES_ROLES).not.toContain(UserRole.PROCUREMENT_STAFF);
    });

    it('ACCOUNTING_ROLES matches ALL_ROLES until accounting access is deliberately narrowed', () => {
      expect(ACCOUNTING_ROLES).toEqual(ALL_ROLES);
    });

    it('other role-set constants match the expected roles', () => {
      expect(PROCUREMENT_ROLES).toEqual([
        UserRole.ADMIN,
        UserRole.MANAGER,
        UserRole.PROCUREMENT_STAFF,
      ]);
      expect(INVENTORY_ROLES).toEqual([
        UserRole.ADMIN,
        UserRole.MANAGER,
        UserRole.INVENTORY_STAFF,
      ]);
      expect(ADMIN_ONLY).toEqual([UserRole.ADMIN]);
    });
  });

  describe('canSearchCustomers', () => {
    it.each([
      [UserRole.ADMIN, true],
      [UserRole.MANAGER, true],
      [UserRole.SALES_STAFF, true],
      [UserRole.INVENTORY_STAFF, false],
      [UserRole.PROCUREMENT_STAFF, false],
    ])('role %s → %s', (role, expected) => {
      expect(canSearchCustomers(role)).toBe(expected);
    });
  });

  describe('canSearchProducts', () => {
    it.each([
      [UserRole.ADMIN, true],
      [UserRole.MANAGER, true],
      [UserRole.SALES_STAFF, true],
      [UserRole.INVENTORY_STAFF, true],
      [UserRole.PROCUREMENT_STAFF, true],
    ])('role %s → %s (all operational roles)', (role, expected) => {
      expect(canSearchProducts(role)).toBe(expected);
    });
  });

  describe('canSearchSalesOrders', () => {
    it.each([
      [UserRole.ADMIN, true],
      [UserRole.MANAGER, true],
      [UserRole.SALES_STAFF, true],
      [UserRole.INVENTORY_STAFF, false],
      [UserRole.PROCUREMENT_STAFF, false],
    ])('role %s → %s', (role, expected) => {
      expect(canSearchSalesOrders(role)).toBe(expected);
    });
  });

  describe('canSearchPurchaseOrders', () => {
    it.each([
      [UserRole.ADMIN, true],
      [UserRole.MANAGER, true],
      [UserRole.SALES_STAFF, false],
      [UserRole.INVENTORY_STAFF, false],
      [UserRole.PROCUREMENT_STAFF, true],
    ])('role %s → %s', (role, expected) => {
      expect(canSearchPurchaseOrders(role)).toBe(expected);
    });
  });
});
