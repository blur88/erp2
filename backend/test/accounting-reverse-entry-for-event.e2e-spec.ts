import { ConflictException, INestApplication } from '@nestjs/common';
import { Test } from '@nestjs/testing';
import { DataSource, QueryRunner } from 'typeorm';
import { AppModule } from '../src/app.module';
import {
  ACCOUNTING_POSTING_PORT,
  AccountingPostingPort,
} from '../src/common/accounting-posting/accounting-posting.port';
import {
  AccountingSourceType,
  PostingType,
} from '../src/common/accounting-posting/enums';
import { configureTestAppValidation } from './utils/configure-test-app-validation';

/**
 * e2e for AccountingPostingService.reverseEntryForEvent (issue #1401, P3).
 *
 * The method implements "The entry-lookup rule" for one event: find exactly
 * one payment's original journal entry and either reverse it or return its
 * existing reversal. It is a query, so it runs against a real DB.
 *
 * Every case seeds raw journal rows (accounts included) inside a transaction
 * that is ALWAYS rolled back — the suite owns its rows and leaves no trace.
 */

let app: INestApplication;
let ds: DataSource;
let posting: AccountingPostingPort;

const uuid = (n: number): string =>
  `00000000-0000-4000-9000-${String(n).padStart(12, '0')}`;

const PO_ID = uuid(11);
const OTHER_PO_ID = uuid(12);
const EVENT_ID = uuid(21);

// Postable accounts owned by this suite; the reversal re-reads them.
const ACCOUNT_A = uuid(31);
const ACCOUNT_B = uuid(32);

let journalSeq = 0;
const nextJournalNo = (): string => `VP-REV-${++journalSeq}`;

beforeAll(async () => {
  const moduleFixture = await Test.createTestingModule({
    imports: [AppModule],
  }).compile();
  app = moduleFixture.createNestApplication();
  configureTestAppValidation(app);
  await app.init();
  ds = app.get(DataSource);
  posting = app.get(ACCOUNTING_POSTING_PORT);
});

afterAll(async () => {
  await app.close();
});

/** Runs `fn` inside a transaction that is ALWAYS rolled back. */
async function inRolledBackTxn(
  fn: (qr: QueryRunner) => Promise<void>,
): Promise<void> {
  const qr = ds.createQueryRunner();
  await qr.connect();
  await qr.startTransaction();
  try {
    await fn(qr);
  } finally {
    await qr.rollbackTransaction();
    await qr.release();
  }
}

async function seedAccounts(qr: QueryRunner): Promise<void> {
  await qr.query(
    `INSERT INTO chart_of_account (id, code, name, type, "isPostable", "isSystem")
     VALUES ($1, 'VPREV-A', 'Vendor payment reversal debit', 'Asset', true, true),
            ($2, 'VPREV-B', 'Vendor payment reversal credit', 'Asset', true, true)`,
    [ACCOUNT_A, ACCOUNT_B],
  );
}

interface SeedEntry {
  id: string;
  postingType: PostingType;
  sourceDocumentId: string | null;
  reversalOfEntryId?: string | null;
}

async function seedEntry(qr: QueryRunner, entry: SeedEntry): Promise<void> {
  await qr.query(
    `INSERT INTO journal_entry
       (id, "journalNo", "entryDate", "sourceType", "sourceDocumentId", "sourceEventId",
        "postingType", "reversalOfEntryId")
     VALUES ($1, $2, DATE '2026-07-15', 'PURCHASE_ORDER', $3, $4, $5, $6)`,
    [
      entry.id,
      nextJournalNo(),
      entry.sourceDocumentId,
      EVENT_ID,
      entry.postingType,
      entry.reversalOfEntryId ?? null,
    ],
  );
  // An original carries Dr A / Cr B, its reversal carries the swap.
  const originalLines = !entry.reversalOfEntryId;
  await qr.query(
    `INSERT INTO journal_entry_line ("entryId", "accountId", debit, credit)
     VALUES ($1, $2, $3, $4), ($1, $5, $6, $7)`,
    originalLines
      ? [entry.id, ACCOUNT_A, '100.0000', '0.0000', ACCOUNT_B, '0.0000', '100.0000']
      : [entry.id, ACCOUNT_A, '0.0000', '100.0000', ACCOUNT_B, '100.0000', '0.0000'],
  );
}

async function eventEntryCount(qr: QueryRunner): Promise<number> {
  const rows: Array<{ count: number }> = await qr.query(
    `SELECT count(*)::int AS count FROM journal_entry
      WHERE "sourceType" = 'PURCHASE_ORDER' AND "sourceEventId" = $1`,
    [EVENT_ID],
  );
  return rows[0].count;
}

function cmd(overrides: Record<string, unknown> = {}) {
  return {
    sourceType: AccountingSourceType.PURCHASE_ORDER,
    sourceDocumentId: PO_ID,
    sourceEventId: EVENT_ID,
    expectedPostingType: PostingType.PURCHASE_PAYMENT,
    otherPostingTypes: [PostingType.PURCHASE_REFUND],
    entryDate: '2026-07-20',
    createdBy: 'tester',
    ...overrides,
  };
}

async function captureConflict(
  fn: () => Promise<unknown>,
): Promise<ConflictException> {
  try {
    await fn();
  } catch (error) {
    expect(error).toBeInstanceOf(ConflictException);
    return error as ConflictException;
  }
  throw new Error('Expected the call to reject with ConflictException');
}

function conflictMessage(error: ConflictException): {
  text: string;
  reason: string;
  sourceEventId: string;
} {
  const response = error.getResponse() as {
    message: { text: string; reason: string; sourceEventId: string };
  };
  return response.message;
}

it('rejects original with outside-pair posting type', async () => {
  await inRolledBackTxn(async (qr) => {
    await seedAccounts(qr);
    const salesOriginalId = uuid(50);
    await seedEntry(qr, {
      id: salesOriginalId,
      postingType: PostingType.SALES_PAYMENT,
      sourceDocumentId: null,
      reversalOfEntryId: null,
    });
    const cmd = {
      sourceType: AccountingSourceType.PURCHASE_ORDER,
      sourceDocumentId: PO_ID,
      sourceEventId: EVENT_ID,
      expectedPostingType: PostingType.PURCHASE_PAYMENT,
      otherPostingTypes: [],
      entryDate: '2026-07-20',
      createdBy: 'tester',
    };
    await expect(
      posting.reverseEntryForEvent(cmd, qr.manager),
    ).rejects.toThrow(ConflictException);
  });
});

describe('AccountingPostingService.reverseEntryForEvent (e2e)', () => {
  it('reverses the unreversed expected original with swapped lines', async () => {
    await inRolledBackTxn(async (qr) => {
      await seedAccounts(qr);
      const original = uuid(101);
      await seedEntry(qr, {
        id: original,
        postingType: 'PURCHASE_PAYMENT',
        sourceDocumentId: PO_ID,
      });

      const result = await posting.reverseEntryForEvent(cmd(), qr.manager);

      expect(result.outcome).toBe('reversed');
      expect(result.reversalEntryId).toEqual(expect.any(String));
      expect(result.reversalEntryId).not.toBe(original);

      const [reversal] = await qr.query(
        `SELECT "reversalOfEntryId", "sourceEventId", "sourceDocumentId"
           FROM journal_entry WHERE id = $1`,
        [result.reversalEntryId],
      );
      expect(reversal.reversalOfEntryId).toBe(original);
      expect(reversal.sourceEventId).toBe(EVENT_ID);
      expect(reversal.sourceDocumentId).toBe(PO_ID);

      const lines: Array<{ accountId: string; debit: string; credit: string }> =
        await qr.query(
          `SELECT "accountId", debit, credit FROM journal_entry_line WHERE "entryId" = $1`,
          [result.reversalEntryId],
        );
      expect(lines).toHaveLength(2);
      const byAccount = new Map(lines.map((line) => [line.accountId, line]));
      expect(byAccount.get(ACCOUNT_A)).toMatchObject({
        debit: '0.0000',
        credit: '100.0000',
      });
      expect(byAccount.get(ACCOUNT_B)).toMatchObject({
        debit: '100.0000',
        credit: '0.0000',
      });

      expect(await eventEntryCount(qr)).toBe(2);
    });
  });

  it('returns the existing reversal without posting', async () => {
    await inRolledBackTxn(async (qr) => {
      await seedAccounts(qr);
      const original = uuid(102);
      const reversal = uuid(103);
      await seedEntry(qr, {
        id: original,
        postingType: 'PURCHASE_PAYMENT',
        sourceDocumentId: PO_ID,
      });
      await seedEntry(qr, {
        id: reversal,
        postingType: 'PURCHASE_PAYMENT',
        sourceDocumentId: PO_ID,
        reversalOfEntryId: original,
      });
      const before = await eventEntryCount(qr);

      const result = await posting.reverseEntryForEvent(cmd(), qr.manager);

      expect(result).toEqual({
        reversalEntryId: reversal,
        outcome: 'already_reversed',
      });
      expect(await eventEntryCount(qr)).toBe(before);
    });
  });

  it('returns no_original when the event has no original entry', async () => {
    await inRolledBackTxn(async (qr) => {
      await seedAccounts(qr);

      const result = await posting.reverseEntryForEvent(cmd(), qr.manager);

      expect(result).toEqual({
        reversalEntryId: null,
        outcome: 'no_original',
      });
      expect(await eventEntryCount(qr)).toBe(0);
    });
  });

  it('rejects an original of the other posting type', async () => {
    await inRolledBackTxn(async (qr) => {
      await seedAccounts(qr);
      await seedEntry(qr, {
        id: uuid(104),
        postingType: 'PURCHASE_REFUND',
        sourceDocumentId: PO_ID,
      });
      const before = await eventEntryCount(qr);

      const error = await captureConflict(() =>
        posting.reverseEntryForEvent(cmd(), qr.manager),
      );

      expect(conflictMessage(error).reason).toBe('unexpected_posting_type');
      expect(conflictMessage(error).sourceEventId).toBe(EVENT_ID);
      expect(conflictMessage(error).text).toEqual(expect.any(String));
      expect(await eventEntryCount(qr)).toBe(before);
    });
  });

  it('rejects when both the expected and the other type exist', async () => {
    await inRolledBackTxn(async (qr) => {
      await seedAccounts(qr);
      await seedEntry(qr, {
        id: uuid(105),
        postingType: 'PURCHASE_PAYMENT',
        sourceDocumentId: PO_ID,
      });
      await seedEntry(qr, {
        id: uuid(106),
        postingType: 'PURCHASE_REFUND',
        sourceDocumentId: PO_ID,
      });
      const before = await eventEntryCount(qr);

      const error = await captureConflict(() =>
        posting.reverseEntryForEvent(cmd(), qr.manager),
      );

      expect(conflictMessage(error).reason).toBe('unexpected_posting_type');
      expect(await eventEntryCount(qr)).toBe(before);
    });
  });

  it('rejects an expected original that belongs to another document', async () => {
    await inRolledBackTxn(async (qr) => {
      await seedAccounts(qr);
      await seedEntry(qr, {
        id: uuid(107),
        postingType: 'PURCHASE_PAYMENT',
        sourceDocumentId: OTHER_PO_ID,
      });
      const before = await eventEntryCount(qr);

      const error = await captureConflict(() =>
        posting.reverseEntryForEvent(cmd(), qr.manager),
      );

      expect(conflictMessage(error).reason).toBe('foreign_document');
      expect(conflictMessage(error).sourceEventId).toBe(EVENT_ID);
      expect(conflictMessage(error).text).toEqual(expect.any(String));
      expect(await eventEntryCount(qr)).toBe(before);
    });
  });

  it('ignores the reversal when finding the original', async () => {
    await inRolledBackTxn(async (qr) => {
      await seedAccounts(qr);
      const original = uuid(108);
      const reversal = uuid(109);
      await seedEntry(qr, {
        id: original,
        postingType: 'PURCHASE_PAYMENT',
        sourceDocumentId: PO_ID,
      });
      await seedEntry(qr, {
        id: reversal,
        postingType: 'PURCHASE_PAYMENT',
        sourceDocumentId: PO_ID,
        reversalOfEntryId: original,
      });

      const result = await posting.reverseEntryForEvent(cmd(), qr.manager);

      // The pair original+reversal is not ambiguous: the reversal row is not
      // mistaken for an original (which would attempt to reverse it again).
      expect(result).toEqual({
        reversalEntryId: reversal,
        outcome: 'already_reversed',
      });
      expect(await eventEntryCount(qr)).toBe(2);
    });
  });
});
