import { MigrationInterface, QueryRunner } from "typeorm";
import * as bcrypt from "bcrypt";

export class CreateDefaultAdmin1735436000000 implements MigrationInterface {
  public async up(queryRunner: QueryRunner): Promise<void> {
    // Check if admin user already exists
    const existingAdmin = await queryRunner.query(
      `SELECT id FROM users WHERE username = 'admin'`,
    );

    if (existingAdmin.length > 0) {
      console.log("Admin user already exists, skipping creation");
      return;
    }

    // Hash default password
    const hashedPassword = await bcrypt.hash("Admin@123!", 12);

    // Create default admin user
    await queryRunner.query(
      `INSERT INTO users (
        id,
        username,
        email,
        password,
        "firstName",
        "lastName",
        role,
        status,
        "isActive",
        "failedLoginAttempts",
        "createdAt",
        "updatedAt"
      ) VALUES (
        uuid_generate_v4(),
        'admin',
        'admin@erp.local',
        $1,
        'System',
        'Administrator',
        'admin',
        'active',
        true,
        0,
        CURRENT_TIMESTAMP,
        CURRENT_TIMESTAMP
      )`,
      [hashedPassword],
    );

    console.log("Default admin user created");
    console.log("Username: admin");
    console.log("Password: Admin@123!");
    console.log(
      "⚠️  IMPORTANT: Change this password immediately after first login!",
    );
  }

  public async down(queryRunner: QueryRunner): Promise<void> {
    // Remove default admin user
    await queryRunner.query(`DELETE FROM users WHERE username = 'admin'`);
    console.log("Default admin user removed");
  }
}
