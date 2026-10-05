import bcrypt from 'bcrypt';
import { DataSource } from 'typeorm';
import { User, UserRole, UserStatus } from '../../src/database/entities/user.entity';
import { removeSuiteTraces } from './shared-e2e-traces-fixture';

export const AUTHSESS_NS = 'authsess';
export const AUTHSESS_USERS = [`${AUTHSESS_NS}_a`, `${AUTHSESS_NS}_b`] as const;
export const AUTHSESS_PASSWORD = 'Sess@12345!';

export interface HeldLock {
  pid: number;
  run(sql: string, params?: unknown[]): Promise<unknown>;
  release(): Promise<void>;
}

export async function removeSessionSuiteRows(ds: DataSource): Promise<void> {
  const users = await ds.query(
    `SELECT id, username FROM users WHERE username LIKE '${AUTHSESS_NS}_%'`,
  );
  const userIds: string[] = users.map((u: { id: string }) => u.id);
  const usernames: string[] = users.map((u: { username: string }) => u.username);

  if (userIds.length > 0) {
    const sessions = await ds.query(
      `SELECT id FROM auth_sessions WHERE "userId" = ANY($1)`,
      [userIds],
    );
    const sessionIds: string[] = sessions.map((s: { id: string }) => s.id);

    await removeSuiteTraces(ds, {
      userIds,
      usernames,
      entityIds: sessionIds,
    });

    await ds.query(`DELETE FROM users WHERE id = ANY($1)`, [userIds]);
  } else {
    await ds.query(
      `DELETE FROM audit_logs WHERE username LIKE '${AUTHSESS_NS}_%'`,
    );
  }
}

export async function seedSessionUsers(ds: DataSource): Promise<Record<string, User>> {
  await removeSessionSuiteRows(ds);

  const hash = await bcrypt.hash(AUTHSESS_PASSWORD, 4);
  const userRepo = ds.getRepository(User);
  const seeded: Record<string, User> = {};

  for (const username of AUTHSESS_USERS) {
    const user = userRepo.create({
      username,
      email: `${username}@example.com`,
      password: hash,
      firstName: 'Session',
      lastName: username,
      role: UserRole.ADMIN,
      status: UserStatus.ACTIVE,
      isActive: true,
      failedLoginAttempts: 0,
    });
    const saved = await userRepo.save(user);
    seeded[username] = saved;
  }

  return seeded;
}

export async function holdRowLock(
  ds: DataSource,
  sql: string,
  params: unknown[] = [],
): Promise<HeldLock> {
  const runner = ds.createQueryRunner();
  await runner.connect();
  await runner.startTransaction();
  const pidRes = await runner.query('SELECT pg_backend_pid() AS pid');
  const pid = Number(pidRes[0].pid);
  await runner.query(sql, params);

  return {
    pid,
    async run(querySql: string, queryParams: unknown[] = []): Promise<unknown> {
      return runner.query(querySql, queryParams);
    },
    async release(): Promise<void> {
      try {
        await runner.commitTransaction();
      } finally {
        await runner.release();
      }
    },
  };
}

export async function waitForBlockedBy(
  ds: DataSource,
  blocker: HeldLock,
  n: number,
  timeoutMs = 5000,
): Promise<void> {
  const start = Date.now();
  while (Date.now() - start < timeoutMs) {
    const res = await ds.query(
      `SELECT count(*)::int AS count FROM pg_stat_activity WHERE $1 = ANY(pg_blocking_pids(pid))`,
      [blocker.pid],
    );
    const count = Number(res[0]?.count ?? 0);
    if (count === n) {
      return;
    }
    await new Promise((resolve) => setTimeout(resolve, 50));
  }
  throw new Error(
    `waitForBlockedBy timed out after ${timeoutMs}ms waiting for ${n} waiter(s) on pid ${blocker.pid}`,
  );
}
