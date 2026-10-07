// Case 14: a bundle that does not send the protocol marker (an old bundle)
// can neither obtain nor renew tokens, by any of the three routes that issue
// them.
import { randomBytes } from 'node:crypto'
import { sleep } from '../lib/config.mjs'
import { onLoginPage, pageFetch, tokensIn } from '../lib/harness.mjs'
import { sessionCount } from '../lib/probe.mjs'

const REFUSAL = 'CLIENT_RELOAD_REQUIRED'
const refused = (r) => r.status === 426 && JSON.stringify(r.json ?? r.text ?? '').includes(REFUSAL)
const brief = (r) => ({ status: r.status, body: r.json ? { ...r.json, accessToken: undefined, refreshToken: undefined, user: undefined } : r.text })

export default [
  {
    id: 14,
    name: 'Old bundle',
    // Every request is sent with fetch from the page. A 429 is waited out and
    // retried, never read as a refusal. Passes when:
    //   sign-in       without the marker: 426 CLIENT_RELOAD_REQUIRED, no token
    //                 in the body, and the user's auth_sessions count is
    //                 unchanged; the same body with the marker then signs in.
    //   refresh       steps 1 to 6 of the plan: the unmarked call is refused
    //                 with no token; after grace + 3 s the SAME refresh token,
    //                 marked, gives generation G + 1 and a different refresh
    //                 token (impossible had the refused call rotated: the
    //                 token would be past its grace and classed as replay);
    //                 the next rotation gives exactly G + 2; /auth/me then
    //                 answers 200.
    //   registration  without the marker: refused the same way, and signing in
    //                 as that user, with the marker, answers 401.
    // The registration probe is sent only if the unmarked sign-in was refused:
    // against a server that does not enforce the marker it would create a real
    // user, and the case has already failed by then.
    async run(ctx) {
      const { config } = ctx
      const profile = await ctx.profile()
      const page = await profile.tab('/login', { label: 'old-bundle' })
      ctx.require('the page is signed out', await onLoginPage(page))
      const user = config.userA
      const credentials = { usernameOrEmail: user.usernameOrEmail, password: user.password }

      // --- sign-in ----------------------------------------------------------
      ctx.scope = 'sign-in: '
      const before = await sessionCount(config, user.usernameOrEmail)
      const unmarked = await ctx.paced(() => pageFetch(page, { method: 'POST', path: '/api/auth/login', body: credentials, marker: false }))
      const signInRefused = ctx.check('refused with 426 and the reload code', refused(unmarked), brief(unmarked))
      ctx.check('the refusal carries no token', tokensIn(unmarked.json).length === 0, tokensIn(unmarked.json))
      const afterRefusal = await sessionCount(config, user.usernameOrEmail)
      if (unmarked.json?.refreshToken) {
        // Not refused: end the session the call should never have created.
        await pageFetch(page, { method: 'POST', path: '/api/auth/logout', body: { refreshToken: unmarked.json.refreshToken } })
      }
      ctx.check('the refused call created no session', afterRefusal === before, { before, afterRefusal })
      const marked = await ctx.paced(() => pageFetch(page, { method: 'POST', path: '/api/auth/login', body: credentials }))
      ctx.check('the same body with the marker signs in', marked.status === 200 && !!marked.json?.sessionId, brief(marked))
      const afterSignIn = await sessionCount(config, user.usernameOrEmail)
      ctx.check('that sign-in is the one session added', afterSignIn === afterRefusal + 1, { afterRefusal, afterSignIn })
      ctx.require('a session to refresh exists', marked.status === 200 && !!marked.json?.refreshToken)

      // --- refresh ----------------------------------------------------------
      ctx.scope = 'refresh: '
      const g = marked.json.generation
      const r = marked.json.refreshToken
      const refreshUnmarked = await pageFetch(page, { method: 'POST', path: '/api/auth/refresh', body: { refreshToken: r }, marker: false })
      ctx.check('refused with 426 and the reload code', refused(refreshUnmarked), brief(refreshUnmarked))
      ctx.check('the refusal carries no token', tokensIn(refreshUnmarked.json).length === 0, tokensIn(refreshUnmarked.json))
      await sleep((config.graceSeconds + 3) * 1000)
      const second = await pageFetch(page, { method: 'POST', path: '/api/auth/refresh', body: { refreshToken: r } })
      ctx.check(
        'after grace + 3 s the same token, marked, rotates to G + 1',
        second.status === 200 && second.json?.generation === g + 1,
        { g, ...brief(second) },
      )
      ctx.check('with a different refresh token', second.status === 200 && second.json?.refreshToken !== r)
      let last = second
      if (second.status === 200) {
        const third = await pageFetch(page, { method: 'POST', path: '/api/auth/refresh', body: { refreshToken: second.json.refreshToken } })
        ctx.check('the next rotation gives exactly G + 2', third.status === 200 && third.json?.generation === g + 2, { g, ...brief(third) })
        if (third.status === 200) last = third
        const me = await pageFetch(page, { path: '/api/auth/me', bearer: last.json.accessToken })
        ctx.check('/auth/me answers 200 with the newest access token', me.status === 200, { status: me.status })
      }
      // Leave no session of the QA user behind.
      const cleanupToken = last.status === 200 ? last.json.refreshToken : r
      const logout = await pageFetch(page, { method: 'POST', path: '/api/auth/logout', body: { refreshToken: cleanupToken } })
      ctx.record('cleanupLogoutStatus', logout.status)

      // --- registration -----------------------------------------------------
      ctx.scope = 'registration: '
      if (!signInRefused) {
        ctx.check(
          'refused with 426 and the reload code',
          false,
          'not sent: the server did not refuse an unmarked sign-in, so an unmarked registration would create a real user',
        )
        return
      }
      const username = `qa_reg_${Date.now().toString(36)}`
      const password = `Qa.${randomBytes(9).toString('hex')}A1`
      const body = {
        username,
        email: `${username}@qa.invalid`,
        password,
        passwordConfirmation: password,
        firstName: 'QA',
        lastName: 'Refused',
      }
      const registration = await ctx.paced(() => pageFetch(page, { method: 'POST', path: '/api/auth/register', body, marker: false }))
      ctx.check('refused with 426 and the reload code', refused(registration), brief(registration))
      ctx.check('the refusal carries no token', tokensIn(registration.json).length === 0, tokensIn(registration.json))
      if (registration.status >= 200 && registration.status < 300) ctx.record('userCreatedByMistake', username)
      const asNewUser = await ctx.paced(() =>
        pageFetch(page, { method: 'POST', path: '/api/auth/login', body: { usernameOrEmail: username, password } }),
      )
      ctx.check('no such user exists: signing in as it answers 401', asNewUser.status === 401, brief(asNewUser))
    },
  },
]
