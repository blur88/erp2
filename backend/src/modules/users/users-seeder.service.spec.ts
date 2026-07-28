import * as bcrypt from 'bcrypt';
import {
  UsersSeederService,
  UsersSeederManager,
  UsersSeederDb,
  DEFAULT_ADMIN_PASSWORD,
  DEFAULT_ADMIN_USERNAME,
} from './users-seeder.service';

// Fake manager capturing what the seeder would write, so the core logic is
// exercised without a database. Mirrors AccountingSeederService's test shape.
class FakeManager implements UsersSeederManager {
  locks: number[] = [];
  inserted: Array<Record<string, any>> = [];

  constructor(private existingUserCount = 0) {}

  async advisoryLock(key: number): Promise<void> {
    this.locks.push(key);
  }

  async userCount(): Promise<number> {
    return this.existingUserCount;
  }

  async insertUser(row: Record<string, any>): Promise<void> {
    this.inserted.push(row);
  }
}

class FakeDb implements UsersSeederDb {
  constructor(public manager: FakeManager) {}
  async transaction(body: (m: UsersSeederManager) => Promise<void>): Promise<void> {
    await body(this.manager);
  }
}

const configOf = (values: Record<string, string | undefined>) =>
  ({ get: (key: string) => values[key] }) as any;

describe('UsersSeederService', () => {
  describe('when the users table is empty', () => {
    it('seeds a single admin user', async () => {
      const manager = new FakeManager(0);
      await new UsersSeederService(new FakeDb(manager) as any, configOf({})).seed();

      expect(manager.inserted).toHaveLength(1);
      const row = manager.inserted[0];
      expect(row.username).toBe(DEFAULT_ADMIN_USERNAME);
      expect(row.role).toBe('admin');
      expect(row.status).toBe('active');
      expect(row.isActive).toBe(true);
    });

    it('stores the password as a bcrypt hash, never in plain text', async () => {
      const manager = new FakeManager(0);
      await new UsersSeederService(new FakeDb(manager) as any, configOf({})).seed();

      const { password } = manager.inserted[0];
      expect(password).not.toBe(DEFAULT_ADMIN_PASSWORD);
      expect(password).toMatch(/^\$2[aby]\$/);
      await expect(bcrypt.compare(DEFAULT_ADMIN_PASSWORD, password)).resolves.toBe(true);
    });

    it('forces a password change on first login', async () => {
      const manager = new FakeManager(0);
      await new UsersSeederService(new FakeDb(manager) as any, configOf({})).seed();

      expect(manager.inserted[0].requiresPasswordChange).toBe(true);
    });

    it('uses ADMIN_PASSWORD from config when provided', async () => {
      const manager = new FakeManager(0);
      await new UsersSeederService(
        new FakeDb(manager) as any,
        configOf({ ADMIN_PASSWORD: 'S3cret!Override' }),
      ).seed();

      const { password } = manager.inserted[0];
      await expect(bcrypt.compare('S3cret!Override', password)).resolves.toBe(true);
      await expect(bcrypt.compare(DEFAULT_ADMIN_PASSWORD, password)).resolves.toBe(false);
    });

    it('honours ADMIN_USERNAME and ADMIN_EMAIL overrides', async () => {
      const manager = new FakeManager(0);
      await new UsersSeederService(
        new FakeDb(manager) as any,
        configOf({ ADMIN_USERNAME: 'root', ADMIN_EMAIL: 'root@corp.test' }),
      ).seed();

      expect(manager.inserted[0].username).toBe('root');
      expect(manager.inserted[0].email).toBe('root@corp.test');
    });

    it('takes an advisory lock before writing, to serialise concurrent boots', async () => {
      const manager = new FakeManager(0);
      await new UsersSeederService(new FakeDb(manager) as any, configOf({})).seed();

      expect(manager.locks).toHaveLength(1);
      expect(manager.inserted).toHaveLength(1);
    });
  });

  describe('when users already exist', () => {
    it('does not insert anything', async () => {
      const manager = new FakeManager(3);
      await new UsersSeederService(new FakeDb(manager) as any, configOf({})).seed();

      expect(manager.inserted).toHaveLength(0);
    });

    it('does not resurrect the admin after it was deliberately removed', async () => {
      // Only a fully empty table triggers the bootstrap; one remaining user
      // (e.g. a renamed admin) must not cause a second admin to appear.
      const manager = new FakeManager(1);
      await new UsersSeederService(new FakeDb(manager) as any, configOf({})).seed();

      expect(manager.inserted).toHaveLength(0);
    });
  });

  describe('failure handling', () => {
    it('propagates errors so a failed bootstrap is not silent', async () => {
      const manager = new FakeManager(0);
      manager.insertUser = async () => {
        throw new Error('insert exploded');
      };

      await expect(
        new UsersSeederService(new FakeDb(manager) as any, configOf({})).seed(),
      ).rejects.toThrow('insert exploded');
    });
  });
});
