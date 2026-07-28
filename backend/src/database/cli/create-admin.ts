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

// Mirrors CreateUserDto (src/modules/users/dto/create-user.dto.ts). This CLI
// writes through Repository.save(), which does NOT run class-validator, so
// without these checks a malformed email or a one-character password could
// create a production admin that the HTTP API would have rejected.
const USERNAME_PATTERN = /^[a-zA-Z0-9._-]+$/;
const EMAIL_PATTERN = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;
const PASSWORD_PATTERN =
  /^(?=.*[a-z])(?=.*[A-Z])(?=.*\d)(?=.*[@$!%*?&.])[A-Za-z\d@$!%*?&.]/;

export function resolveAdminInput(
  argv: string[],
  env: NodeJS.ProcessEnv,
): AdminInput {
  const flag = (name: string): string | undefined => {
    const i = argv.indexOf(`--${name}`);
    return i >= 0 ? argv[i + 1] : undefined;
  };

  const rawUsername = flag('username');
  if (!rawUsername) throw new Error('Missing required argument: --username');

  const rawEmail = flag('email');
  if (!rawEmail) throw new Error('Missing required argument: --email');

  const password = env.ADMIN_PASSWORD;
  if (!password) throw new Error('Missing required env var: ADMIN_PASSWORD');

  // Normalization matches CreateUserDto's @Transform: trim and lowercase.
  // Repository.save() does not apply those either, so a "Root" here would
  // otherwise collide case-sensitively with an existing "root".
  const username = rawUsername.trim().toLowerCase();
  const email = rawEmail.trim().toLowerCase();

  if (username.length < 3 || username.length > 50) {
    throw new Error('Username must be between 3 and 50 characters long');
  }
  if (!USERNAME_PATTERN.test(username)) {
    throw new Error(
      'Username can only contain letters, numbers, dots, underscores, and hyphens',
    );
  }

  if (email.length > 100) {
    throw new Error('Email must not exceed 100 characters');
  }
  if (!EMAIL_PATTERN.test(email)) {
    throw new Error('Please provide a valid email address');
  }

  if (password.length < 8 || password.length > 128) {
    throw new Error('Password must be between 8 and 128 characters long');
  }
  if (!PASSWORD_PATTERN.test(password)) {
    throw new Error(
      'Password must contain at least one uppercase letter, one lowercase ' +
        'letter, one number, and one special character (@$!%*?&.)',
    );
  }

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
