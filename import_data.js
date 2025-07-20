const { promisePool } = require('./config/database');

async function importSampleData() {
  try {
    console.log('Importing sample data...');

    // Insert categories
    console.log('Inserting categories...');
    await promisePool.execute('INSERT IGNORE INTO categories (name, slug) VALUES (?, ?)', ['Áo', 'ao']);
    await promisePool.execute('INSERT IGNORE INTO categories (name, slug) VALUES (?, ?)', ['Quần', 'quan']);
    await promisePool.execute('INSERT IGNORE INTO categories (name, slug) VALUES (?, ?)', ['Váy', 'vay']);
    await promisePool.execute('INSERT IGNORE INTO categories (name, slug) VALUES (?, ?)', ['Phụ kiện', 'phu-kien']);

    // Insert products
    console.log('Inserting products...');
    await promisePool.execute(`
      INSERT IGNORE INTO products (sku, name, category_id, brand, material, description, images, purchase_price, sale_price, is_active) 
      VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
    `, ['AO001', 'Áo Sơ Mi Trắng Classic', 1, 'Coflar Mania', 'Cotton 100%', 'Áo sơ mi trắng classic, thiết kế tinh tế', '["https://via.placeholder.com/300x400"]', 200000, 350000, 1]);

    await promisePool.execute(`
      INSERT IGNORE INTO products (sku, name, category_id, brand, material, description, images, purchase_price, sale_price, is_active) 
      VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
    `, ['QUAN001', 'Quần Jeans Slim Fit', 2, 'Coflar Mania', 'Denim 98% Cotton, 2% Spandex', 'Quần jeans slim fit, co giãn tốt', '["https://via.placeholder.com/300x400"]', 300000, 550000, 1]);

    await promisePool.execute(`
      INSERT IGNORE INTO products (sku, name, category_id, brand, material, description, images, purchase_price, sale_price, is_active) 
      VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
    `, ['AO002', 'Áo Thun Cotton Nam', 1, 'Coflar Mania', 'Cotton 100%', 'Áo thun cotton nam, thoáng mát', '["https://via.placeholder.com/300x400"]', 100000, 180000, 1]);

    await promisePool.execute(`
      INSERT IGNORE INTO products (sku, name, category_id, brand, material, description, images, purchase_price, sale_price, is_active) 
      VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
    `, ['VAY001', 'Váy Maxi Họa Tiết', 3, 'Coflar Mania', 'Vải lụa', 'Váy maxi họa tiết hoa, thanh lịch', '["https://via.placeholder.com/300x400"]', 250000, 450000, 1]);

    // Insert variants
    console.log('Inserting product variants...');
    const variants = [
      [1, 'S', 'Trắng', 20, 5],
      [1, 'M', 'Trắng', 30, 5],
      [1, 'L', 'Trắng', 25, 5],
      [2, '30', 'Xanh đen', 25, 3],
      [2, '32', 'Xanh đen', 20, 3],
      [3, 'M', 'Đen', 40, 10],
      [3, 'L', 'Đen', 30, 10],
      [4, 'M', 'Hoa đỏ', 15, 2],
      [4, 'L', 'Hoa đỏ', 10, 2]
    ];

    for (const variant of variants) {
      await promisePool.execute(`
        INSERT IGNORE INTO product_variants (product_id, size, color, stock, min_stock) 
        VALUES (?, ?, ?, ?, ?)
      `, variant);
    }

    console.log('✅ Sample data imported successfully!');

    // Check data
    const [products] = await promisePool.execute('SELECT COUNT(*) as count FROM products');
    const [categories] = await promisePool.execute('SELECT COUNT(*) as count FROM categories');
    const [variantCount] = await promisePool.execute('SELECT COUNT(*) as count FROM product_variants');

    console.log(`📊 Data summary:
- Products: ${products[0].count}
- Categories: ${categories[0].count}
- Variants: ${variantCount[0].count}`);

    process.exit(0);
  } catch (error) {
    console.error('❌ Error importing data:', error);
    process.exit(1);
  }
}

importSampleData();
