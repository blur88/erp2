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
   * Gate-run admin password. A fresh seed forces a mandatory UI password
   * rotation (/change-password-required), so the brief's Admin@123! login
   * never reaches the reports (Task 3 measurement, env-only rotation there).
   * globalSetup rotates once via PATCH /api/auth/change-password and the
   * spec logs in with this value. Fixed (not random) so a failed run stays
   * reproducible from the retained descriptor; the gate DB is disposable.
   */
  password: string
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

async function login(password = 'Admin@123!'): Promise<string> {
  const token = unwrap<{ accessToken?: string }>(
    await api('/auth/login', {
      method: 'POST',
      body: JSON.stringify({ usernameOrEmail: 'admin', password }),
    }),
  )?.accessToken
  if (!token) throw new Error('print-gate fixture: login returned no accessToken')
  return token
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

/**
 * Insert the non-postable parent (SQL — no API path exists, see
 * PrintFixtureGroup) and create its postable child, expense and payment through
 * the ordinary API.
 */
async function createGroupedAccount(
  token: string,
  prefix: string,
  paymentMethodId: string,
  expenseDate: string,
  amount: string,
): Promise<PrintFixtureGroup> {
  const parentCode = '6900'
  const childCode = '6901'
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
  // Fresh seed marks admin requiresPasswordChange, which the UI enforces as a
  // hard redirect to /change-password-required on every route. Rotate once
  // here (provisioning belongs in globalSetup, which runs once per run) so
  // the spec's UI login reaches the reports. Re-login after rotation: the
  // endpoint invalidates refresh tokens, and this also proves the new
  // password works before the spec depends on it.
  const password = process.env.PRINT_GATE_PASSWORD ?? 'PrintGate@12345!'
  const seedToken = await login()
  await api('/auth/change-password', {
    method: 'PATCH',
    token: seedToken,
    body: JSON.stringify({ currentPassword: 'Admin@123!', newPassword: password, newPasswordConfirmation: password }),
  })
  const token = await login(password)
  const paymentMethodId = await ensureBankPaymentMethod(token, prefix)
  const expenseDate = `${year}-01-15`

  const accounts: PrintFixtureAccount[] = []
  for (let i = 1; i <= FIXTURE_ACCOUNT_COUNT; i += 1) {
    // Long name: exercises print-visible wrapping in the P&L account column.
    const name = `${prefix} expense account ${String(i).padStart(2, '0')} with a deliberately long descriptive name for print wrapping`
    const code = `9${String(600 + i).padStart(3, '0')}`
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
      `totalExpense=${descriptor.expected.totalExpense}`,
  )
}
