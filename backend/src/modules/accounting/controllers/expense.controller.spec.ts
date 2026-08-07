import { ExpenseController } from './expense.controller';

describe('ExpenseController', () => {
  const makeMocks = () => {
    const service = {
      create: jest.fn().mockResolvedValue({ id: 'exp-1' }),
      update: jest.fn().mockResolvedValue({ id: 'exp-1' }),
      findOne: jest.fn().mockResolvedValue({ id: 'exp-1', payments: [] }),
      list: jest.fn().mockResolvedValue({ data: [], meta: { total: 0, page: 1, limit: 25 } }),
      cancel: jest.fn().mockResolvedValue({ id: 'exp-1' }),
      uncancel: jest.fn().mockResolvedValue({ id: 'exp-1' }),
    };
    const paymentService = {
      pay: jest.fn().mockResolvedValue({ id: 'exp-1' }),
      refund: jest.fn().mockResolvedValue({ id: 'exp-1' }),
    };
    const controller = new ExpenseController(service as any, paymentService as any);
    return { service, paymentService, controller };
  };

  it('list() delegates to service.list with query', async () => {
    const { service, controller } = makeMocks();
    const query = { page: '1', limit: '25', search: 'test', fromDate: '2026-01-01' };
    await controller.list(query as any);
    expect(service.list).toHaveBeenCalledWith(query);
  });

  it('findOne() delegates to service.findOne with id', async () => {
    const { service, controller } = makeMocks();
    await controller.findOne('exp-1');
    expect(service.findOne).toHaveBeenCalledWith('exp-1');
  });

  it('create() delegates to service.create with dto, userId, username', async () => {
    const { service, controller } = makeMocks();
    const dto = { expenseDate: '2026-07-20', description: 'Test', expenseAccountId: 'acc-1', totalAmount: '100.0000' };
    await controller.create(dto as any, 'u1', 'admin');
    expect(service.create).toHaveBeenCalledWith(dto, 'u1', 'admin');
  });

  it('update() delegates to service.update with id, dto, userId, username', async () => {
    const { service, controller } = makeMocks();
    const dto = { description: 'Updated' };
    await controller.update('exp-1', dto as any, 'u1', 'admin');
    expect(service.update).toHaveBeenCalledWith('exp-1', dto, 'u1', 'admin');
  });

  it('cancel() delegates to service.cancel with id, userId, username', async () => {
    const { service, controller } = makeMocks();
    await controller.cancel('exp-1', 'u1', 'admin');
    expect(service.cancel).toHaveBeenCalledWith('exp-1', 'u1', 'admin');
  });

  it('uncancel() delegates to service.uncancel with id, userId, username', async () => {
    const { service, controller } = makeMocks();
    await controller.uncancel('exp-1', 'u1', 'admin');
    expect(service.uncancel).toHaveBeenCalledWith('exp-1', 'u1', 'admin');
  });

  it('pay() delegates to paymentService.pay with id, dto, userId, username', async () => {
    const { paymentService, controller } = makeMocks();
    const dto = { payments: [{ paymentMethodId: 'pm-1', amount: '100.0000', paymentDate: '2026-07-20' }] };
    await controller.pay('exp-1', dto as any, 'u1', 'admin');
    expect(paymentService.pay).toHaveBeenCalledWith('exp-1', dto, 'u1', 'admin');
  });

  it('refund() delegates to paymentService.refund with id, dto, userId, username', async () => {
    const { paymentService, controller } = makeMocks();
    const dto = { refunds: [{ sourcePaymentId: 'sp-1', amount: '50.0000', refundDate: '2026-07-21' }] };
    await controller.refund('exp-1', dto as any, 'u1', 'admin');
    expect(paymentService.refund).toHaveBeenCalledWith('exp-1', dto, 'u1', 'admin');
  });

  it('has no DELETE route', () => {
    const methods = Object.getOwnPropertyNames(ExpenseController.prototype);
    expect(methods).not.toContain('delete');
    expect(methods).not.toContain('remove');
  });
});
