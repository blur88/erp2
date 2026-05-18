import { DatabaseErrorCode } from '../types/error-response.interface';
import { ErrorClassifierService } from './error-classifier.service';

describe('ErrorClassifierService', () => {
  let service: ErrorClassifierService;

  beforeEach(() => {
    service = new ErrorClassifierService();
  });

  describe('getConstraintType', () => {
    it('returns "duplicate" for duplicate key message', () => {
      expect(service.getConstraintType('duplicate key value violates unique constraint')).toBe('duplicate');
    });

    it('returns "duplicate" for already exists message', () => {
      expect(service.getConstraintType('already exists')).toBe('duplicate');
    });

    it('returns "foreign" for foreign key message', () => {
      expect(service.getConstraintType('violates foreign key constraint')).toBe('foreign');
    });

    it('returns "null" for not null message', () => {
      expect(service.getConstraintType('null value in column violates not-null constraint')).toBe('null');
    });

    it('returns "null" for null value message', () => {
      expect(service.getConstraintType('null value in column')).toBe('null');
    });

    it('returns "check" for check constraint message', () => {
      expect(service.getConstraintType('violates check constraint')).toBe('check');
    });

    it('returns "unknown" for unrecognised message', () => {
      expect(service.getConstraintType('something completely different')).toBe('unknown');
    });
  });

  describe('getErrorResponse', () => {
    it('returns duplicate entry response', () => {
      const result = service.getErrorResponse('duplicate', false);
      expect(result.code).toBe(DatabaseErrorCode.DUPLICATE_ENTRY);
      expect(result.message).toMatch(/unique/i);
    });

    it('returns foreign key response', () => {
      const result = service.getErrorResponse('foreign', false);
      expect(result.code).toBe(DatabaseErrorCode.FOREIGN_KEY_VIOLATION);
    });

    it('returns not-null response', () => {
      const result = service.getErrorResponse('null', false);
      expect(result.code).toBe(DatabaseErrorCode.NOT_NULL_VIOLATION);
    });

    it('returns check constraint response', () => {
      const result = service.getErrorResponse('check', false);
      expect(result.code).toBe(DatabaseErrorCode.CHECK_CONSTRAINT);
    });

    it('returns unknown error for unrecognised type', () => {
      const result = service.getErrorResponse('unknown', false);
      expect(result.code).toBe(DatabaseErrorCode.UNKNOWN_ERROR);
    });
  });

  describe('getGenericError', () => {
    it('returns unknown error code', () => {
      const result = service.getGenericError(false);
      expect(result.code).toBe(DatabaseErrorCode.UNKNOWN_ERROR);
    });

    it('uses provided requestId', () => {
      const result = service.getGenericError(false, 'test-id');
      expect(result.requestId).toBe('test-id');
    });

    it('generates a fallback requestId when none provided', () => {
      const result = service.getGenericError(false);
      expect(result.requestId).toBeTruthy();
    });
  });
});
