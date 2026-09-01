import { jest } from '@jest/globals';
import { FormBController } from './form-b.controller';
import { FormBMappingController } from './form-b-mapping.controller';

describe('Form B controllers', () => {
  it('passes the validated year straight through to the service', async () => {
    const service = { getFormB: (jest.fn as unknown as any)().mockResolvedValue({ year: 2025 }) };
    const controller = new FormBController(service as any);
    await controller.get({ year: 2025 } as any);
    expect(service.getFormB).toHaveBeenCalledWith({ year: 2025 });
  });

  it('forwards accountId and category on a mapping PUT', async () => {
    const service = { list: (jest.fn as unknown as any)().mockResolvedValue([]), setCategory: (jest.fn as unknown as any)() };
    const controller = new FormBMappingController(service as any);
    await controller.update('a1', { category: 'RENT_LEASE' } as any);
    expect(service.setCategory).toHaveBeenCalledWith('a1', 'RENT_LEASE');
  });

  it('forwards an explicit null category as a clear', async () => {
    const service = { list: (jest.fn as unknown as any)(), setCategory: (jest.fn as unknown as any)() };
    const controller = new FormBMappingController(service as any);
    await controller.update('a1', { category: null } as any);
    expect(service.setCategory).toHaveBeenCalledWith('a1', null);
  });
});
