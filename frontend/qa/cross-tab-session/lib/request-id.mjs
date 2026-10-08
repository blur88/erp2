// Which identifier an API request carries when the profile tags its requests
// ({ tagRequests: true } in lib/harness.mjs). Pure: request-id.test.mjs.
//
// A request that already carries one keeps it: a case that sends its own
// probes names them itself (`probe-007`, `fill-012`) and looks them up by that
// name in the ingress log and the upstream capture. Only a request without one
// - the application's own - is given the harness's `app-<seq>`. The `app-`
// prefix is the harness's alone, so that an `app-*` identifier always means
// "the application sent this, and its sequence number is <seq>".

const HEADER = 'x-qa-request-id'

/** The identifier for a request with these headers and this harness sequence number. */
export function requestIdFor(headers, seq) {
  const given = headers && typeof headers[HEADER] === 'string' ? headers[HEADER].trim() : ''
  if (given !== '' && !given.startsWith('app-')) return given
  return `app-${seq}`
}
