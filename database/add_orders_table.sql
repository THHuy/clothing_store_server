-- Tạo bảng orders để lưu trữ thông tin đơn hàng
CREATE TABLE IF NOT EXISTS orders (
  id INT PRIMARY KEY AUTO_INCREMENT,
  order_number VARCHAR(50) UNIQUE NOT NULL,
  customer_name VARCHAR(255),
  customer_phone VARCHAR(20),
  customer_email VARCHAR(255),
  total_amount DECIMAL(15,2) NOT NULL DEFAULT 0,
  status ENUM('pending', 'processing', 'completed', 'cancelled') DEFAULT 'pending',
  payment_status ENUM('pending', 'paid', 'failed', 'refunded') DEFAULT 'pending',
  shipping_address TEXT,
  notes TEXT,
  user_id INT,
  created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
  updated_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP,
  FOREIGN KEY (user_id) REFERENCES users(id) ON DELETE SET NULL
);

-- Tạo bảng order_items để lưu chi tiết sản phẩm trong đơn hàng
CREATE TABLE IF NOT EXISTS order_items (
  id INT PRIMARY KEY AUTO_INCREMENT,
  order_id INT NOT NULL,
  variant_id INT NOT NULL,
  quantity INT NOT NULL,
  unit_price DECIMAL(10,2) NOT NULL,
  total_price DECIMAL(10,2) NOT NULL,
  created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
  FOREIGN KEY (order_id) REFERENCES orders(id) ON DELETE CASCADE,
  FOREIGN KEY (variant_id) REFERENCES product_variants(id) ON DELETE CASCADE
);

-- Kiểm tra và thêm cột order_id vào inventory_transactions nếu chưa có
SET @sql = IF((SELECT COUNT(*) FROM information_schema.columns 
              WHERE table_schema = DATABASE() 
              AND table_name = 'inventory_transactions' 
              AND column_name = 'order_id') = 0,
              'ALTER TABLE inventory_transactions ADD COLUMN order_id INT, ADD FOREIGN KEY (order_id) REFERENCES orders(id) ON DELETE SET NULL',
              'SELECT "Column order_id already exists"');
PREPARE stmt FROM @sql;
EXECUTE stmt;
DEALLOCATE PREPARE stmt;
