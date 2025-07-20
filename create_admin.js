const bcrypt = require('bcryptjs');
const { promisePool } = require('./config/database');

async function createAdminUser() {
  try {
    const hashedPassword = bcrypt.hashSync('123456', 10);
    
    const [result] = await promisePool.execute(
      `INSERT INTO users (name, email, password, role, is_active) 
       VALUES (?, ?, ?, ?, ?)
       ON DUPLICATE KEY UPDATE password = VALUES(password)`,
      ['Administrator', 'admin@clothingstore.com', hashedPassword, 'admin', 1]
    );
    
    console.log('✅ Admin user created/updated successfully');
    console.log('Email: admin@clothingstore.com');
    console.log('Password: 123456');
    
    // Verify the user was created
    const [users] = await promisePool.execute(
      'SELECT id, name, email, role, is_active FROM users WHERE email = ?',
      ['admin@clothingstore.com']
    );
    
    console.log('Admin user details:', users[0]);
    
  } catch (error) {
    console.error('❌ Error creating admin user:', error);
  } finally {
    process.exit();
  }
}

createAdminUser();
