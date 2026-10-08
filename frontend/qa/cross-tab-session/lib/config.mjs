// Run configuration for the cross-tab session suite (#1345).
//
// Everything that differs between runs comes from the environment. Nothing
// here has a default that could make a run look configured when it is not:
// a missing value stops the script before a browser is started.
import { createRequire } from 'node:module'
import { existsSync, readFileSync } from 'node:fs'
import { dirname, join, resolve } from 'node:path'
import { fileURLToPath, pathToFileURL } from 'node:url'

const HERE = dirname(fileURLToPath(import.meta.url))
export const SUITE_DIR = resolve(HERE, '..')
export const REPO_ROOT = resolve(SUITE_DIR, '../../..')

function required(name) {
  const value = process.env[name]
  if (!value) throw new Error(`${name} is not set (see README.md, "What it needs")`)
  return value
}

/** `20s`, `15m`, `2h`, `1d` or a bare number of seconds, as the backend accepts. */
export function durationSeconds(text) {
  const m = /^(\d+)\s*(s|m|h|d)?$/.exec(String(text).trim())
  if (!m) throw new Error(`cannot read a duration from "${text}"`)
  const unit = { s: 1, m: 60, h: 3600, d: 86400 }[m[2] ?? 's']
  return Number(m[1]) * unit
}

/**
 * True for `localhost` and names under it, anything in 127.0.0.0/8 and ::1,
 * as a URL's hostname states them (the URL parser has already normalised
 * 127.1 or 2130706433 to dotted form). run.sh refuses the same and, having a
 * resolver, also a name that resolves to one of them.
 */
export function isLoopbackHost(hostname) {
  const h = String(hostname).toLowerCase().replace(/\.$/, '')
  return h === 'localhost' || h.endsWith('.localhost') || /^127\.\d+\.\d+\.\d+$/.test(h) || h === '[::1]' || h === '::1'
}

export function loadConfig() {
  const base = required('QA_BASE_URL').replace(/\/+$/, '')
  const url = new URL(base)
  if (isLoopbackHost(url.hostname)) {
    throw new Error('QA_BASE_URL must be a LAN address: localhost is a secure context and behaves differently')
  }
  if (url.port) throw new Error('QA_BASE_URL must not carry a port: the run goes through the ingress on port 80')

  const scratch = process.env.QA_SCRATCH || process.cwd()

  // The output of `stack.sh show`, taken while the configuration under test is
  // running. Cases read the access lifetime and the grace from it; neither is
  // written into a case.
  const showPath = required('QA_STACK_SHOW')
  if (!existsSync(showPath)) throw new Error(`QA_STACK_SHOW points at ${showPath}, which does not exist`)
  const show = JSON.parse(readFileSync(showPath, 'utf8'))
  const accessSeconds = durationSeconds(show.accessTokenExpiry)
  const graceSeconds = durationSeconds(show.refreshGraceSeconds)

  return {
    base,
    scratch,
    show,
    accessSeconds,
    graceSeconds,
    userA: { usernameOrEmail: required('QA_USERNAME'), password: required('QA_PASSWORD') },
    userB: { usernameOrEmail: required('QA_USERNAME_2'), password: required('QA_PASSWORD_2') },
    // The user W1 signs in as: NOT an administrator (W1 stops if it is one).
    userC: { usernameOrEmail: required('QA_USERNAME_3'), password: required('QA_PASSWORD_3') },
    // The ingress access log as run.sh captured it, or null when it was not
    // captured. It is the only record of what each limiter decided about each
    // request, and W1 reads it per round (#1353).
    ingressLog: process.env.QA_INGRESS_LOG && existsSync(process.env.QA_INGRESS_LOG) ? process.env.QA_INGRESS_LOG : null,
    // A run whose suite came from an override copy outside the repository, or
    // which ran only some cases, is never recorded evidence.
    suiteOverride: process.env.QA_SUITE_OVERRIDE ? true : false,
    // Development only: serve the page and its assets from a local build of the
    // checkout instead of from the ingress, so cases can be exercised without
    // rebuilding the frontend image. API calls still go through the ingress.
    // `run.sh` never sets it, and results written with it say so.
    distDir: process.env.QA_DIST_DIR || null,
    headless: process.env.QA_HEADED !== '1',
  }
}

/** Playwright is installed in the scratch directory, not beside these files. */
export function loadPlaywright() {
  const from = process.env.QA_PLAYWRIGHT_DIR || process.env.QA_SCRATCH || process.cwd()
  const require = createRequire(join(from, 'noop.js'))
  return require('playwright')
}

/** Rates and bursts as nginx.conf states them; never copied into this suite. */
export async function loadZones() {
  const mod = await import(pathToFileURL(join(REPO_ROOT, 'nginx/verify-rate-limits.mjs')).href)
  const zones = mod.parseZones(readFileSync(join(REPO_ROOT, 'nginx/nginx.conf'), 'utf8'))
  for (const name of ['session_limit', 'login_limit']) {
    const z = zones[name]
    if (!z || !(z.ratePerSecond > 0) || !Number.isInteger(z.burst)) {
      throw new Error(`could not read rate and burst of ${name} from nginx/nginx.conf`)
    }
  }
  // api_limit, the general limit on /api. parseZones reads its rate; its burst
  // is read here, from the same file. W1 uses it only to pace recovery, and
  // stops if it cannot be read (null here, a precondition there).
  const text = readFileSync(join(REPO_ROOT, 'nginx/nginx.conf'), 'utf8')
  const apiBurst = /limit_req\s+zone=api_limit\s+burst=(\d+)/.exec(text)
  // The delay threshold on the same directive: case 16 derives the longest
  // configured hold from burst, delay and rate. Absent (`nodelay`) it is null.
  const apiDelay = /limit_req\s+zone=api_limit\s+burst=\d+\s+delay=(\d+)/.exec(text)
  const api =
    zones.api_limit && zones.api_limit.ratePerSecond > 0 && apiBurst
      ? { ...zones.api_limit, burst: Number(apiBurst[1]), delay: apiDelay ? Number(apiDelay[1]) : null }
      : null
  return {
    session: zones.session_limit,
    login: zones.login_limit,
    api,
    drainWaitSeconds: mod.drainWaitSeconds,
  }
}

/**
 * Browser launch options. A recorded run uses Chromium's defaults. Only the
 * development mode adds flags: a document fulfilled by the script has no
 * network address, so Chromium treats it as public and blocks its requests to
 * the LAN address (Private Network Access); the real page, served by the
 * ingress, is not affected by that check.
 */
export function launchOptions(config) {
  const options = { headless: config.headless }
  if (config.distDir) {
    options.args = [
      '--disable-features=BlockInsecurePrivateNetworkRequests,PrivateNetworkAccessSendPreflights,PrivateNetworkAccessRespectPreflightResults,LocalNetworkAccessChecks',
    ]
  }
  return options
}

export const sleep = (ms) => new Promise((r) => setTimeout(r, ms))
