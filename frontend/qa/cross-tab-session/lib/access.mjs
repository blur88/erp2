// Which pages a role can open, read from the application's own access rules.
//
// The application has one place that says which role sees which page:
// `menuSections` in frontend/src/config/navigation.tsx. Every menu item with a
// path carries `roles`, and `getFilteredMenuSections` there (used by
// components/common/Sidebar.tsx) shows a user only the items whose `roles`
// include the user's role, and a parent only if one of its children is shown.
// router.tsx puts no role on any route, so the menu is the access rule: a page
// whose link a user is not shown is a page that user has no link to.
//
// Nothing is copied from that file into this suite. It is read each run, the
// way lib/config.mjs reads the limits from nginx.conf, so a change of the
// rules changes what W1 allows. W1 uses the result for one thing: a recovery
// step, or the action, that would open a page outside the signed-in role's set
// is refused (lib/usable.mjs, follow()).
import { readFileSync } from 'node:fs'
import { join } from 'node:path'
import { REPO_ROOT } from './config.mjs'

export const NAVIGATION_FILE = 'frontend/src/config/navigation.tsx'

/**
 * Reads the role constants (`const SALES_ROLES: Role[] = [...]`) and the menu
 * (`export const menuSections`) out of the source text. Returns one entry per
 * menu item that has a path: its title, the title of the item it sits under
 * (null for a top-level item), its path and the roles that are shown it.
 *
 * It throws on anything it does not understand (no menu, an item naming a
 * role list that is not defined, unbalanced braces or brackets): a menu read wrongly must
 * not be mistaken for a menu.
 */
export function parseNavigation(source) {
  const roleLists = {}
  for (const m of source.matchAll(/const\s+(\w+)\s*:\s*Role\[\]\s*=\s*\[([^\]]*)\]/g)) {
    roleLists[m[1]] = [...m[2].matchAll(/'([^']+)'/g)].map((x) => x[1])
  }
  const start = source.indexOf('export const menuSections')
  if (start < 0) throw new Error(`${NAVIGATION_FILE}: "export const menuSections" not found`)

  const items = []
  const stack = []
  // An object opens or closes, a string property, or `roles: NAME`. The icons
  // are JSX elements (`<DashboardIcon />`) and carry no braces.
  // Square brackets are counted only to find where the array of sections ends.
  const token = /[{}[\]]|(\w+)\s*:\s*'([^']*)'|roles\s*:\s*(\w+)/g
  const opens = source.indexOf('= [', start)
  if (opens < 0) throw new Error(`${NAVIGATION_FILE}: menuSections is not an array literal`)
  token.lastIndex = opens
  let brackets = 0
  for (let m = token.exec(source); m; m = token.exec(source)) {
    if (m[0] === '[') {
      brackets += 1
    } else if (m[0] === ']') {
      brackets -= 1
      if (brackets === 0) break // the array of sections has ended
    } else if (m[0] === '{') {
      stack.push({})
    } else if (m[0] === '}') {
      const object = stack.pop()
      if (!object) throw new Error(`${NAVIGATION_FILE}: unbalanced braces in menuSections`)
      if (object.path !== undefined) {
        // An item without `roles` is shown to nobody (filterMenuItems).
        let roles = []
        if (object.roles !== undefined) {
          roles = roleLists[object.roles]
          if (!roles) throw new Error(`${NAVIGATION_FILE}: item "${object.title}" names the role list ${object.roles}, which is not defined`)
        }
        // Inside the object of a section sits the object of an item, and
        // inside a parent item the objects of its children: with two objects
        // still open, the nearer one is the parent item.
        items.push({ title: object.title, parent: stack.length >= 2 ? stack.at(-1).title : null, path: object.path, roles })
      }
    } else if (m[3] !== undefined) {
      if (stack.length > 0) stack.at(-1).roles = m[3]
    } else if (stack.length > 0) {
      stack.at(-1)[m[1]] = m[2]
    }
  }
  if (brackets !== 0 || stack.length !== 0) throw new Error(`${NAVIGATION_FILE}: menuSections did not end where its brackets say`)
  if (items.length === 0) throw new Error(`${NAVIGATION_FILE}: no menu item with a path was read`)
  return { roleLists, items }
}

/**
 * What one role can open: the menu items shown to it, with lookups by path
 * and by the link a person clicks (parent title and item title).
 */
export function accessFor(navigation, role) {
  const items = navigation.items.filter((item) => item.roles.includes(role))
  const paths = new Set(items.map((item) => item.path))
  return {
    role,
    source: NAVIGATION_FILE,
    items,
    paths: [...paths],
    canOpen: (path) => paths.has(path),
    /** The item behind a sidebar link, or null when this role is not shown it. */
    link: (parent, child) => items.find((item) => (child === undefined ? item.parent === null && item.title === parent : item.parent === parent && item.title === child)) ?? null,
    /** Every title this role's sidebar shows: the items and their parents. */
    titles: [...new Set(items.flatMap((item) => (item.parent ? [item.parent, item.title] : [item.title])))],
    /** The pages some role can open and this one cannot. */
    closed: navigation.items.filter((item) => !item.roles.includes(role)).map((item) => item.path),
  }
}

export function loadNavigation() {
  return parseNavigation(readFileSync(join(REPO_ROOT, NAVIGATION_FILE), 'utf8'))
}
