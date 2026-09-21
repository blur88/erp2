import { plainToInstance } from 'class-transformer';
import { validate } from 'class-validator';
import { UpdateProviderSettlementDto } from './provider-settlement.dto';

const paymentId = '3f1e4b9a-0000-4000-8000-000000000001';

const errorsFor = async (payload: Record<string, unknown>) =>
  validate(plainToInstance(UpdateProviderSettlementDto, payload));

const paymentIdErrors = (errors: Awaited<ReturnType<typeof validate>>) =>
  errors.filter((e) => e.property === 'paymentIds');

describe('UpdateProviderSettlementDto.paymentIds', () => {
  it('rejects an update that omits paymentIds', async () => {
    // The selection is a full replacement, so an absent array is ambiguous.
    // PartialType must not mark it optional.
    const errors = await errorsFor({ providerReference: 'PRV-1' });
    expect(paymentIdErrors(errors).length).toBeGreaterThan(0);
  });

  it('accepts an update containing ONLY paymentIds', async () => {
    // Every OTHER field remains optional through PartialType.
    expect(await errorsFor({ paymentIds: [paymentId] })).toHaveLength(0);
  });

  it('still rejects an empty paymentIds array', async () => {
    const errors = paymentIdErrors(await errorsFor({ paymentIds: [] }));
    expect(errors).toHaveLength(1);
    expect(errors[0].constraints).toHaveProperty('arrayMinSize');
  });

  it('rejects a non-uuid payment id', async () => {
    const errors = paymentIdErrors(await errorsFor({ paymentIds: ['pay-1'] }));
    expect(errors.length).toBeGreaterThan(0);
  });
});
