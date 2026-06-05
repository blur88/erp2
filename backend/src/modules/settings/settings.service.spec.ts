import { SettingsService } from './settings.service';

describe('SettingsService', () => {
  const createQueryBuilderMock = (result: unknown) => ({
    select: jest.fn().mockReturnThis(),
    where: jest.fn().mockReturnThis(),
    orderBy: jest.fn().mockReturnThis(),
    limit: jest.fn().mockReturnThis(),
    getOne: jest.fn().mockResolvedValue(result),
  });

  it('syncDocumentNumbersWithDatabase uses the larger of current-year and legacy GRN sequences', async () => {
    const documentNumberSettingRepository = {
      find: jest.fn().mockResolvedValue([
        { documentName: 'Goods Received', prefix: 'GRN' },
      ]),
      update: jest.fn().mockResolvedValue(undefined),
    };
    const currentYearQueryBuilder = createQueryBuilderMock({ grnNumber: 'GRN-26-007' });
    const legacyQueryBuilder = createQueryBuilderMock({ grnNumber: 'GRN-123456' });
    const goodsReceivedNoteRepository = {
      createQueryBuilder: jest.fn()
        .mockReturnValueOnce(currentYearQueryBuilder)
        .mockReturnValueOnce(legacyQueryBuilder),
    };

    const service = new SettingsService(
      {} as any,
      {} as any,
      documentNumberSettingRepository as any,
      {} as any,
      {} as any,
      {} as any,
      {} as any,
      goodsReceivedNoteRepository as any,
      {} as any,
      {} as any,
      {} as any,
      {} as any,
      {} as any,
      {} as any,
    );

    await service.syncDocumentNumbersWithDatabase();

    expect(currentYearQueryBuilder.where).toHaveBeenCalledWith(
      'grn.grnNumber LIKE :p',
      { p: 'GRN-26-%' },
    );
    expect(legacyQueryBuilder.where).toHaveBeenCalledWith("grn.grnNumber ~ '^GRN-\\\\d+$'");
    expect(documentNumberSettingRepository.update).toHaveBeenCalledWith(
      { documentName: 'Goods Received' },
      { nextNumber: 123457, lastResetYear: 26 },
    );
  });
});
