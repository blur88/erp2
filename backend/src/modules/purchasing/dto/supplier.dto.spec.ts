import { plainToInstance } from 'class-transformer';
import { SupplierQueryDto } from './supplier.dto';

describe('SupplierQueryDto', () => {
  function make(raw: Record<string, unknown> = {}): SupplierQueryDto {
    return plainToInstance(SupplierQueryDto, raw);
  }

  describe('isActive transform', () => {
    it('returns undefined when isActive is not provided', () => {
      const dto = make({});
      expect(dto.isActive).toBeUndefined();
    });

    it('returns true when isActive is the string "true"', () => {
      const dto = make({ isActive: 'true' });
      expect(dto.isActive).toBe(true);
    });

    it('returns false when isActive is the string "false"', () => {
      const dto = make({ isActive: 'false' });
      expect(dto.isActive).toBe(false);
    });

    it('returns true when isActive is the boolean true', () => {
      const dto = make({ isActive: true });
      expect(dto.isActive).toBe(true);
    });

    it('returns undefined when isActive is an empty string', () => {
      const dto = make({ isActive: '' });
      expect(dto.isActive).toBeUndefined();
    });

    it('returns undefined when isActive is null', () => {
      const dto = make({ isActive: null });
      expect(dto.isActive).toBeUndefined();
    });
  });
});
