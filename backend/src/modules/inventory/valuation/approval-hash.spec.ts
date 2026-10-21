import { contentHash } from './approval-hash';

describe('contentHash', () => {
  it('canonicalizes object key order but preserves array order', () => {
    expect(contentHash({ b: 2, a: 1 })).toBe(contentHash({ a: 1, b: 2 }));
    expect(contentHash({ rows: [1, 2] })).not.toBe(contentHash({ rows: [2, 1] }));
  });
});
