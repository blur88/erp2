import { jest } from '@jest/globals';
import * as fs from 'fs';
import * as os from 'os';
import * as path from 'path';
import { SettingsService } from './settings.service';

/**
 * Logo lifecycle for company settings (#2107).
 *
 * Logo files are never deleted. Replacing or removing the company logo only
 * changes the database reference, because print settings may point at the same
 * file. Each test runs against a real temporary directory that stands in for
 * the backend working directory, so the assertions are about files on disk.
 */
describe('SettingsService company logo lifecycle', () => {
  let root: string;
  let cwdSpy: { mockRestore: () => void };

  const write = (logoUrl: string, content = 'image-bytes') => {
    const filePath = path.join(root, logoUrl.replace(/^\//, ''));
    fs.mkdirSync(path.dirname(filePath), { recursive: true });
    fs.writeFileSync(filePath, content);
  };
  const exists = (logoUrl: string) =>
    fs.existsSync(path.join(root, logoUrl.replace(/^\//, '')));

  const OLD = '/uploads/logos/logo-111-222.png';
  const NEW = '/uploads/logos/logo-333-444.png';

  const buildService = (settings: any) => {
    const saved: any[] = [];
    const companySettingsRepository = {
      findOne: (jest.fn as unknown as any)().mockResolvedValue(settings),
      save: (jest.fn as unknown as any)((value: any) => {
        saved.push({ ...value, fileExistsAtSave: value.logoUrl ? exists(value.logoUrl) : null });
        return Promise.resolve(value);
      }),
    };
    const service = new SettingsService(
      companySettingsRepository as any,
      {} as any,
      {} as any,
      {} as any,
      {} as any,
      {} as any,
      {} as any,
      {} as any,
    );
    return { service, companySettingsRepository, saved };
  };

  beforeEach(() => {
    root = fs.mkdtempSync(path.join(os.tmpdir(), 'logo-lifecycle-'));
    cwdSpy = jest.spyOn(process, 'cwd').mockReturnValue(root) as any;
  });

  afterEach(() => {
    cwdSpy.mockRestore();
    fs.rmSync(root, { recursive: true, force: true });
  });

  describe('replacing the company logo', () => {
    it('keeps the previous file on disk and saves the new reference', async () => {
      write(OLD, 'old-logo');
      write(NEW, 'new-logo');
      const settings: any = { id: 's1', isActive: true, logoUrl: OLD };
      const { service, saved } = buildService(settings);

      await service.updateLogoUrl(NEW, 'tester');

      expect(saved).toHaveLength(1);
      expect(saved[0].logoUrl).toBe(NEW);
      expect(exists(OLD)).toBe(true);
      expect(fs.readFileSync(path.join(root, OLD.slice(1)), 'utf8')).toBe('old-logo');
    });

    it('writes the new file before the reference is saved', async () => {
      write(OLD);
      write(NEW);
      const { service, saved } = buildService({ id: 's1', isActive: true, logoUrl: OLD });

      await service.updateLogoUrl(NEW, 'tester');

      expect(saved[0].fileExistsAtSave).toBe(true);
    });

    it('refuses a reference to a file that is not on disk, and saves nothing', async () => {
      write(OLD);
      const settings: any = { id: 's1', isActive: true, logoUrl: OLD };
      const { service, companySettingsRepository, saved } = buildService(settings);

      await expect(service.updateLogoUrl(NEW, 'tester')).rejects.toThrow();

      expect(companySettingsRepository.save).not.toHaveBeenCalled();
      expect(saved).toHaveLength(0);
      expect(settings.logoUrl).toBe(OLD);
      expect(exists(OLD)).toBe(true);
    });
  });

  describe('removing the company logo', () => {
    it('clears the reference and leaves the file on disk', async () => {
      write(OLD, 'old-logo');
      const settings: any = { id: 's1', isActive: true, logoUrl: OLD };
      const { service, saved } = buildService(settings);

      await service.deleteLogoUrl('tester');

      expect(saved[0].logoUrl).toBeNull();
      expect(exists(OLD)).toBe(true);
    });
  });

  describe('a logo shared with print settings', () => {
    it('still resolves to an existing file after the company logo is replaced', async () => {
      write(OLD);
      write(NEW);
      // Print settings hold a reference to the same file as company settings.
      const printSettingsLogoUrl = OLD;
      const { service } = buildService({ id: 's1', isActive: true, logoUrl: OLD });

      await service.updateLogoUrl(NEW, 'tester');

      expect(exists(printSettingsLogoUrl)).toBe(true);
    });

    it('still resolves to an existing file after the company logo is removed', async () => {
      write(OLD);
      const printSettingsLogoUrl = OLD;
      const { service } = buildService({ id: 's1', isActive: true, logoUrl: OLD });

      await service.deleteLogoUrl('tester');

      expect(exists(printSettingsLogoUrl)).toBe(true);
    });
  });
});
