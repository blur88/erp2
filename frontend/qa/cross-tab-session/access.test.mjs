// node --test frontend/qa/cross-tab-session/access.test.mjs
//
// Which pages a role can open (lib/access.mjs), without a browser. Half of
// these read a small menu written here, to pin down the reading; the other
// half read the application's real navigation.tsx, to show the reading holds
// on the file W1 depends on. The real file's expectations are relations
// between roles, not a copy of its lists.
import { test } from 'node:test'
import assert from 'node:assert/strict'
import { accessFor, loadNavigation, parseNavigation } from './lib/access.mjs'

const SOURCE = `
import { default as DashboardIcon } from '@mui/icons-material/Dashboard';
const ALL_ROLES: Role[] = [
  'admin',
  'sales_staff',
];
const ADMIN_ONLY: Role[] = ['admin'];
export function filterMenuItems(items: MenuItem[], role: Role): MenuItem[] {
  return items.map((item) => { return item.roles?.includes(role) ? item : null; });
}
export const menuSections: MenuSection[] = [
  {
    id: 'primary',
    title: 'Primary',
    items: [
      { id: 'dashboard', title: 'Dashboard', icon: <DashboardIcon />, path: '/dashboard', roles: ALL_ROLES },
    ],
  },
  {
    id: 'administration',
    title: 'Administration',
    items: [
      {
        id: 'settings',
        title: 'Settings',
        icon: <SettingsIcon />,
        children: [
          { id: 'company-settings', title: 'Company', icon: <CompanyIcon />, group: 'Business', path: '/settings/company', roles: ADMIN_ONLY },
          { id: 'profit', title: 'Profit & Loss', icon: <X />, path: '/accounting/profit-and-loss', roles: ALL_ROLES },
          { id: 'hidden', title: 'Nobody', icon: <X />, path: '/nobody' },
        ],
      },
      { id: 'audit-logs', title: 'Audit Logs', icon: <AuditIcon />, path: '/audit-logs', roles: ADMIN_ONLY },
    ],
  },
];
export const after = [{ id: 'not-a-menu', title: 'Elsewhere', path: '/elsewhere', roles: ALL_ROLES }];
`

test('every item with a path is read with its parent and its roles, and nothing after the menu is', () => {
  const { items } = parseNavigation(SOURCE)
  assert.deepEqual(
    items.map((i) => [i.parent, i.title, i.path, i.roles.join(',')]),
    [
      [null, 'Dashboard', '/dashboard', 'admin,sales_staff'],
      ['Settings', 'Company', '/settings/company', 'admin'],
      ['Settings', 'Profit & Loss', '/accounting/profit-and-loss', 'admin,sales_staff'],
      ['Settings', 'Nobody', '/nobody', ''],
      [null, 'Audit Logs', '/audit-logs', 'admin'],
    ],
  )
})

test('a role is shown only its own items, and an item without roles is shown to nobody', () => {
  const staff = accessFor(parseNavigation(SOURCE), 'sales_staff')
  assert.deepEqual(staff.paths, ['/dashboard', '/accounting/profit-and-loss'])
  assert.equal(staff.canOpen('/settings/company'), false)
  assert.equal(staff.canOpen('/nobody'), false)
  assert.equal(accessFor(parseNavigation(SOURCE), 'admin').canOpen('/nobody'), false)
  assert.deepEqual(staff.titles, ['Dashboard', 'Settings', 'Profit & Loss'])
  assert.deepEqual(staff.closed, ['/settings/company', '/nobody', '/audit-logs'])
})

test('a link is found by the titles a person clicks, and a link the role is not shown is not found', () => {
  const staff = accessFor(parseNavigation(SOURCE), 'sales_staff')
  assert.equal(staff.link('Dashboard').path, '/dashboard')
  assert.equal(staff.link('Settings', 'Profit & Loss').path, '/accounting/profit-and-loss')
  assert.equal(staff.link('Settings', 'Company'), null)
  assert.equal(staff.link('Audit Logs'), null)
  // A child's title alone is not a top-level link.
  assert.equal(staff.link('Profit & Loss'), null)
  assert.equal(accessFor(parseNavigation(SOURCE), 'admin').link('Settings', 'Company').path, '/settings/company')
})

test('a role nobody has is shown nothing', () => {
  assert.deepEqual(accessFor(parseNavigation(SOURCE), 'nobody').paths, [])
})

test('a file that is not the menu is an error, not an empty menu', () => {
  assert.throws(() => parseNavigation('export const somethingElse = []'), /menuSections" not found/)
  assert.throws(() => parseNavigation('export const menuSections: MenuSection[] = []'), /no menu item with a path/)
  assert.throws(() => parseNavigation(`export const menuSections: MenuSection[] = [{ items: [{ title: 'X', path: '/x', roles: UNKNOWN }] }]`), /role list UNKNOWN, which is not defined/)
  assert.throws(() => parseNavigation(`export const menuSections: MenuSection[] = [{ items: [{ title: 'X', path: '/x' }`), /did not end where its brackets say/)
})

// --- the application's real file ---------------------------------------------

test('the real menu: the administrator is shown every item, and every other role a proper part of them', () => {
  const navigation = loadNavigation()
  const admin = accessFor(navigation, 'admin')
  const all = navigation.items.filter((item) => item.roles.length > 0).map((item) => item.path)
  assert.deepEqual(admin.paths, all)
  for (const role of ['manager', 'sales_staff', 'inventory_staff', 'procurement_staff']) {
    const access = accessFor(navigation, role)
    assert.ok(access.paths.length > 1 && access.paths.length < admin.paths.length, `${role}: ${access.paths.length} of ${admin.paths.length}`)
    assert.ok(access.paths.every((path) => admin.canOpen(path)), role)
    assert.equal(access.paths.length + access.closed.length, navigation.items.length, role)
  }
})

test('the real menu: no path is listed twice and every item under /settings is for administrators only', () => {
  const navigation = loadNavigation()
  const paths = navigation.items.map((item) => item.path)
  assert.equal(new Set(paths).size, paths.length)
  const settings = navigation.items.filter((item) => item.path.startsWith('/settings/'))
  assert.ok(settings.length > 0)
  // If this ever stops holding, an ordinary user has gained a settings page,
  // and what W1 says about data only those pages ask for must be looked at.
  for (const item of settings) assert.deepEqual(item.roles, ['admin'], item.path)
})

test('the real menu: a sales_staff user is shown the links W1 follows and not the Company page', () => {
  const staff = accessFor(loadNavigation(), 'sales_staff')
  assert.equal(staff.link('Dashboard')?.path, '/dashboard')
  assert.equal(staff.link('Sales', 'Customers')?.path, '/sales/customers')
  assert.equal(staff.link('Sales', 'Sales Orders')?.path, '/sales/orders')
  assert.equal(staff.link('Settings', 'Company'), null)
  assert.equal(staff.canOpen('/inventory/products'), false)
})
