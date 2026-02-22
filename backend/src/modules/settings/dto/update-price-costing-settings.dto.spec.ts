import { validate } from 'class-validator';
import { UpdatePriceCostingSettingsDto } from './update-price-costing-settings.dto';

describe('UpdatePriceCostingSettingsDto', () => {
  it('accepts all supported date formats including month-word formats', async () => {
    const supportedFormats = [
      'DD/MM/YYYY',
      'DD-MM-YYYY',
      'MM/DD/YYYY',
      'MM-DD-YYYY',
      'YYYY-MM-DD',
      'DD MMM YYYY',
      'DD MMMM YYYY',
      'MMM DD, YYYY',
      'MMMM DD, YYYY',
    ];

    for (const dateFormat of supportedFormats) {
      const dto = new UpdatePriceCostingSettingsDto();
      dto.dateFormat = dateFormat;

      const errors = await validate(dto);
      expect(errors).toHaveLength(0);
    }
  });

  it('rejects unsupported date formats', async () => {
    const dto = new UpdatePriceCostingSettingsDto();
    dto.dateFormat = 'YYYY/MM/DD';

    const errors = await validate(dto);
    expect(errors.length).toBeGreaterThan(0);
  });
});
