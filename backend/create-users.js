const { Pool } = require('pg');
const bcrypt = require('bcrypt');

// Database connection
const pool = new Pool({
  host: process.env.DB_HOST || 'postgres', // Use docker service name
  port: process.env.DB_PORT || 5432,
  user: process.env.DB_USERNAME || 'erp_user',
  password: process.env.DB_PASSWORD || 'erp_password',
  database: process.env.DB_DATABASE || 'erp_db',
});

async function createUsersTable() {
  const createTableSQL = `
    CREATE TABLE IF NOT EXISTS users (
      id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
      username VARCHAR(50) UNIQUE NOT NULL,
      email VARCHAR(100) UNIQUE NOT NULL,
      password VARCHAR(255) NOT NULL,
      "firstName" VARCHAR(100) NOT NULL,
      "lastName" VARCHAR(100) NOT NULL,
      "phoneNumber" VARCHAR(20),
      role VARCHAR(50) DEFAULT 'sales_staff',
      status VARCHAR(50) DEFAULT 'active',
      "isActive" BOOLEAN DEFAULT true,
      "lastLoginAt" TIMESTAMPTZ,
      "lastLoginIp" VARCHAR(45),
      "failedLoginAttempts" INTEGER DEFAULT 0,
      "lockedUntil" TIMESTAMPTZ,
      notes TEXT,
      "createdAt" TIMESTAMPTZ DEFAULT CURRENT_TIMESTAMP,
      "updatedAt" TIMESTAMPTZ DEFAULT CURRENT_TIMESTAMP,
      "deletedAt" TIMESTAMPTZ,
      "createdBy" UUID,
      "updatedBy" UUID
    );
  `;

  await pool.query(createTableSQL);
  console.log('Users table created successfully');
}

async function createDemoUsers() {
  try {
    console.log('Connecting to database...');
    
    // Create users table first
    await createUsersTable();
    
    // Check if users already exist
    const checkResult = await pool.query('SELECT COUNT(*) FROM users WHERE email IN ($1, $2, $3)', 
      ['admin@erp.com', 'manager@erp.com', 'sales@erp.com']
    );
    
    if (parseInt(checkResult.rows[0].count) > 0) {
      console.log('Demo users already exist, skipping creation');
      return;
    }

    console.log('Creating demo users...');

    // Hash passwords
    const adminPassword = await bcrypt.hash('admin123', 12);
    const managerPassword = await bcrypt.hash('manager123', 12);
    const salesPassword = await bcrypt.hash('sales123', 12);

    // Insert demo users
    const insertSQL = `
      INSERT INTO users (username, email, password, "firstName", "lastName", role, status, "isActive")
      VALUES 
        ('admin', 'admin@erp.com', $1, 'Admin', 'User', 'admin', 'active', true),
        ('manager', 'manager@erp.com', $2, 'Manager', 'User', 'manager', 'active', true),
        ('sales', 'sales@erp.com', $3, 'Sales', 'Staff', 'sales_staff', 'active', true)
    `;

    await pool.query(insertSQL, [adminPassword, managerPassword, salesPassword]);
    
    console.log('✅ Demo users created successfully:');
    console.log('  - Admin: admin@erp.com / admin123');
    console.log('  - Manager: manager@erp.com / manager123');
    console.log('  - Sales Staff: sales@erp.com / sales123');

  } catch (error) {
    console.error('❌ Error creating demo users:', error);
    throw error;
  } finally {
    await pool.end();
    console.log('Database connection closed');
  }
}

// Run the script
createDemoUsers()
  .then(() => {
    console.log('Script completed successfully');
    process.exit(0);
  })
  .catch((error) => {
    console.error('Script failed:', error);
    process.exit(1);
  });