// What #1394 added the harness: reading the sidebar's "Company details
// unavailable" strip, and counting each tab's company-settings reads by what
// led to them, its own refreshes against tokens it adopted, and the two windows
// of spec 9.3.
//
// Everything here is either pure (judged from a snapshot a case hands it, unit
// tested with `node --test`) or the one page read that cannot be. Nothing here
// is a judgement of the suite's: the counts are recorded, and W1's own checks
// stay where they were.

import { COMPANY_SETTINGS } from './usable.mjs'

/** The strip's wording, verbatim from CompanyUnavailableStrip.tsx. */
export const STRIP_TEXT = 'Company details unavailable'

/** The collapsed button's accessible name, verbatim from CompanyUnavailableStrip.tsx. */
export const COLLAPSED_RETRY_NAME = 'Retry loading company details'

/** What a read can be counted as: the last thing that led to it. */
export const READ_CAUSES = ['page load', 'navigation', 'tokens renewed', 'retry click']

const isCompanyRead = (entry) =>
  Boolean(entry) && entry.zone === 'business' && entry.method === 'GET' && entry.path === COMPANY_SETTINGS

/**
 * Reads the strip out of a page. The expanded form is a `role="status"` row
 * whose text is the wording; the collapsed form is the icon button, which
 * carries the wording in its tooltip instead and so is found by its accessible
 * name. Both are looked for by their own words, never by a class.
 */
export async function readStrip(page) {
  return page.evaluate(
    ([text, name]) => {
      const shown = [...document.querySelectorAll('[role="status"]')].some((el) => (el.textContent ?? '').includes(text))
      const buttons = [...document.querySelectorAll(`button[aria-label="${name}"]`)]
      const expanded = shown
        ? [...document.querySelectorAll('[role="status"]')].find((el) => (el.textContent ?? '').includes(text))
        : null
      const retry = expanded
        ? [...expanded.querySelectorAll('button')].find((b) => /^Retry/.test((b.textContent ?? '').trim())) ?? null
        : null
      return {
        expanded,
        collapsed: buttons.length > 0,
        retryDisabled: retry ? retry.disabled : buttons.length > 0 ? buttons[0].disabled : null,
        retryLabel: retry ? (retry.textContent ?? '').trim() : null,
      }
    },
    [STRIP_TEXT, COLLAPSED_RETRY_NAME],
  )
}

/**
 * The strip's state as a judgement, from what `readStrip` returned. `showing`
 * is the whole point; `form` is which of the two the user is looking at, and
 * `canRetry` is only reported when there is a button to read it from.
 */
export function judgeStrip(read) {
  const expanded = Boolean(read?.expanded)
  const collapsed = Boolean(read?.collapsed)
  return {
    showing: expanded || collapsed,
    form: expanded ? 'expanded' : collapsed ? 'collapsed' : 'none',
    canRetry: read?.retryDisabled === false,
    retryLabel: read?.retryLabel ?? null,
  }
}

/**
 * Every company-settings read a tab sent, each attributed to the last thing
 * that preceded it: the page load, a sidebar navigation, a token renewal, or a
 * Retry click. `events` are the harness's own record of those three things,
 * `{ at, kind }` with `at` in the same clock as `entry.issuedAt`.
 *
 * A read with no preceding event is the page load's own. An event that is not
 * one of `READ_CAUSES` never attributes anything.
 */
export function classifyReads(entries, events = []) {
  const marks = (Array.isArray(events) ? events : []).filter(
    (e) => e && READ_CAUSES.includes(e.kind) && typeof e.at === 'number',
  )
  return (Array.isArray(entries) ? entries : [])
    .filter(isCompanyRead)
    .map((entry) => ({
      seq: entry.seq,
      tab: entry.tab,
      issuedAt: entry.issuedAt,
      status: entry.status ?? entry.failed ?? 'pending',
      qaId: entry.qaId ?? null,
      after: causeOf(entry, marks),
    }))
}

function causeOf(entry, marks) {
  let best = null
  for (const mark of marks) {
    if (mark.at > entry.issuedAt) continue
    // Two events at one millisecond are ordered by the order they were observed
    // in, and the later of them is the one that led to the read.
    if (best === null || mark.at >= best.at) best = mark
  }
  return best === null ? 'page load' : best.kind
}

/** The read counts of one tab, by cause. Always all four keys, so a shape does not change with the run. */
export function readCounts(entries, events = []) {
  const counts = Object.fromEntries(READ_CAUSES.map((cause) => [cause, 0]))
  for (const read of classifyReads(entries, events)) counts[read.after] += 1
  return { ...counts, total: Object.values(counts).reduce((a, b) => a + b, 0) }
}

/**
 * Whether a tab's tokens were its own or another tab's, from its own trace.
 *
 * A refresh is the tab's own when the trace has a `refresh-sent` presenting its
 * generation. A generation the tab's memory held without one was adopted from
 * another tab. Both are counted, and neither is guessed: a trace with no
 * refreshes and no settled reads says `none`, not `adopted`.
 */
export function tokenOrigin(trace) {
  const events = Array.isArray(trace) ? trace.filter((e) => e && typeof e.type === 'string') : []
  const sent = events.filter((e) => e.type === 'refresh-sent')
  const ownGenerations = new Set(sent.map((e) => e.presentedGeneration).filter((g) => typeof g === 'number'))
  const heldGenerations = [
    ...new Set(events.filter((e) => e.type === 'settled-read').map((e) => e.memoryGeneration).filter((g) => typeof g === 'number')),
  ].sort((a, b) => a - b)
  const adoptedGenerations = heldGenerations.filter((g) => !ownGenerations.has(g))
  return {
    ownRefreshes: sent.length,
    ownGenerations: [...ownGenerations].sort((a, b) => a - b),
    heldGenerations,
    adoptedGenerations,
    adoptedTokens: adoptedGenerations.length,
    origin: heldGenerations.length === 0 ? 'none' : adoptedGenerations.length === 0 ? 'own' : 'mixed',
  }
}

/**
 * One window of a two-window run, for one tab: what its reads were, whether
 * the strip was showing at the end, and where its tokens came from. Counts are
 * kept apart by kind, because the design bounds attempts and says nothing about
 * how many requests or refreshes one attempt causes.
 */
export function windowRecord({ window, entries = [], events = [], strip = null, companyNameInSidebar = null, trace = null }) {
  return {
    window,
    reads: readCounts(entries, events),
    strip: judgeStrip(strip ?? {}),
    companyNameInSidebar,
    tokens: tokenOrigin(trace),
  }
}

/** Both windows, in order, with the per-window figures kept separate. */
export function summariseWindows(records) {
  const windows = (Array.isArray(records) ? records : []).filter(Boolean)
  return {
    windows: windows.map((record) => record.window),
    perWindow: windows,
    tabsWithStrip: windows.filter((record) => record.strip.showing).length,
    readsAfterStrip: Object.fromEntries(
      windows.flatMap((record) => Object.entries(record.reads)).reduce((acc, [cause, count]) => {
        acc.set(cause, (acc.get(cause) ?? 0) + count)
        return acc
      }, new Map()),
    ),
    ownRefreshes: windows.reduce((total, record) => total + record.tokens.ownRefreshes, 0),
    adoptedTokens: windows.reduce((total, record) => total + record.tokens.adoptedTokens, 0),
  }
}