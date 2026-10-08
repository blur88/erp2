// What the capture feasibility run sends and what its record must show
// (#1353, Task 2 Step 5). Pure: capture-feasibility.test.mjs.
//
// The run validates the evidence pipeline - browser record, ingress log and
// upstream capture agreeing request by request - and nothing else. It says
// nothing about the expiry case that pipeline is later used for.

export const FEASIBILITY_PLAN = {
  // One after another, so the ingress reuses its upstream connections.
  sequential: 40,
  // At once, so that the limiter delays a good share of them.
  bursts: 5,
  burstSize: 20,
  // With a padding header, as a means of making the request span several
  // frames. What is judged is what the capture reassembled, not this size.
  padded: 40,
  paddingBytes: 4096,
  // 401s, from a token that has expired and from one that never was a token.
  expired: 10,
  garbage: 10,
  total: 200,
}

// What the backend says for a token it will not accept
// (backend/src/modules/auth/guards/jwt-auth.guard.ts).
export const EXPIRED_MESSAGE = 'Invalid or expired token'

// How many answers each group sends for, and what they must be.
const GROUPS = {
  seq: { count: FEASIBILITY_PLAN.sequential, intended: '2xx' },
  burst: { count: FEASIBILITY_PLAN.bursts * FEASIBILITY_PLAN.burstSize, intended: '2xx' },
  pad: { count: FEASIBILITY_PLAN.padded, intended: '2xx' },
  expired: { count: FEASIBILITY_PLAN.expired, intended: '401 expired' },
  garbage: { count: FEASIBILITY_PLAN.garbage, intended: '401 expired' },
}

/** Why a group's answers are not the ones it was sent for, or null. */
function groupProblem(name, group) {
  const want = GROUPS[name]
  if (!group) return `${name}: not recorded`
  const statuses = Object.entries(group.statuses ?? {}).map(([status, n]) => [Number(status), n])
  const total = statuses.reduce((sum, [, n]) => sum + n, 0)
  if (total !== want.count) return `${name}: ${total} answers of ${want.count}`
  const intended = want.intended === '2xx' ? (status) => status >= 200 && status < 300 : (status) => status === 401
  const others = statuses.filter(([status]) => !intended(status))
  if (others.length > 0) return `${name}: ${others.map(([status, n]) => `${n} x ${status}`).join(', ')} where ${want.intended} was intended`
  if (want.intended === '401 expired') {
    const messages = group.messages ?? []
    if (messages.length !== 1 || messages[0] !== EXPIRED_MESSAGE) return `${name}: answered with ${JSON.stringify(messages)}, not "${EXPIRED_MESSAGE}"`
  }
  return null
}

/**
 * The record's verdict. Every failure is named; none hides another.
 *
 * `categories` are counts the evidence itself gave: streams that carried more
 * than one request, requests the ingress logged as DELAYED, requests the
 * capture reassembled from more than one frame, and answers by status.
 */
export function judgeFeasibility(record) {
  const failures = []
  const need = (ok, check, detail) => {
    if (!ok) failures.push({ check, detail })
  }
  const { sent, matched, problems, fingerprintMismatches, statusMismatches, categories, capture, groups, token, refresh, paddedReachedUpstream } = record
  need(sent === FEASIBILITY_PLAN.total, 'every planned request was sent', `${sent} of ${FEASIBILITY_PLAN.total}`)
  need(matched === sent && problems.length === 0, 'one-to-one correlation', `${matched} of ${sent} matched in browser, ingress and capture; ${problems.length} problem(s)`)
  need(fingerprintMismatches.length === 0, 'token fingerprints agree', `${fingerprintMismatches.length} request(s) differ`)
  need(statusMismatches.length === 0, 'statuses agree', `${statusMismatches.length} request(s) differ`)
  need(categories.reusedStreams > 0, 'reused connections were observed', 'no upstream stream carried more than one request')
  need(categories.delayed * 4 >= sent, 'at least a quarter of the requests were delayed', `${categories.delayed} of ${sent}`)
  need(categories.multiFrame > 0, 'multi-frame requests were observed', 'the capture reassembled no request from more than one frame')
  need(categories.status2xx > 0, 'successful responses were observed', 'no 2xx')
  need(categories.status401 > 0, 'authentication-error responses were observed', 'no 401')
  need(capture.usable === true, 'the capture is usable', capture.why)
  const wrong = Object.keys(GROUPS).map((name) => groupProblem(name, groups?.[name])).filter(Boolean)
  need(wrong.length === 0, 'every group got its intended statuses', wrong.join('; '))
  // The valid-token groups mean nothing if the token ran out under them.
  const left = token?.lifetimeLeftMsAfterLastValidRequest
  need(typeof left === 'number' && left > 0, 'the current token outlived the requests that needed it', `${left} ms left after the last of them`)
  need(
    paddedReachedUpstream === FEASIBILITY_PLAN.padded,
    'the padding reached the upstream on every padded request',
    `${paddedReachedUpstream} of ${FEASIBILITY_PLAN.padded}`,
  )
  // The refresh is identified and accounted for apart from the 200.
  need(refresh?.correlated === true, 'the refresh before the workload is in all three sources', 'not found once in each')
  return { verdict: failures.length === 0 ? 'pass' : 'fail', failures }
}
