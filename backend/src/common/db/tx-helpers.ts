import { NotFoundException } from "@nestjs/common";
import {
  EntityManager,
  EntityTarget,
  FindOptionsRelations,
  ObjectLiteral,
  Repository,
} from "typeorm";

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
 *
 * The lock is always taken on the BARE row (no relations). Postgres rejects
 * `SELECT … FOR UPDATE` when the query contains a LEFT JOIN to a nullable side
 * ("FOR UPDATE cannot be applied to the nullable side of an outer join"), which
 * is exactly what TypeORM emits when `relations` are loaded via join. When
 * `relations` are requested we therefore lock the bare row first, then re-load it
 * with its relations in a second query on the same manager — still inside the
 * transaction, so the row lock acquired in step one is held throughout.
 */
export async function lockRowForUpdate<T extends ObjectLiteral>(
  manager: EntityManager,
  entity: EntityTarget<T>,
  id: string,
  options?: { relations?: FindOptionsRelations<T>; notFoundMessage?: string },
): Promise<T> {
  const repo = manager.getRepository(entity);

  // Step 1: lock the bare row FOR UPDATE (no join, so the lock is valid).
  const locked = await repo.findOne({
    where: { id } as any,
    lock: { mode: "pessimistic_write" },
  });
  if (!locked) {
    throw new NotFoundException(
      options?.notFoundMessage ?? "Resource not found",
    );
  }

  // Step 2: hydrate relations in a separate (unlocked) read within the same
  // transaction. The row is already lock-held, so this view is consistent.
  if (options?.relations) {
    const withRelations = await repo.findOne({
      where: { id } as any,
      relations: options.relations,
    });
    // The row exists and is locked; the re-read cannot legitimately miss it.
    if (withRelations) return withRelations;
  }

  return locked;
}
