const { promisePool } = require('./config/database');

async function addUsernameColumn() {
  try {
    console.log('🔄 Adding username column to users table...');
    
    // Add username column
    await promisePool.execute(`
      ALTER TABLE users 
      ADD COLUMN username VARCHAR(50) UNIQUE NULL 
      AFTER id
    `);
    
    console.log('✅ Username column added successfully');
    
    // Update existing admin user with username
    await promisePool.execute(`
      UPDATE users 
      SET username = 'admin' 
      WHERE email = 'admin@clothingstore.com'
    `);
    
    console.log('✅ Admin user updated with username: admin');
    
    // Verify the changes
    const [users] = await promisePool.execute(
      'SELECT id, username, name, email, role, is_active FROM users WHERE email = ?',
      ['admin@clothingstore.com']
    );
    
    console.log('Updated admin user details:', users[0]);
    
    // Show table structure
    const [columns] = await promisePool.execute('DESCRIBE users');
    console.log('\n📋 Users table structure:');
    columns.forEach(col => {
      console.log(`  ${col.Field}: ${col.Type} ${col.Null === 'NO' ? 'NOT NULL' : 'NULL'} ${col.Key}`);
    });
    
  } catch (error) {
    if (error.code === 'ER_DUP_FIELDNAME') {
      console.log('ℹ️  Username column already exists');
      
      // Just update the admin user
      await promisePool.execute(`
        UPDATE users 
        SET username = 'admin' 
        WHERE email = 'admin@clothingstore.com'
      `);
      
      console.log('✅ Admin user updated with username: admin');
    } else {
      console.error('❌ Error adding username column:', error);
    }
  } finally {
    process.exit();
  }
}

addUsernameColumn();
