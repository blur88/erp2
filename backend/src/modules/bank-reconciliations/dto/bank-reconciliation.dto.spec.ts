import { plainToInstance } from 'class-transformer';
import { validate } from 'class-validator';
import {
  CreateBankReconciliationDto,
  UpdateBankReconciliationDto,
  EligibleLinesSearchDto,
  PreviewDto,
  SetupChangeDto,
} from './bank-reconciliation.dto';
import { SetupClassification } from '../entities/bank-reconciliation.entity';

const validUuid1 = 'a0000000-0000-4000-8000-000000000001';
const validUuid2 = 'a0000000-0000-4000-8000-000000000002';

const errs = async (cls: any, payload: Record<string, unknown>) => validate(plainToInstance(cls, payload));
const props = (e: Awaited<ReturnType<typeof validate>>) => e.map((x) => x.property);

describe('bank-reconciliation DTOs', () => {
  describe('balance format validation', () => {
    it.each(['-350.00', '0', '12.5', '100.00', '-0.01', '0.00'])('accepts valid balance %p', async (val) => {
      const payload = {
        bankAccountId: validUuid1,
        periodTo: '2026-10-31',
        closingBalance: val,
        matchedLineIds: [validUuid2],
      };
      const errors = await errs(CreateBankReconciliationDto, payload);
      expect(props(errors)).not.toContain('closingBalance');
    });

    it.each(['1.234', '1e3', '', 'abc', '12.345', '10.'])('rejects invalid balance %p', async (val) => {
      const payload = {
        bankAccountId: validUuid1,
        periodTo: '2026-10-31',
        closingBalance: val,
        matchedLineIds: [validUuid2],
      };
      const errors = await errs(CreateBankReconciliationDto, payload);
      expect(props(errors)).toContain('closingBalance');
    });

    it.each(['-350.00', '0', '12.5'])('accepts valid openingBalance %p on DraftContextDto', async (val) => {
      const payload = {
        bankAccountId: validUuid1,
        periodTo: '2026-10-31',
        openingBalance: val,
        view: 'checklist',
      };
      const errors = await errs(EligibleLinesSearchDto, payload);
      expect(props(errors)).not.toContain('openingBalance');
    });

    it.each(['1.234', '1e3', ''])('rejects invalid openingBalance %p on DraftContextDto', async (val) => {
      const payload = {
        bankAccountId: validUuid1,
        periodTo: '2026-10-31',
        openingBalance: val,
        view: 'checklist',
      };
      const errors = await errs(EligibleLinesSearchDto, payload);
      expect(props(errors)).toContain('openingBalance');
    });
  });

  describe('date validation', () => {
    it('rejects invalid calendar dates like 2026-13-01', async () => {
      const payload = {
        bankAccountId: validUuid1,
        periodTo: '2026-13-01',
        closingBalance: '100.00',
        matchedLineIds: [],
      };
      const errors = await errs(CreateBankReconciliationDto, payload);
      expect(props(errors)).toContain('periodTo');
    });

    it('rejects invalid periodFrom', async () => {
      const payload = {
        bankAccountId: validUuid1,
        periodFrom: '2026-02-30',
        periodTo: '2026-03-31',
        closingBalance: '100.00',
        matchedLineIds: [],
      };
      const errors = await errs(CreateBankReconciliationDto, payload);
      expect(props(errors)).toContain('periodFrom');
    });
  });

  describe('UUID validation', () => {
    it('requires matchedLineIds to be UUIDs', async () => {
      const payload = {
        bankAccountId: validUuid1,
        periodTo: '2026-10-31',
        matchedLineIds: ['not-a-uuid'],
      };
      const errors = await errs(PreviewDto, payload);
      expect(props(errors)).toContain('matchedLineIds');
    });

    it('requires setupChanges[].journalEntryLineId to be UUID', async () => {
      const payload = {
        journalEntryLineId: 'not-a-uuid',
        classification: SetupClassification.CLEARED,
      };
      const errors = await errs(SetupChangeDto, payload);
      expect(props(errors)).toContain('journalEntryLineId');
    });
  });

  describe('classification enum validation', () => {
    it.each(['CLEARED', 'OUTSTANDING', 'UNCLASSIFIED'])('accepts valid classification %p', async (c) => {
      const payload = {
        journalEntryLineId: validUuid1,
        classification: c,
      };
      const errors = await errs(SetupChangeDto, payload);
      expect(errors).toHaveLength(0);
    });

    it.each(['MATCHED', 'UNKNOWN', '', 123])('rejects invalid classification %p', async (c) => {
      const payload = {
        journalEntryLineId: validUuid1,
        classification: c,
      };
      const errors = await errs(SetupChangeDto, payload);
      expect(props(errors)).toContain('classification');
    });
  });

  describe('limit validation', () => {
    it('accepts limit <= 100', async () => {
      const payload = {
        bankAccountId: validUuid1,
        periodTo: '2026-10-31',
        view: 'checklist',
        limit: 100,
      };
      const errors = await errs(EligibleLinesSearchDto, payload);
      expect(errors).toHaveLength(0);
    });

    it('rejects limit > 100', async () => {
      const payload = {
        bankAccountId: validUuid1,
        periodTo: '2026-10-31',
        view: 'checklist',
        limit: 101,
      };
      const errors = await errs(EligibleLinesSearchDto, payload);
      expect(props(errors)).toContain('limit');
    });
  });
});
