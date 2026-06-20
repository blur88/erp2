import { applyPagination, paginationOptions } from './apply-pagination';

describe('applyPagination', () => {
  const makeQb = () => {
    const qb: any = { skip: jest.fn(() => qb), take: jest.fn(() => qb) };
    return qb;
  };

  it('applies skip/take when both params present', () => {
    const qb = makeQb();
    applyPagination(qb, 3, 20);
    expect(qb.skip).toHaveBeenCalledWith(40);
    expect(qb.take).toHaveBeenCalledWith(20);
  });

  it('treats page=0 as present (still applies)', () => {
    const qb = makeQb();
    applyPagination(qb, 0, 20);
    expect(qb.skip).toHaveBeenCalled();
  });

  it('no-op when page undefined', () => {
    const qb = makeQb();
    applyPagination(qb, undefined, 20);
    expect(qb.skip).not.toHaveBeenCalled();
    expect(qb.take).not.toHaveBeenCalled();
  });

  it('no-op when limit undefined', () => {
    const qb = makeQb();
    applyPagination(qb, 2, undefined);
    expect(qb.skip).not.toHaveBeenCalled();
  });
});

describe('paginationOptions', () => {
  it('returns skip/take when both present', () => {
    expect(paginationOptions(2, 10)).toEqual({ skip: 10, take: 10 });
  });
  it('returns empty object when absent', () => {
    expect(paginationOptions(undefined, 10)).toEqual({});
    expect(paginationOptions(2, undefined)).toEqual({});
  });
});
