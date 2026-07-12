import { describe, it, expect } from 'vitest'
import { isValidElement, type ReactElement } from 'react'
import {
  menuSections,
  getFilteredMenuSections,
  type MenuItem,
  type MenuSection,
} from '../navigation'

const financeSection = (): MenuSection => {
  const section = menuSections.find((s) => s.id === 'finance')
  if (!section) throw new Error('finance section not found')
  return section
}

const accountingParent = (): MenuItem => {
  const parent = financeSection().items.find((i) => i.id === 'accounting')
  if (!parent) throw new Error('accounting parent item not found')
  return parent
}

describe('navigation structure', () => {
  it('orders sections operations -> finance -> administration', () => {
    const ids = menuSections.map((s) => s.id)
    expect(ids).toContain('operations')
    expect(ids).toContain('finance')
    expect(ids).toContain('administration')
    expect(ids.indexOf('operations')).toBeLessThan(ids.indexOf('finance'))
    expect(ids.indexOf('finance')).toBeLessThan(ids.indexOf('administration'))
  })

  it('has no flat top-level accounting section', () => {
    expect(menuSections.map((s) => s.id)).not.toContain('accounting')
  })

  it('holds exactly one Accounting parent item in the finance section', () => {
    const section = financeSection()
    expect(section.title).toBe('Finance')
    expect(section.items).toHaveLength(1)

    const parent = section.items[0]
    expect(parent.id).toBe('accounting')
    expect(parent.title).toBe('Accounting')
    expect(parent.path).toBeUndefined()
    expect(parent.children).toBeDefined()
  })

  it('nests the five accounting pages as children with unchanged paths', () => {
    const children = accountingParent().children ?? []
    expect(
      children.map((c) => ({ id: c.id, title: c.title, path: c.path })),
    ).toEqual([
      {
        id: 'chart-of-accounts',
        title: 'Chart of Accounts',
        path: '/accounting/chart-of-accounts',
      },
      {
        id: 'journal-entries',
        title: 'Journal Entries',
        path: '/accounting/journal-entries',
      },
      {
        id: 'general-ledger',
        title: 'General Ledger',
        path: '/accounting/general-ledger',
      },
      {
        id: 'trial-balance',
        title: 'Trial Balance',
        path: '/accounting/trial-balance',
      },
      {
        id: 'accounting-settings',
        title: 'Accounting Settings',
        path: '/accounting/settings',
      },
    ])
  })

  it('gives every accounting child a distinct icon', () => {
    const children = accountingParent().children ?? []
    const iconTypes = children.map((child) => {
      expect(isValidElement(child.icon)).toBe(true)
      return (child.icon as ReactElement).type
    })
    expect(new Set(iconTypes).size).toBe(children.length)
  })

  it('restricts every accounting child to admin', () => {
    const children = accountingParent().children ?? []
    expect(children).toHaveLength(5)
    children.forEach((child) => {
      expect(child.roles).toEqual(['admin'])
    })
  })

  it('keeps the finance section for an admin', () => {
    const ids = getFilteredMenuSections(menuSections, 'admin').map((s) => s.id)
    expect(ids).toContain('finance')
  })

  it('drops the finance section for a non-admin role', () => {
    const nonAdminRoles = [
      'manager',
      'sales_staff',
      'inventory_staff',
      'procurement_staff',
    ] as const

    nonAdminRoles.forEach((role) => {
      const ids = getFilteredMenuSections(menuSections, role).map((s) => s.id)
      expect(ids).not.toContain('finance')
    })
  })
})
