import { test } from 'node:test'
import assert from 'node:assert/strict'
import { classifyState, mergeProbeResults } from './limiter-probe.mjs'

const BOTH_ESTABLISHED = {
  handlerOrder: { status: 'established', finding: 'limit_conn runs first', evidence: ['a', 'b'] },
  delayedCountedByLimitConn: { status: 'established', finding: 'not counted', evidence: ['c'] },
}

test('a state observed with limiter-specific evidence is reachable', () => {
  const s = classifyState({
    observed: true,
    evidence: ['E1 saw lconn=REJECTED on 3 lines'],
    answers: BOTH_ESTABLISHED,
  })
  assert.equal(s.status, 'reachable')
  assert.deepEqual(s.evidence, ['E1 saw lconn=REJECTED on 3 lines'])
  assert.equal(s.explanation, null)
})

test('never observed, with an explanation resting on established answers, is unreachable', () => {
  const s = classifyState({
    observed: false,
    explanation: 'limit_conn refuses the eleventh concurrent request, and only ten can be in flight',
    answers: BOTH_ESTABLISHED,
  })
  assert.equal(s.status, 'unreachable')
  assert.match(s.explanation, /limit_conn/)
})

test('never observed and no explanation is unresolved: could not provoke it is not a reason', () => {
  const s = classifyState({ observed: false, answers: BOTH_ESTABLISHED })
  assert.equal(s.status, 'unresolved')
  assert.equal(s.explanation, null)
})

test('never observed, an explanation given, but handlerOrder unresolved, is unresolved', () => {
  const s = classifyState({
    observed: false,
    explanation: 'because of the handler order',
    answers: {
      handlerOrder: { status: 'unresolved', finding: 'source and experiment disagree', evidence: [] },
      delayedCountedByLimitConn: BOTH_ESTABLISHED.delayedCountedByLimitConn,
    },
  })
  assert.equal(s.status, 'unresolved')
  assert.equal(s.explanation, null)
})

test('an explanation that rests on delayedCountedByLimitConn being unresolved cannot stand either', () => {
  const s = classifyState({
    observed: false,
    explanation: 'because delayed requests do not hold a connection',
    answers: {
      handlerOrder: BOTH_ESTABLISHED.handlerOrder,
      delayedCountedByLimitConn: { status: 'unresolved', finding: '', evidence: [] },
    },
  })
  assert.equal(s.status, 'unresolved')
})

test('maxSimultaneousImmediate travels with the state that measured it', () => {
  const s = classifyState({ observed: true, maxSimultaneousImmediate: 7, answers: BOTH_ESTABLISHED })
  assert.equal(s.maxSimultaneousImmediate, 7)
  assert.equal('maxSimultaneousImmediate' in classifyState({ observed: true, answers: BOTH_ESTABLISHED }), false)
})

test('merging two runs that agree keeps every entry', () => {
  const a = { answers: { handlerOrder: { status: 'established', finding: 'x', evidence: ['1'] } }, states: { immediate: { status: 'reachable', evidence: ['e'], explanation: null } } }
  const b = structuredClone(a)
  const merged = mergeProbeResults(a, b)
  assert.equal(merged.answers.handlerOrder.status, 'established')
  assert.equal(merged.answers.handlerOrder.finding, 'x')
  assert.equal(merged.states.immediate.status, 'reachable')
})

test('two runs whose evidence differs but whose statuses agree agree', () => {
  // The counts quoted in the evidence are measurements and differ every run;
  // only a difference of status is a disagreement.
  const a = { answers: { handlerOrder: { status: 'established', finding: 'x', evidence: ['run1: 2 refusals'] } }, states: {} }
  const b = { answers: { handlerOrder: { status: 'established', finding: 'x', evidence: ['run2: 3 refusals'] } }, states: {} }
  const merged = mergeProbeResults(a, b)
  assert.equal(merged.answers.handlerOrder.status, 'established')
  assert.match(merged.answers.handlerOrder.evidence.at(-1), /second run agreed/)
})

test('two runs that disagree on maxSimultaneousImmediate do not agree', () => {
  const a = { answers: {}, states: { immediate: { status: 'reachable', evidence: ['a'], explanation: null, maxSimultaneousImmediate: 10 } } }
  const b = { answers: {}, states: { immediate: { status: 'reachable', evidence: ['b'], explanation: null, maxSimultaneousImmediate: 15 } } }
  const merged = mergeProbeResults(a, b)
  assert.equal(merged.states.immediate.status, 'unresolved')
  assert.match(merged.states.immediate.evidence[0], /10/)
  assert.match(merged.states.immediate.evidence[1], /15/)
})

test('merging two runs that disagree marks the differing answer unresolved and records both', () => {
  const a = { answers: { handlerOrder: { status: 'established', finding: 'conn first', evidence: ['run1'] } }, states: {} }
  const b = { answers: { handlerOrder: { status: 'established', finding: 'req first', evidence: ['run2'] } }, states: {} }
  const merged = mergeProbeResults(a, b)
  assert.equal(merged.answers.handlerOrder.status, 'unresolved')
  assert.equal(merged.answers.handlerOrder.finding, '')
  assert.equal(merged.answers.handlerOrder.evidence.length, 2)
  assert.match(merged.answers.handlerOrder.evidence[0], /run1/)
  assert.match(merged.answers.handlerOrder.evidence[1], /run2/)
})

test('merging two runs that disagree marks the differing state unresolved and records both', () => {
  const a = { answers: {}, states: { delayed: { status: 'reachable', evidence: ['run1'], explanation: null } } }
  const b = { answers: {}, states: { delayed: { status: 'unreachable', evidence: ['run2'], explanation: 'why' } } }
  const merged = mergeProbeResults(a, b)
  assert.equal(merged.states.delayed.status, 'unresolved')
  assert.equal(merged.states.delayed.explanation, null)
  assert.equal(merged.states.delayed.evidence.length, 2)
})
