import { DataSource } from "typeorm";
import * as bcrypt from "bcrypt";
import { User, UserRole, UserStatus } from "../entities/user.entity";

// Configure database connection
const dataSource = new DataSource({
  type: "postgres",
  host: process.env.DATABASE_HOST,
  port: parseInt(process.env.DATABASE_PORT),
  username: process.env.DATABASE_USERNAME,
  password: process.env.DATABASE_PASSWORD,
  database: process.env.DATABASE_NAME,
  entities: [User],
  synchronize: true,
  logging: true,
});

async function createDemoUsers() {
  try {
    console.log("Connecting to database...");
    await dataSource.initialize();
    console.log("Database connected successfully");

    const userRepository = dataSource.getRepository(User);

    // Check if users already exist
    const existingAdmin = await userRepository.findOne({
      where: { email: "admin@erp.com" },
    });

    if (existingAdmin) {
      console.log("Demo users already exist, skipping creation");
      return;
    }

    console.log("Creating admin user...");

    // Hash password with bcrypt (12 rounds)
    const BCRYPT_ROUNDS = 12;
    const adminPasswordHash = await bcrypt.hash("Admin@123!", BCRYPT_ROUNDS);

    // Create admin user
    const adminUser = new User();
    adminUser.username = "admin";
    adminUser.email = "admin@erp.com";
    adminUser.password = adminPasswordHash;
    adminUser.firstName = "Admin";
    adminUser.lastName = "User";
    adminUser.role = UserRole.ADMIN;
    adminUser.status = UserStatus.ACTIVE;
    adminUser.isActive = true;
    adminUser.failedLoginAttempts = 0;
    adminUser.requiresPasswordChange = true; // Force password change on first login

    // Save admin user
    await userRepository.save(adminUser);

    console.log("✅ Admin user created successfully:");
    console.log("  - Username: admin");
    console.log("  - Password: Admin@123!");
    console.log("  ⚠️  CHANGE PASSWORD IMMEDIATELY AFTER FIRST LOGIN!");
  } catch (error) {
    console.error("❌ Error creating demo users:", error);
    throw error;
  } finally {
    if (dataSource.isInitialized) {
      await dataSource.destroy();
      console.log("Database connection closed");
    }
  }
}

// Run if called directly
if (require.main === module) {
  createDemoUsers()
    .then(() => {
      console.log("Seed script completed successfully");
      process.exit(0);
    })
    .catch((error) => {
      console.error("Seed script failed:", error);
      process.exit(1);
    });
}

export default createDemoUsers;
