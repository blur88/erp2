import { DataSource } from 'typeorm';
import * as bcrypt from 'bcrypt';
import { User, UserRole, UserStatus } from '../entities/user.entity';
import connectionSource from '../../config/cli-datasource';

const BCRYPT_ROUNDS = 12;

export interface AdminInput {
  username: string;
  email: string;
  password: string;
}

export function resolveAdminInput(
  argv: string[],
  env: NodeJS.ProcessEnv,
): AdminInput {
  const flag = (name: string): string | undefined => {
    const i = argv.indexOf(`--${name}`);
    return i >= 0 ? argv[i + 1] : undefined;
  };

  const username = flag('username');
  if (!username) throw new Error('Missing required argument: --username');

  const email = flag('email');
  if (!email) throw new Error('Missing required argument: --email');

  const password = env.ADMIN_PASSWORD;
  if (!password) throw new Error('Missing required env var: ADMIN_PASSWORD');

  return { username, email, password };
}

export async function createAdmin(
  dataSource: DataSource,
  input: AdminInput,
): Promise<'created' | 'exists'> {
  const repo = dataSource.getRepository(User);

  const byUsername = await repo.findOne({
    where: { username: input.username },
  });
  const byEmail = await repo.findOne({ where: { email: input.email } });

  if (byUsername || byEmail) {
    if (
      byUsername &&
      byEmail &&
      byUsername.id === byEmail.id &&
      byUsername.role === UserRole.ADMIN &&
      byUsername.status === UserStatus.ACTIVE &&
      byUsername.isActive === true
    ) {
      return 'exists';
    }

    if (byUsername && byUsername.email !== input.email) {
      throw new Error(
        `User "${input.username}" already exists with a different email.`,
      );
    }
    if (byEmail && byEmail.username !== input.username) {
      throw new Error(
        `Email "${input.email}" is already used by user "${byEmail.username}".`,
      );
    }
    throw new Error(
      `User "${input.username}" already exists but is not an active admin ` +
        `(role=${byUsername?.role}, status=${byUsername?.status}, ` +
        `isActive=${byUsername?.isActive}). Refusing to modify it.`,
    );
  }

  const user = repo.create({
    username: input.username,
    email: input.email,
    password: await bcrypt.hash(input.password, BCRYPT_ROUNDS),
    role: UserRole.ADMIN,
    status: UserStatus.ACTIVE,
    isActive: true,
    requiresPasswordChange: true,
  } as any);

  await repo.save(user);
  return 'created';
}

async function main(): Promise<void> {
  const input = resolveAdminInput(process.argv.slice(2), process.env);
  await connectionSource.initialize();
  try {
    const outcome = await createAdmin(connectionSource, input);
    console.log(
      outcome === 'created'
        ? `Admin user "${input.username}" created.`
        : `Admin user "${input.username}" already exists; nothing to do.`,
    );
  } finally {
    await connectionSource.destroy();
  }
}

if (require.main === module) {
  main().catch((error) => {
    console.error(`create-admin failed: ${error.message}`);
    process.exit(1);
  });
}
