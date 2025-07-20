const mysql = require('mysql2/promise');
const { promisePool } = require('../config/database');

async function updateInventorySchema() {
  console.log('Đang cập nhật schema inventory_transactions...');
  
  try {
    // Kiểm tra xem type đã có 'adjustment' chưa
    const [columns] = await promisePool.execute(`
      SELECT COLUMN_TYPE 
      FROM INFORMATION_SCHEMA.COLUMNS 
      WHERE TABLE_SCHEMA = 'clothing_store' 
      AND TABLE_NAME = 'inventory_transactions' 
      AND COLUMN_NAME = 'type'
    `);

    if (columns.length > 0) {
      const columnType = columns[0].COLUMN_TYPE;
      console.log('Column type hiện tại:', columnType);
      
      // Nếu chưa có 'adjustment', thêm vào
      if (!columnType.includes('adjustment')) {
        console.log('Đang thêm type "adjustment" vào enum...');
        
        await promisePool.execute(`
          ALTER TABLE inventory_transactions 
          MODIFY COLUMN type ENUM('in', 'out', 'adjustment') NOT NULL
        `);
        
        console.log('✅ Đã cập nhật thành công type enum để hỗ trợ "adjustment"');
      } else {
        console.log('✅ Type "adjustment" đã tồn tại trong enum');
      }
    }

    // Thêm một số sample transactions với type adjustment
    console.log('Đang thêm sample adjustment transactions...');
    
    // Lấy một số variant để test
    const [variants] = await promisePool.execute(`
      SELECT pv.id, pv.stock, p.name, pv.size, pv.color
      FROM product_variants pv
      JOIN products p ON pv.product_id = p.id
      LIMIT 3
    `);

    // Lấy admin user
    const [adminUsers] = await promisePool.execute(`
      SELECT id FROM users WHERE role = 'admin' LIMIT 1
    `);

    if (variants.length > 0 && adminUsers.length > 0) {
      const adminId = adminUsers[0].id;
      
      for (const variant of variants) {
        await promisePool.execute(`
          INSERT INTO inventory_transactions 
          (variant_id, type, quantity, reason, user_id, created_at) 
          VALUES (?, 'adjustment', ?, ?, ?, NOW())
        `, [
          variant.id,
          Math.floor(Math.random() * 5) + 1, // Random 1-5
          `Điều chỉnh kiểm kê cho ${variant.name} (${variant.size}/${variant.color})`,
          adminId
        ]);
      }
      
      console.log(`✅ Đã thêm ${variants.length} sample adjustment transactions`);
    }

    console.log('🎉 Hoàn thành cập nhật schema!');
    
  } catch (error) {
    console.error('❌ Lỗi khi cập nhật schema:', error);
    throw error;
  }
}

// Chạy script
if (require.main === module) {
  updateInventorySchema()
    .then(() => {
      console.log('Script hoàn thành!');
      process.exit(0);
    })
    .catch((error) => {
      console.error('Script thất bại:', error);
      process.exit(1);
    });
}

module.exports = updateInventorySchema;
