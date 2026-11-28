import * as fs from 'fs';
import * as path from 'path';
import { DataSource } from 'typeorm';
import connectionSource from '../../config/cli-datasource';
import { CompanySettings } from '../entities/company-settings.entity';
import { PrintSettings } from '../entities/print-settings.entity';

/**
 * One-off, read-only operator check (#2107).
 *
 * Lists every company_settings and print_settings logo reference whose file is
 * missing from the uploads directory. It never clears, rewrites or deletes a
 * reference, so the result is a list to resolve by hand before Backups are
 * enabled against real data.
 *
 * Operator steps are in docs/deployment/LOGO_REFERENCE_CHECK.md.
 * Exit status: 0 when every local reference resolves, 1 when any is dangling,
 * 2 when the check could not run.
 */

export interface DanglingLogoReference {
  table: 'company_settings' | 'print_settings';
  id: string;
  logoUrl: string;
  resolvedPath: string;
}

interface ReadableRepository<T> {
  find(options: { withDeleted: true }): Promise<T[]>;
}

type LogoRow = { id: string; logoUrl?: string | null };

const LOCAL_PREFIX = '/uploads/';

/**
 * Resolves each local logo reference the same way the uploads are written and
 * returns the ones that do not point at an existing file under uploads/.
 *
 * `baseDir` is the backend working directory (process.cwd() in the CLI), which
 * is where multer writes `./uploads/logos`.
 */
export async function findDanglingLogoReferences(
  dataSource: Pick<DataSource, 'getRepository'>,
  baseDir: string,
): Promise<DanglingLogoReference[]> {
  const uploadsRoot = path.resolve(baseDir, 'uploads');
  const companyRows = await (dataSource.getRepository(CompanySettings) as unknown as ReadableRepository<LogoRow>).find({
    withDeleted: true,
  });
  const printRows = await (dataSource.getRepository(PrintSettings) as unknown as ReadableRepository<LogoRow>).find({
    withDeleted: true,
  });

  const dangling: DanglingLogoReference[] = [];
  const check = (table: DanglingLogoReference['table'], rows: LogoRow[]) => {
    for (const row of rows) {
      const logoUrl = row.logoUrl;
      // Only local uploads are checked. Empty values and external URLs are not
      // files this server wrote, so they are out of scope here.
      if (!logoUrl || !logoUrl.startsWith(LOCAL_PREFIX)) continue;

      const resolvedPath = path.resolve(baseDir, logoUrl.replace(/^\//, ''));
      const insideUploads = resolvedPath.startsWith(uploadsRoot + path.sep);
      if (!insideUploads || !isFile(resolvedPath)) {
        dangling.push({ table, id: row.id, logoUrl, resolvedPath });
      }
    }
  };

  check('company_settings', companyRows);
  check('print_settings', printRows);
  return dangling;
}

function isFile(filePath: string): boolean {
  try {
    return fs.statSync(filePath).isFile();
  } catch {
    return false;
  }
}

async function main(): Promise<number> {
  await connectionSource.initialize();
  try {
    const dangling = await findDanglingLogoReferences(connectionSource, process.cwd());
    if (dangling.length === 0) {
      console.log('All local logo references resolve to files on disk.');
      return 0;
    }
    console.log(`${dangling.length} logo reference(s) point at missing files:`);
    for (const ref of dangling) {
      console.log(`  ${ref.table} id=${ref.id} logoUrl=${ref.logoUrl} expected=${ref.resolvedPath}`);
    }
    console.log('Nothing was changed. Resolve these references deliberately before enabling Backups.');
    return 1;
  } finally {
    await connectionSource.destroy();
  }
}

if (typeof require !== 'undefined' && require.main === module) {
  main()
    .then((code) => process.exit(code))
    .catch((error) => {
      console.error(`check-logo-references failed: ${error.message}`);
      process.exit(2);
    });
}
