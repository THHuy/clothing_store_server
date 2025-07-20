const mysql = require('mysql2/promise');

const dbConfig = {
  host: process.env.DB_HOST || 'localhost',
  port: process.env.DB_PORT || 3306,
  user: process.env.DB_USER || 'root',
  password: process.env.DB_PASSWORD || '123456',
  database: process.env.DB_NAME || 'clothing_store',
};

async function seedDatabase() {
  let connection;
  
  try {
    console.log('🌱 Đang khởi tạo dữ liệu mẫu...');
    
    connection = await mysql.createConnection(dbConfig);
    console.log('✅ Kết nối database thành công');

    // Kiểm tra và thêm categories
    const [categories] = await connection.execute('SELECT COUNT(*) as count FROM categories');
    if (categories[0].count === 0) {
      console.log('📂 Thêm categories...');
      await connection.execute(`
        INSERT INTO categories (name, slug, description) VALUES 
        ('Áo thun', 'ao-thun', 'Các loại áo thun nam nữ'),
        ('Quần jeans', 'quan-jeans', 'Quần jeans thời trang'),
        ('Áo sơ mi', 'ao-so-mi', 'Áo sơ mi công sở và casual'),
        ('Váy đầm', 'vay-dam', 'Váy đầm nữ các loại'),
        ('Áo khoác', 'ao-khoac', 'Áo khoác mùa đông và mùa mát')
      `);
      console.log('✅ Đã thêm 5 categories');
    } else {
      console.log('📂 Categories đã tồn tại');
    }

    // Kiểm tra và thêm admin user
    const [users] = await connection.execute('SELECT COUNT(*) as count FROM users WHERE role = "admin"');
    if (users[0].count === 0) {
      console.log('👤 Thêm admin user...');
      await connection.execute(`
        INSERT INTO users (name, email, password, role) VALUES 
        ('Administrator', 'admin@clothingstore.com', '$2a$10$vI8aWBnW3fID.ZQ4/zo1G.q1lRps.9cGLcZEiGDMVr5yUP1KUOYTa', 'admin')
      `);
      console.log('✅ Đã thêm admin user (admin@clothingstore.com / admin123)');
    } else {
      console.log('👤 Admin user đã tồn tại');
    }

    // Kiểm tra và thêm products
    const [products] = await connection.execute('SELECT COUNT(*) as count FROM products');
    if (products[0].count === 0) {
      console.log('🛍️ Thêm products...');
      await connection.execute(`
        INSERT INTO products (sku, name, category_id, brand, material, description, purchase_price, sale_price) VALUES 
        ('TS001', 'Áo thun cổ tròn basic', 1, 'Local Brand', 'Cotton 100%', 'Áo thun basic thiết kế đơn giản, phù hợp mọi lứa tuổi', 80000, 150000),
        ('QJ001', 'Quần jeans skinny', 2, 'Denim Co', 'Denim cotton', 'Quần jeans skinny fit thời trang, form chuẩn', 200000, 350000),
        ('AS001', 'Áo sơ mi công sở', 3, 'Office Wear', 'Cotton pha', 'Áo sơ mi công sở lịch sự, dễ phối đồ', 150000, 280000),
        ('VD001', 'Váy đầm công sở', 4, 'Lady Style', 'Polyester', 'Váy đầm công sở thanh lịch, nhiều màu sắc', 180000, 320000),
        ('AK001', 'Áo khoác cardigan', 5, 'Cozy Wear', 'Wool blend', 'Áo khoác cardigan ấm áp, phong cách vintage', 250000, 450000)
      `);
      console.log('✅ Đã thêm 5 products');
    } else {
      console.log('🛍️ Products đã tồn tại');
    }

    // Kiểm tra và thêm product variants
    const [variants] = await connection.execute('SELECT COUNT(*) as count FROM product_variants');
    if (variants[0].count === 0) {
      console.log('🎨 Thêm product variants...');
      await connection.execute(`
        INSERT INTO product_variants (product_id, size, color, stock, min_stock) VALUES 
        -- Áo thun cổ tròn basic
        (1, 'S', 'Trắng', 50, 10),
        (1, 'M', 'Trắng', 45, 10),
        (1, 'L', 'Trắng', 30, 10),
        (1, 'XL', 'Trắng', 20, 5),
        (1, 'S', 'Đen', 40, 10),
        (1, 'M', 'Đen', 35, 10),
        (1, 'L', 'Đen', 25, 10),
        (1, 'XL', 'Đen', 15, 5),
        -- Quần jeans skinny
        (2, '28', 'Xanh đậm', 20, 5),
        (2, '29', 'Xanh đậm', 25, 5),
        (2, '30', 'Xanh đậm', 30, 8),
        (2, '31', 'Xanh đậm', 25, 5),
        (2, '32', 'Xanh đậm', 20, 5),
        (2, '28', 'Đen', 15, 5),
        (2, '29', 'Đen', 20, 5),
        (2, '30', 'Đen', 25, 8),
        -- Áo sơ mi công sở
        (3, 'S', 'Trắng', 30, 8),
        (3, 'M', 'Trắng', 35, 8),
        (3, 'L', 'Trắng', 25, 8),
        (3, 'XL', 'Trắng', 15, 5),
        (3, 'S', 'Xanh nhạt', 25, 5),
        (3, 'M', 'Xanh nhạt', 30, 8),
        (3, 'L', 'Xanh nhạt', 20, 5),
        -- Váy đầm công sở
        (4, 'S', 'Đen', 20, 5),
        (4, 'M', 'Đen', 25, 8),
        (4, 'L', 'Đen', 20, 5),
        (4, 'S', 'Xanh navy', 15, 5),
        (4, 'M', 'Xanh navy', 20, 5),
        (4, 'L', 'Xanh navy', 15, 5),
        -- Áo khoác cardigan
        (5, 'S', 'Be', 15, 5),
        (5, 'M', 'Be', 20, 5),
        (5, 'L', 'Be', 15, 5),
        (5, 'S', 'Xám', 10, 3),
        (5, 'M', 'Xám', 15, 5),
        (5, 'L', 'Xám', 10, 3)
      `);
      console.log('✅ Đã thêm 32 product variants');
    } else {
      console.log('🎨 Product variants đã tồn tại');
    }

    // Thêm một vài giao dịch mẫu
    const [transactions] = await connection.execute('SELECT COUNT(*) as count FROM inventory_transactions');
    if (transactions[0].count === 0) {
      console.log('📊 Thêm sample transactions...');
      await connection.execute(`
        INSERT INTO inventory_transactions (variant_id, type, quantity, reason, user_id) VALUES 
        (1, 'in', 50, 'Nhập hàng đầu tiên', 1),
        (2, 'in', 45, 'Nhập hàng đầu tiên', 1),
        (3, 'in', 30, 'Nhập hàng đầu tiên', 1),
        (9, 'in', 20, 'Nhập hàng đầu tiên', 1),
        (10, 'in', 25, 'Nhập hàng đầu tiên', 1),
        (17, 'in', 30, 'Nhập hàng đầu tiên', 1),
        (18, 'in', 35, 'Nhập hàng đầu tiên', 1),
        (1, 'out', 5, 'Bán hàng', 1),
        (2, 'out', 3, 'Bán hàng', 1),
        (3, 'adjustment', 2, 'Điều chỉnh kiểm kê', 1)
      `);
      console.log('✅ Đã thêm 10 sample transactions');
    } else {
      console.log('📊 Transactions đã tồn tại');
    }

    console.log('\n🎉 Khởi tạo dữ liệu mẫu hoàn thành!');
    console.log('📋 Thông tin đăng nhập:');
    console.log('   📧 Email: admin@clothingstore.com');
    console.log('   🔑 Password: admin123');
    
  } catch (error) {
    console.error('❌ Lỗi khi khởi tạo dữ liệu:', error);
  } finally {
    if (connection) {
      await connection.end();
    }
  }
}

if (require.main === module) {
  seedDatabase()
    .then(() => process.exit(0))
    .catch(() => process.exit(1));
}

module.exports = seedDatabase;
