import { jest } from '@jest/globals';
import { FormBSettingsService } from './form-b-settings.service';

const makeService = (stored: any, printCompanyName: string) => {
  const repo = {
    findOne: (jest.fn as unknown as any)().mockResolvedValue(stored),
    create: (jest.fn as unknown as any)((v: any) => v),
    save: (jest.fn as unknown as any)((v: any) => Promise.resolve(v)),
  };
  const print = { getSettings: (jest.fn as unknown as any)().mockResolvedValue({ companyName: printCompanyName }) };
  return { service: new FormBSettingsService(repo as any, print as any), repo, print };
};

const EMPTY = {
  id: true, businessName: null, registrationNumber: null,
  businessCode: null, activityType: null,
};

describe('FormBSettingsService.resolve', () => {
  it('falls businessName back to Print Settings when no override is stored', async () => {
    const { service } = makeService(EMPTY, 'Acme Trading');
    const identity = await service.resolve();
    expect(identity.businessName).toEqual({
      value: 'Acme Trading', source: 'printSettings', override: null,
    });
  });

  it('prefers the Form B override over Print Settings', async () => {
    const { service } = makeService({ ...EMPTY, businessName: 'Acme Sdn Bhd' }, 'Acme Trading');
    const identity = await service.resolve();
    expect(identity.businessName).toEqual({
      value: 'Acme Sdn Bhd', source: 'formB', override: 'Acme Sdn Bhd',
    });
  });

  // PrintSettingsService.getSettings() seeds companyName as '' when no row
  // exists, so an empty string must read as ABSENT, not as a value.
  it('treats an empty Print Settings companyName as absent', async () => {
    const { service } = makeService(EMPTY, '');
    const identity = await service.resolve();
    expect(identity.businessName).toEqual({ value: null, source: null, override: null });
  });

  // PrintSettings has NO registration-number field — only companyName and a
  // free-text miscInfo, which must never be parsed for one.
  it('gives registrationNumber, businessCode and activityType no fallback', async () => {
    const { service } = makeService(EMPTY, 'Acme Trading');
    const identity = await service.resolve();
    for (const field of ['registrationNumber', 'businessCode', 'activityType'] as const) {
      expect(identity[field]).toEqual({ value: null, source: null, override: null });
    }
  });

  it('reports formB as the source for the three no-fallback fields when stored', async () => {
    const { service } = makeService(
      { ...EMPTY, registrationNumber: '201901234567', businessCode: '47111', activityType: 'Retail' },
      'Acme Trading',
    );
    const identity = await service.resolve();
    expect(identity.registrationNumber).toEqual({
      value: '201901234567', source: 'formB', override: '201901234567',
    });
    expect(identity.businessCode.value).toBe('47111');
    expect(identity.activityType.value).toBe('Retail');
  });
});

describe('FormBSettingsService.update', () => {
  it('normalises a whitespace-only value to null so the fallback re-engages', async () => {
    const { service, repo } = makeService(EMPTY, 'Acme Trading');
    await service.update({ businessName: '   ' } as any);
    expect(repo.save).toHaveBeenCalledWith(expect.objectContaining({ businessName: null }));
  });

  it('normalises whitespace-only on all four fields', async () => {
    const { service, repo } = makeService(EMPTY, 'Acme Trading');
    await service.update({
      businessName: ' ', registrationNumber: '\t', businessCode: '  ', activityType: '\n',
    } as any);
    expect(repo.save).toHaveBeenCalledWith(expect.objectContaining({
      businessName: null, registrationNumber: null, businessCode: null, activityType: null,
    }));
  });

  it('trims a real value rather than storing it padded', async () => {
    const { service, repo } = makeService(EMPTY, '');
    await service.update({ businessName: '  Acme Sdn Bhd  ' } as any);
    expect(repo.save).toHaveBeenCalledWith(expect.objectContaining({ businessName: 'Acme Sdn Bhd' }));
  });

  it('leaves omitted fields untouched', async () => {
    const { service, repo } = makeService({ ...EMPTY, activityType: 'Retail' }, '');
    await service.update({ businessName: 'Acme' } as any);
    expect(repo.save).toHaveBeenCalledWith(expect.objectContaining({ activityType: 'Retail' }));
  });
});
