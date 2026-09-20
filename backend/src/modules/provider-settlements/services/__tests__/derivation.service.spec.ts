import { jest } from '@jest/globals';
import { BadRequestException } from '@nestjs/common';
import { ProviderSettlementDerivationService } from '../provider-settlement-derivation.service';
import { PostingType, AccountingSourceType } from '../../../../common/accounting-posting/enums';

const DEPOSIT = 'deposit-account-id';
const CLEARING = 'clearing-account-id';

function payment(over: Partial<any> = {}) {
  return { id: 'pay-1', salesOrderId: 'so-1', amount: '98.0000', ...over };
}

function entry(
  lines: Array<{ accountId: string; debit: string; credit: string }>,
  over: Partial<any> = {},
) {
  return {
    id: 'je-1',
    sourceType: AccountingSourceType.SALES_ORDER,
    sourceDocumentId: 'so-1',
    sourceEventId: 'pay-1',
    postingType: PostingType.SALES_PAYMENT,
    reversalOfEntryId: null,
    lines,
    ...over,
  };
}

const ACCOUNT_LABELS = [
  { id: CLEARING, code: '1240', name: 'Atome' },
  { id: 'old-clearing', code: '1250', name: 'Shopee' },
];

function makeService(entries: any[], reversals: any[] = []) {
  // Three repositories are read: JournalEntry (twice — the entry fetch, then
  // the reversal lookup) and ChartOfAccount (only on the mixed-account error
  // path). Dispatch on the entity so each gets the right rows.
  const journalFind = (jest.fn() as any)
    .mockResolvedValueOnce(entries) // the full-key entry fetch
    .mockResolvedValue(reversals); // reversedEntryIds()
  const manager = {
    getRepository: (entity: any) => {
      const name = typeof entity === 'function' ? entity.name : String(entity);
      if (name === 'ChartOfAccount') {
        return { find: (jest.fn() as any).mockResolvedValue(ACCOUNT_LABELS) };
      }
      return { find: journalFind };
    },
  } as any;
  const lookup = {
    resolveAccount: (jest.fn() as any).mockResolvedValue({ id: DEPOSIT }),
  } as any;
  return {
    service: new ProviderSettlementDerivationService(lookup),
    manager,
    journalFind,
  };
}

describe('ProviderSettlementDerivationService', () => {
  it('derives the debit side as clearing for a positive payment', async () => {
    const { service, manager } = makeService([
      entry([
        { accountId: CLEARING, debit: '98.0000', credit: '0.0000' },
        { accountId: DEPOSIT, debit: '0.0000', credit: '98.0000' },
      ]),
    ]);
    await expect(service.deriveClearingAccountId([payment()], manager)).resolves.toBe(CLEARING);
  });

  it('derives the credit side as clearing for a refund', async () => {
    const { service, manager } = makeService([
      entry(
        [
          { accountId: DEPOSIT, debit: '50.0000', credit: '0.0000' },
          { accountId: CLEARING, debit: '0.0000', credit: '50.0000' },
        ],
        { postingType: PostingType.SALES_REFUND },
      ),
    ]);
    const refund = payment({ amount: '-50.0000' });
    await expect(service.deriveClearingAccountId([refund], manager)).resolves.toBe(CLEARING);
  });

  it('rejects an empty payment selection', async () => {
    const { service, manager } = makeService([]);
    const result = service.deriveClearingAccountId([], manager);
    await expect(result).rejects.toBeInstanceOf(BadRequestException);
    await expect(result).rejects.toThrow(/Select at least one payment/);
  });

  describe('rejects malformed journal shapes rather than guessing', () => {
    const cases: Array<[string, any[], RegExp]> = [
      [
        'three lines',
        [
          { accountId: CLEARING, debit: '98.0000', credit: '0.0000' },
          { accountId: DEPOSIT, debit: '0.0000', credit: '98.0000' },
          { accountId: 'fee-account', debit: '2.0000', credit: '0.0000' },
        ],
        /has 3 lines, expected exactly 2/,
      ],
      [
        'one line',
        [{ accountId: CLEARING, debit: '98.0000', credit: '0.0000' }],
        /has 1 lines, expected exactly 2/,
      ],
      [
        'no customer deposit line',
        [
          { accountId: CLEARING, debit: '98.0000', credit: '0.0000' },
          { accountId: 'other-account', debit: '0.0000', credit: '98.0000' },
        ],
        /no customer deposit line/,
      ],
      [
        'both lines on the deposit account',
        [
          { accountId: DEPOSIT, debit: '98.0000', credit: '0.0000' },
          { accountId: DEPOSIT, debit: '0.0000', credit: '98.0000' },
        ],
        /both journal lines post to the customer deposit account/,
      ],
      [
        'clearing amount does not match the payment row',
        [
          { accountId: CLEARING, debit: '97.0000', credit: '0.0000' },
          { accountId: DEPOSIT, debit: '0.0000', credit: '98.0000' },
        ],
        /clearing line debit does not equal the payment amount/,
      ],
      [
        'debit and credit on the wrong sides',
        [
          { accountId: CLEARING, debit: '0.0000', credit: '98.0000' },
          { accountId: DEPOSIT, debit: '98.0000', credit: '0.0000' },
        ],
        /does not equal the payment amount/,
      ],
    ];

    it.each(cases)('rejects %s', async (_name, lines, expected) => {
      const { service, manager } = makeService([entry(lines)]);
      await expect(service.deriveClearingAccountId([payment()], manager)).rejects.toThrow(expected);
    });
  });

  it('rejects a payment whose entry was reversed (absent from the active query)', async () => {
    const { service, manager } = makeService([]);
    await expect(service.deriveClearingAccountId([payment()], manager)).rejects.toThrow(
      /has no active journal entry/,
    );
  });

  it('rejects a line carrying a value on both sides', async () => {
    const { service, manager } = makeService([
      entry([
        { accountId: CLEARING, debit: '98.0000', credit: '98.0000' },
        { accountId: DEPOSIT, debit: '0.0000', credit: '98.0000' },
      ]),
    ]);
    await expect(service.deriveClearingAccountId([payment()], manager)).rejects.toThrow(
      /clearing line credit must be zero/,
    );
  });

  it('rejects a payment matching more than one active entry', async () => {
    // A Map keyed only on sourceEventId would silently keep the last one.
    const { service, manager } = makeService([
      entry(
        [
          { accountId: CLEARING, debit: '98.0000', credit: '0.0000' },
          { accountId: DEPOSIT, debit: '0.0000', credit: '98.0000' },
        ],
        { id: 'je-1', journalNo: 'JE-26-001' },
      ),
      entry(
        [
          { accountId: CLEARING, debit: '98.0000', credit: '0.0000' },
          { accountId: DEPOSIT, debit: '0.0000', credit: '98.0000' },
        ],
        { id: 'je-2', journalNo: 'JE-26-002' },
      ),
    ]);
    await expect(service.deriveClearingAccountId([payment()], manager)).rejects.toThrow(
      /matches 2 active journal entries \(JE-26-001, JE-26-002\)/,
    );
  });

  it('rejects payments spanning two clearing accounts, naming both', async () => {
    const { service, manager } = makeService([
      entry([
        { accountId: CLEARING, debit: '98.0000', credit: '0.0000' },
        { accountId: DEPOSIT, debit: '0.0000', credit: '98.0000' },
      ]),
      entry(
        [
          { accountId: 'old-clearing', debit: '10.0000', credit: '0.0000' },
          { accountId: DEPOSIT, debit: '0.0000', credit: '10.0000' },
        ],
        { id: 'je-2', sourceEventId: 'pay-2' },
      ),
    ]);
    await expect(
      service.deriveClearingAccountId(
        [payment(), payment({ id: 'pay-2', amount: '10.0000' })],
        manager,
      ),
    ).rejects.toThrow(/1240 Atome: pay-1; 1250 Shopee: pay-2/);
  });
});
