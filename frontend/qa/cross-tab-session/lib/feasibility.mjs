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
  const { sent, matched, problems, fingerprintMismatches, statusMismatches, categories, capture } = record
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
  return { verdict: failures.length === 0 ? 'pass' : 'fail', failures }
}
