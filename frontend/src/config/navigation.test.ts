import { describe, it, expect } from 'vitest';
import {
  getFilteredMenuSections,
  filterMenuItems,
  menuSections,
} from './navigation';

type Role =
  | 'admin'
  | 'manager'
  | 'sales_staff'
  | 'inventory_staff'
  | 'procurement_staff';

describe('navigation filtering', () => {
  describe('filterMenuItems - leaf visibility', () => {
    it('all roles see Dashboard', () => {
      const roles: Role[] = [
        'admin',
        'manager',
        'sales_staff',
        'inventory_staff',
        'procurement_staff',
      ];

      for (const role of roles) {
        const allItems = menuSections.flatMap((section) => section.items);
        const dashboard = allItems.find(
          (item) => 'path' in item && item.path === '/dashboard',
        );
        expect(dashboard).toBeDefined();

        if (dashboard) {
          const result = filterMenuItems([dashboard], role);
          expect(result).toHaveLength(1);
        }
      }
    });

    it('Audit Logs visible only to admin', () => {
      const allSections = getFilteredMenuSections(menuSections, 'admin');
      const auditItem = allSections
        .flatMap((section) => section.items)
        .find((item) => 'path' in item && item.path === '/audit-logs');
      expect(auditItem).toBeDefined();

      for (const role of [
        'manager',
        'sales_staff',
        'inventory_staff',
        'procurement_staff',
      ] as Role[]) {
        const sections = getFilteredMenuSections(menuSections, role);
        const item = sections
          .flatMap((section) => section.items)
          .find((candidate) => 'path' in candidate && candidate.path === '/audit-logs');
        expect(item).toBeUndefined();
      }
    });

    it('Procurement Staff sees /purchasing, not /sales/customers', () => {
      const sections = getFilteredMenuSections(menuSections, 'procurement_staff');
      const allItems = sections.flatMap((section) => section.items);
      const findPath = (path: string): boolean =>
        allItems.some((item) => {
          if ('path' in item && item.path === path) return true;
          if ('children' in item && item.children) {
            return item.children.some(
              (child) => 'path' in child && child.path === path,
            );
          }
          return false;
        });

      expect(findPath('/purchasing')).toBe(true);
      expect(findPath('/sales/customers')).toBe(false);
    });

    it('Sales Staff sees /sales/customers, not /purchasing', () => {
      const sections = getFilteredMenuSections(menuSections, 'sales_staff');
      const allItems = sections.flatMap((section) => section.items);
      const hasPath = allItems.some(
        (item) =>
          'children' in item &&
          item.children?.some(
            (child) => 'path' in child && child.path === '/sales/customers',
          ),
      );
      expect(hasPath).toBe(true);

      const hasPurchasing = allItems.some(
        (item) => 'path' in item && item.path === '/purchasing',
      );
      expect(hasPurchasing).toBe(false);
    });
  });

  describe('getFilteredMenuSections - parent collapse', () => {
    it('removes parent sections when all children are filtered out', () => {
      const sections = getFilteredMenuSections(menuSections, 'inventory_staff');
      const salesSection = sections.find(
        (section) =>
          section.id === 'operations' ||
          section.items.some((item) => 'path' in item && item.path === '/sales'),
      );

      if (salesSection) {
        const salesItem = salesSection.items.find(
          (item) => 'path' in item && item.path === '/sales',
        );
        expect(salesItem).toBeUndefined();
      }
    });

    it('all roles see at least one section', () => {
      const roles: Role[] = [
        'admin',
        'manager',
        'sales_staff',
        'inventory_staff',
        'procurement_staff',
      ];

      for (const role of roles) {
        const sections = getFilteredMenuSections(menuSections, role);
        expect(sections.length).toBeGreaterThan(0);
      }
    });
  });

  describe('Products - all operational roles can search', () => {
    it('admin and manager see /inventory/products in nav', () => {
      for (const role of ['admin', 'manager'] as Role[]) {
        const sections = getFilteredMenuSections(menuSections, role);
        const found = sections.some((section) =>
          section.items.some((item) => {
            if ('path' in item && item.path === '/inventory/products') return true;
            if ('children' in item && item.children) {
              return item.children.some(
                (child) =>
                  'path' in child && child.path === '/inventory/products',
              );
            }
            return false;
          }),
        );
        expect(found).toBe(true);
      }
    });
  });
});
