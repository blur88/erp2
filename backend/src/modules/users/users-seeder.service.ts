import { Injectable, Logger, OnModuleInit } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { InjectDataSource } from '@nestjs/typeorm';
import { DataSource, EntityManager } from 'typeorm';
import * as bcrypt from 'bcrypt';
import { User, UserRole, UserStatus } from '../../database/entities/user.entity';

// Distinct from the accounting seeder's key (891891) so the two advisory
// locks can never block each other during a parallel boot.
const SEED_LOCK_KEY = 891892;

// Must match auth.service.ts BCRYPT_ROUNDS so a seeded password verifies at
// the same cost as one set through the app.
const BCRYPT_ROUNDS = 12;

export const DEFAULT_ADMIN_USERNAME = 'admin';
export const DEFAULT_ADMIN_EMAIL = 'admin@example.com';
// Documented in CLAUDE.md and .env.example:126. Override with ADMIN_PASSWORD.
export const DEFAULT_ADMIN_PASSWORD = 'Admin@123!';

// Data-access surface. Production adapter wraps a TypeORM EntityManager; the
// unit test supplies a fake with the same methods.
export interface UsersSeederManager {
  advisoryLock(key: number): Promise<void>;
  userCount(): Promise<number>;
  insertUser(row: Record<string, any>): Promise<void>;
}

// Anything that can run the core inside a transaction.
export interface UsersSeederDb {
  transaction(body: (m: UsersSeederManager) => Promise<void>): Promise<void>;
}

/**
 * Creates the bootstrap administrator when the users table is completely empty.
 *
 * Without this, a deployment built from the InitialSchema baseline (#950) has no
 * account at all and nobody can log in: InitialSchema seeds reference data
 * (chart of accounts, payment methods, regional settings) but never a user.
 *
 * Deliberately only fires on a fully empty table. If an operator renames or
 * deletes the default admin but any other user remains, we must not silently
 * recreate a known-password admin account behind their back.
 */
@Injectable()
export class UsersSeederService implements OnModuleInit {
  private readonly logger = new Logger(UsersSeederService.name);

  constructor(
    @InjectDataSource() private readonly source: DataSource | UsersSeederDb,
    private readonly configService: ConfigService,
  ) {}

  async onModuleInit(): Promise<void> {
    await this.seed();
  }

  async seed(): Promise<void> {
    try {
      await this.runInTransaction(async (m) => {
        // Serialise concurrent boots (multiple replicas) so only one inserts.
        await m.advisoryLock(SEED_LOCK_KEY);
        await this.runCore(m);
      });
    } catch (err) {
      this.logger.error(
        `Admin bootstrap failed: ${(err as Error).message}`,
        (err as Error).stack,
      );
      throw err;
    }
  }

  private runInTransaction(body: (m: UsersSeederManager) => Promise<void>): Promise<void> {
    if (this.source instanceof DataSource) {
      return this.source.transaction(async (em) => body(this.adapter(em)));
    }
    return (this.source as UsersSeederDb).transaction(body);
  }

  private adapter(em: EntityManager): UsersSeederManager {
    const users = em.getRepository(User);
    return {
      advisoryLock: async (key) => {
        await em.query('SELECT pg_advisory_xact_lock($1)', [key]);
      },
      // withDeleted: a soft-deleted user still occupies its unique username,
      // so treating the table as empty would make the insert fail.
      userCount: () => users.count({ withDeleted: true } as any),
      insertUser: async (row) => {
        await users.createQueryBuilder().insert().values(row as any).orIgnore().execute();
      },
    };
  }

  private async runCore(m: UsersSeederManager): Promise<void> {
    const count = await m.userCount();
    if (count > 0) {
      return;
    }

    const username =
      this.configService.get<string>('ADMIN_USERNAME') || DEFAULT_ADMIN_USERNAME;
    const email = this.configService.get<string>('ADMIN_EMAIL') || DEFAULT_ADMIN_EMAIL;
    const plainPassword =
      this.configService.get<string>('ADMIN_PASSWORD') || DEFAULT_ADMIN_PASSWORD;
    const usingDefaultPassword = plainPassword === DEFAULT_ADMIN_PASSWORD;

    await m.insertUser({
      username,
      email,
      password: await bcrypt.hash(plainPassword, BCRYPT_ROUNDS),
      firstName: 'System',
      lastName: 'Administrator',
      role: UserRole.ADMIN,
      status: UserStatus.ACTIVE,
      isActive: true,
      // Always true, even for an operator-supplied ADMIN_PASSWORD: the
      // bootstrap password is shared/known by whoever provisioned the system.
      requiresPasswordChange: true,
    });

    this.logger.log(`Bootstrapped administrator account "${username}".`);
    if (usingDefaultPassword) {
      this.logger.warn(
        `Administrator "${username}" was created with the default password. ` +
          'Change it immediately, or set ADMIN_PASSWORD before first boot.',
      );
    }
  }
}
