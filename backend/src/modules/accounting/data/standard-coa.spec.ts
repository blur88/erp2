import { STANDARD_COA_GROUPS, STANDARD_COA_CHILDREN, SETTINGS_CODE_MAP } from './standard-coa';
import { CreateAccountingV11772100000001 as MigrationClass } from '../../../database/migrations/1772100000001-CreateAccountingV1';

interface NormRow {
  code: string;
  name: string;
  type: string;
  parentCode: string | null;
  isSystem: boolean;
  isPostable: boolean;
}

type Call = { sql: string; params: any[] };

function makeCapturingRunner(calls: Call[]) {
  return {
    query: (sql: string, params: any[] = []) => {
      calls.push({ sql, params });
      return Promise.resolve([]);
    },
  } as any;
}

// Reconstruct the migration's full COA dataset from captured INSERT calls.
function capturedCoa(calls: Call[]): NormRow[] {
  return calls
    .filter((c) => /INSERT INTO "chart_of_account"/.test(c.sql))
    .map((c) => {
      // Child rows use the INSERT template that includes the "parentId" column;
      // group rows use the template without it. params: group [code,name,type],
      // child [code,name,type,parentCode].
      const isChild = /parentId/.test(c.sql);
      return {
        code: c.params[0],
        name: c.params[1],
        type: c.params[2],
        parentCode: isChild ? c.params[3] : null,
        isSystem: true,
        isPostable: isChild, // groups isPostable=false, children isPostable=true
      };
    })
    .sort((a, b) => a.code.localeCompare(b.code));
}

function capturedSettings(calls: Call[]): Record<string, string> {
  const call = calls.find((c) => /INSERT INTO "accounting_settings"/.test(c.sql));
  if (!call) return {};
  const out: Record<string, string> = {};
  // Settings SQL wires each column via (SELECT id FROM chart_of_account WHERE code='NNNN').
  // Parse column -> code pairs from the SQL text of this single statement.
  const codeMatches = [...call.sql.matchAll(/code='(\d+)'/g)].map((m) => m[1]);
  const cols = Object.keys(SETTINGS_CODE_MAP);
  cols.forEach((col, i) => (out[col] = codeMatches[i]));
  return out;
}

function expectedCoa(): NormRow[] {
  return [
    ...STANDARD_COA_GROUPS.map((g) => ({
      code: g.code,
      name: g.name,
      type: g.type as string,
      parentCode: null,
      isSystem: true,
      isPostable: false,
    })),
    ...STANDARD_COA_CHILDREN.map((c) => ({
      code: c.code,
      name: c.name,
      type: c.type as string,
      parentCode: c.parentCode,
      isSystem: true,
      isPostable: true,
    })),
  ].sort((a, b) => a.code.localeCompare(b.code));
}

describe('standard-coa constant exactly matches frozen migration 1772100000001', () => {
  const calls: Call[] = [];
  beforeAll(async () => {
    await new MigrationClass().up(makeCapturingRunner(calls));
  });

  it('captured COA dataset equals the constant-derived dataset exactly', () => {
    expect(capturedCoa(calls)).toEqual(expectedCoa());
  });

  it('captured settings wiring equals SETTINGS_CODE_MAP exactly', () => {
    expect(capturedSettings(calls)).toEqual({ ...SETTINGS_CODE_MAP });
  });
});