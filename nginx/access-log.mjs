// Pure reading of one line of the `limits` access-log format declared in
// nginx/nginx.conf. Nothing here touches NGINX, a socket or the clock.
//
// The format, one field per limiter:
//
//   $remote_addr - $remote_user [$time_local] "$request" $status $body_bytes_sent
//   "$http_referer" "$http_user_agent"
//   msec=$msec rt=$request_time urt="$upstream_response_time"
//   lreq=$limit_req_status lconn=$limit_conn_status qa="$http_x_qa_request_id"
//
// A line that does not match is `null`, never a partial read: a line in the
// older `combined` format carries no limiter verdict at all, and a field read
// from the wrong place is worse than no field. NGINX writes `-` for a variable
// that is unset, which is `null` here for the same reason.
//
// Times are milliseconds. `$msec` and `$request_time` are both written to the
// millisecond, so `startMs` (the ingress clock's reading of when the request
// began) can be up to 1 ms out, and a difference of two of them up to 2 ms.
// Callers that compare two of them carry a margin for that (see INGRESS_MARGIN_MS
// in frontend/qa/cross-tab-session/lib/expiry-crossing.mjs).

const LINE = new RegExp(
  '^(\\S+) - (\\S+) \\[[^\\]]*\\] "(\\S+) (\\S+) HTTP/[\\d.]+" ' +
    '(\\d{3}) (\\S+) "[^"]*" "[^"]*" ' +
    'msec=(\\S+) rt=(\\S+) urt="([^"]*)" ' +
    'lreq=(\\S+) lconn=(\\S+) qa="([^"]*)"$',
)

const LIMIT_REQ = new Set(['PASSED', 'DELAYED', 'REJECTED'])
const LIMIT_CONN = new Set(['PASSED', 'REJECTED'])

// "-" is NGINX's unset marker; "" is what a bare `lreq=` would leave.
function unset(value) {
  return value === '-' || value === '' || value === undefined
}

function secondsToMs(text) {
  const n = Number(text)
  if (!Number.isFinite(n)) return null
  return Math.round(n * 1000)
}

// "-" means no upstream was contacted. Several values, comma or colon
// separated, mean the request was tried more than once; their sum is the total
// time the upstream took, which is what the non-upstream duration is taken from.
function parseUpstream(value) {
  if (unset(value)) return { kind: 'none', ms: null }
  const parts = value
    .split(/[,:]/)
    .map((p) => p.trim())
    .filter((p) => p !== '')
  if (parts.length === 0) return { kind: 'none', ms: null }
  let ms = 0
  for (const part of parts) {
    const n = secondsToMs(part)
    if (n === null) return { kind: 'none', ms: null }
    ms += n
  }
  return parts.length === 1 ? { kind: 'single', ms } : { kind: 'multiple', ms }
}

// One `limits` line, or null when the line is not one.
export function parseLine(line) {
  if (typeof line !== 'string') return null
  const m = LINE.exec(line.replace(/\r?\n$/, ''))
  if (!m) return null

  const endMs = secondsToMs(m[7])
  const requestMs = secondsToMs(m[8])
  // Without both there is no start time, and a start time is what every
  // ordering in this plan is measured against.
  if (endMs === null || requestMs === null) return null

  const upstream = parseUpstream(m[9])
  return {
    remoteAddr: m[1],
    method: m[3],
    uri: m[4],
    status: Number(m[5]),
    endMs,
    requestMs,
    startMs: endMs - requestMs,
    upstream,
    // request_time minus the upstream's own time. It is not the time a limiter
    // held the request: it also contains request processing and the time spent
    // sending the response to the client. Null only when no upstream was
    // contacted, since then there is nothing to subtract.
    nonUpstreamMs: upstream.ms === null ? null : requestMs - upstream.ms,
    limitReq: LIMIT_REQ.has(m[10]) ? m[10] : null,
    limitConn: LIMIT_CONN.has(m[11]) ? m[11] : null,
    qaId: unset(m[12]) ? null : m[12],
  }
}

// Which limiter refused the request, from that limiter's own field. A 429 with
// neither field REJECTED was refused by something this log cannot name, and is
// never attributed by guess; a line that does not parse is the same case.
// When both fields read REJECTED, /api's first limiter is reported.
export function attribute(entry) {
  if (!entry) return 'unattributed'
  if (entry.status !== 429) return 'none'
  if (entry.limitReq === 'REJECTED') return 'limit_req'
  if (entry.limitConn === 'REJECTED') return 'limit_conn'
  return 'unattributed'
}
