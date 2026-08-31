import { FormBService } from './form-b.service';
import type { PlAccount } from './profit-and-loss.types';

const acc = (over: Partial<PlAccount> = {}): PlAccount => ({
  id: 'inv', code: '1300', name: 'Inventory', type: 'Asset',
  parentId: null, isPostable: true, ...over,
});

// Only validateRoot is exercised here — it is pure, so the repositories and
// collaborators are irrelevant and passed as nulls.
const service = () => new FormBService(
  null as any, null as any, null as any, null as any, null as any, null as any,
);

const validate = (
  id: string | null,
  accounts: PlAccount[],
  over: { cyclicIds?: Set<string>; danglingIds?: Set<string> } = {},
) => service().validateRoot({
  id, expectedType: 'Asset', accounts,
  cyclicIds: over.cyclicIds ?? new Set(),
  danglingIds: over.danglingIds ?? new Set(),
});

describe('FormBService.validateRoot', () => {
  it('accepts a present, correctly-typed, well-formed root', () => {
    expect(validate('inv', [acc()])).toEqual({ ok: true, id: 'inv' });
  });

  it('reports an unset root as missing, not invalid', () => {
    expect(validate(null, [acc()])).toEqual({ ok: false, kind: 'missing' });
  });

  it('reports a root that names no account', () => {
    expect(validate('ghost', [acc()]))
      .toEqual({ ok: false, kind: 'invalid', detail: 'notFound' });
  });

  it('reports a wrong-type root', () => {
    expect(validate('inv', [acc({ type: 'Income' })]))
      .toEqual({ ok: false, kind: 'invalid', detail: 'wrongType' });
  });

  it('reports a dangling parent anywhere in the subtree', () => {
    const child = acc({ id: 'c1', parentId: 'inv' });
    expect(validate('inv', [acc(), child], { danglingIds: new Set(['c1']) }))
      .toEqual({ ok: false, kind: 'invalid', detail: 'dangling' });
  });

  // getRollup() recurses with NO visited set (account-balance.service.ts:40),
  // so a cyclic subtree is unbounded recursion. This must be caught BEFORE any
  // rollup runs. The test asserting termination is in Task 8.
  it('reports a cycle in the subtree', () => {
    const child = acc({ id: 'c1', parentId: 'inv' });
    expect(validate('inv', [acc(), child], { cyclicIds: new Set(['c1']) }))
      .toEqual({ ok: false, kind: 'invalid', detail: 'cyclic' });
  });

  it('ignores a cycle that is outside the validated subtree', () => {
    const elsewhere = acc({ id: 'x1', parentId: null, code: '6000' });
    expect(validate('inv', [acc(), elsewhere], { cyclicIds: new Set(['x1']) }))
      .toEqual({ ok: true, id: 'inv' });
  });
});
