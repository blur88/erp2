import { Injectable, Logger, OnModuleInit } from '@nestjs/common';
import { DataSource, EntityManager } from 'typeorm';
import { InjectDataSource } from '@nestjs/typeorm';
import { ChartOfAccount } from '../entities/chart-of-account.entity';
import { AccountingSettings } from '../entities/accounting-settings.entity';
import {
  STANDARD_COA_GROUPS,
  STANDARD_COA_CHILDREN,
  SETTINGS_CODE_MAP,
} from '../data/standard-coa';

const SEED_LOCK_KEY = 891891;

// A chart_of_account row as the seeder reads it back for validation.
export interface CoaRow {
  id: string;
  code: string;
  name: string;
  type: string;
  parentId: string | null;
  isSystem: boolean;
  isPostable: boolean;
}

// Data-access surface. Production adapter wraps a TypeORM EntityManager; the
// unit test supplies a fake with the same methods.
export interface SeederManager {
  advisoryLock(key: number): Promise<void>;
  coaCount(): Promise<number>;
  findCoaRowsByCode(code: string): Promise<CoaRow[]>;
  insertCoa(row: { code: string; name: string; type: string; parentId: string | null }): Promise<void>;
  getSettings(): Promise<Record<string, any> | null>;
  insertSettings(row: Record<string, any>): Promise<void>;
  ensureJournalEntryDocNumber(currentYear: number): Promise<void>;
}

// Anything that can run the core inside a rolling-back transaction.
export interface SeederDb {
  transaction(body: (m: SeederManager) => Promise<void>): Promise<void>;
}

@Injectable()
export class AccountingSeederService implements OnModuleInit {
  private readonly logger = new Logger(AccountingSeederService.name);
  private phase = 'init';

  // Production: a real DataSource. Test: a fake implementing SeederDb.
  constructor(@InjectDataSource() private readonly source: DataSource | SeederDb) {}

  async onModuleInit(): Promise<void> {
    await this.seed();
  }

  async seed(): Promise<void> {
    try {
      await this.runInTransaction(async (m) => {
        this.phase = 'advisory-lock';
        await m.advisoryLock(SEED_LOCK_KEY);
        await this.runCore(m);
      });
    } catch (err) {
      this.logger.error(
        `Accounting seed failed during phase "${this.phase}": ${(err as Error).message}`,
        (err as Error).stack,
      );
      throw err;
    }
  }

  private runInTransaction(body: (m: SeederManager) => Promise<void>): Promise<void> {
    if (this.source instanceof DataSource) {
      return this.source.transaction(async (em) => body(this.adapter(em)));
    }
    return (this.source as SeederDb).transaction(body);
  }

  private adapter(em: EntityManager): SeederManager {
    const coa = em.getRepository(ChartOfAccount);
    const settingsRepo = em.getRepository(AccountingSettings);
    return {
      advisoryLock: async (key) => {
        await em.query('SELECT pg_advisory_xact_lock($1)', [key]);
      },
      coaCount: () => coa.count(),
      findCoaRowsByCode: async (code) => {
        const rows = await coa.find({ where: { code } as any });
        return rows.map((r) => ({
          id: r.id, code: r.code, name: r.name, type: r.type as string,
          parentId: r.parentId, isSystem: r.isSystem, isPostable: r.isPostable,
        }));
      },
      insertCoa: async (row) => {
        await coa.createQueryBuilder().insert()
          .values({ ...row, isSystem: true, isPostable: row.parentId !== null } as any)
          .orIgnore().execute();
      },
      getSettings: async () => (await settingsRepo.findOne({ where: { id: true } as any })) as any,
      insertSettings: async (row) => {
        await settingsRepo.createQueryBuilder().insert().values(row as any).orIgnore().execute();
      },
      ensureJournalEntryDocNumber: async (currentYear) => {
        // Fast path: skip the journal_entry aggregate scan on the common already-healed
        // boot. The row is present on every boot after the first, so this avoids a full
        // MAX() over journal_entry on the startup hot path (issue #901).
        const existing = await em.query(
          `SELECT 1 FROM document_number_settings WHERE "documentName" = 'Journal Entries' LIMIT 1`,
        );
        if (existing.length > 0) return;
        const yy = String(currentYear).padStart(2, '0');
        await em.query(
          `INSERT INTO document_number_settings
             ("documentName", "prefix", "paddingDigits", "nextNumber", "lastResetYear")
           SELECT 'Journal Entries', 'JE', 3,
                  COALESCE(MAX((split_part("journalNo", '-', 3))::int), 0) + 1,
                  $1
             FROM journal_entry
            WHERE "journalNo" ~ ('^JE-' || $2 || '-[0-9]{1,9}$')
           ON CONFLICT ("documentName") DO NOTHING`,
          [currentYear, yy],
        );
      },
    };
  }

  private async runCore(m: SeederManager): Promise<void> {
    this.phase = 'ensure-je-doc-number';
    await m.ensureJournalEntryDocNumber(new Date().getFullYear() % 100);

    this.phase = 'inspect';
    const count = await m.coaCount();
    const settings = await m.getSettings();

    // Branch 1: fully empty + no settings -> seed everything, then validate.
    if (count === 0 && !settings) {
      this.phase = 'seed-coa';
      await this.seedCoa(m);
      this.phase = 'seed-settings';
      const resolved = await this.resolveRequired(m);
      await this.seedSettings(m, resolved);
      this.phase = 'validate';
      await this.validateHierarchy(m);
      await this.validateSettings(m, resolved);
      this.logger.log('Seeded standard chart of accounts and accounting settings.');
      return;
    }

    // Branch 3: empty COA but a settings row exists -> anomalous.
    if (count === 0 && settings) {
      throw new Error('Accounting inconsistent: settings singleton present but chart_of_account is empty. Manual reset required.');
    }

    // COA is non-empty. Validate it is the healthy canonical hierarchy
    // (this covers branch 2: partial, duplicate, wrong-flag, wrong-parent).
    this.phase = 'validate-existing-hierarchy';
    await this.validateHierarchy(m);
    const resolved = await this.resolveRequired(m);

    // Branch 4: healthy COA, no settings -> self-heal settings only.
    if (!settings) {
      this.phase = 'self-heal-settings';
      await this.seedSettings(m, resolved);
      this.phase = 'validate';
      await this.validateSettings(m, resolved);
      this.logger.log('Self-healed missing accounting settings singleton.');
      return;
    }

    // Branch 5: healthy COA + settings present -> validate wiring, never modify.
    this.phase = 'validate-existing-settings';
    this.assertWiring(settings, resolved);
    // no-op
  }

  private async seedCoa(m: SeederManager): Promise<void> {
    for (const g of STANDARD_COA_GROUPS) {
      await m.insertCoa({ code: g.code, name: g.name, type: g.type, parentId: null });
    }
    for (const c of STANDARD_COA_CHILDREN) {
      const parentRows = await m.findCoaRowsByCode(c.parentCode);
      if (parentRows.length !== 1) {
        throw new Error(`Accounting seed: parent code ${c.parentCode} for ${c.code} resolved to ${parentRows.length} rows.`);
      }
      await m.insertCoa({ code: c.code, name: c.name, type: c.type, parentId: parentRows[0].id });
    }
  }

  // Resolve each required (settings-referenced) code to its single row id.
  // Throws on missing or duplicate -- the explicit duplicate-detection requirement.
  private async resolveRequired(m: SeederManager): Promise<Record<string, string>> {
    const resolved: Record<string, string> = {};
    for (const code of new Set(Object.values(SETTINGS_CODE_MAP))) {
      const rows = await m.findCoaRowsByCode(code);
      if (rows.length === 0) {
        throw new Error(`Accounting inconsistent: chart_of_account missing required code ${code}. Manual reset required.`);
      }
      if (rows.length > 1) {
        throw new Error(`Accounting inconsistent: chart_of_account has duplicate rows for code ${code} (${rows.length}). Manual reset required.`);
      }
      resolved[code] = rows[0].id;
    }
    return resolved;
  }

  // Full canonical hierarchy validation: every group + child present exactly once
  // with expected type/flags, and each child's parentId points at the expected parent.
  // NOTE: `name` is deliberately NOT validated — it is user-editable display data
  // (update() lets any account be renamed, with no isSystem guard), so a renamed
  // seeded account must not fail boot. Only structural invariants the posting engine
  // and settings depend on (code, type, isSystem, isPostable, parent) are enforced.
  private async validateHierarchy(m: SeederManager): Promise<void> {
    const idByCode: Record<string, string> = {};

    const checkOne = async (
      expected: { code: string; type: string; isSystem: boolean; isPostable: boolean },
    ): Promise<CoaRow> => {
      const rows = await m.findCoaRowsByCode(expected.code);
      if (rows.length === 0) throw new Error(`Accounting inconsistent: missing account ${expected.code}. Manual reset required.`);
      if (rows.length > 1) throw new Error(`Accounting inconsistent: duplicate account ${expected.code} (${rows.length} rows). Manual reset required.`);
      const r = rows[0];
      if (r.type !== expected.type || r.isSystem !== expected.isSystem || r.isPostable !== expected.isPostable) {
        throw new Error(`Accounting inconsistent: account ${expected.code} has unexpected properties. Manual reset required.`);
      }
      idByCode[expected.code] = r.id;
      return r;
    };

    for (const g of STANDARD_COA_GROUPS) {
      await checkOne({ code: g.code, type: g.type as string, isSystem: true, isPostable: false });
    }
    for (const c of STANDARD_COA_CHILDREN) {
      const row = await checkOne({ code: c.code, type: c.type as string, isSystem: true, isPostable: true });
      const expectedParentId = idByCode[c.parentCode];
      if (!expectedParentId || row.parentId !== expectedParentId) {
        throw new Error(`Accounting inconsistent: account ${c.code} parent should be ${c.parentCode} but parentId is ${row.parentId}. Manual reset required.`);
      }
    }
  }

  private async seedSettings(m: SeederManager, resolved: Record<string, string>): Promise<void> {
    const row: Record<string, any> = { id: true };
    for (const [col, code] of Object.entries(SETTINGS_CODE_MAP)) {
      row[col] = resolved[code];
    }
    await m.insertSettings(row);
  }

  // Post-insert validation (branches 1 and 4): re-read and assert wiring.
  private async validateSettings(m: SeederManager, resolved: Record<string, string>): Promise<void> {
    const settings = await m.getSettings();
    if (!settings) throw new Error('Accounting seed validation failed: settings singleton missing after insert.');
    this.assertWiring(settings, resolved);
  }

  // Assert the settings row references exactly the accounts SETTINGS_CODE_MAP demands.
  private assertWiring(settings: Record<string, any>, resolved: Record<string, string>): void {
    for (const [col, code] of Object.entries(SETTINGS_CODE_MAP)) {
      const expected = resolved[code];
      if (!expected || settings[col] !== expected) {
        throw new Error(`Accounting inconsistent: settings.${col} references ${settings[col]}, expected code ${code} (${expected}). No modification performed.`);
      }
    }
  }
}