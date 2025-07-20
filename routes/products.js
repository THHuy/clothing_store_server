const express = require('express');
const router = express.Router();
const { promisePool } = require('../config/database');
const { authenticateToken, requireAdminOrManager } = require('../middleware/auth');
const multer = require('multer');
const path = require('path');
const fs = require('fs');

// Configure multer for file uploads
const storage = multer.diskStorage({
  destination: function (req, file, cb) {
    const uploadDir = path.join(__dirname, '..', 'uploads');
    if (!fs.existsSync(uploadDir)) {
      fs.mkdirSync(uploadDir, { recursive: true });
    }
    cb(null, uploadDir);
  },
  filename: function (req, file, cb) {
    const uniqueSuffix = Date.now() + '-' + Math.round(Math.random() * 1E9);
    cb(null, 'product-' + uniqueSuffix + path.extname(file.originalname));
  }
});

const upload = multer({ 
  storage: storage,
  limits: {
    fileSize: 5 * 1024 * 1024 // 5MB limit
  },
  fileFilter: function (req, file, cb) {
    const allowedTypes = /jpeg|jpg|png|webp/;
    const extname = allowedTypes.test(path.extname(file.originalname).toLowerCase());
    const mimetype = allowedTypes.test(file.mimetype);
    
    if (mimetype && extname) {
      return cb(null, true);
    } else {
      cb(new Error('Chỉ cho phép upload ảnh (jpeg, jpg, png, webp)'));
    }
  }
});

// Get all products with simple query
router.get('/', async (req, res) => {
  try {
    console.log('Starting products query...');
    
    const {
      page = 1,
      limit = 12,
      search = '',
      category = '',
      categoryId = '',
      brand = '',
      minPrice = 0,
      maxPrice = 999999999,
      sortBy = 'created_at',
      sortOrder = 'desc'
    } = req.query;

    const offset = (parseInt(page) - 1) * parseInt(limit);

    // Build WHERE clause
    let whereConditions = ['p.is_active = ?'];
    let queryParams = [1];

    if (search) {
      whereConditions.push('(p.name LIKE ? OR p.description LIKE ? OR p.sku LIKE ?)');
      queryParams.push(`%${search}%`, `%${search}%`, `%${search}%`);
    }

    if (category) {
      whereConditions.push('c.slug = ?');
      queryParams.push(category);
    }

    if (categoryId) {
      whereConditions.push('c.id = ?');
      queryParams.push(parseInt(categoryId));
    }

    if (brand) {
      whereConditions.push('p.brand = ?');
      queryParams.push(brand);
    }

    whereConditions.push('p.sale_price BETWEEN ? AND ?');
    queryParams.push(parseFloat(minPrice), parseFloat(maxPrice));

    // Validate sort parameters first
    const allowedSortFields = ['name', 'sale_price', 'created_at', 'updated_at'];
    const allowedSortOrders = ['asc', 'desc'];
    const validSortBy = allowedSortFields.includes(sortBy) ? sortBy : 'created_at';
    const validSortOrder = allowedSortOrders.includes(sortOrder.toLowerCase()) ? sortOrder.toLowerCase() : 'desc';

    // Build the complete query string to avoid template literal issues
    let baseQuery = `
      SELECT 
        p.id, p.sku, p.name, p.brand, p.material, p.description, p.images,
        p.purchase_price, p.sale_price, p.is_active, p.created_at, p.updated_at,
        c.id as category_id, c.name as category_name, c.slug as category_slug
      FROM products p
      LEFT JOIN categories c ON p.category_id = c.id
    `;

    // Add WHERE clause manually
    if (whereConditions.length > 0) {
      baseQuery += ` WHERE ${whereConditions.join(' AND ')}`;
    }

    // Add ORDER BY and pagination
    baseQuery += ` ORDER BY p.${validSortBy} ${validSortOrder}`;
    baseQuery += ` LIMIT ${parseInt(limit)} OFFSET ${offset}`;

    // Execute the query with only WHERE parameters
    const [products] = await promisePool.execute(baseQuery, queryParams);

    // Get variants separately for each product
    const productsWithVariants = await Promise.all(
      products.map(async (product) => {
        const [variants] = await promisePool.execute(
          'SELECT id, size, color, stock, min_stock as minStock FROM product_variants WHERE product_id = ?',
          [product.id]
        );
        
        // Safely parse images JSON
        let images = [];
        try {
          if (product.images) {
            // Handle different data types from MySQL
            let imageData = product.images;
            
            // If it's a Buffer, convert to string first
            if (Buffer.isBuffer(imageData)) {
              imageData = imageData.toString('utf8');
            }
            
            // If it's already an array, use it directly
            if (Array.isArray(imageData)) {
              images = imageData;
            } else if (typeof imageData === 'string') {
              // Clean the string and try to parse
              imageData = imageData.trim();
              if (imageData.startsWith('[') && imageData.endsWith(']')) {
                images = JSON.parse(imageData);
              } else if (imageData.startsWith('http') || imageData.startsWith('/uploads')) {
                images = [imageData];
              } else {
                // Try direct JSON parse
                images = JSON.parse(imageData);
              }
            }
          }
        } catch (error) {
          console.log('Error parsing images for product', product.id, ':', error.message);
          console.log('Raw images value:', product.images);
          console.log('Type:', typeof product.images);
          // Fallback - if all else fails, use default image
          images = ['/uploads/default-product.jpg'];
        }
        
        return {
          ...product,
          // Convert snake_case to camelCase for frontend compatibility
          salePrice: product.sale_price ? parseFloat(product.sale_price) : 0,
          purchasePrice: product.purchase_price ? parseFloat(product.purchase_price) : 0,
          isActive: !!product.is_active,
          category: {
            id: product.category_id,
            name: product.category_name || 'Chưa phân loại',
            slug: product.category_slug || 'chua-phan-loai'
          },
          variants: variants || [],
          images: images
        };
      })
    );

    // Get total count for pagination
    let countQuery = `
      SELECT COUNT(DISTINCT p.id) as total
      FROM products p
      LEFT JOIN categories c ON p.category_id = c.id
    `;
    
    // Add WHERE clause to count query if needed
    if (whereConditions.length > 0) {
      countQuery += ` WHERE ${whereConditions.join(' AND ')}`;
    }

    const [countResult] = await promisePool.execute(countQuery, queryParams);
    const total = countResult[0].total;

    const totalPages = Math.ceil(total / parseInt(limit));

    res.json({
      success: true,
      data: productsWithVariants,
      pagination: {
        page: parseInt(page),
        limit: parseInt(limit),
        total: total,
        totalPages: totalPages,
        hasNext: parseInt(page) < totalPages,
        hasPrev: parseInt(page) > 1
      }
    });

  } catch (error) {
    console.error('Get products error:', error);
    res.status(500).json({
      success: false,
      message: 'Lỗi khi lấy danh sách sản phẩm'
    });
  }
});

// Get product by ID
router.get('/:id', async (req, res) => {
  try {
    const { id } = req.params;

    const [products] = await promisePool.execute(`
      SELECT 
        p.id, p.sku, p.name, p.brand, p.material, p.description, p.images,
        p.purchase_price, p.sale_price, p.is_active, p.created_at, p.updated_at,
        c.id as category_id, c.name as category_name, c.slug as category_slug
      FROM products p
      LEFT JOIN categories c ON p.category_id = c.id
      WHERE p.id = ? AND p.is_active = ?
    `, [id, 1]);

    if (products.length === 0) {
      return res.status(404).json({
        success: false,
        message: 'Không tìm thấy sản phẩm'
      });
    }

    const product = products[0];

    // Get variants for this product
    const [variants] = await promisePool.execute(
      'SELECT id, size, color, stock, min_stock as minStock FROM product_variants WHERE product_id = ?',
      [product.id]
    );

    const productWithDetails = {
      ...product,
      purchasePrice: product.purchase_price ? parseFloat(product.purchase_price) : 0,
      salePrice: product.sale_price ? parseFloat(product.sale_price) : 0,
      category: {
        id: product.category_id,
        name: product.category_name,
        slug: product.category_slug
      },
      variants: variants || [],
      images: product.images ? (typeof product.images === 'string' ? JSON.parse(product.images) : product.images) : []
    };

    res.json({
      success: true,
      data: productWithDetails
    });

  } catch (error) {
    console.error('Get product by ID error:', error);
    res.status(500).json({
      success: false,
      message: 'Lỗi khi lấy thông tin sản phẩm'
    });
  }
});

// Create new product
router.post('/', upload.array('images', 5), async (req, res) => {
  try {
    const {
      sku,
      name,
      category_id,
      brand,
      material,
      description,
      purchase_price,
      sale_price,
      variants
    } = req.body;

    // Process uploaded images
    const imageUrls = req.files ? req.files.map(file => `/uploads/${file.filename}`) : [];

    // Insert product
    const [result] = await promisePool.execute(`
      INSERT INTO products (sku, name, category_id, brand, material, description, images, purchase_price, sale_price)
      VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?)
    `, [
      sku,
      name,
      category_id,
      brand,
      material,
      description,
      JSON.stringify(imageUrls),
      purchase_price,
      sale_price
    ]);

    const productId = result.insertId;

    // Insert variants if provided
    if (variants && Array.isArray(variants)) {
      for (const variant of variants) {
        await promisePool.execute(`
          INSERT INTO product_variants (product_id, size, color, stock, min_stock)
          VALUES (?, ?, ?, ?, ?)
        `, [productId, variant.size, variant.color, variant.stock, variant.minStock || 5]);
      }
    }

    res.json({
      success: true,
      message: 'Tạo sản phẩm thành công',
      data: { id: productId, images: imageUrls }
    });

  } catch (error) {
    console.error('Create product error:', error);
    res.status(500).json({
      success: false,
      message: 'Lỗi khi tạo sản phẩm'
    });
  }
});

// Update product
router.put('/:id', upload.array('images', 5), async (req, res) => {
  try {
    const { id } = req.params;
    const {
      sku,
      name,
      category_id,
      brand,
      material,
      description,
      purchase_price,
      sale_price,
      variants,
      keepImages
    } = req.body;

    // Get existing product to check current images
    const [existing] = await promisePool.execute('SELECT images FROM products WHERE id = ?', [id]);
    if (existing.length === 0) {
      return res.status(404).json({ success: false, message: 'Không tìm thấy sản phẩm' });
    }

    let imageUrls = [];
    
    // Keep existing images if specified
    if (keepImages && existing[0].images) {
      const existingImages = typeof existing[0].images === 'string' 
        ? JSON.parse(existing[0].images) 
        : existing[0].images;
      imageUrls = [...existingImages];
    }

    // Add new uploaded images
    if (req.files && req.files.length > 0) {
      const newImages = req.files.map(file => `/uploads/${file.filename}`);
      imageUrls = [...imageUrls, ...newImages];
    }

    // Update product
    await promisePool.execute(`
      UPDATE products 
      SET sku = ?, name = ?, category_id = ?, brand = ?, material = ?, description = ?, 
          images = ?, purchase_price = ?, sale_price = ?, updated_at = CURRENT_TIMESTAMP
      WHERE id = ?
    `, [
      sku,
      name,
      category_id,
      brand,
      material,
      description,
      JSON.stringify(imageUrls),
      purchase_price,
      sale_price,
      id
    ]);

    // Update variants if provided
    if (variants && Array.isArray(variants)) {
      // Delete existing variants
      await promisePool.execute('DELETE FROM product_variants WHERE product_id = ?', [id]);
      
      // Insert new variants
      for (const variant of variants) {
        await promisePool.execute(`
          INSERT INTO product_variants (product_id, size, color, stock, min_stock)
          VALUES (?, ?, ?, ?, ?)
        `, [id, variant.size, variant.color, variant.stock, variant.minStock || 5]);
      }
    }

    res.json({
      success: true,
      message: 'Cập nhật sản phẩm thành công',
      data: { images: imageUrls }
    });

  } catch (error) {
    console.error('Update product error:', error);
    res.status(500).json({
      success: false,
      message: 'Lỗi khi cập nhật sản phẩm'
    });
  }
});

// Delete product
router.delete('/:id', async (req, res) => {
  try {
    const { id } = req.params;

    // Kiểm tra sản phẩm tồn tại
    const [product] = await promisePool.execute('SELECT id FROM products WHERE id = ?', [id]);
    if (product.length === 0) {
      return res.status(404).json({ success: false, message: 'Không tìm thấy sản phẩm' });
    }

    // Xóa mềm: cập nhật is_active = 0
    await promisePool.execute('UPDATE products SET is_active = 0 WHERE id = ?', [id]);

    res.json({
      success: true,
      message: 'Đã chuyển sản phẩm sang trạng thái ẩn (xóa mềm)'
    });

  } catch (error) {
    console.error('Delete product error:', error);
    res.status(500).json({
      success: false,
      message: 'Lỗi khi xóa sản phẩm',
      error: error.message
    });
  }
});

// Update product status (active/inactive)
router.patch('/:id/status', authenticateToken, requireAdminOrManager, async (req, res) => {
  try {
    const { id } = req.params;
    const { isActive } = req.body;

    // Validate input
    if (typeof isActive !== 'boolean') {
      return res.status(400).json({
        success: false,
        message: 'Trạng thái sản phẩm phải là true hoặc false'
      });
    }

    // Check if product exists
    const [existing] = await promisePool.execute('SELECT id, name FROM products WHERE id = ?', [id]);
    if (existing.length === 0) {
      return res.status(404).json({
        success: false,
        message: 'Không tìm thấy sản phẩm'
      });
    }

    // Update product status
    await promisePool.execute(`
      UPDATE products 
      SET is_active = ?, updated_at = CURRENT_TIMESTAMP
      WHERE id = ?
    `, [isActive ? 1 : 0, id]);

    console.log(`Product ${id} (${existing[0].name}) status updated to: ${isActive ? 'active' : 'inactive'}`);

    res.json({
      success: true,
      message: `${isActive ? 'Kích hoạt' : 'Vô hiệu hóa'} sản phẩm thành công`,
      data: {
        id: parseInt(id),
        name: existing[0].name,
        isActive: isActive
      }
    });

  } catch (error) {
    console.error('Update product status error:', error);
    res.status(500).json({
      success: false,
      message: 'Lỗi khi cập nhật trạng thái sản phẩm'
    });
  }
});

// Get all products for admin (including inactive products)
router.get('/admin/all', authenticateToken, requireAdminOrManager, async (req, res) => {
  try {
    console.log('Starting admin products query...');
    
    const {
      page = 1,
      limit = 12,
      search = '',
      category = '', // Add category filter
      sortBy = 'created_at',
      sortOrder = 'desc',
      isActive = '' // Filter by status (empty = all, 'true' = active, 'false' = inactive)
    } = req.query;

    const offset = (parseInt(page) - 1) * parseInt(limit);

    // Build WHERE conditions as an array
    let whereConditions = [];
    let queryParams = [];

    // Add search condition if provided
    if (search && search.trim() !== '') {
      whereConditions.push('(p.name LIKE ? OR p.description LIKE ? OR p.sku LIKE ?)');
      queryParams.push(`%${search}%`, `%${search}%`, `%${search}%`);
    }

    // Add category filter if provided
    if (category && category.trim() !== '') {
      whereConditions.push('c.name = ?');
      queryParams.push(category);
    }

    // Add status filter if provided
    if (isActive === 'true') {
      whereConditions.push('p.is_active = ?');
      queryParams.push(1);
    } else if (isActive === 'false') {
      whereConditions.push('p.is_active = ?');
      queryParams.push(0);
    }

    // Validate sort parameters
    const allowedSortFields = ['name', 'sale_price', 'created_at', 'updated_at', 'category_name'];
    const allowedSortOrders = ['asc', 'desc'];
    const validSortBy = allowedSortFields.includes(sortBy) ? sortBy : 'created_at';
    const validSortOrder = allowedSortOrders.includes(sortOrder.toLowerCase()) ? sortOrder.toLowerCase() : 'desc';

    // Build the main query dynamically
    let baseQuery = `
      SELECT 
        p.id, p.sku, p.name, p.brand, p.material, p.description, p.images,
        p.purchase_price, p.sale_price, p.is_active, p.created_at, p.updated_at,
        c.id as category_id, c.name as category_name, c.slug as category_slug
      FROM products p
      LEFT JOIN categories c ON p.category_id = c.id
    `;
    
    // Add WHERE clause if there are conditions
    if (whereConditions.length > 0) {
      baseQuery += ` WHERE ${whereConditions.join(' AND ')}`;
    }
    
    // Add ORDER BY with proper prefix for category sort
    const orderByField = validSortBy === 'category_name' ? `c.${validSortBy}` : `p.${validSortBy}`;
    baseQuery += ` ORDER BY ${orderByField} ${validSortOrder}`;
    baseQuery += ` LIMIT ${parseInt(limit)} OFFSET ${offset}`;
    
    console.log('Executing Admin Query:', baseQuery);
    console.log('Query Parameters:', queryParams);

    // Execute query with only WHERE parameters
    const [products] = await promisePool.execute(baseQuery, queryParams);

    // Get variants for each product
    const productsWithVariants = await Promise.all(products.map(async (product) => {
      const [variants] = await promisePool.execute(
        'SELECT id, size, color, stock, min_stock FROM product_variants WHERE product_id = ?',
        [product.id]
      );

      // Safely parse images
      let images = [];
      try {
        if (product.images) {
          images = typeof product.images === 'string' ? JSON.parse(product.images) : product.images;
        }
      } catch (error) {
        console.log('Error parsing images for product', product.id, ':', error.message);
        images = []; // Fallback to empty array on error
      }

      return {
        id: product.id,
        sku: product.sku,
        name: product.name,
        brand: product.brand,
        material: product.material,
        description: product.description,
        images: images,
        purchasePrice: product.purchase_price ? parseFloat(product.purchase_price) : 0,
        salePrice: product.sale_price ? parseFloat(product.sale_price) : 0,
        isActive: !!product.is_active,
        createdAt: product.created_at,
        updatedAt: product.updated_at,
        category: {
          id: product.category_id,
          name: product.category_name || 'Chưa phân loại',
          slug: product.category_slug || 'chua-phan-loai'
        },
        variants: variants.map(variant => ({
          id: variant.id,
          size: variant.size,
          color: variant.color,
          stock: variant.stock,
          minStock: variant.min_stock
        }))
      };
    }));

    // Get total count for pagination using the same WHERE clause
    let countQuery = `
      SELECT COUNT(DISTINCT p.id) as total
      FROM products p
      LEFT JOIN categories c ON p.category_id = c.id
    `;
    if (whereConditions.length > 0) {
      countQuery += ` WHERE ${whereConditions.join(' AND ')}`;
    }

    const [countResult] = await promisePool.execute(countQuery, queryParams);
    const total = countResult[0].total;

    console.log(`Admin query completed. Found ${products.length} products, total: ${total}`);

    res.json({
      success: true,
      data: productsWithVariants,
      pagination: {
        page: parseInt(page),
        limit: parseInt(limit),
        total,
        totalPages: Math.ceil(total / parseInt(limit))
      }
    });

  } catch (error) {
    console.error('Admin products query error:', error);
    res.status(500).json({
      success: false,
      message: 'Lỗi khi tải danh sách sản phẩm cho admin'
    });
  }
});

module.exports = router;
