import { jest } from '@jest/globals';

describe('check-baseline CLI', () => {
  afterEach(() => {
    jest.restoreAllMocks();
  });

  it.each([
    ['no user tables', 0, false, 0, 'FRESH'],
    ['user tables without a migrations table', 1, false, 0, 'UNTRACKED_SCHEMA'],
    ['user tables with empty migration history', 1, true, 0, 'UNTRACKED_SCHEMA'],
    ['user tables with migration history', 1, true, 1, 'BASELINED'],
  ])('reports the state for %s', async (_label, tables, hasHistoryTable, migrations, token) => {
    jest.resetModules();
    let finish: () => void;
    const finished = new Promise<void>((resolve) => {
      finish = resolve;
    });
    const queryRunner = {
      query: jest
        .fn<(...args: any[]) => Promise<any>>()
        .mockResolvedValueOnce([{ count: tables }])
        .mockResolvedValueOnce([{ count: migrations }]),
      hasTable: jest.fn<(...args: any[]) => Promise<boolean>>().mockResolvedValue(hasHistoryTable),
      release: jest.fn<() => Promise<void>>().mockResolvedValue(undefined),
    };
    const dataSource = {
      setOptions: jest.fn(),
      initialize: jest.fn<() => Promise<void>>().mockResolvedValue(undefined),
      createQueryRunner: jest.fn().mockReturnValue(queryRunner),
      destroy: jest.fn<() => Promise<void>>().mockImplementation(async () => finish()),
    };
    jest.unstable_mockModule('../config/cli-datasource', () => ({ default: dataSource }));
    const stdout = jest.spyOn(process.stdout, 'write').mockReturnValue(true);

    await import('./check-baseline');
    await finished;

    expect(stdout).toHaveBeenCalledTimes(1);
    expect(stdout).toHaveBeenCalledWith(token);
    expect(dataSource.setOptions).toHaveBeenCalledWith({
      synchronize: false,
      migrationsRun: false,
    });
  });
});
