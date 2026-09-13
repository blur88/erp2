/**
 * Executable preflight for `docs/modules/accounting/STATEMENT_THEME_QA.md`.
 *
 * CLAUDE.md designates that document as the substitute for the browser gate
 * removed in #1223. Its failure mode is silent: every step is a
 * `document.querySelector(...)` in a browser console, and when a selector is
 * renamed or dropped the query returns `null` — or, worse,
 * `querySelectorAll` returns an EMPTY NodeList, which iterates zero times
 * without throwing. A loop over zero figure cells "finds no mismatch", which a
 * careless run records as a pass.
 *
 * Running the preflight at the top of a QA session converts that into a hard
 * stop: it THROWS naming the missing hook, so the session cannot proceed to
 * record results against selectors that match nothing.
 *
 * Kept as shipped source rather than a snippet inside the Markdown so it is
 * type-checked, linted and unit-tested like any other module — a preflight
 * that has itself rotted is worse than none.
 *
 * BROWSER USE: this file is TypeScript with ESM exports, so its source cannot
 * be pasted into a console — that fails with `SyntaxError: Unexpected token
 * 'export'`, and stripping the keywords still leaves `QA_REQUIRED_HOOKS`
 * undefined. `qaPreflightSnippet()` below emits a SELF-CONTAINED snippet with
 * the hook table inlined; that is what the document tells the reader to paste,
 * and `qaSelectorContract.test.tsx` executes it to prove it runs.
 */

/**
 * Every DOM hook the QA procedure depends on, with the minimum number of
 * matches a correctly rendered statement must produce.
 *
 * `min` is the load-bearing half: a hook that exists on zero elements fails
 * the same way a renamed one does, which is exactly the empty-collection trap
 * above. Figure cells and column heads are plural, so requiring 1 would let a
 * statement that rendered a single row pass a sweep meant to cover all of them.
 *
 * Every entry must also be named by the document — `qaSelectorContract`
 * asserts that both ways, so the table and the procedure cannot drift apart.
 */
export const QA_REQUIRED_HOOKS: readonly { selector: string; min: number; role: string }[] = [
  { selector: '[data-role="statement-root"]', min: 1, role: 'statement root (Paper frame)' },
  { selector: '[data-testid="statement-scroller"]', min: 1, role: 'scroll container' },
  { selector: '[data-role="col-head"]', min: 2, role: 'column header cells' },
  { selector: '[data-role="figure"]', min: 1, role: 'figure cells (blank cells excluded)' },
  {
    // ST-13 reads this element's ::after; it exists only on POSITIVE figures,
    // so a report of all-negative figures legitimately has none. The step says
    // to include at least one positive, which is what makes min: 1 right.
    selector: '[data-role="paren-spacer"]',
    min: 1,
    role: 'paren spacer (generated content, positive figures only)',
  },
  { selector: '[data-a11y="statement-value"]', min: 1, role: 'complete value, visually hidden' },
] as const

export interface QaPreflightResult {
  selector: string
  role: string
  found: number
  min: number
}

/**
 * Verify every QA hook resolves within `root`, THROWING if any does not.
 *
 * @param root - Defaults to `document` in a browser session; tests pass a
 *   rendered container.
 * @returns One row per hook with its match count, for the QA log.
 * @throws If any hook matches fewer than its required minimum. The message
 *   names each failing selector, its role and what was actually found, so the
 *   reader knows which document step is void rather than just that something
 *   is wrong.
 */
export function runQaPreflight(
  root: Pick<ParentNode, 'querySelectorAll'> = document,
): QaPreflightResult[] {
  const results = QA_REQUIRED_HOOKS.map(({ selector, min, role }) => ({
    selector,
    role,
    min,
    found: root.querySelectorAll(selector).length,
  }))

  const missing = results.filter((r) => r.found < r.min)
  if (missing.length > 0) {
    throw new Error(
      `STATEMENT_THEME_QA preflight FAILED — ${missing.length} hook(s) unusable.\n` +
        missing
          .map((r) => `  ${r.selector} (${r.role}): found ${r.found}, need >= ${r.min}`)
          .join('\n') +
        '\n\nThe QA steps that query these return null or an empty collection and ' +
        'would record a silent pass. Update the selectors in ' +
        'docs/modules/accounting/STATEMENT_THEME_QA.md and ' +
        'Statement/qaPreflight.ts together, then re-run.',
    )
  }

  return results
}

/**
 * The exact text a QA reader pastes into the browser console.
 *
 * Plain ES5-compatible JavaScript with the hook table INLINED from
 * `QA_REQUIRED_HOOKS`, so there is nothing to import and no TypeScript syntax
 * to strip. Generating it from the same constant is what keeps the pasted
 * snippet and the tested function from diverging — the document embeds this
 * output, and the contract test both executes the snippet and checks the
 * document still contains it verbatim.
 *
 * Defined as a string rather than by stringifying `runQaPreflight`, because
 * `Function.prototype.toString` returns the COMPILED body — after the TS
 * transform, and still closing over `QA_REQUIRED_HOOKS`, which a console
 * paste would not have.
 */
export function qaPreflightSnippet(): string {
  const table = QA_REQUIRED_HOOKS.map(
    (h) => `  { selector: ${JSON.stringify(h.selector)}, min: ${h.min}, role: ${JSON.stringify(h.role)} },`,
  ).join('\n')

  return `var QA_REQUIRED_HOOKS = [
${table}
];

function runQaPreflight(root) {
  root = root || document;
  var results = QA_REQUIRED_HOOKS.map(function (h) {
    return {
      selector: h.selector,
      role: h.role,
      min: h.min,
      found: root.querySelectorAll(h.selector).length,
    };
  });
  var missing = results.filter(function (r) { return r.found < r.min; });
  if (missing.length > 0) {
    throw new Error(
      'STATEMENT_THEME_QA preflight FAILED — ' + missing.length + ' hook(s) unusable.\\n' +
      missing.map(function (r) {
        return '  ' + r.selector + ' (' + r.role + '): found ' + r.found + ', need >= ' + r.min;
      }).join('\\n') +
      '\\n\\nThe QA steps that query these return null or an empty collection and ' +
      'would record a silent pass. Update the selectors in the QA document and ' +
      'Statement/qaPreflight.ts together, then re-run.'
    );
  }
  console.table(results);
  return results;
}

runQaPreflight();`
}
