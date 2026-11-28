import { hasRoleStatement, normaliseTarEntry, referenceToEntry } from './backup-attempt';
import { BackupStepError } from './backup.types';

describe('backup attempt helpers (#2111)', () => {
  it('maps a local upload URL to its archive entry', () => {
    expect(referenceToEntry('/uploads/logos/logo-1.png')).toBe('logos/logo-1.png');
    expect(referenceToEntry('')).toBeNull();
    expect(referenceToEntry('https://example.test/logo.png')).toBeNull();
  });

  it('rejects upload references that escape the uploads directory', () => {
    expect(() => referenceToEntry('/uploads/../secrets.env')).toThrow(BackupStepError);
    expect(() => referenceToEntry('/uploads//logo.png')).toThrow(BackupStepError);
  });

  it('normalises tar listing lines', () => {
    expect(normaliseTarEntry('./logos/logo-1.png')).toBe('logos/logo-1.png');
    expect(normaliseTarEntry('./logos/')).toBe('logos');
    expect(normaliseTarEntry('  ./')).toBe('');
  });

  it('finds the application role statement the way pg_dumpall writes it', () => {
    expect(hasRoleStatement('CREATE ROLE erp_app;\nALTER ROLE erp_app WITH LOGIN;\n', 'erp_app')).toBe(true);
    expect(hasRoleStatement('CREATE ROLE erp_app_admin;\n', 'erp_app')).toBe(false);
    expect(hasRoleStatement('CREATE ROLE "Mixed Case";\n', 'Mixed Case')).toBe(true);
    expect(hasRoleStatement('CREATE ROLE erp_app;', '')).toBe(false);
  });
});
