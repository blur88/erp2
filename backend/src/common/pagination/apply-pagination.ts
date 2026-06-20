import { SelectQueryBuilder, FindManyOptions } from 'typeorm';

export function applyPagination<T>(
  qb: SelectQueryBuilder<T>,
  page?: number,
  limit?: number,
): SelectQueryBuilder<T> {
  if (page !== undefined && limit !== undefined) {
    qb.skip((page - 1) * limit).take(limit);
  }
  return qb;
}

export function paginationOptions(
  page?: number,
  limit?: number,
): Pick<FindManyOptions, 'skip' | 'take'> {
  if (page !== undefined && limit !== undefined) {
    return { skip: (page - 1) * limit, take: limit };
  }
  return {};
}
