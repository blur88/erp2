import { jest } from '@jest/globals';
import * as fs from 'fs';
import * as os from 'os';
import * as path from 'path';
import { PrintSettingsService } from './print-settings.service';

/**
 * Print logo lifecycle (#2107).
 *
 * Print settings hold their own logo reference, which can point at the same
 * file as company settings. Replacing or removing a print logo must leave the
 * file on disk, because other references may still use it.
 */
describe('PrintSettingsService logo lifecycle', () => {
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

  const buildService = (existing: any) => {
    const saved: any[] = [];
    const printSettingsRepository = {
      findOne: (jest.fn as unknown as any)().mockResolvedValue(existing),
      create: (jest.fn as unknown as any)((value: any) => ({ ...value })),
      save: (jest.fn as unknown as any)((value: any) => {
        saved.push({ ...value });
        return Promise.resolve({ id: 'ps1', ...value });
      }),
    };
    const service = new PrintSettingsService(printSettingsRepository as any);
    return { service, printSettingsRepository, saved };
  };

  beforeEach(() => {
    root = fs.mkdtempSync(path.join(os.tmpdir(), 'print-logo-lifecycle-'));
    cwdSpy = jest.spyOn(process, 'cwd').mockReturnValue(root) as any;
  });

  afterEach(() => {
    cwdSpy.mockRestore();
    fs.rmSync(root, { recursive: true, force: true });
  });

  it('replacing the print logo leaves the previous file on disk', async () => {
    write(OLD, 'old-logo');
    write(NEW, 'new-logo');
    const { service, saved } = buildService({ id: 'ps1', logoUrl: OLD });

    await service.updateSettings({ logoUrl: NEW });

    expect(saved[0].logoUrl).toBe(NEW);
    expect(exists(OLD)).toBe(true);
    expect(fs.readFileSync(path.join(root, OLD.slice(1)), 'utf8')).toBe('old-logo');
  });

  it('removing the print logo clears the reference and leaves the file on disk', async () => {
    write(OLD);
    const { service, saved } = buildService({ id: 'ps1', logoUrl: OLD });

    await service.updateSettings({ logoUrl: null as any });

    expect(saved[0].logoUrl).toBeNull();
    expect(exists(OLD)).toBe(true);
  });

  it('importing the company logo shares the file and leaves it on disk', async () => {
    write(OLD);
    const { service, saved } = buildService({ id: 'ps1', logoUrl: NEW });

    await service.importFromCompanySettings({ name: 'Acme', logoUrl: OLD });

    expect(saved[0].logoUrl).toBe(OLD);
    expect(exists(OLD)).toBe(true);
  });
});
