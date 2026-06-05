import { MigrationInterface, QueryRunner } from 'typeorm';
import * as bcrypt from 'bcrypt';

export class HashExistingPasswords1735435000000 implements MigrationInterface {
  public async up(queryRunner: QueryRunner): Promise<void> {
    // Get all users with plaintext passwords
    const users = await queryRunner.query(
      `SELECT id, username, password FROM users WHERE password NOT LIKE '$2a$%' AND password NOT LIKE '$2b$%'`,
    );

    console.log(`Found ${users.length} users with plaintext passwords`);

    // Hash each plaintext password
    for (const user of users) {
      const hashedPassword = await bcrypt.hash(user.password, 12);

      await queryRunner.query(
        `UPDATE users SET password = $1 WHERE id = $2`,
        [hashedPassword, user.id],
      );

      console.log(`Hashed password for user: ${user.username}`);
    }

    console.log('All existing passwords have been hashed');
  }

  public async down(queryRunner: QueryRunner): Promise<void> {
    // Cannot revert password hashing - this is a one-way operation
    console.warn(
      'Cannot revert password hashing. Users will need to reset their passwords if rollback is needed.',
    );
  }
}
