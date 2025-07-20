const express = require('express');
const { promisePool } = require('../config/database');
const { authenticateToken, requireAdminOrManager } = require('../middleware/auth');

const router = express.Router();

// Get inventory variants with stock information
router.get('/variants', authenticateToken, requireAdminOrManager, async (req, res) => {
  try {
    const {
      search = '',
      category = '',
      lowStock = false,
      outOfStock = false,
      page = 1,
      limit = 100
    } = req.query;

    const offset = (parseInt(page) - 1) * parseInt(limit);

    // Build WHERE clause
    let whereConditions = ['p.is_active = ?'];
    let queryParams = [1];

    if (search) {
      whereConditions.push('(p.name LIKE ? OR p.sku LIKE ?)');
      queryParams.push(`%${search}%`, `%${search}%`);
    }

    if (category) {
      whereConditions.push('c.name = ?');
      queryParams.push(category);
    }

    if (outOfStock === 'true') {
      whereConditions.push('pv.stock = 0');
    } else if (lowStock === 'true') {
      whereConditions.push('pv.stock <= pv.min_stock AND pv.stock > 0');
    }

    // Build the query dynamically to avoid parameter mismatch
    let baseQuery = `
      SELECT 
        pv.id, pv.size, pv.color, pv.stock, pv.min_stock,
        p.id as product_id, p.name as product_name, p.sku as product_sku, p.images,
        c.name as category_name
      FROM product_variants pv
      JOIN products p ON pv.product_id = p.id
      JOIN categories c ON p.category_id = c.id
    `;

    // Add WHERE clause if there are conditions
    if (whereConditions.length > 0) {
      baseQuery += ` WHERE ${whereConditions.join(' AND ')}`;
    }

    // Add ORDER BY and pagination
    baseQuery += ` ORDER BY p.name, pv.size, pv.color`;
    baseQuery += ` LIMIT ${parseInt(limit)} OFFSET ${offset}`;

    console.log('Inventory variants query:', baseQuery);
    console.log('Query params:', queryParams);

    // Get variants with product and category information
    const [variants] = await promisePool.execute(baseQuery, queryParams);

    // Format response
    const formattedVariants = variants.map(variant => {
      // Safely parse images JSON
      let images = [];
      try {
        if (variant.images) {
          // Handle different data types from MySQL
          let imageData = variant.images;
          
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
        console.log('Error parsing images for variant', variant.id, ':', error.message);
        console.log('Raw images value:', variant.images);
        console.log('Type:', typeof variant.images);
        // Fallback - if all else fails, use default image
        images = ['/uploads/default-product.jpg'];
      }

      return {
        id: variant.id,
        size: variant.size,
        color: variant.color,
        stock: variant.stock,
        minStock: variant.min_stock,
        currentStock: variant.stock, // Alias for compatibility
        product: {
          id: variant.product_id,
          name: variant.product_name,
          sku: variant.product_sku,
          category: variant.category_name,
          images: images
        }
      };
    });

    res.json({
      success: true,
      data: formattedVariants
    });

  } catch (error) {
    console.error('Get inventory variants error:', error);
    res.status(500).json({
      success: false,
      message: 'Failed to fetch inventory variants'
    });
  }
});

// Get inventory transactions with filters
router.get('/transactions', authenticateToken, requireAdminOrManager, async (req, res) => {
  try {
    const {
      page = 1,
      limit = 20,
      type = '',
      productId = '',
      variantId = '',
      startDate = '',
      endDate = '',
      userId = '',
      search = ''
    } = req.query;

    const offset = (parseInt(page) - 1) * parseInt(limit);

    // Build WHERE clause
    let whereConditions = [];
    let queryParams = [];

    if (type && ['in', 'out', 'adjustment'].includes(type)) {
      whereConditions.push('it.type = ?');
      queryParams.push(type);
    }

    if (productId) {
      whereConditions.push('p.id = ?');
      queryParams.push(productId);
    }

    if (variantId) {
      whereConditions.push('it.variant_id = ?');
      queryParams.push(variantId);
    }

    if (search) {
      whereConditions.push('(p.name LIKE ? OR p.sku LIKE ? OR it.reason LIKE ?)');
      queryParams.push(`%${search}%`, `%${search}%`, `%${search}%`);
    }

    if (startDate) {
      whereConditions.push('DATE(it.created_at) >= ?');
      queryParams.push(startDate);
    }

    if (endDate) {
      whereConditions.push('DATE(it.created_at) <= ?');
      queryParams.push(endDate);
    }

    if (userId) {
      whereConditions.push('it.user_id = ?');
      queryParams.push(userId);
    }

    // Build transactions query dynamically to avoid parameter mismatch
    let transactionsQuery = `
      SELECT 
        it.id, it.type, it.quantity, it.reason, it.created_at,
        pv.id as variant_id, pv.size, pv.color, pv.stock as current_stock,
        p.id as product_id, p.name as product_name, p.sku as product_sku,
        c.name as category_name,
        u.id as user_id, u.name as user_name, u.email as user_email
      FROM inventory_transactions it
      JOIN product_variants pv ON it.variant_id = pv.id
      JOIN products p ON pv.product_id = p.id
      JOIN categories c ON p.category_id = c.id
      LEFT JOIN users u ON it.user_id = u.id
    `;

    // Add WHERE clause if there are conditions
    if (whereConditions.length > 0) {
      transactionsQuery += ` WHERE ${whereConditions.join(' AND ')}`;
    }

    // Add ORDER BY and pagination
    transactionsQuery += ` ORDER BY it.created_at DESC`;
    transactionsQuery += ` LIMIT ${parseInt(limit)} OFFSET ${offset}`;
    
    const [transactions] = await promisePool.execute(transactionsQuery, queryParams);

    // Get total count for pagination
    let countQuery = `
      SELECT COUNT(*) as total
      FROM inventory_transactions it
      JOIN product_variants pv ON it.variant_id = pv.id
      JOIN products p ON pv.product_id = p.id
      JOIN categories c ON p.category_id = c.id
    `;

    // Add WHERE clause to count query if needed
    if (whereConditions.length > 0) {
      countQuery += ` WHERE ${whereConditions.join(' AND ')}`;
    }

    const [countResult] = await promisePool.execute(countQuery, queryParams);
    const total = countResult[0].total;

    // Format transactions data
    const formattedTransactions = transactions.map(transaction => ({
      id: transaction.id,
      type: transaction.type,
      quantity: transaction.quantity,
      reason: transaction.reason,
      createdAt: transaction.created_at,
      variant: {
        id: transaction.variant_id,
        size: transaction.size,
        color: transaction.color,
        currentStock: transaction.current_stock
      },
      product: {
        id: transaction.product_id,
        name: transaction.product_name,
        sku: transaction.product_sku,
        category: transaction.category_name
      },
      user: {
        id: transaction.user_id,
        name: transaction.user_name,
        email: transaction.user_email
      }
    }));

    res.json({
      success: true,
      data: formattedTransactions,
      pagination: {
        page: parseInt(page),
        limit: parseInt(limit),
        total,
        totalPages: Math.ceil(total / parseInt(limit))
      }
    });

  } catch (error) {
    console.error('Get inventory transactions error:', error);
    res.status(500).json({
      success: false,
      message: 'Failed to fetch inventory transactions'
    });
  }
});

// Add stock (stock in)
router.post('/stock-in', authenticateToken, requireAdminOrManager, async (req, res) => {
  try {
    const { variantId, quantity, reason = 'Stock replenishment', supplier = '' } = req.body;

    // Validate input
    if (!variantId || !quantity || quantity <= 0) {
      return res.status(400).json({
        success: false,
        message: 'Valid variant ID and quantity are required'
      });
    }

    // Check if variant exists
    const [variantCheck] = await promisePool.execute(
      'SELECT stock FROM product_variants WHERE id = ?',
      [variantId]
    );

    if (variantCheck.length === 0) {
      return res.status(404).json({
        success: false,
        message: 'Product variant not found'
      });
    }

    const currentStock = variantCheck[0].stock;
    const newStock = currentStock + parseInt(quantity);

    const connection = await promisePool.getConnection();
    try {
      await connection.beginTransaction();

      // Update variant stock
      await connection.execute(
        'UPDATE product_variants SET stock = ?, updated_at = NOW() WHERE id = ?',
        [newStock, variantId]
      );

      // Create inventory transaction
      const [transactionResult] = await connection.execute(
        `INSERT INTO inventory_transactions 
         (variant_id, type, quantity, reason, supplier, user_id, created_at) 
         VALUES (?, 'in', ?, ?, ?, ?, NOW())`,
        [variantId, quantity, reason, supplier, req.user.id]
      );

      await connection.commit();

      res.json({
        success: true,
        message: 'Stock added successfully',
        data: {
          transactionId: transactionResult.insertId,
          previousStock: currentStock,
          addedQuantity: parseInt(quantity),
          newStock: newStock
        }
      });

    } catch (error) {
      await connection.rollback();
      throw error;
    } finally {
      connection.release();
    }

  } catch (error) {
    console.error('Stock in error:', error);
    res.status(500).json({
      success: false,
      message: 'Failed to add stock'
    });
  }
});

// Remove stock (stock out)
router.post('/stock-out', authenticateToken, requireAdminOrManager, async (req, res) => {
  try {
    console.log('📦 Stock-out request received:', req.body);
    
    const { 
      variantId, 
      quantity, 
      reason = 'Manual adjustment', 
      orderId = null,
      customerName = '',
      customerPhone = '',
      customerEmail = '',
      createOrder = false // Flag để tự động tạo đơn hàng
    } = req.body;

    // Validate input
    if (!variantId || !quantity || quantity <= 0) {
      return res.status(400).json({
        success: false,
        message: 'Valid variant ID and quantity are required'
      });
    }

    // Check if variant exists and has enough stock
    const [variantCheck] = await promisePool.execute(
      `SELECT pv.stock, p.sale_price, p.name as product_name 
       FROM product_variants pv 
       JOIN products p ON pv.product_id = p.id 
       WHERE pv.id = ?`,
      [variantId]
    );

    if (variantCheck.length === 0) {
      return res.status(404).json({
        success: false,
        message: 'Product variant not found'
      });
    }

    const currentStock = variantCheck[0].stock;
    const requestedQuantity = parseInt(quantity);
    const unitPrice = variantCheck[0].sale_price;
    const productName = variantCheck[0].product_name;

    if (currentStock < requestedQuantity) {
      return res.status(400).json({
        success: false,
        message: `Insufficient stock. Available: ${currentStock}, Requested: ${requestedQuantity}`
      });
    }

    const newStock = currentStock - requestedQuantity;

    const connection = await promisePool.getConnection();
    try {
      await connection.beginTransaction();

      let finalOrderId = orderId;

      // Tự động tạo đơn hàng khi có thông tin khách hàng hoặc khi được yêu cầu
      const shouldCreateOrder = createOrder || 
                               customerName.trim() !== '' || 
                               customerPhone.trim() !== '' || 
                               (!orderId && reason.toLowerCase().includes('bán'));

      console.log('🔍 Should create order?', shouldCreateOrder, {
        createOrder,
        hasCustomerName: customerName.trim() !== '',
        hasCustomerPhone: customerPhone.trim() !== '',
        reasonIncludesSale: reason.toLowerCase().includes('bán'),
        noOrderId: !orderId
      });

      if (shouldCreateOrder) {
        const orderNumber = `ORD-${Date.now()}`;
        const totalAmount = unitPrice * requestedQuantity;

        console.log('🛒 Creating order:', {
          orderNumber,
          customerName: customerName || 'Khách lẻ',
          customerPhone: customerPhone || '',
          totalAmount,
          userId: req.user.id
        });

        const [orderResult] = await connection.execute(
          `INSERT INTO orders 
           (order_number, customer_name, customer_phone, customer_email, total_amount, status, payment_status, user_id, created_at) 
           VALUES (?, ?, ?, ?, ?, 'completed', 'paid', ?, NOW())`,
          [
            orderNumber, 
            customerName || 'Khách lẻ', 
            customerPhone || '', 
            customerEmail || '',
            totalAmount, 
            req.user.id
          ]
        );

        finalOrderId = orderResult.insertId;

        // Tạo order item
        await connection.execute(
          `INSERT INTO order_items 
           (order_id, variant_id, quantity, price) 
           VALUES (?, ?, ?, ?)`,
          [finalOrderId, variantId, requestedQuantity, unitPrice * requestedQuantity]
        );

        console.log(`✅ Created order ${orderNumber} (ID: ${finalOrderId}) for ${productName} x${requestedQuantity}`);
      }

      // Update variant stock
      await connection.execute(
        'UPDATE product_variants SET stock = ?, updated_at = NOW() WHERE id = ?',
        [newStock, variantId]
      );

      // Create inventory transaction
      const [transactionResult] = await connection.execute(
        `INSERT INTO inventory_transactions 
         (variant_id, type, quantity, reason, order_id, user_id, created_at) 
         VALUES (?, 'out', ?, ?, ?, ?, NOW())`,
        [variantId, requestedQuantity, reason, finalOrderId, req.user.id]
      );

      await connection.commit();

      const responseMessage = finalOrderId && finalOrderId !== orderId ? 
        `Xuất kho thành công và đã tạo đơn hàng ${finalOrderId}` : 
        'Xuất kho thành công';

      console.log('✅ Stock-out completed:', responseMessage);

      res.json({
        success: true,
        message: responseMessage,
        data: {
          transactionId: transactionResult.insertId,
          orderId: finalOrderId,
          orderCreated: finalOrderId && finalOrderId !== orderId,
          previousStock: currentStock,
          removedQuantity: requestedQuantity,
          newStock: newStock
        }
      });

    } catch (error) {
      await connection.rollback();
      console.error('Transaction rollback:', error);
      throw error;
    } finally {
      connection.release();
    }

  } catch (error) {
    console.error('Stock out error:', error);
    res.status(500).json({
      success: false,
      message: 'Failed to remove stock'
    });
  }
});

// Stock adjustment (set exact stock value)
router.post('/stock-adjust', authenticateToken, requireAdminOrManager, async (req, res) => {
  try {
    const { variantId, newStock, reason = 'Stock adjustment' } = req.body;

    // Validate input
    if (!variantId || newStock === undefined || newStock < 0) {
      return res.status(400).json({
        success: false,
        message: 'Valid variant ID and new stock value are required'
      });
    }

    // Check if variant exists
    const [variantCheck] = await promisePool.execute(
      'SELECT stock FROM product_variants WHERE id = ?',
      [variantId]
    );

    if (variantCheck.length === 0) {
      return res.status(404).json({
        success: false,
        message: 'Product variant not found'
      });
    }

    const currentStock = variantCheck[0].stock;
    const targetStock = parseInt(newStock);
    const difference = targetStock - currentStock;

    if (difference === 0) {
      return res.json({
        success: true,
        message: 'No adjustment needed - stock is already at target value',
        data: {
          currentStock: currentStock,
          targetStock: targetStock,
          change: 0
        }
      });
    }

    const connection = await promisePool.getConnection();
    try {
      await connection.beginTransaction();

      // Update variant stock
      await connection.execute(
        'UPDATE product_variants SET stock = ?, updated_at = NOW() WHERE id = ?',
        [targetStock, variantId]
      );

      // Create inventory transaction
      const [transactionResult] = await connection.execute(
        `INSERT INTO inventory_transactions 
         (variant_id, type, quantity, reason, user_id, created_at) 
         VALUES (?, 'adjustment', ?, ?, ?, NOW())`,
        [variantId, Math.abs(difference), reason, req.user.id]
      );

      await connection.commit();

      res.json({
        success: true,
        message: 'Stock adjusted successfully',
        data: {
          transactionId: transactionResult.insertId,
          previousStock: currentStock,
          newStock: targetStock,
          change: difference,
          changeType: 'adjustment'
        }
      });

    } catch (error) {
      await connection.rollback();
      throw error;
    } finally {
      connection.release();
    }

  } catch (error) {
    console.error('Stock adjustment error:', error);
    res.status(500).json({
      success: false,
      message: 'Failed to adjust stock'
    });
  }
});

// Get inventory summary
router.get('/summary', authenticateToken, requireAdminOrManager, async (req, res) => {
  try {
    // Get overall statistics
    const [overallStats] = await promisePool.execute(`
      SELECT 
        COUNT(DISTINCT p.id) as total_products,
        COUNT(pv.id) as total_variants,
        SUM(pv.stock) as total_stock_units,
        SUM(pv.stock * p.purchase_price) as total_stock_value,
        COUNT(CASE WHEN pv.stock <= pv.min_stock THEN 1 END) as low_stock_variants,
        COUNT(CASE WHEN pv.stock = 0 THEN 1 END) as out_of_stock_variants
      FROM products p
      JOIN product_variants pv ON p.id = pv.product_id
      WHERE p.is_active = 1
    `);

    // Get category breakdown
    const [categoryStats] = await promisePool.execute(`
      SELECT 
        c.id, c.name as category_name,
        COUNT(DISTINCT p.id) as product_count,
        COUNT(pv.id) as variant_count,
        SUM(pv.stock) as total_stock,
        SUM(pv.stock * p.purchase_price) as stock_value
      FROM categories c
      LEFT JOIN products p ON c.id = p.category_id AND p.is_active = 1
      LEFT JOIN product_variants pv ON p.id = pv.product_id
      WHERE c.is_active = 1
      GROUP BY c.id, c.name
      ORDER BY stock_value DESC
    `);

    // Get recent transactions (last 10)
    const [recentTransactions] = await promisePool.execute(`
      SELECT 
        it.id, it.type, it.quantity, it.reason, it.created_at,
        p.name as product_name, p.sku,
        pv.size, pv.color,
        u.name as user_name
      FROM inventory_transactions it
      JOIN product_variants pv ON it.variant_id = pv.id
      JOIN products p ON pv.product_id = p.id
      LEFT JOIN users u ON it.user_id = u.id
      ORDER BY it.created_at DESC
      LIMIT 10
    `);

    const formattedOverallStats = {
      totalProducts: overallStats[0].total_products,
      totalVariants: overallStats[0].total_variants,
      totalStockUnits: overallStats[0].total_stock_units || 0,
      totalStockValue: overallStats[0].total_stock_value || 0,
      lowStockVariants: overallStats[0].low_stock_variants,
      outOfStockVariants: overallStats[0].out_of_stock_variants
    };

    const formattedCategoryStats = categoryStats.map(category => ({
      id: category.id,
      name: category.category_name,
      productCount: category.product_count || 0,
      variantCount: category.variant_count || 0,
      totalStock: category.total_stock || 0,
      stockValue: category.stock_value || 0
    }));

    const formattedRecentTransactions = recentTransactions.map(transaction => ({
      id: transaction.id,
      type: transaction.type,
      quantity: transaction.quantity,
      reason: transaction.reason,
      createdAt: transaction.created_at,
      product: {
        name: transaction.product_name,
        sku: transaction.sku,
        variant: `${transaction.size}/${transaction.color}`
      },
      user: transaction.user_name
    }));

    res.json({
      success: true,
      data: {
        overview: formattedOverallStats,
        categoryBreakdown: formattedCategoryStats,
        recentTransactions: formattedRecentTransactions
      }
    });

  } catch (error) {
    console.error('Get inventory summary error:', error);
    res.status(500).json({
      success: false,
      message: 'Failed to fetch inventory summary'
    });
  }
});

// Bulk inventory transaction (Admin/Manager only)
router.post('/bulk-transaction', authenticateToken, requireAdminOrManager, async (req, res) => {
  const connection = await promisePool.getConnection();
  
  try {
    const { transactions, supplier, reason } = req.body;
    const userId = req.user.id;

    if (!transactions || !Array.isArray(transactions) || transactions.length === 0) {
      return res.status(400).json({
        success: false,
        message: 'Transactions array is required'
      });
    }

    await connection.beginTransaction();

    const results = [];

    for (const transaction of transactions) {
      const { productId, size, color, quantity, minStock, type = 'IN' } = transaction;

      if (!productId || !size || !color || !quantity) {
        throw new Error('Missing required fields: productId, size, color, quantity');
      }

      // Check if variant exists
      let [variantRows] = await connection.execute(
        'SELECT id, stock FROM product_variants WHERE product_id = ? AND size = ? AND color = ?',
        [productId, size, color]
      );

      let variantId;
      let currentStock = 0;

      if (variantRows.length === 0) {
        // Create new variant
        const [variantResult] = await connection.execute(
          'INSERT INTO product_variants (product_id, size, color, stock, min_stock) VALUES (?, ?, ?, ?, ?)',
          [productId, size, color, 0, minStock || 5]
        );
        variantId = variantResult.insertId;
      } else {
        variantId = variantRows[0].id;
        currentStock = variantRows[0].stock;
      }

      // Calculate new stock
      const newStock = type === 'IN' ? currentStock + quantity : Math.max(0, currentStock - quantity);

      // Update variant stock
      await connection.execute(
        'UPDATE product_variants SET stock = ?, min_stock = COALESCE(?, min_stock) WHERE id = ?',
        [newStock, minStock, variantId]
      );

      // Create transaction record
      const [transactionResult] = await connection.execute(
        'INSERT INTO inventory_transactions (variant_id, type, quantity, reason, supplier, user_id, created_at) VALUES (?, ?, ?, ?, ?, ?, NOW())',
        [variantId, type, quantity, reason || `Bulk ${type.toLowerCase()}`, supplier, userId]
      );

      results.push({
        variantId,
        transactionId: transactionResult.insertId,
        previousStock: currentStock,
        newStock,
        quantity
      });
    }

    await connection.commit();

    res.json({
      success: true,
      message: `Successfully processed ${transactions.length} transactions`,
      data: results
    });

  } catch (error) {
    await connection.rollback();
    console.error('Bulk transaction error:', error);
    res.status(500).json({
      success: false,
      message: error.message || 'Failed to process bulk transaction'
    });
  } finally {
    connection.release();
  }
});

module.exports = router;
