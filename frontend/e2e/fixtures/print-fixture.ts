import { writeFileSync, readFileSync } from 'node:fs'
import { randomBytes } from 'node:crypto'
import path from 'node:path'

/**
 * Fixture volume: the account count at which Profit & Loss first exceeded one
 * A4 page in the Task 3 measurement (taken with THIS same paid-expense flow),
 * rounded up to the next multiple of 5 for margin. Recorded in
 * docs/test/print-gate-measurement.md.
 */
const FIXTURE_ACCOUNT_COUNT = 15

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

export interface PrintFixtureDescriptor {
  runId: string
  year: number
  prefix: string
  paymentMethodId: string
  accounts: PrintFixtureAccount[]
  expected: {
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

async function login(): Promise<string> {
  const token = unwrap<{ accessToken?: string }>(
    await api('/auth/login', {
      method: 'POST',
      body: JSON.stringify({ usernameOrEmail: 'admin', password: 'Admin@123!' }),
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
  const token = await login()
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

  const totalExpense = sum4dp(accounts.map((a) => a.amount))
  return {
    runId,
    year,
    prefix,
    paymentMethodId,
    accounts,
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
    `print-gate fixture ready: prefix=${descriptor.prefix} accounts=${descriptor.accounts.length} totalExpense=${descriptor.expected.totalExpense}`,
  )
}
