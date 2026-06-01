import { NotFoundException } from '@nestjs/common';
import {
  EntityManager,
  EntityTarget,
  FindOptionsRelations,
  ObjectLiteral,
  Repository,
} from 'typeorm';

/**
 * Select the repository to use for an entity: the transaction manager's repo
 * when a manager is supplied, otherwise the injected fallback repository.
 *
 * Centralises the `manager ? manager.getRepository(Entity) : this.fooRepository`
 * idiom so transactional methods stay backward-compatible (no manager → injected
 * repo, unchanged behaviour) without repeating the ternary at every call site.
 */
export function repoFor<T extends ObjectLiteral>(
  manager: EntityManager | undefined,
  entity: EntityTarget<T>,
  fallback: Repository<T>,
): Repository<T> {
  return manager ? manager.getRepository(entity) : fallback;
}

/**
 * Lock-read a single entity row `FOR UPDATE` inside a transaction and throw a
 * NotFoundException when it is absent. This is the shared first step of the
 * pessimistic-lock + single-transaction protocol used by the sales-order
 * transitions: open `dataSource.transaction`, then call this to take the row
 * lock before re-asserting any status guards on fresh, lock-held state.
 */
export async function lockRowForUpdate<T extends ObjectLiteral>(
  manager: EntityManager,
  entity: EntityTarget<T>,
  id: string,
  options?: { relations?: FindOptionsRelations<T>; notFoundMessage?: string },
): Promise<T> {
  const row = await manager.getRepository(entity).findOne({
    where: { id } as any,
    relations: options?.relations,
    lock: { mode: 'pessimistic_write' },
  });
  if (!row) {
    throw new NotFoundException(options?.notFoundMessage ?? 'Resource not found');
  }
  return row;
}
