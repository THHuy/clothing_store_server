# Clothing Store API Server

Backend API server cho hệ thống quản lý cửa hàng quần áo.

## Cài đặt và Chạy

### 1. Cài đặt dependencies
```bash
npm install
```

### 2. Cấu hình môi trường
Tạo file `.env` với nội dung:
```
# Database
DB_HOST=localhost
DB_USER=root
DB_PASSWORD=123456
DB_NAME=clothing_store
DB_PORT=3306

# JWT
JWT_SECRET=your-super-secret-jwt-key-here
JWT_EXPIRE=24h

# Server
PORT=3001
NODE_ENV=development
ALLOWED_ORIGINS=http://localhost:5173,http://localhost:3000

# Upload
UPLOAD_DIR=uploads
MAX_FILE_SIZE=5242880
```

### 3. Cấu hình Database
Trước tiên, tạo database trong MySQL:
```sql
CREATE DATABASE clothing_store CHARACTER SET utf8mb4 COLLATE utf8mb4_unicode_ci;
```

Sau đó chạy file schema để tạo bảng:
```bash
mysql -u root -p clothing_store < database/schema.sql
```

Hoặc chạy migration script:
```bash
npm run migrate
```

### 4. Chạy server
```bash
# Development mode với nodemon
npm run dev

# Production mode
npm start
```

Server sẽ chạy tại: http://localhost:3001

## API Endpoints

### Authentication
- `POST /api/auth/login` - Đăng nhập
- `POST /api/auth/logout` - Đăng xuất
- `GET /api/auth/profile` - Lấy thông tin user
- `PUT /api/auth/profile` - Cập nhật thông tin user

### Products
- `GET /api/products` - Lấy danh sách sản phẩm (có pagination, filter)
- `GET /api/products/:id` - Lấy chi tiết sản phẩm
- `POST /api/products` - Tạo sản phẩm mới (Admin/Manager)
- `PUT /api/products/:id` - Cập nhật sản phẩm (Admin/Manager)
- `DELETE /api/products/:id` - Xóa sản phẩm (Admin/Manager)

### Categories
- `GET /api/categories` - Lấy danh sách danh mục
- `GET /api/categories/:id` - Lấy chi tiết danh mục
- `POST /api/categories` - Tạo danh mục mới (Admin/Manager)
- `PUT /api/categories/:id` - Cập nhật danh mục (Admin/Manager)
- `DELETE /api/categories/:id` - Xóa danh mục (Admin/Manager)

### Product Variants
- `GET /api/variants/product/:productId` - Lấy variants của sản phẩm
- `GET /api/variants/:id` - Lấy chi tiết variant
- `POST /api/variants` - Tạo variant mới (Admin/Manager)
- `PUT /api/variants/:id` - Cập nhật variant (Admin/Manager)
- `PATCH /api/variants/:id/stock` - Cập nhật số lượng tồn kho
- `DELETE /api/variants/:id` - Xóa variant (Admin/Manager)
- `GET /api/variants/alerts/low-stock` - Cảnh báo hàng sắp hết

### Inventory Management
- `GET /api/inventory/transactions` - Lịch sử giao dịch kho (Admin/Manager)
- `POST /api/inventory/stock-in` - Nhập kho (Admin/Manager)
- `POST /api/inventory/stock-out` - Xuất kho (Admin/Manager)
- `POST /api/inventory/stock-adjust` - Điều chỉnh tồn kho (Admin/Manager)
- `GET /api/inventory/summary` - Tổng quan tồn kho (Admin/Manager)

### User Management
- `GET /api/users` - Lấy danh sách user (Admin)
- `GET /api/users/:id` - Lấy chi tiết user (Admin)
- `POST /api/users` - Tạo user mới (Admin)
- `PUT /api/users/:id` - Cập nhật user (Admin)
- `PATCH /api/users/:id/password` - Đổi mật khẩu user (Admin)
- `PATCH /api/users/:id/toggle-status` - Bật/tắt user (Admin)
- `DELETE /api/users/:id` - Xóa user (Admin)
- `GET /api/users/stats/overview` - Thống kê user (Admin)

### Reports
- `GET /api/reports/sales` - Báo cáo bán hàng (Admin/Manager)
- `GET /api/reports/inventory` - Báo cáo tồn kho (Admin/Manager)
- `GET /api/reports/profit` - Báo cáo lợi nhuận (Admin/Manager)
- `GET /api/reports/dashboard` - Tổng quan dashboard (Admin/Manager)

### Health Check
- `GET /api/health` - Kiểm tra trạng thái server

## Database Schema

### Bảng users
Quản lý thông tin người dùng và phân quyền.

### Bảng categories
Danh mục sản phẩm.

### Bảng products
Thông tin sản phẩm cơ bản.

### Bảng product_variants
Biến thể sản phẩm (size, màu sắc, tồn kho).

### Bảng inventory_transactions
Lịch sử giao dịch nhập/xuất kho.

### Bảng orders & order_items
Đơn hàng và chi tiết đơn hàng (để mở rộng tương lai).

## Authentication & Authorization

### Roles
- **admin**: Toàn quyền quản lý hệ thống
- **manager**: Quản lý sản phẩm, kho hàng, báo cáo
- **staff**: Chỉ xem thông tin cơ bản

### Default Admin Account
- Email: `admin@clothingstore.com`
- Password: `admin123`

## Error Handling

API trả về response format:
```json
{
  "success": true/false,
  "message": "Message description",
  "data": {...} // Nếu success = true
}
```

HTTP Status Codes:
- `200`: Success
- `201`: Created
- `400`: Bad Request
- `401`: Unauthorized
- `403`: Forbidden
- `404`: Not Found
- `500`: Internal Server Error

## Security Features

- Rate limiting (1000 requests/15 minutes per IP)
- JWT authentication
- Password hashing với bcrypt
- Helmet for security headers
- CORS configuration
- Input validation
- SQL injection protection với prepared statements

## Environment Variables

Các biến môi trường quan trọng:

- `DB_HOST`, `DB_USER`, `DB_PASSWORD`, `DB_NAME`: Cấu hình database
- `JWT_SECRET`: Secret key cho JWT
- `PORT`: Port chạy server
- `NODE_ENV`: Môi trường (development/production)
- `ALLOWED_ORIGINS`: Danh sách domain được phép CORS
