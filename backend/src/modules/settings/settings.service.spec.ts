import { SettingsService } from './settings.service';

describe('SettingsService', () => {
  const createQueryBuilderMock = (result: unknown) => ({
    select: jest.fn().mockReturnThis(),
    where: jest.fn().mockReturnThis(),
    orderBy: jest.fn().mockReturnThis(),
    limit: jest.fn().mockReturnThis(),
    getOne: jest.fn().mockResolvedValue(result),
  });

  it('syncDocumentNumbersWithDatabase parses PO sequence and sets nextNumber', async () => {
    const documentNumberSettingRepository = {
      find: jest.fn().mockResolvedValue([
        { documentName: 'Purchase Orders', prefix: 'PO' },
      ]),
      update: jest.fn().mockResolvedValue(undefined),
    };
    const queryBuilder = createQueryBuilderMock({ orderNumber: 'PO-26-123456' });
    const purchaseOrderRepository = {
      createQueryBuilder: jest.fn().mockReturnValue(queryBuilder),
    };

    const service = new SettingsService(
      {} as any, {} as any,
      documentNumberSettingRepository as any,
      {} as any, {} as any,
      purchaseOrderRepository as any,
      {} as any, {} as any,
      {} as any,
    );

    await service.syncDocumentNumbersWithDatabase();

    expect(queryBuilder.where).toHaveBeenCalledWith(
      'po.orderNumber LIKE :p',
      expect.objectContaining({ p: expect.stringMatching(/^PO-\d{2}-%$/) }),
    );
    expect(documentNumberSettingRepository.update).toHaveBeenCalledWith(
      { documentName: 'Purchase Orders' },
      { nextNumber: 123457, lastResetYear: expect.any(Number) },
    );
  });
});
