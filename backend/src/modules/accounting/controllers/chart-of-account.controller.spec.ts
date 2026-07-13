import { ChartOfAccountController } from './chart-of-account.controller';

function makeCtrl() {
  const svc = {
    findTree: jest.fn(async () => [{ code: '1000' }]),
    create: jest.fn(async () => ({ id: 'new' })),
    update: jest.fn(async () => ({ id: 'x' })),
    list: jest.fn(async () => []),
  };
  return { svc, ctrl: new ChartOfAccountController(svc as any) };
}

describe('ChartOfAccountController', () => {
  it('delegates tree + create to the service', async () => {
    const { svc, ctrl } = makeCtrl();
    expect(await ctrl.tree()).toEqual([{ code: '1000' }]);
    await ctrl.create({ code: '1500' } as any, { user: { username: 'admin' } } as any);
    expect(svc.create).toHaveBeenCalled();
  });

  it('forwards the search term to the service', async () => {
    const { svc, ctrl } = makeCtrl();
    await ctrl.tree('cash');
    expect(svc.findTree).toHaveBeenCalledWith({ search: 'cash' });
  });

  it('passes an undefined search term when none is given', async () => {
    const { svc, ctrl } = makeCtrl();
    await ctrl.tree();
    expect(svc.findTree).toHaveBeenCalledWith({ search: undefined });
  });
});
