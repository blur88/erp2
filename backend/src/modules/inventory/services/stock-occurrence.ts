import { EntityManager } from 'typeorm';
import { StockOccurrence, StockOccurrenceKind } from '../../../database/entities/stock-occurrence.entity';

export interface CreateOccurrenceInput {
  kind: StockOccurrenceKind;
  documentType: string;
  documentId: string;
  occurredAt: Date;
  actorUserId?: string;
  actorUsername?: string;
  reversesOccurrenceId?: string;
  postedAmount?: number;
  isLegacy?: boolean;
  legacyJournalEntryId?: string;
  reason?: string;
}

export async function createOccurrence(
  manager: EntityManager,
  input: CreateOccurrenceInput,
): Promise<StockOccurrence> {
  const repo = manager.getRepository(StockOccurrence);
  const occurrence = repo.create({
    kind: input.kind,
    documentType: input.documentType,
    documentId: input.documentId,
    occurredAt: input.occurredAt,
    actorUserId: input.actorUserId,
    actorUsername: input.actorUsername,
    reversesOccurrenceId: input.reversesOccurrenceId,
    postedAmount: input.postedAmount,
    isLegacy: input.isLegacy ?? false,
    legacyJournalEntryId: input.legacyJournalEntryId,
    reason: input.reason,
  } as any);
  return repo.save(occurrence) as any;
}

export async function nextProductSequence(
  manager: EntityManager,
  productId: string,
): Promise<string> {
  const rows = await manager.query(
    `SELECT COALESCE(MAX("productSequence"), 0) + 1 AS seq FROM stock_movements WHERE "productId" = $1`,
    [productId],
  );
  return String(rows[0].seq);
}
