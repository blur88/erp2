import { groupKey, groupPayments, classifyClaimedGroup, withProviderClearing } from '../settlement-groups';

describe('settlement-groups', () => {
  it('keys a group by sales order AND payment method', () => {
    expect(groupKey({ salesOrderId: 'so-1', paymentMethodId: 'pm-1' })).toBe('so-1:pm-1');
    expect(groupKey({ salesOrderId: 'so-1', paymentMethodId: 'pm-2' })).not.toBe(
      groupKey({ salesOrderId: 'so-1', paymentMethodId: 'pm-1' }),
    );
  });

  it('groups rows without letting one method bleed into another', () => {
    const groups = groupPayments([
      { id: 'a', salesOrderId: 'so-1', paymentMethodId: 'atome' },
      { id: 'b', salesOrderId: 'so-1', paymentMethodId: 'atome' },
      { id: 'c', salesOrderId: 'so-1', paymentMethodId: 'tiktok' },
    ]);
    expect(groups.get('so-1:atome')!.map((r) => r.id)).toEqual(['a', 'b']);
    expect(groups.get('so-1:tiktok')!.map((r) => r.id)).toEqual(['c']);
  });

  describe('classifyClaimedGroup', () => {
    const p = (id: string, amount: string) => ({ id, amount });

    it('is current only when ids AND every amount match', () => {
      expect(classifyClaimedGroup([p('a', '100.0000')], [p('a', '100.0000')])).toBe('current');
    });

    it('is changed when membership differs even though the net is equal', () => {
      // +50 payment and −50 refund added: net still 100, group is NOT the same.
      expect(
        classifyClaimedGroup(
          [p('a', '100.0000')],
          [p('a', '100.0000'), p('b', '50.0000'), p('c', '-50.0000')],
        ),
      ).toBe('changed');
    });

    it('is changed on snapshot drift with the same ids', () => {
      expect(classifyClaimedGroup([p('a', '100.0000')], [p('a', '90.0000')])).toBe('changed');
    });

    it('is zero when the current set nets to zero', () => {
      expect(classifyClaimedGroup([p('a', '100.0000')], [p('a', '100.0000'), p('r', '-100.0000')])).toBe('zero');
    });

    it('is ineligible when nothing is eligible any more', () => {
      expect(classifyClaimedGroup([p('a', '100.0000')], [])).toBe('ineligible');
    });
  });

  describe('withProviderClearing (#1285, spec §8)', () => {
    it.each(['current', 'changed', 'zero'] as const)('%s + derived unflagged ⇒ not_provider_clearing', (s) => {
      expect(withProviderClearing(s, { ok: true, flagged: false })).toBe('not_provider_clearing');
    });
    it('ineligible is preserved and never reclassified, even when derivation finds an unflagged account', () => {
      expect(withProviderClearing('ineligible', { ok: true, flagged: false })).toBe('ineligible');
    });
    it.each(['current', 'changed', 'zero', 'ineligible'] as const)('%s + derivation failure ⇒ unchanged', (s) => {
      expect(withProviderClearing(s, { ok: false })).toBe(s);
    });
    it('a flagged account leaves the state unchanged', () => {
      expect(withProviderClearing('changed', { ok: true, flagged: true })).toBe('changed');
    });
  });
});
