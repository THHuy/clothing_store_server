-- Clothing Store Database Schema
-- Run this script to create the database structure

-- Create database
CREATE DATABASE IF NOT EXISTS clothing_store 
CHARACTER SET utf8mb4 
COLLATE utf8mb4_unicode_ci;

USE clothing_store;

-- Table: users
CREATE TABLE users (
    id INT PRIMARY KEY AUTO_INCREMENT,
    username VARCHAR(50) UNIQUE NULL,
    name VARCHAR(100) NOT NULL,
    email VARCHAR(100) UNIQUE NOT NULL,
    phone VARCHAR(20) NULL,
    password VARCHAR(255) NOT NULL,
    role ENUM('admin', 'manager', 'staff') DEFAULT 'staff',
    is_active BOOLEAN DEFAULT TRUE,
    last_login_at TIMESTAMP NULL,
    created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
    updated_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP,
    INDEX idx_username (username),
    INDEX idx_email (email),
    INDEX idx_role (role),
    INDEX idx_active (is_active)
);

-- Table: categories
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
);

-- Table: products
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
);

-- Table: product_variants
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
);

-- Table: inventory_transactions
CREATE TABLE inventory_transactions (
    id INT PRIMARY KEY AUTO_INCREMENT,
    variant_id INT NOT NULL,
    type ENUM('in', 'out', 'adjustment') NOT NULL,
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
);

-- Table: orders (for future sales tracking)
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
);

-- Table: order_items (for future sales tracking)
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
);

-- Insert default admin user (password: admin123)
INSERT INTO users (name, email, password, role) VALUES 
('Administrator', 'admin@clothingstore.com', '$2a$10$YourHashedPasswordHere', 'admin');

-- Insert sample categories
INSERT INTO categories (name, slug, description) VALUES 
('Áo thun', 'ao-thun', 'Các loại áo thun nam nữ'),
('Quần jeans', 'quan-jeans', 'Quần jeans thời trang'),
('Áo sơ mi', 'ao-so-mi', 'Áo sơ mi công sở và casual'),
('Váy đầm', 'vay-dam', 'Váy đầm nữ các loại'),
('Áo khoác', 'ao-khoac', 'Áo khoác mùa đông và mùa mát'),
('Quần short', 'quan-short', 'Quần short thể thao và thời trang'),
('Phụ kiện', 'phu-kien', 'Thắt lưng, mũ, túi xách');

-- Insert sample products
INSERT INTO products (sku, name, category_id, brand, material, description, purchase_price, sale_price) VALUES 
('TS001', 'Áo thun cổ tròn basic', 1, 'Local Brand', 'Cotton 100%', 'Áo thun basic thiết kế đơn giản, phù hợp mọi lứa tuổi', 80000, 150000),
('QJ001', 'Quần jeans skinny', 2, 'Denim Co', 'Denim cotton', 'Quần jeans skinny fit thời trang, form chuẩn', 200000, 350000),
('AS001', 'Áo sơ mi công sở', 3, 'Office Wear', 'Cotton pha', 'Áo sơ mi công sở lịch sự, dễ phối đồ', 150000, 280000),
('VD001', 'Váy đầm công sở', 4, 'Lady Style', 'Polyester', 'Váy đầm công sở thanh lịch, nhiều màu sắc', 180000, 320000),
('AK001', 'Áo khoác cardigan', 5, 'Cozy Wear', 'Wool blend', 'Áo khoác cardigan ấm áp, phong cách vintage', 250000, 450000);

-- Insert sample product variants
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
(5, 'L', 'Xám', 10, 3);

-- Insert sample inventory transactions
INSERT INTO inventory_transactions (variant_id, type, quantity, reason, user_id) VALUES 
(1, 'in', 50, 'Nhập hàng đầu tiên', 1),
(2, 'in', 45, 'Nhập hàng đầu tiên', 1),
(3, 'in', 30, 'Nhập hàng đầu tiên', 1),
(9, 'in', 20, 'Nhập hàng đầu tiên', 1),
(10, 'in', 25, 'Nhập hàng đầu tiên', 1),
(17, 'in', 30, 'Nhập hàng đầu tiên', 1),
(18, 'in', 35, 'Nhập hàng đầu tiên', 1);

-- Create indexes for better performance
CREATE INDEX idx_products_search ON products(name, brand, sku);
CREATE INDEX idx_variants_stock_alert ON product_variants(stock, min_stock);
CREATE INDEX idx_transactions_date ON inventory_transactions(created_at);

-- Update admin user password (bcrypt hash for 'admin123')
UPDATE users SET password = '$2a$10$vI8aWBnW3fID.ZQ4/zo1G.q1lRps.9cGLcZEiGDMVr5yUP1KUOYTa' WHERE email = 'admin@clothingstore.com';

COMMIT;
