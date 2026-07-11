import { ChartOfAccountController } from './chart-of-account.controller';

describe('ChartOfAccountController', () => {
  it('delegates tree + create to the service', async () => {
    const svc = {
      findTree: jest.fn(async () => [{ code: '1000' }]),
      create: jest.fn(async () => ({ id: 'new' })),
      update: jest.fn(async () => ({ id: 'x' })),
      list: jest.fn(async () => []),
    };
    const ctrl = new ChartOfAccountController(svc as any);
    expect(await ctrl.tree()).toEqual([{ code: '1000' }]);
    await ctrl.create({ code: '1500' } as any, { user: { username: 'admin' } } as any);
    expect(svc.create).toHaveBeenCalled();
  });
});
