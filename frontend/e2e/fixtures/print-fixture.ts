import { writeFileSync, readFileSync } from 'node:fs'
import { execFileSync } from 'node:child_process'
import { randomBytes } from 'node:crypto'
import path from 'node:path'

/**
 * Fixture volume: the account count at which Profit & Loss first exceeded one
 * A4 page in the Task 3 measurement (taken with THIS same paid-expense flow),
 * rounded up to the next multiple of 5 for margin. Recorded in
 * docs/test/print-gate-measurement.md.
 *
 * The grouped account below (see createGroupedAccount) adds two further P&L
 * rows on top of these, so the page count only ever grows.
 */
const FIXTURE_ACCOUNT_COUNT = 15

/**
 * The seeded top-level EXPENSE group. accounting-seeder writes
 * `isPostable = parentId !== null`, so the six root groups — and only they —
 * are non-postable, and 6000 is the EXPENSE one. It is the sole account the
 * REST API will accept as a `parentId` (ChartOfAccountService.assertParentValid
 * rejects a postable parent).
 */
const SEEDED_EXPENSE_GROUP_CODE = '6000'

/**
 * Account codes are RUN-SCOPED, so a second run against the same database does
 * not collide with the first (`ChartOfAccountService.create` 409s on a
 * duplicate code, and the SQL insert hits the unique index on `code`).
 *
 * Fixed codes made the gate un-re-runnable without `down -v`, which is the
 * same "you must remember to reset it" failure mode #1214 exists to remove.
 *
 * Shape: `9<runId[0:4]><nn>` — 4 hex chars of the run id plus a 2-digit
 * sequence, e.g. `9a06510`. That is 7 characters against the column's
 * `varchar(20)`, sorts stably within a run (the P&L sorts rows by code), leads
 * with 9 so it stays clear of every seeded code (1000–6990), and cannot
 * collide with the seeded set or with another run except on a runId prefix
 * collision — which would also have to coincide with the same sequence number.
 *
 * Sequences are partitioned so the two creation paths cannot collide with each
 * other: 00 and 01 are the grouped parent and child, and the flat accounts
 * start at 10. Stated as named constants rather than left implicit — an overlap
 * would surface as a mid-fixture 409, not as a wrong report.
 */
const runScopedCode = (runId: string, sequence: number) =>
  `9${runId.slice(0, 4)}${String(sequence).padStart(2, '0')}`
/** Flat fixture accounts occupy sequences 10..(9 + FIXTURE_ACCOUNT_COUNT). */
const FLAT_CODE_SEQUENCE_BASE = 10
/** The grouped parent and its child, deliberately outside the flat range. */
const GROUP_PARENT_SEQUENCE = 0
const GROUP_CHILD_SEQUENCE = 1

const DESCRIPTOR_PATH =
  process.env.PRINT_GATE_DESCRIPTOR ??
  path.join(import.meta.dirname, '.print-gate-descriptor.json')

export interface PrintFixtureAccount {
  id: string
  code: string
  name: string
  amount: string
  expenseId: string
}

/**
 * A real drill-down: a NON-POSTABLE parent expense account with one POSTABLE
 * child carrying a paid expense.
 *
 * Why this exists (review finding 4). ProfitAndLossAccountingView marks
 * `printClass = 'acct-print-detail-row'` only at `depth > 0`, and
 * assembleSections only emits children under a NON-POSTABLE category
 * (profit-and-loss.classify.ts: `category?.isPostable ? [] : ...`). The flat
 * 15-account fixture is all top-level postable leaves, so it produced no
 * `pl-expand-*` control and no `.acct-print-detail-row` at all — the P&L leg of
 * the intentional-hiding test was skipped on every run, and deleting that
 * class's print rule would have escaped detection.
 *
 * Why one row is inserted with SQL. No REST path creates a non-postable
 * account: ChartOfAccountService.create hardcodes `isPostable: true` and
 * accounting-seeder is the only writer of `false` (verified against the live
 * gate API — POST with a parentId returns a postable account, so the child
 * still lands at depth 0 as its own category). The child, its expense and its
 * payment all still go through the ordinary API flow, so the amount and the
 * cash-basis posting are genuine; only the parent's `isPostable` flag is
 * unreachable, and that one column is what the SQL sets.
 */
export interface PrintFixtureGroup {
  /** Non-postable parent — renders as a `group` row with a `pl-expand-*` control. */
  parentId: string
  parentCode: string
  parentName: string
  /** Postable child at depth 1 — carries `.acct-print-detail-row`. */
  childId: string
  childCode: string
  childName: string
  /** The child's paid amount, 4dp. The parent row shows the same total. */
  amount: string
  expenseId: string
}

export interface PrintFixtureDescriptor {
  runId: string
  year: number
  prefix: string
  paymentMethodId: string
  /**
   * Gate-run admin password — the value the spec's UI login uses.
   *
   * A fresh seed marks admin `requiresPasswordChange`, which the UI enforces as
   * a hard redirect to /change-password-required on every route, so the seeded
   * Admin@123! login never reaches the reports. globalSetup rotates to this
   * value ONLY when a rotation is actually pending (see authenticate), so a
   * re-run against an already-rotated database reuses it instead of failing.
   *
   * Fixed (not random) so a failed run stays reproducible from the retained
   * descriptor, and so the re-run path has a known value to fall back to.
   */
  password: string
  /**
   * What the pre-run cleanup removed, e.g. "0 accounts, 0 expenses, ...".
   * Non-zero means this run reused a database an earlier run had populated —
   * useful when reading a failure from the retained descriptor.
   */
  cleaned: string
  accounts: PrintFixtureAccount[]
  /** The grouped drill-down. Always present — the P&L hiding test REQUIRES it. */
  group: PrintFixtureGroup
  expected: {
    /** Flat accounts + the grouped child. Drives P&L net profit and BS N48/N38. */
    totalExpense: string
    currentYearLossN48: string
    bankMovementN38: string
  }
}

const apiBase = () =>
  process.env.PRINT_GATE_API_URL ?? `http://localhost:${process.env.PRINT_GATE_API_PORT ?? '3101'}/api`

/** Any non-2xx throws with the response body — fixture failure is terminal. */
async function api(pathname: string, init: RequestInit & { token?: string } = {}) {
  const { token, ...rest } = init
  const res = await fetch(`${apiBase()}${pathname}`, {
    ...rest,
    headers: {
      'Content-Type': 'application/json',
      ...(token ? { Authorization: `Bearer ${token}` } : {}),
      ...(rest.headers ?? {}),
    },
  })
  const body = await res.text()
  if (!res.ok) {
    throw new Error(
      `print-gate fixture: ${init.method ?? 'GET'} ${pathname} -> ${res.status}\n${body}`,
    )
  }
  return body ? JSON.parse(body) : null
}

const unwrap = <T,>(payload: any): T => (payload?.data ?? payload) as T

const SEEDED_PASSWORD = 'Admin@123!'

interface LoginResult {
  accessToken: string
  /** From the login response — the UI hard-redirects to /change-password-required. */
  requiresPasswordChange: boolean
}

/** Login, returning the token AND whether a password change is still pending. */
async function login(password = SEEDED_PASSWORD): Promise<LoginResult> {
  const payload = unwrap<{ accessToken?: string; requiresPasswordChange?: boolean }>(
    await api('/auth/login', {
      method: 'POST',
      body: JSON.stringify({ usernameOrEmail: 'admin', password }),
    }),
  )
  if (!payload?.accessToken) throw new Error('print-gate fixture: login returned no accessToken')
  return {
    accessToken: payload.accessToken,
    requiresPasswordChange: payload.requiresPasswordChange === true,
  }
}

/** Login that resolves to null on 401 instead of throwing, for the probe below. */
async function tryLogin(password: string): Promise<LoginResult | null> {
  try {
    return await login(password)
  } catch (err) {
    if (/-> 401/.test(String(err))) return null
    throw err
  }
}

/**
 * Authenticate idempotently, so the gate is RE-RUNNABLE against a database a
 * previous run already used.
 *
 * A fresh seed marks admin `requiresPasswordChange`, which the UI enforces as a
 * hard redirect to /change-password-required on every route — so the rotation
 * genuinely IS needed on a first run, and is not skipped.
 *
 * But it used to be UNCONDITIONAL: the second run's `login()` with the seeded
 * password returned 401 (the first run had already rotated it) and globalSetup
 * died before creating anything. Re-running therefore required `down -v` plus
 * deleting .print-gate-data. A gate people must remember to reset is a gate
 * people stop running, which is the premise of #1214.
 *
 * Order matters: the SEEDED password is tried first, because that is the state
 * that needs acting on. Falling straight through to the gate password would
 * leave a fresh seed's pending change unrotated.
 */
async function authenticate(gatePassword: string): Promise<string> {
  const seeded = await tryLogin(SEEDED_PASSWORD)
  if (seeded) {
    if (!seeded.requiresPasswordChange) {
      // Seeded password still valid and no change pending: nothing to rotate,
      // and rotating anyway would move the password the spec logs in with.
      // (Only reachable if someone cleared the flag by hand.)
      return seeded.accessToken
    }
    await api('/auth/change-password', {
      method: 'PATCH',
      token: seeded.accessToken,
      body: JSON.stringify({
        currentPassword: SEEDED_PASSWORD,
        newPassword: gatePassword,
        newPasswordConfirmation: gatePassword,
      }),
    })
    // Re-login: change-password invalidates all refresh tokens, and this also
    // proves the new password works before the spec depends on it.
    return (await login(gatePassword)).accessToken
  }

  // Seeded password rejected => an earlier run already rotated it. Proceed on
  // the gate password without rotating (change-password rejects reusing the
  // current value, so a second rotation would fail).
  const rotated = await tryLogin(gatePassword)
  if (!rotated) {
    throw new Error(
      `print-gate fixture: admin login failed with BOTH the seeded password and ` +
        `the gate password. The database is in an unexpected state — recreate the ` +
        `gate stack (down -v and remove .print-gate-data), or set ` +
        `PRINT_GATE_PASSWORD to the value actually in use.`,
    )
  }
  return rotated.accessToken
}

/**
 * A BANK-channel method enabled for purchases. useForPurchases is mandatory:
 * expense-payment.service.ts rejects methods without it. BANK channel is what
 * makes payments move N38 (Bank Balance) on the Balance Sheet.
 */
async function ensureBankPaymentMethod(token: string, prefix: string): Promise<string> {
  const existing = unwrap<any[]>(
    await api('/settings/payment-methods?useForPurchases=true', { token }),
  )
  const bank = (existing ?? []).find((m) => m?.accountingChannel === 'BANK' && m?.isActive)
  if (bank?.id) return bank.id

  const created = unwrap<{ id: string }>(
    await api('/settings/payment-methods', {
      method: 'POST',
      token,
      body: JSON.stringify({
        code: `PWB${prefix.slice(-4)}`,
        name: `${prefix} bank`,
        useForPurchases: true,
        accountingChannel: 'BANK',
      }),
    }),
  )
  if (!created?.id) throw new Error('print-gate fixture: payment method returned no id')
  return created.id
}

/**
 * Run one SQL statement against the gate's Postgres and return the single
 * scalar it selects.
 *
 * Uses the gate's own compose stack (the same explicit argument set every other
 * gate command uses) rather than adding a Postgres client to the frontend's
 * dependency tree for one INSERT. Overridable so a differently-hosted gate DB
 * can still be reached.
 *
 * Failure is TERMINAL and loud: execFileSync throws on a non-zero exit, and the
 * caller does not catch. A silently skipped group insert would put the P&L
 * hiding assertion straight back to the vacuous state finding 4 is about.
 */
function psqlScalar(sql: string): string {
  const override = process.env.PRINT_GATE_PSQL
  const argv = override
    ? [...override.split(' ').filter(Boolean), '-tAc', sql]
    : [
        'compose',
        '-p',
        process.env.PRINT_GATE_PROJECT ?? 'erp_print_gate',
        '-f',
        'docker-compose.yml',
        '-f',
        'docker-compose.print-gate.yml',
        'exec',
        '-T',
        'postgres',
        'psql',
        // psql exits 0 on a SQL error without this, so a failed INSERT would
        // surface as "returned no value" instead of the actual error.
        '-v',
        'ON_ERROR_STOP=1',
        '-U',
        process.env.PRINT_GATE_DB_USER ?? 'erp_print_gate',
        '-d',
        process.env.PRINT_GATE_DB_NAME ?? 'erp_print_gate',
        '-tAc',
        sql,
      ]
  const bin = override ? argv.shift()! : 'docker'
  const out = execFileSync(bin, argv, {
    // Repo root: this file lives at frontend/e2e/fixtures/, and the compose
    // files are named relative to the root.
    cwd: path.resolve(import.meta.dirname, '..', '..', '..'),
    encoding: 'utf8',
    stdio: ['ignore', 'pipe', 'pipe'],
  })
  // First non-empty line only. `psql -tAc` prints the RETURNING row AND a
  // command-status line ("INSERT 0 1") after it, so a bare trim() of the whole
  // output yields "<uuid>\nINSERT 0 1" — which reaches the API as an invalid
  // UUID and fails validation rather than anything legible.
  const lines = out
    .split('\n')
    .map((l) => l.trim())
    .filter((l) => l.length > 0)
  const value = lines[0]
  if (!value) throw new Error(`print-gate fixture: psql returned no value for: ${sql}`)
  // A psql ERROR is written to stderr, so execFileSync would already have
  // thrown; this catches the case where it lands on stdout instead.
  if (/^(ERROR|FATAL)\b/.test(value)) {
    throw new Error(`print-gate fixture: psql failed for: ${sql}\n${out}`)
  }
  return value
}

const sqlLiteral = (value: string) => `'${value.replace(/'/g, "''")}'`

/** Marker every fixture account name starts with, and the cleanup's only scope. */
const FIXTURE_NAME_PREFIX = 'PWPRINT-'

/**
 * Delete every PREVIOUS run's fixture rows, so each run starts from the same
 * state and the gate is RE-RUNNABLE in place — no `down -v`, no removing
 * .print-gate-data.
 *
 * Why this is necessary and not merely tidy. Both reports aggregate over the
 * whole database, so a second run's rows ADD to the first's:
 *   - Balance Sheet N38/N48 are sums. Verified: run 2 read MYR -5,868.09 where
 *     the declared expectation was -1,956.03 — exactly 3x, one multiple per run.
 *   - Profit & Loss is worse. assembleSections seeds EVERY postable expense
 *     account at zero regardless of year (spec §7.2, zero rows stay visible),
 *     so a prior run's 17 accounts render as 0.00 rows in every later report.
 *     Verified against the live API. The report therefore grows by 17 rows per
 *     run, drifting page count, layout and the clipping scan's element set.
 *
 * Two alternatives were rejected:
 *   - Deriving expectations from the live report. Forbidden by design: expected
 *     print-visible content is DECLARED, never derived, because deriving lets
 *     accidental hiding or a wrong figure pass.
 *   - A run-scoped fiscal year. Fixes the Balance Sheet sums (verified: an
 *     earlier year is fully isolated, N47 carries prior years forward) but NOT
 *     the P&L, because the zero-row seeding above ignores the year entirely.
 *
 * Scope is `chart_of_account.name LIKE 'PWPRINT-%'` — the marker every fixture
 * account carries, and nothing else in the database does. Seeded accounts
 * (1000–6990), the payment method and the admin user are untouched.
 *
 * Deletion order follows the FKs: payments, then expenses, then journal entries
 * (whose lines CASCADE), then the accounts themselves — `journal_entry_line`
 * references `chart_of_account` with RESTRICT, so the accounts cannot go first.
 */
function cleanPreviousFixtureRows(): string {
  const marker = sqlLiteral(`${FIXTURE_NAME_PREFIX}%`)
  const scope = `SELECT id FROM chart_of_account WHERE name LIKE ${marker}`

  // One statement, one transaction, so a partial clean cannot leave rows that
  // would silently skew the next report. `-tAc` runs a single string as one
  // implicit transaction.
  return psqlScalar(
    `WITH scoped AS (${scope}),
     scoped_expenses AS (
       SELECT id, "expenseNumber" FROM expenses
        WHERE "expenseAccountId" IN (SELECT id FROM scoped)
     ),
     del_payments AS (
       DELETE FROM expense_payments
        WHERE "expenseId" IN (SELECT id FROM scoped_expenses) RETURNING 1
     ),
     del_lines AS (
       DELETE FROM journal_entry_line
        WHERE "accountId" IN (SELECT id FROM scoped) RETURNING "entryId"
     ),
     del_entries AS (
       DELETE FROM journal_entry
        WHERE id IN (SELECT "entryId" FROM del_lines) RETURNING 1
     ),
     del_expenses AS (
       DELETE FROM expenses
        WHERE id IN (SELECT id FROM scoped_expenses) RETURNING 1
     ),
     del_accounts AS (
       DELETE FROM chart_of_account
        WHERE id IN (SELECT id FROM scoped) RETURNING 1
     )
     SELECT (SELECT count(*) FROM del_accounts) || ' accounts, '
         || (SELECT count(*) FROM del_expenses) || ' expenses, '
         || (SELECT count(*) FROM del_payments) || ' payments, '
         || (SELECT count(*) FROM del_entries) || ' journal entries'`,
  )
}

/**
 * Insert the non-postable parent (SQL — no API path exists, see
 * PrintFixtureGroup) and create its postable child, expense and payment through
 * the ordinary API.
 */
async function createGroupedAccount(
  token: string,
  runId: string,
  prefix: string,
  paymentMethodId: string,
  expenseDate: string,
  amount: string,
): Promise<PrintFixtureGroup> {
  const parentCode = runScopedCode(runId, GROUP_PARENT_SEQUENCE)
  const childCode = runScopedCode(runId, GROUP_CHILD_SEQUENCE)
  const parentName = `${prefix} grouped parent expense account with a deliberately long descriptive name for print wrapping`
  const childName = `${prefix} grouped CHILD expense account with a deliberately long descriptive name for print wrapping`

  // Parented to the seeded 6000 group so the child lands two levels below the
  // root — which is what makes it depth 1. A parent at the root itself would
  // BE the category and render its child flat at depth 0 (verified against the
  // live API), producing no drill-down at all.
  const groupRootId = psqlScalar(
    `SELECT id FROM chart_of_account WHERE code = ${sqlLiteral(SEEDED_EXPENSE_GROUP_CODE)}`,
  )
  const parentId = psqlScalar(
    `INSERT INTO chart_of_account
       (code, name, type, "parentId", "isActive", "isSystem", "isPostable",
        "openingBalance", "createdBy")
     VALUES (${sqlLiteral(parentCode)}, ${sqlLiteral(parentName)}, 'Expense',
             ${sqlLiteral(groupRootId)}, true, false, false, '0.0000', 'print-gate')
     RETURNING id`,
  )

  const child = unwrap<{ id: string; isPostable?: boolean }>(
    await api('/accounting/accounts', {
      method: 'POST',
      token,
      body: JSON.stringify({ name: childName, code: childCode, type: 'Expense', parentId }),
    }),
  )
  if (!child?.id) throw new Error('print-gate fixture: grouped child returned no id')

  const expense = unwrap<{ id: string }>(
    await api('/accounting/expenses', {
      method: 'POST',
      token,
      body: JSON.stringify({
        expenseDate,
        description: `${prefix} grouped child expense`,
        expenseAccountId: child.id,
        totalAmount: amount,
      }),
    }),
  )
  if (!expense?.id) throw new Error('print-gate fixture: grouped child expense returned no id')

  await api(`/accounting/expenses/${expense.id}/pay`, {
    method: 'POST',
    token,
    body: JSON.stringify({ payments: [{ paymentMethodId, amount, paymentDate: expenseDate }] }),
  })

  return {
    parentId,
    parentCode,
    parentName,
    childId: child.id,
    childCode,
    childName,
    amount: to4dp(amount),
    expenseId: expense.id,
  }
}

/** Fixed 2dp inputs so 4dp expectations are exact, never float-derived. */
const amountFor = (index: number) => `${100 + index}.${String(10 + index).padStart(2, '0')}`

const to4dp = (value: string) => (Math.round(parseFloat(value) * 10000) / 10000).toFixed(4)

const sum4dp = (values: string[]) => {
  const total = values.reduce((acc, v) => acc + Math.round(parseFloat(v) * 10000), 0)
  return (total / 10000).toFixed(4)
}

/**
 * accounts -> expenses -> pay, the approved flow. Each expense is fully paid
 * from a BANK-channel method, so the cash-basis posting port produces a real
 * balanced entry: debit expense, credit bank.
 */
export async function createPrintFixture(): Promise<PrintFixtureDescriptor> {
  const runId = randomBytes(4).toString('hex')
  const prefix = `PWPRINT-${runId}`
  const year = Number(process.env.PRINT_GATE_YEAR ?? new Date().getFullYear())
  // Rotates only when a rotation is actually pending, so a second run against
  // the same database works without any teardown. See authenticate().
  const password = process.env.PRINT_GATE_PASSWORD ?? 'PrintGate@12345!'
  const token = await authenticate(password)

  // Reset to a known state BEFORE creating anything, so a re-run against a
  // used database produces the same reports as a first run. See
  // cleanPreviousFixtureRows for why both reports demand this.
  const cleaned = cleanPreviousFixtureRows()

  const paymentMethodId = await ensureBankPaymentMethod(token, prefix)
  const expenseDate = `${year}-01-15`

  const accounts: PrintFixtureAccount[] = []
  for (let i = 1; i <= FIXTURE_ACCOUNT_COUNT; i += 1) {
    // Long name: exercises print-visible wrapping in the P&L account column.
    const name = `${prefix} expense account ${String(i).padStart(2, '0')} with a deliberately long descriptive name for print wrapping`
    const code = runScopedCode(runId, FLAT_CODE_SEQUENCE_BASE + i - 1)
    const amount = amountFor(i)

    const account = unwrap<{ id: string }>(
      await api('/accounting/accounts', {
        method: 'POST',
        token,
        body: JSON.stringify({ name, code, type: 'Expense' }),
      }),
    )
    if (!account?.id) throw new Error(`print-gate fixture: account ${code} returned no id`)

    const expense = unwrap<{ id: string }>(
      await api('/accounting/expenses', {
        method: 'POST',
        token,
        body: JSON.stringify({
          expenseDate,
          description: `${prefix} expense ${String(i).padStart(2, '0')}`,
          expenseAccountId: account.id,
          totalAmount: amount,
        }),
      }),
    )
    if (!expense?.id) throw new Error(`print-gate fixture: expense for ${code} returned no id`)

    await api(`/accounting/expenses/${expense.id}/pay`, {
      method: 'POST',
      token,
      body: JSON.stringify({
        payments: [{ paymentMethodId, amount, paymentDate: expenseDate }],
      }),
    })

    accounts.push({ id: account.id, code, name, amount: to4dp(amount), expenseId: expense.id })
  }

  // The grouped drill-down (review finding 4). Its amount is deliberately
  // distinct from every amountFor(i) value so a row swap cannot pass.
  const group = await createGroupedAccount(
    token,
    runId,
    prefix,
    paymentMethodId,
    expenseDate,
    '333.33',
  )

  // Both the flat leaves AND the grouped child post real expenses, so the
  // grouped amount must be in the aggregate totals or every Balance Sheet
  // expectation is short by it.
  const totalExpense = sum4dp([...accounts.map((a) => a.amount), group.amount])
  return {
    runId,
    year,
    prefix,
    paymentMethodId,
    password,
    cleaned,
    accounts,
    group,
    expected: {
      totalExpense,
      // Signed: expenses reduce profit and BANK-channel payments reduce bank.
      currentYearLossN48: `-${totalExpense}`,
      bankMovementN38: `-${totalExpense}`,
    },
  }
}

export function readDescriptor(): PrintFixtureDescriptor {
  return JSON.parse(readFileSync(DESCRIPTOR_PATH, 'utf8')) as PrintFixtureDescriptor
}

/**
 * Playwright globalSetup. Runs ONCE per run — unlike beforeAll, which re-runs
 * after a worker restart and would double these balances mid-diagnosis.
 */
export default async function globalSetup() {
  const descriptor = await createPrintFixture()
  writeFileSync(DESCRIPTOR_PATH, JSON.stringify(descriptor, null, 2))
  console.log(
    `print-gate fixture ready: prefix=${descriptor.prefix} ` +
      `accounts=${descriptor.accounts.length} ` +
      `group=${descriptor.group.parentCode}/${descriptor.group.childCode}@${descriptor.group.amount} ` +
      `totalExpense=${descriptor.expected.totalExpense} ` +
      `(pre-run cleanup removed ${descriptor.cleaned})`,
  )
}
