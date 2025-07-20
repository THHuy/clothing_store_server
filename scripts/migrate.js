const mysql = require('mysql2/promise');
require('dotenv').config();

async function runMigration() {
  console.log('🔄 Starting database migration...');
  
  try {
    // Create connection without database first to create the database
    const connectionConfig = {
      host: process.env.DB_HOST || 'localhost',
      user: process.env.DB_USER || 'root',
      password: process.env.DB_PASSWORD || '123456',
      port: process.env.DB_PORT || 3306
    };

    console.log('🔗 Connecting to MySQL server...');
    const connection = await mysql.createConnection(connectionConfig);
    
    // Create database if not exists
    console.log('� Creating database if not exists...');
    await connection.execute(`CREATE DATABASE IF NOT EXISTS clothing_store CHARACTER SET utf8mb4 COLLATE utf8mb4_unicode_ci`);
    console.log('✅ Database clothing_store created or already exists');
    
    await connection.end();

    // Now connect to the specific database
    const { promisePool } = require('../config/database');
    
    console.log('🔗 Connecting to clothing_store database...');
    const dbConnection = await promisePool.getConnection();
    console.log('✅ Database connection successful');
    dbConnection.release();

    // Check if tables exist
    const [tables] = await promisePool.execute(`
      SELECT TABLE_NAME 
      FROM INFORMATION_SCHEMA.TABLES 
      WHERE TABLE_SCHEMA = DATABASE()
    `);

    const existingTables = tables.map(table => table.TABLE_NAME);
    console.log('📋 Existing tables:', existingTables);

    const requiredTables = ['users', 'categories', 'products', 'product_variants', 'inventory_transactions'];
    const missingTables = requiredTables.filter(table => !existingTables.includes(table));

    if (missingTables.length > 0) {
      console.log('🔨 Creating missing tables:', missingTables);
      
      // Create tables
      if (!existingTables.includes('users')) {
        await promisePool.execute(`
          CREATE TABLE users (
            id INT PRIMARY KEY AUTO_INCREMENT,
            name VARCHAR(100) NOT NULL,
            email VARCHAR(100) UNIQUE NOT NULL,
            phone VARCHAR(20) NULL,
            password VARCHAR(255) NOT NULL,
            role ENUM('admin', 'manager', 'staff') DEFAULT 'staff',
            is_active BOOLEAN DEFAULT TRUE,
            last_login_at TIMESTAMP NULL,
            created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
            updated_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP,
            INDEX idx_email (email),
            INDEX idx_role (role),
            INDEX idx_active (is_active)
          )
        `);
        console.log('✅ Table users created');
      }

      if (!existingTables.includes('categories')) {
        await promisePool.execute(`
          CREATE TABLE categories (
            id INT PRIMARY KEY AUTO_INCREMENT,
            name VARCHAR(100) NOT NULL,
            slug VARCHAR(100) UNIQUE NOT NULL,
            description TEXT,
            is_active BOOLEAN DEFAULT TRUE,
            created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
            updated_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP,
            INDEX idx_slug (slug),
            INDEX idx_active (is_active)
          )
        `);
        console.log('✅ Table categories created');
      }

      if (!existingTables.includes('products')) {
        await promisePool.execute(`
          CREATE TABLE products (
            id INT PRIMARY KEY AUTO_INCREMENT,
            sku VARCHAR(50) UNIQUE NOT NULL,
            name VARCHAR(200) NOT NULL,
            category_id INT NOT NULL,
            brand VARCHAR(100) NOT NULL,
            material VARCHAR(100) NOT NULL,
            description TEXT,
            images JSON NULL,
            purchase_price DECIMAL(10,2) NOT NULL DEFAULT 0.00,
            sale_price DECIMAL(10,2) NOT NULL DEFAULT 0.00,
            is_active BOOLEAN DEFAULT TRUE,
            created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
            updated_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP,
            FOREIGN KEY (category_id) REFERENCES categories(id) ON DELETE RESTRICT,
            INDEX idx_sku (sku),
            INDEX idx_category (category_id),
            INDEX idx_brand (brand),
            INDEX idx_active (is_active),
            INDEX idx_price (sale_price)
          )
        `);
        console.log('✅ Table products created');
      }

      if (!existingTables.includes('product_variants')) {
        await promisePool.execute(`
          CREATE TABLE product_variants (
            id INT PRIMARY KEY AUTO_INCREMENT,
            product_id INT NOT NULL,
            size VARCHAR(20) NOT NULL,
            color VARCHAR(50) NOT NULL,
            stock INT NOT NULL DEFAULT 0,
            min_stock INT NOT NULL DEFAULT 0,
            created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
            updated_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP,
            FOREIGN KEY (product_id) REFERENCES products(id) ON DELETE CASCADE,
            UNIQUE KEY unique_product_variant (product_id, size, color),
            INDEX idx_product (product_id),
            INDEX idx_stock (stock),
            INDEX idx_size (size),
            INDEX idx_color (color)
          )
        `);
        console.log('✅ Table product_variants created');
      }

      if (!existingTables.includes('inventory_transactions')) {
        await promisePool.execute(`
          CREATE TABLE inventory_transactions (
            id INT PRIMARY KEY AUTO_INCREMENT,
            variant_id INT NOT NULL,
            type ENUM('in', 'out') NOT NULL,
            quantity INT NOT NULL,
            reason VARCHAR(255) NOT NULL,
            supplier VARCHAR(100) NULL,
            order_id INT NULL,
            user_id INT NULL,
            created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
            FOREIGN KEY (variant_id) REFERENCES product_variants(id) ON DELETE CASCADE,
            FOREIGN KEY (user_id) REFERENCES users(id) ON DELETE SET NULL,
            INDEX idx_variant (variant_id),
            INDEX idx_type (type),
            INDEX idx_created (created_at),
            INDEX idx_user (user_id)
          )
        `);
        console.log('✅ Table inventory_transactions created');
      }

      if (!existingTables.includes('orders')) {
        await promisePool.execute(`
          CREATE TABLE orders (
            id INT PRIMARY KEY AUTO_INCREMENT,
            order_number VARCHAR(50) UNIQUE NOT NULL,
            customer_name VARCHAR(100) NULL,
            customer_email VARCHAR(100) NULL,
            customer_phone VARCHAR(20) NULL,
            total_amount DECIMAL(10,2) NOT NULL DEFAULT 0.00,
            status ENUM('pending', 'processing', 'completed', 'cancelled') DEFAULT 'pending',
            payment_status ENUM('pending', 'paid', 'refunded') DEFAULT 'pending',
            notes TEXT NULL,
            created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
            updated_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP,
            INDEX idx_order_number (order_number),
            INDEX idx_status (status),
            INDEX idx_created (created_at)
          )
        `);
        console.log('✅ Table orders created');
      }

      if (!existingTables.includes('order_items')) {
        await promisePool.execute(`
          CREATE TABLE order_items (
            id INT PRIMARY KEY AUTO_INCREMENT,
            order_id INT NOT NULL,
            variant_id INT NOT NULL,
            quantity INT NOT NULL,
            price DECIMAL(10,2) NOT NULL,
            created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
            FOREIGN KEY (order_id) REFERENCES orders(id) ON DELETE CASCADE,
            FOREIGN KEY (variant_id) REFERENCES product_variants(id) ON DELETE RESTRICT,
            INDEX idx_order (order_id),
            INDEX idx_variant (variant_id)
          )
        `);
        console.log('✅ Table order_items created');
      }
    }

    // Check if admin user exists
    const [adminCheck] = await promisePool.execute(
      'SELECT id, email FROM users WHERE role = "admin" LIMIT 1'
    );

    if (adminCheck.length === 0) {
      console.log('👤 Creating default admin user...');
      const bcrypt = require('bcryptjs');
      const hashedPassword = await bcrypt.hash('admin123', 10);
      
      await promisePool.execute(
        'INSERT INTO users (name, email, password, role) VALUES (?, ?, ?, ?)',
        ['Administrator', 'admin@clothingstore.com', hashedPassword, 'admin']
      );
      console.log('✅ Admin user created: admin@clothingstore.com / admin123');
    } else {
      console.log('✅ Admin user exists:', adminCheck[0].email);
    }

    // Check categories
    const [categoryCheck] = await promisePool.execute('SELECT COUNT(*) as count FROM categories');
    if (categoryCheck[0].count === 0) {
      console.log('📁 Creating default categories...');
      const categories = [
        ['Áo thun', 'ao-thun', 'Các loại áo thun nam nữ'],
        ['Quần jeans', 'quan-jeans', 'Quần jeans thời trang'],
        ['Áo sơ mi', 'ao-so-mi', 'Áo sơ mi công sở và casual'],
        ['Váy đầm', 'vay-dam', 'Váy đầm nữ các loại'],
        ['Áo khoác', 'ao-khoac', 'Áo khoác mùa đông và mùa mát'],
        ['Quần short', 'quan-short', 'Quần short thể thao và thời trang'],
        ['Phụ kiện', 'phu-kien', 'Thắt lưng, mũ, túi xách']
      ];

      for (const [name, slug, description] of categories) {
        await promisePool.execute(
          'INSERT INTO categories (name, slug, description) VALUES (?, ?, ?)',
          [name, slug, description]
        );
      }
      console.log('✅ Default categories created');
    } else {
      console.log('✅ Categories exist:', categoryCheck[0].count);
    }

    console.log('🎉 Database migration completed successfully!');
    console.log('🚀 You can now start the server with: npm run dev');

  } catch (error) {
    console.error('❌ Migration failed:', error.message);
    if (error.code === 'ECONNREFUSED') {
      console.log('💡 Make sure MySQL is running and credentials are correct in .env file');
    }
    process.exit(1);
  }
}

runMigration();
