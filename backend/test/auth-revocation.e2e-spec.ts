import { AsyncLocalStorage } from "node:async_hooks";
import { jest } from "@jest/globals";
import { Test } from "@nestjs/testing";
import { INestApplication } from "@nestjs/common";
import { DataSource, QueryRunner } from "typeorm";
import { JwtService } from "@nestjs/jwt";
import request from "supertest";
import * as bcrypt from "bcrypt";
import { AppModule } from "../src/app.module";
import {
  User,
  UserRole,
  UserStatus,
} from "../src/database/entities/user.entity";
import { RefreshToken } from "../src/database/entities/refresh-token.entity";
import { AuthService } from "../src/modules/auth/auth.service";
import {
  AuthUserLockHook,
  AuthUserLockOperation,
} from "../src/modules/auth/auth-user-lock.hook";
import { configureTestAppValidation } from "./utils/configure-test-app-validation";
import { removeSuiteTraces } from "./utils/shared-e2e-traces-fixture";

const deferred = () => {
  let resolve!: () => void;
  const promise = new Promise<void>((done) => {
    resolve = done;
  });
  return { promise, resolve };
};

describe("Session revocation (database and HTTP)", () => {
  let app: INestApplication;
  let ds: DataSource;
  let auth: AuthService;
  let jwt: JwtService;
  let user: User;
  let onLock: (
    operation: AuthUserLockOperation,
    userId: string,
  ) => Promise<void>;
  const password = "Initial@123!";
  const changed = "Changed@456!";
  const dto = {
    currentPassword: password,
    newPassword: changed,
    newPasswordConfirmation: changed,
  };
  const login = () => auth.login({ usernameOrEmail: user.username, password });
  const me = (token: string) =>
    request(app.getHttpServer())
      .get("/auth/me")
      .auth(token, { type: "bearer" });
  const count = () =>
    ds.getRepository(RefreshToken).countBy({ userId: user.id });

  type Operation = { pid?: number };
  const context = new AsyncLocalStorage<Operation>();
  const activeRunners = new Map<QueryRunner, Operation>();
  const releases: (() => void)[] = [];
  const tasks: Promise<any>[] = [];
  async function bounded<T>(
    promise: Promise<T>,
    description: string,
    ms = 10000,
  ): Promise<T> {
    let timer: ReturnType<typeof setTimeout>;
    try {
      return await Promise.race([
        promise,
        new Promise<never>((_, reject) => {
          timer = setTimeout(
            () => reject(new Error(`Timed out: ${description}`)),
            ms,
          );
        }),
      ]);
    } finally {
      clearTimeout(timer!);
    }
  }
  function start(
    operation: Operation,
    action: () => Promise<any>,
  ): Promise<any> {
    const task = context.run(operation, action).then(
      (value) => ({ value }),
      (error) => ({ error }),
    );
    tasks.push(task);
    return task;
  }
  async function settleTasks() {
    releases.splice(0).forEach((release) => release());
    try {
      await bounded(Promise.allSettled(tasks), "operations finish", 18000);
    } finally {
      for (const operation of activeRunners.values()) {
        if (operation.pid)
          await bounded(
            ds.query("SELECT pg_terminate_backend($1)", [operation.pid]),
            "terminate owned backend",
          );
      }
      await bounded(
        Promise.allSettled(tasks.splice(0)),
        "terminated operations finish",
      );
      activeRunners.clear();
    }
  }

  beforeAll(async () => {
    const module = await Test.createTestingModule({ imports: [AppModule] })
      .overrideProvider(AuthUserLockHook)
      .useValue({
        afterUserLock: (operation: AuthUserLockOperation, id: string) =>
          onLock(operation, id),
      })
      .compile();
    app = module.createNestApplication();
    configureTestAppValidation(app);
    await app.init();
    ds = module.get(DataSource);
    auth = module.get(AuthService);
    jwt = module.get(JwtService);
  });
  beforeEach(async () => {
    const createRunner = ds.createQueryRunner.bind(ds);
    jest.spyOn(ds, "createQueryRunner").mockImplementation((mode) => {
      const runner = createRunner(mode);
      const operation = context.getStore();
      if (!operation) return runner;
      const query = runner.query.bind(runner);
      const release = runner.release.bind(runner);
      activeRunners.set(runner, operation);
      runner.release = async () => {
        activeRunners.delete(runner);
        return release();
      };
      runner.query = async (...args: Parameters<QueryRunner["query"]>) => {
        const result = await query(...args);
        if (args[0] === "START TRANSACTION") {
          const [row] = await query("SELECT pg_backend_pid() AS pid");
          operation.pid = row.pid;
          await query("SET LOCAL statement_timeout = '15s'");
        }
        return result;
      };
      return runner;
    });
    onLock = async () => {};
    user = await ds.getRepository(User).save(
      ds.getRepository(User).create({
        username: "revocationspec_user",
        email: "revocationspec@test.com",
        password: await bcrypt.hash(password, 4),
        role: UserRole.ADMIN,
        isActive: true,
        status: UserStatus.ACTIVE,
      }),
    );
  });
  afterEach(async () => {
    try {
      await settleTasks();
    } finally {
      jest.restoreAllMocks();
      onLock = async () => {};
      await removeSuiteTraces(ds, {
        userIds: [user.id],
        usernames: [user.username],
      });
      await ds.getRepository(User).delete(user.id);
    }
  });
  afterAll(async () => {
    await app?.close();
  });

  it("rejects issued access tokens after HTTP Sign out", async () => {
    const tokens = await login();
    await request(app.getHttpServer())
      .post("/auth/logout")
      .auth(tokens.accessToken, { type: "bearer" })
      .expect(204);
    await me(tokens.accessToken).expect(401);
    expect(await count()).toBe(0);
  });
  it("rejects issued access tokens after HTTP password change", async () => {
    const tokens = await login();
    await request(app.getHttpServer())
      .patch("/auth/change-password")
      .auth(tokens.accessToken, { type: "bearer" })
      .send(dto)
      .expect(204);
    await me(tokens.accessToken).expect(401);
    expect(await count()).toBe(0);
  });
  it("rejects a hand-signed token with no version claim", async () => {
    await me(jwt.sign({ sub: user.id })).expect(401);
  });
  it("keeps an incremented version when a stale entity is saved", async () => {
    const stale = await ds.getRepository(User).findOneByOrFail({ id: user.id });
    await auth.logout(user.id);
    stale.firstName = "Updated";
    await ds.getRepository(User).save(stale);
    expect(
      await ds.getRepository(User).findOneByOrFail({ id: user.id }),
    ).toMatchObject({ firstName: "Updated", tokenVersion: 1 });
  });
  it("retains a locked user refresh token until unlocking", async () => {
    const tokens = await login();
    await ds
      .getRepository(User)
      .update(user.id, { lockedUntil: new Date(Date.now() + 60000) });
    await expect(
      auth.refreshAccessToken({ refreshToken: tokens.refreshToken }),
    ).rejects.toThrow("User account is locked");
    expect(await count()).toBe(1);
    await ds.getRepository(User).update(user.id, { lockedUntil: null });
    const refreshed = await auth.refreshAccessToken({
      refreshToken: tokens.refreshToken,
    });
    await me(refreshed.accessToken).expect(200);
  });
  it.each([{ isActive: false }, { lockedUntil: new Date(Date.now() + 60000) }])(
    "allows revocation regardless of eligibility: %s",
    async (state) => {
      const tokens = await login();
      await ds.getRepository(User).update(user.id, state);
      await auth.logout(user.id);
      await ds
        .getRepository(User)
        .update(user.id, { isActive: true, lockedUntil: null });
      await me(tokens.accessToken).expect(401);
    },
  );
  it("rolls back the new hash and Sessions when revocation fails", async () => {
    const tokens = await login();
    // A trigger faults after the password UPDATE, inside the shared revocation.
    await ds.query(
      `CREATE FUNCTION revocationspec_fail() RETURNS trigger LANGUAGE plpgsql AS $$ BEGIN IF NEW."tokenVersion" <> OLD."tokenVersion" THEN RAISE EXCEPTION 'revocationspec rollback'; END IF; RETURN NEW; END $$`,
    );
    await ds.query(
      "CREATE TRIGGER revocationspec_fail BEFORE UPDATE ON users FOR EACH ROW EXECUTE FUNCTION revocationspec_fail()",
    );
    try {
      await expect(auth.changePassword(user.id, dto)).rejects.toThrow(
        "revocationspec rollback",
      );
      const current = await ds
        .getRepository(User)
        .findOneByOrFail({ id: user.id });
      expect(current.password).toBe(user.password);
      expect(current.tokenVersion).toBe(0);
      await me(tokens.accessToken).expect(200);
      expect(await count()).toBe(1);
    } finally {
      await ds.query("DROP TRIGGER revocationspec_fail ON users");
      await ds.query("DROP FUNCTION revocationspec_fail()");
    }
  });

  // Observe the actual user SELECT lock, not login bookkeeping's UPDATE wait.
  async function waitForUserLock(
    waiter: Operation,
    holder: Operation,
  ): Promise<void> {
    const deadline = Date.now() + 5000;
    while (Date.now() < deadline) {
      if (waiter.pid && holder.pid) {
        const [row] = await bounded(
          ds.query(
            `SELECT wait_event_type, query, pg_blocking_pids(pid) AS blockers
          FROM pg_stat_activity WHERE pid = $1`,
            [waiter.pid],
          ),
          "observe lock wait",
        );
        if (
          row?.wait_event_type === "Lock" &&
          row.blockers.includes(holder.pid) &&
          /FOR NO KEY UPDATE/i.test(row.query) &&
          row.query.includes("users")
        )
          return;
      }
      await new Promise((resolve) => setTimeout(resolve, 10));
    }
    throw new Error(
      "Second operation never waited on the user issuance/revocation lock",
    );
  }

  async function ordered(
    firstOperation: AuthUserLockOperation,
    first: () => Promise<any>,
    second: () => Promise<any>,
    secondOperation: Operation = {},
  ) {
    const entered = deferred();
    const release = deferred();
    const firstOperationContext: Operation = {};
    releases.push(release.resolve);
    let firstSeen = false;
    onLock = async (operation, id) => {
      if (id === user.id && operation === firstOperation && !firstSeen) {
        firstSeen = true;
        entered.resolve();
        await bounded(release.promise, "release first operation");
      }
    };
    const firstResult = start(firstOperationContext, first);
    let secondResult: Promise<any> | undefined;
    try {
      await bounded(
        Promise.race([
          entered.promise,
          firstResult.then(() => {
            throw new Error("First operation did not reach barrier");
          }),
        ]),
        "first operation reaches barrier",
      );
      secondResult = start(secondOperation, second);
      await bounded(
        waitForUserLock(secondOperation, firstOperationContext),
        "second waits for first",
      );
    } finally {
      release.resolve();
      await bounded(
        Promise.all([firstResult, secondResult]),
        "ordered operations complete",
        18000,
      );
    }
    return [
      await bounded(firstResult, "first result"),
      await bounded(secondResult!, "second result"),
    ];
  }

  // Pause login after bcrypt/bookkeeping, before it opens its issuance transaction.
  // This avoids mistaking the bookkeeping UPDATE for the intended lock wait.
  async function prepareLogin() {
    const operation: Operation = {};
    const ready = deferred();
    const release = deferred();
    releases.push(release.resolve);
    const manager = ds.getRepository(User).manager;
    const original = manager.transaction.bind(manager);
    const spy = jest
      .spyOn(manager, "transaction")
      .mockImplementationOnce((async (...args: any[]) => {
        ready.resolve();
        await bounded(release.promise, "release prepared login");
        return (original as any)(...args);
      }) as any);
    const pending = start(operation, login);
    try {
      await bounded(
        Promise.race([
          ready.promise,
          pending.then(() => {
            throw new Error("Login did not reach preparation barrier");
          }),
        ]),
        "login prepared",
      );
      return { release, pending, operation };
    } catch (error) {
      release.resolve();
      await bounded(pending, "failed preparation finishes", 18000);
      throw error;
    } finally {
      spy.mockRestore();
    }
  }

  it("orders refresh then Sign out", async () => {
    const initial = await login();
    const [refresh, signOut] = await ordered(
      "refresh",
      () => auth.refreshAccessToken({ refreshToken: initial.refreshToken }),
      () => auth.logout(user.id),
    );
    expect(refresh.error).toBeUndefined();
    expect(signOut.error).toBeUndefined();
    expect(await count()).toBe(0);
    await me(refresh.value.accessToken).expect(401);
    await expect(
      auth.refreshAccessToken({ refreshToken: refresh.value.refreshToken }),
    ).rejects.toThrow("Invalid refresh token");
  });
  it("orders Sign out then refresh with the pre-lock lookup completed", async () => {
    const initial = await login();
    const [, refresh] = await ordered(
      "signOut",
      () => auth.logout(user.id),
      () => auth.refreshAccessToken({ refreshToken: initial.refreshToken }),
    );
    expect(refresh.error.message).toBe("Invalid refresh token");
    expect(await count()).toBe(0);
  });
  it("orders login then Sign out", async () => {
    const [signedIn, signOut] = await ordered("login", login, () =>
      auth.logout(user.id),
    );
    expect(signedIn.error).toBeUndefined();
    expect(signOut.error).toBeUndefined();
    expect(await count()).toBe(0);
    await me(signedIn.value.accessToken).expect(401);
  });
  it("orders Sign out then login at the issuance lock", async () => {
    const prepared = await prepareLogin();
    try {
      const [, signedIn] = await ordered(
        "signOut",
        () => auth.logout(user.id),
        async () => {
          prepared.release.resolve();
          const result = await prepared.pending;
          if (result.error) throw result.error;
          return result.value;
        },
        prepared.operation,
      );
      expect(signedIn.error).toBeUndefined();
      await me(signedIn.value.accessToken).expect(200);
    } finally {
      prepared.release.resolve();
      await bounded(prepared.pending, "prepared login finishes", 18000);
    }
  });
  it("rejects login verified against the password replaced while it waited", async () => {
    const prepared = await prepareLogin();
    try {
      const [change, signedIn] = await ordered(
        "changePassword",
        () => auth.changePassword(user.id, dto),
        async () => {
          prepared.release.resolve();
          const result = await prepared.pending;
          if (result.error) throw result.error;
          return result.value;
        },
        prepared.operation,
      );
      expect(change.error).toBeUndefined();
      expect(signedIn.error.message).toBe("Invalid credentials");
      expect(await count()).toBe(0);
      expect(
        (await ds.getRepository(User).findOneByOrFail({ id: user.id }))
          .failedLoginAttempts,
      ).toBe(0);
    } finally {
      prepared.release.resolve();
      await bounded(prepared.pending, "prepared login finishes", 18000);
    }
  });
  it("allows only one concurrent password change verified against the same hash", async () => {
    const [first, second] = await ordered(
      "changePassword",
      () => auth.changePassword(user.id, dto),
      () => auth.changePassword(user.id, dto),
    );
    expect(first.error).toBeUndefined();
    expect(second.error.message).toBe("Current password is incorrect");
    expect(
      (await ds.getRepository(User).findOneByOrFail({ id: user.id }))
        .tokenVersion,
    ).toBe(1);
  });
});
