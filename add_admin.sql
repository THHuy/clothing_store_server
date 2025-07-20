-- Thêm tài khoản admin
INSERT INTO users (username, email, password, role, is_active) 
VALUES ('admin', 'admin@clothingstore.com', '$2a$10$H7otbbXFDSjD5swMOT2Kt.5ceSW.0cNgXuRxsyd8RHTXcCDVrX46e', 'admin', 1)
ON DUPLICATE KEY UPDATE 
password = '$2a$10$H7otbbXFDSjD5swMOT2Kt.5ceSW.0cNgXuRxsyd8RHTXcCDVrX46e';

-- Kiểm tra tài khoản admin
SELECT id, username, email, role, is_active FROM users WHERE username = 'admin';
