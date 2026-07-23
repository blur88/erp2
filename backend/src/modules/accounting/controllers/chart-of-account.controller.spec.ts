import { BadRequestException } from '@nestjs/common';
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
    await ctrl.create({ code: '1500' } as any, { user: { username: 'admin' } } as any);
    expect(svc.create).toHaveBeenCalled();
  });

  it('forwards the search term to the service', async () => {
    const { svc, ctrl } = makeCtrl();
    await ctrl.tree('cash');
    expect(svc.findTree).toHaveBeenCalledWith({ search: 'cash', type: undefined, isActive: undefined });
  });

  it('passes undefined params when none is given', async () => {
    const { svc, ctrl } = makeCtrl();
    await ctrl.tree();
    expect(svc.findTree).toHaveBeenCalledWith({ search: undefined, type: undefined, isActive: undefined });
  });

  it('forwards the type filter', async () => {
    const { svc, ctrl } = makeCtrl();
    await ctrl.tree(undefined, 'Asset');
    expect(svc.findTree).toHaveBeenCalledWith({ search: undefined, type: 'Asset', isActive: undefined });
  });

  it('forwards isActive=true', async () => {
    const { svc, ctrl } = makeCtrl();
    await ctrl.tree(undefined, undefined, 'true');
    expect(svc.findTree).toHaveBeenCalledWith({ search: undefined, type: undefined, isActive: true });
  });

  it('forwards isActive=false', async () => {
    const { svc, ctrl } = makeCtrl();
    await ctrl.tree(undefined, undefined, 'false');
    expect(svc.findTree).toHaveBeenCalledWith({ search: undefined, type: undefined, isActive: false });
  });

  it('rejects a malformed isActive', () => {
    const { ctrl } = makeCtrl();
    expect(() => ctrl.tree(undefined, undefined, 'yes')).toThrow(BadRequestException);
  });

  it('rejects an unknown account type', () => {
    const { ctrl } = makeCtrl();
    expect(() => ctrl.tree(undefined, 'bogus')).toThrow(BadRequestException);
  });
});
