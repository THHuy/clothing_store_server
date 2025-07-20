-- Insert sample data
INSERT INTO categories (name, slug) VALUES 
('Áo', 'ao'),
('Quần', 'quan'),
('Váy', 'vay'),
('Phụ kiện', 'phu-kien');

INSERT INTO products (sku, name, category_id, brand, material, description, images, purchase_price, sale_price, is_active) VALUES 
('AO001', 'Áo Sơ Mi Trắng Classic', 1, 'Coflar Mania', 'Cotton 100%', 'Áo sơ mi trắng classic, thiết kế tinh tế, phù hợp cho môi trường công sở', '["https://via.placeholder.com/300x400"]', 200000, 350000, 1),
('QUAN001', 'Quần Jeans Slim Fit', 2, 'Coflar Mania', 'Denim 98% Cotton, 2% Spandex', 'Quần jeans slim fit, co giãn tốt, phong cách hiện đại', '["https://via.placeholder.com/300x400"]', 300000, 550000, 1),
('AO002', 'Áo Thun Cotton Nam', 1, 'Coflar Mania', 'Cotton 100%', 'Áo thun cotton nam, thoáng mát, phù hợp mọi hoạt động', '["https://via.placeholder.com/300x400"]', 100000, 180000, 1),
('VAY001', 'Váy Maxi Họa Tiết', 3, 'Coflar Mania', 'Vải lụa', 'Váy maxi họa tiết hoa, thanh lịch và nữ tính', '["https://via.placeholder.com/300x400"]', 250000, 450000, 1);

INSERT INTO product_variants (product_id, size, color, stock, min_stock) VALUES 
(1, 'S', 'Trắng', 20, 5),
(1, 'M', 'Trắng', 30, 5),
(1, 'L', 'Trắng', 25, 5),
(1, 'XL', 'Trắng', 15, 5),
(2, '29', 'Xanh đen', 18, 3),
(2, '30', 'Xanh đen', 25, 3),
(2, '31', 'Xanh đen', 22, 3),
(2, '32', 'Xanh đen', 20, 3),
(3, 'S', 'Đen', 35, 10),
(3, 'M', 'Đen', 40, 10),
(3, 'L', 'Đen', 30, 10),
(3, 'S', 'Trắng', 25, 10),
(3, 'M', 'Trắng', 35, 10),
(3, 'L', 'Trắng', 28, 10),
(4, 'S', 'Hoa đỏ', 12, 2),
(4, 'M', 'Hoa đỏ', 15, 2),
(4, 'L', 'Hoa đỏ', 10, 2),
(4, 'S', 'Hoa xanh', 8, 2),
(4, 'M', 'Hoa xanh', 12, 2),
(4, 'L', 'Hoa xanh', 7, 2);
