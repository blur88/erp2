import { plainToInstance } from 'class-transformer';
import { validate } from 'class-validator';
import { CreateProviderSettlementDto, UpdateProviderSettlementDto } from './provider-settlement.dto';

const so = '3f1e4b9a-0000-4000-8000-000000000001';
const pm = '3f1e4b9a-0000-4000-8000-000000000002';
const pm2 = '3f1e4b9a-0000-4000-8000-000000000003';
const row = (over: Record<string, unknown> = {}) => ({ salesOrderId: so, paymentMethodId: pm, expectedNetAmount: '70.00', ...over });
const base = {
  bankAccountId: '3f1e4b9a-0000-4000-8000-000000000009',
  settlementDate: '2026-09-20',
  settlementAmount: '70.00',
  rows: [row()],
};
const errs = async (cls: any, payload: Record<string, unknown>) => validate(plainToInstance(cls, payload));
const props = (e: Awaited<ReturnType<typeof validate>>) => e.map((x) => x.property);

describe('CreateProviderSettlementDto', () => {
  it('accepts a valid body', async () => {
    expect(await errs(CreateProviderSettlementDto, base)).toHaveLength(0);
  });
  it('rejects an empty selection', async () => {
    expect(props(await errs(CreateProviderSettlementDto, { ...base, rows: [] }))).toContain('rows');
  });
  it('rejects duplicate group keys', async () => {
    expect(props(await errs(CreateProviderSettlementDto, { ...base, rows: [row(), row({ expectedNetAmount: '1.00' })] }))).toContain('rows');
  });
  it('accepts the same order under two methods (the service, not the DTO, rejects mixing)', async () => {
    expect(await errs(CreateProviderSettlementDto, { ...base, rows: [row(), row({ paymentMethodId: pm2 })] })).toHaveLength(0);
  });
  it.each(['70.005', '70.0000', 'abc', ''])('rejects expectedNetAmount %p', async (v) => {
    expect(props(await errs(CreateProviderSettlementDto, { ...base, rows: [row({ expectedNetAmount: v })] }))).toContain('rows');
  });
  it('accepts a negative expectedNetAmount', async () => {
    expect(await errs(CreateProviderSettlementDto, { ...base, rows: [row({ expectedNetAmount: '-30.00' })] })).toHaveLength(0);
  });
  it.each(['70.001', '0.00', '-5.00'])('rejects settlementAmount %p', async (v) => {
    expect(props(await errs(CreateProviderSettlementDto, { ...base, settlementAmount: v }))).toContain('settlementAmount');
  });
  it('no longer accepts provider or payment ids as input', async () => {
    const dto = plainToInstance(CreateProviderSettlementDto, base) as any;
    expect('paymentIds' in dto).toBe(false);
    expect('providerPaymentMethodId' in dto).toBe(false);
  });
});

describe('UpdateProviderSettlementDto', () => {
  it('requires rows', async () => {
    expect(props(await errs(UpdateProviderSettlementDto, { providerReference: 'x' }))).toContain('rows');
  });
  it('accepts rows alone', async () => {
    expect(await errs(UpdateProviderSettlementDto, { rows: [row()] })).toHaveLength(0);
  });
});
