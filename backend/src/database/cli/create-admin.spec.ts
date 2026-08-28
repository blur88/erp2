import { jest } from '@jest/globals';
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

  it('trims and lowercases username and email', () => {
    const result = resolveAdminInput(
      ['--username', '  Root.Admin  ', '--email', '  Root@Example.COM '],
      { ADMIN_PASSWORD: 'S3cret!pass' } as NodeJS.ProcessEnv,
    );
    expect(result.username).toBe('root.admin');
    expect(result.email).toBe('root@example.com');
  });

  describe('rejects credentials that violate CreateUserDto policy', () => {
    const call = (username: string, email: string, password: string) => () =>
      resolveAdminInput(['--username', username, '--email', email], {
        ADMIN_PASSWORD: password,
      } as NodeJS.ProcessEnv);

    const OK_USER = 'root';
    const OK_EMAIL = 'root@example.com';
    const OK_PASS = 'S3cret!pass';

    it('rejects a username shorter than 3 characters', () => {
      expect(call('ab', OK_EMAIL, OK_PASS)).toThrow('between 3 and 50');
    });

    it('rejects a username longer than 50 characters', () => {
      expect(call('a'.repeat(51), OK_EMAIL, OK_PASS)).toThrow(
        'between 3 and 50',
      );
    });

    it('rejects a username with illegal characters', () => {
      expect(call('root admin', OK_EMAIL, OK_PASS)).toThrow(
        'letters, numbers, dots',
      );
      expect(call('root$admin', OK_EMAIL, OK_PASS)).toThrow(
        'letters, numbers, dots',
      );
    });

    it('rejects a malformed email', () => {
      expect(call(OK_USER, 'not-an-email', OK_PASS)).toThrow('valid email');
      expect(call(OK_USER, 'missing@domain', OK_PASS)).toThrow('valid email');
      expect(call(OK_USER, '@example.com', OK_PASS)).toThrow('valid email');
    });

    // Regression: these pass a naive /^[^\s@]+@[^\s@]+\.[^\s@]+$/ but are
    // rejected by class-validator's isEmail(), which @IsEmail() uses in
    // CreateUserDto. The CLI must reject exactly what the HTTP API rejects.
    it.each([
      ['consecutive dots in local part', 'a..b@example.com'],
      ['leading dot in local part', '.a@example.com'],
      ['hyphen-prefixed domain label', 'a@-example.com'],
      ['consecutive dots in domain', 'a@example..com'],
    ])('rejects %s (%s)', (_label, email) => {
      expect(call(OK_USER, email, OK_PASS)).toThrow('valid email');
    });

    it('still accepts valid addresses that look unusual', () => {
      expect(() =>
        resolveAdminInput(['--username', OK_USER, '--email', 'a-b@example.co'], {
          ADMIN_PASSWORD: OK_PASS,
        } as NodeJS.ProcessEnv),
      ).not.toThrow();
    });

    it('rejects an email longer than 100 characters', () => {
      const long = `${'a'.repeat(95)}@example.com`;
      expect(call(OK_USER, long, OK_PASS)).toThrow('exceed 100');
    });

    it('rejects a password shorter than 8 characters', () => {
      expect(call(OK_USER, OK_EMAIL, 'S3c!a')).toThrow('between 8 and 128');
    });

    it('rejects a password longer than 128 characters', () => {
      expect(call(OK_USER, OK_EMAIL, `S3cret!${'a'.repeat(130)}`)).toThrow(
        'between 8 and 128',
      );
    });

    it('rejects a password missing an uppercase letter', () => {
      expect(call(OK_USER, OK_EMAIL, 's3cret!pass')).toThrow(
        'uppercase letter',
      );
    });

    it('rejects a password missing a lowercase letter', () => {
      expect(call(OK_USER, OK_EMAIL, 'S3CRET!PASS')).toThrow(
        'uppercase letter',
      );
    });

    it('rejects a password missing a digit', () => {
      expect(call(OK_USER, OK_EMAIL, 'Secret!pass')).toThrow(
        'uppercase letter',
      );
    });

    it('rejects a password missing a special character', () => {
      expect(call(OK_USER, OK_EMAIL, 'S3cretpass')).toThrow(
        'uppercase letter',
      );
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
      findOne: (jest.fn as unknown as any)(({ where }: any) => {
        const [[field, value]] = Object.entries(where);
        return Promise.resolve(
          rows.find((r) => r[field] === value) ?? null,
        );
      }),
      create: (jest.fn as unknown as any)((v: any) => v),
      save: (jest.fn as unknown as any)((v: any) => Promise.resolve(v)),
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
