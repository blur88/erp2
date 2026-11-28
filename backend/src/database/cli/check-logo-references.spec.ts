import { jest } from '@jest/globals';
import * as fs from 'fs';
import * as os from 'os';
import * as path from 'path';
import { findDanglingLogoReferences } from './check-logo-references';
import { CompanySettings } from '../entities/company-settings.entity';
import { PrintSettings } from '../entities/print-settings.entity';

describe('findDanglingLogoReferences', () => {
  let base: string;

  const touch = (logoUrl: string) => {
    const filePath = path.join(base, logoUrl.replace(/^\//, ''));
    fs.mkdirSync(path.dirname(filePath), { recursive: true });
    fs.writeFileSync(filePath, 'image-bytes');
  };

  /**
   * Fake DataSource that only exposes read methods. Any attempt to write goes
   * through a method that does not exist here, so a write fails the test
   * rather than silently changing data.
   */
  const buildDataSource = (company: any[], print: any[]) => {
    const findCompany = (jest.fn as unknown as any)().mockResolvedValue(company);
    const findPrint = (jest.fn as unknown as any)().mockResolvedValue(print);
    const dataSource = {
      getRepository: (entity: unknown) => {
        if (entity === CompanySettings) return { find: findCompany };
        if (entity === PrintSettings) return { find: findPrint };
        throw new Error('unexpected repository');
      },
    };
    return { dataSource: dataSource as any, findCompany, findPrint };
  };

  beforeEach(() => {
    base = fs.mkdtempSync(path.join(os.tmpdir(), 'logo-check-'));
  });

  afterEach(() => {
    fs.rmSync(base, { recursive: true, force: true });
  });

  it('reports company and print references whose file is missing', async () => {
    touch('/uploads/logos/logo-present.png');
    const { dataSource } = buildDataSource(
      [{ id: 'c1', logoUrl: '/uploads/logos/logo-gone.png', isActive: true }],
      [{ id: 'p1', logoUrl: '/uploads/logos/logo-also-gone.png' }],
    );

    const dangling = await findDanglingLogoReferences(dataSource, base);

    expect(dangling).toEqual([
      expect.objectContaining({
        table: 'company_settings',
        id: 'c1',
        logoUrl: '/uploads/logos/logo-gone.png',
      }),
      expect.objectContaining({
        table: 'print_settings',
        id: 'p1',
        logoUrl: '/uploads/logos/logo-also-gone.png',
      }),
    ]);
  });

  it('does not report references whose file exists', async () => {
    touch('/uploads/logos/logo-present.png');
    const { dataSource } = buildDataSource(
      [{ id: 'c1', logoUrl: '/uploads/logos/logo-present.png' }],
      [{ id: 'p1', logoUrl: '/uploads/logos/logo-present.png' }],
    );

    await expect(findDanglingLogoReferences(dataSource, base)).resolves.toEqual([]);
  });

  it('reports both sides of a shared reference when its file is missing', async () => {
    const shared = '/uploads/logos/logo-shared.png';
    const { dataSource } = buildDataSource(
      [{ id: 'c1', logoUrl: shared }],
      [{ id: 'p1', logoUrl: shared }],
    );

    const dangling = await findDanglingLogoReferences(dataSource, base);

    expect(dangling.map((d) => `${d.table}:${d.id}`)).toEqual([
      'company_settings:c1',
      'print_settings:p1',
    ]);
  });

  it('skips empty references and references that are not local uploads', async () => {
    const { dataSource } = buildDataSource(
      [
        { id: 'c1', logoUrl: null },
        { id: 'c2', logoUrl: '' },
        { id: 'c3', logoUrl: 'https://cdn.example.com/logo.png' },
      ],
      [{ id: 'p1', logoUrl: undefined }],
    );

    await expect(findDanglingLogoReferences(dataSource, base)).resolves.toEqual([]);
  });

  it('reports a reference that resolves outside the uploads directory', async () => {
    const { dataSource } = buildDataSource(
      [{ id: 'c1', logoUrl: '/uploads/../../etc/passwd' }],
      [],
    );

    const dangling = await findDanglingLogoReferences(dataSource, base);

    expect(dangling).toEqual([expect.objectContaining({ table: 'company_settings', id: 'c1' })]);
  });

  it('includes soft-deleted rows and only reads, never writing', async () => {
    const { dataSource, findCompany, findPrint } = buildDataSource(
      [{ id: 'c1', logoUrl: '/uploads/logos/logo-gone.png', deletedAt: new Date() }],
      [],
    );

    const dangling = await findDanglingLogoReferences(dataSource, base);

    expect(findCompany).toHaveBeenCalledWith(expect.objectContaining({ withDeleted: true }));
    expect(findPrint).toHaveBeenCalledWith(expect.objectContaining({ withDeleted: true }));
    expect(dangling).toHaveLength(1);
  });
});
