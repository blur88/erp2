import { resolveAdminInput, createAdmin } from './create-admin';
import { UserRole, UserStatus } from '../entities/user.entity';

describe('resolveAdminInput', () => {
  it('reads username and email from argv and password from env', () => {
    const result = resolveAdminInput(
      ['--username', 'root', '--email', 'root@example.com'],
      { ADMIN_PASSWORD: 'S3cret!pass' } as NodeJS.ProcessEnv,
    );
    expect(result).toEqual({
      username: 'root',
      email: 'root@example.com',
      password: 'S3cret!pass',
    });
  });

  it('throws when password env var is absent', () => {
    expect(() =>
      resolveAdminInput(
        ['--username', 'root', '--email', 'root@example.com'],
        {} as NodeJS.ProcessEnv,
      ),
    ).toThrow('ADMIN_PASSWORD');
  });

  it('throws when username is absent', () => {
    expect(() =>
      resolveAdminInput(
        ['--email', 'root@example.com'],
        { ADMIN_PASSWORD: 'S3cret!pass' } as NodeJS.ProcessEnv,
      ),
    ).toThrow('--username');
  });

  it('throws when email is absent', () => {
    expect(() =>
      resolveAdminInput(
        ['--username', 'root'],
        { ADMIN_PASSWORD: 'S3cret!pass' } as NodeJS.ProcessEnv,
      ),
    ).toThrow('--email');
  });
});

describe('createAdmin', () => {
  const input = {
    username: 'root',
    email: 'root@example.com',
    password: 'S3cret!pass',
  };

  const dataSourceWith = (rows: any[]) => {
    const repo = {
      findOne: jest.fn(({ where }: any) => {
        const [[field, value]] = Object.entries(where);
        return Promise.resolve(
          rows.find((r) => r[field] === value) ?? null,
        );
      }),
      create: jest.fn((v: any) => v),
      save: jest.fn((v: any) => Promise.resolve(v)),
    };
    return { dataSource: { getRepository: () => repo } as any, repo };
  };

  it('creates the admin when no conflicting user exists', async () => {
    const { dataSource, repo } = dataSourceWith([]);
    await expect(createAdmin(dataSource, input)).resolves.toBe('created');
    expect(repo.save).toHaveBeenCalled();
  });

  it('is a no-op when the same active admin already exists', async () => {
    const { dataSource, repo } = dataSourceWith([
      {
        id: 'u1',
        username: 'root',
        email: 'root@example.com',
        role: UserRole.ADMIN,
        status: UserStatus.ACTIVE,
        isActive: true,
      },
    ]);
    await expect(createAdmin(dataSource, input)).resolves.toBe('exists');
    expect(repo.save).not.toHaveBeenCalled();
  });

  it('rejects an existing admin that is soft-disabled (isActive=false)', async () => {
    const { dataSource } = dataSourceWith([
      {
        id: 'u1',
        username: 'root',
        email: 'root@example.com',
        role: UserRole.ADMIN,
        status: UserStatus.ACTIVE,
        isActive: false,
      },
    ]);
    await expect(createAdmin(dataSource, input)).rejects.toThrow(
      'not an active admin',
    );
  });

  it('rejects an existing username that is not an admin', async () => {
    const { dataSource } = dataSourceWith([
      {
        id: 'u1',
        username: 'root',
        email: 'root@example.com',
        role: UserRole.SALES_STAFF,
        status: UserStatus.ACTIVE,
        isActive: true,
      },
    ]);
    await expect(createAdmin(dataSource, input)).rejects.toThrow(
      'not an active admin',
    );
  });

  it('rejects an existing username with a different email', async () => {
    const { dataSource } = dataSourceWith([
      {
        id: 'u1',
        username: 'root',
        email: 'other@example.com',
        role: UserRole.ADMIN,
        status: UserStatus.ACTIVE,
        isActive: true,
      },
    ]);
    await expect(createAdmin(dataSource, input)).rejects.toThrow(
      'different email',
    );
  });

  it('rejects an email already used by another username', async () => {
    const { dataSource } = dataSourceWith([
      {
        id: 'u2',
        username: 'someone-else',
        email: 'root@example.com',
        role: UserRole.ADMIN,
        status: UserStatus.ACTIVE,
        isActive: true,
      },
    ]);
    await expect(createAdmin(dataSource, input)).rejects.toThrow(
      'already used by user',
    );
  });

  it('rejects an existing admin whose account is suspended', async () => {
    const { dataSource } = dataSourceWith([
      {
        id: 'u1',
        username: 'root',
        email: 'root@example.com',
        role: UserRole.ADMIN,
        status: UserStatus.SUSPENDED,
        isActive: true,
      },
    ]);
    await expect(createAdmin(dataSource, input)).rejects.toThrow(
      'not an active admin',
    );
  });
});
