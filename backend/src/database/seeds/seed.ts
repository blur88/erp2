import { DataSource } from 'typeorm';
import * as bcrypt from 'bcrypt';
import { User, UserRole, UserStatus } from '../entities/user.entity';

// Configure database connection
const dataSource = new DataSource({
  type: 'postgres',
  host: process.env.DB_HOST || 'postgres',
  port: parseInt(process.env.DB_PORT || '5432'),
  username: process.env.DB_USERNAME || 'erp_user', 
  password: process.env.DB_PASSWORD || 'erp_password',
  database: process.env.DB_DATABASE || 'erp_db',
  entities: [User],
  synchronize: true,
  logging: true,
});

async function createDemoUsers() {
  try {
    console.log('Connecting to database...');
    await dataSource.initialize();
    console.log('Database connected successfully');

    const userRepository = dataSource.getRepository(User);

    // Check if users already exist
    const existingAdmin = await userRepository.findOne({
      where: { email: 'admin@erp.com' }
    });

    if (existingAdmin) {
      console.log('Demo users already exist, skipping creation');
      return;
    }

    console.log('Creating demo users...');

    // Create admin user
    const adminUser = new User();
    adminUser.username = 'admin';
    adminUser.email = 'admin@erp.com';
    adminUser.password = 'admin123'; // Will be hashed by @BeforeInsert hook
    adminUser.firstName = 'Admin';
    adminUser.lastName = 'User';
    adminUser.role = UserRole.ADMIN;
    adminUser.status = UserStatus.ACTIVE;
    adminUser.isActive = true;

    // Create manager user
    const managerUser = new User();
    managerUser.username = 'manager';
    managerUser.email = 'manager@erp.com';
    managerUser.password = 'manager123';
    managerUser.firstName = 'Manager';
    managerUser.lastName = 'User';
    managerUser.role = UserRole.MANAGER;
    managerUser.status = UserStatus.ACTIVE;
    managerUser.isActive = true;

    // Create sales staff user
    const salesUser = new User();
    salesUser.username = 'sales';
    salesUser.email = 'sales@erp.com';
    salesUser.password = 'sales123';
    salesUser.firstName = 'Sales';
    salesUser.lastName = 'Staff';
    salesUser.role = UserRole.SALES_STAFF;
    salesUser.status = UserStatus.ACTIVE;
    salesUser.isActive = true;

    // Save users
    await userRepository.save([adminUser, managerUser, salesUser]);
    
    console.log('✅ Demo users created successfully:');
    console.log('  - Admin: admin@erp.com / admin123');
    console.log('  - Manager: manager@erp.com / manager123');
    console.log('  - Sales Staff: sales@erp.com / sales123');

  } catch (error) {
    console.error('❌ Error creating demo users:', error);
    throw error;
  } finally {
    if (dataSource.isInitialized) {
      await dataSource.destroy();
      console.log('Database connection closed');
    }
  }
}

// Run if called directly
if (require.main === module) {
  createDemoUsers()
    .then(() => {
      console.log('Seed script completed successfully');
      process.exit(0);
    })
    .catch((error) => {
      console.error('Seed script failed:', error);
      process.exit(1);
    });
}

export default createDemoUsers;