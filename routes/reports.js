const express = require('express');
const ExcelJS = require('exceljs');
const { promisePool } = require('../config/database');
const { authenticateToken, requireAdminOrManager } = require('../middleware/auth');

const router = express.Router();

// Get sales report
router.get('/sales', authenticateToken, requireAdminOrManager, async (req, res) => {
  try {
    const {
      startDate = '',
      endDate = '',
      groupBy = 'day', // day, week, month, year
      categoryId = '',
      productId = ''
    } = req.query;

    // Build date conditions
    let dateConditions = [];
    let queryParams = [];

    if (startDate) {
      dateConditions.push('DATE(oi.created_at) >= ?');
      queryParams.push(startDate);
    }

    if (endDate) {
      dateConditions.push('DATE(oi.created_at) <= ?');
      queryParams.push(endDate);
    }

    if (categoryId) {
      dateConditions.push('p.category_id = ?');
      queryParams.push(categoryId);
    }

    if (productId) {
      dateConditions.push('p.id = ?');
      queryParams.push(productId);
    }

    const whereClause = dateConditions.length > 0 ? `WHERE ${dateConditions.join(' AND ')}` : '';

    // Determine date grouping
    let dateFormat;
    switch (groupBy) {
      case 'week':
        dateFormat = '%Y-%u';
        break;
      case 'month':
        dateFormat = '%Y-%m';
        break;
      case 'year':
        dateFormat = '%Y';
        break;
      default:
        dateFormat = '%Y-%m-%d';
    }

    // Get sales data grouped by date
    const salesQuery = `
      SELECT 
        DATE_FORMAT(oi.created_at, '${dateFormat}') as period,
        COUNT(DISTINCT o.id) as total_orders,
        SUM(oi.quantity) as total_units_sold,
        SUM(oi.price * oi.quantity) as total_revenue,
        AVG(oi.price) as average_price,
        COUNT(DISTINCT p.id) as unique_products_sold
      FROM order_items oi
      JOIN orders o ON oi.order_id = o.id
      JOIN product_variants pv ON oi.variant_id = pv.id
      JOIN products p ON pv.product_id = p.id
      ${whereClause}
      GROUP BY DATE_FORMAT(oi.created_at, '${dateFormat}')
      ORDER BY period DESC
      LIMIT 100
    `;

    const [salesData] = await promisePool.execute(salesQuery, queryParams);

    // Get top selling products
    const topProductsQuery = `
      SELECT 
        p.id, p.name, p.sku,
        c.name as category_name,
        SUM(oi.quantity) as total_sold,
        SUM(oi.price * oi.quantity) as total_revenue,
        AVG(oi.price) as average_price
      FROM order_items oi
      JOIN product_variants pv ON oi.variant_id = pv.id
      JOIN products p ON pv.product_id = p.id
      JOIN categories c ON p.category_id = c.id
      ${whereClause}
      GROUP BY p.id, p.name, p.sku, c.name
      ORDER BY total_sold DESC
      LIMIT 10
    `;

    const [topProducts] = await promisePool.execute(topProductsQuery, queryParams);

    // Get category performance
    const categoryQuery = `
      SELECT 
        c.id, c.name as category_name,
        COUNT(DISTINCT p.id) as product_count,
        SUM(oi.quantity) as total_sold,
        SUM(oi.price * oi.quantity) as total_revenue,
        AVG(oi.price) as average_price
      FROM order_items oi
      JOIN product_variants pv ON oi.variant_id = pv.id
      JOIN products p ON pv.product_id = p.id
      JOIN categories c ON p.category_id = c.id
      ${whereClause}
      GROUP BY c.id, c.name
      ORDER BY total_revenue DESC
    `;

    const [categoryData] = await promisePool.execute(categoryQuery, queryParams);

    // Format the data
    const formattedSalesData = salesData.map(item => ({
      period: item.period,
      totalOrders: item.total_orders,
      totalUnitsSold: item.total_units_sold,
      totalRevenue: parseFloat(item.total_revenue) || 0,
      averagePrice: parseFloat(item.average_price) || 0,
      uniqueProductsSold: item.unique_products_sold
    }));

    const formattedTopProducts = topProducts.map(product => ({
      id: product.id,
      name: product.name,
      sku: product.sku,
      categoryName: product.category_name,
      totalSold: product.total_sold,
      totalRevenue: parseFloat(product.total_revenue) || 0,
      averagePrice: parseFloat(product.average_price) || 0
    }));

    const formattedCategoryData = categoryData.map(category => ({
      id: category.id,
      name: category.category_name,
      productCount: category.product_count,
      totalSold: category.total_sold,
      totalRevenue: parseFloat(category.total_revenue) || 0,
      averagePrice: parseFloat(category.average_price) || 0
    }));

    res.json({
      success: true,
      data: {
        salesOverTime: formattedSalesData,
        topProducts: formattedTopProducts,
        categoryPerformance: formattedCategoryData,
        summary: {
          totalRevenue: formattedSalesData.reduce((sum, item) => sum + item.totalRevenue, 0),
          totalUnitsSold: formattedSalesData.reduce((sum, item) => sum + item.totalUnitsSold, 0),
          totalOrders: formattedSalesData.reduce((sum, item) => sum + item.totalOrders, 0),
          averageOrderValue: formattedSalesData.length > 0 
            ? formattedSalesData.reduce((sum, item) => sum + item.totalRevenue, 0) / 
              formattedSalesData.reduce((sum, item) => sum + item.totalOrders, 0)
            : 0
        }
      }
    });

  } catch (error) {
    console.error('Get sales report error:', error);
    res.status(500).json({
      success: false,
      message: 'Failed to fetch sales report'
    });
  }
});

// Get inventory report
router.get('/inventory', authenticateToken, requireAdminOrManager, async (req, res) => {
  try {
    const {
      categoryId = '',
      lowStockOnly = 'false',
      outOfStockOnly = 'false'
    } = req.query;

    // Build WHERE conditions
    let whereConditions = ['p.is_active = 1'];
    let queryParams = [];

    if (categoryId) {
      whereConditions.push('p.category_id = ?');
      queryParams.push(categoryId);
    }

    if (lowStockOnly === 'true') {
      whereConditions.push('pv.stock <= pv.min_stock');
    }

    if (outOfStockOnly === 'true') {
      whereConditions.push('pv.stock = 0');
    }

    const whereClause = `WHERE ${whereConditions.join(' AND ')}`;

    // Get inventory data
    const inventoryQuery = `
      SELECT 
        p.id as product_id, p.name as product_name, p.sku, p.purchase_price, p.sale_price,
        c.name as category_name,
        pv.id as variant_id, pv.size, pv.color, pv.stock, pv.min_stock,
        (pv.stock * p.purchase_price) as stock_value,
        CASE 
          WHEN pv.stock = 0 THEN 'Out of Stock'
          WHEN pv.stock <= pv.min_stock THEN 'Low Stock'
          ELSE 'In Stock'
        END as stock_status
      FROM products p
      JOIN categories c ON p.category_id = c.id
      JOIN product_variants pv ON p.id = pv.product_id
      ${whereClause}
      ORDER BY 
        CASE 
          WHEN pv.stock = 0 THEN 1
          WHEN pv.stock <= pv.min_stock THEN 2
          ELSE 3
        END,
        p.name, pv.size, pv.color
    `;

    const [inventoryData] = await promisePool.execute(inventoryQuery, queryParams);

    // Get summary statistics
    const [summaryStats] = await promisePool.execute(`
      SELECT 
        COUNT(DISTINCT p.id) as total_products,
        COUNT(pv.id) as total_variants,
        SUM(pv.stock) as total_stock_units,
        SUM(pv.stock * p.purchase_price) as total_stock_value,
        COUNT(CASE WHEN pv.stock = 0 THEN 1 END) as out_of_stock_count,
        COUNT(CASE WHEN pv.stock <= pv.min_stock AND pv.stock > 0 THEN 1 END) as low_stock_count,
        COUNT(CASE WHEN pv.stock > pv.min_stock THEN 1 END) as in_stock_count
      FROM products p
      JOIN product_variants pv ON p.id = pv.product_id
      WHERE p.is_active = 1
    `);

    // Get category breakdown
    const [categoryBreakdown] = await promisePool.execute(`
      SELECT 
        c.id, c.name as category_name,
        COUNT(DISTINCT p.id) as product_count,
        COUNT(pv.id) as variant_count,
        SUM(pv.stock) as total_stock,
        SUM(pv.stock * p.purchase_price) as stock_value,
        COUNT(CASE WHEN pv.stock = 0 THEN 1 END) as out_of_stock,
        COUNT(CASE WHEN pv.stock <= pv.min_stock AND pv.stock > 0 THEN 1 END) as low_stock
      FROM categories c
      LEFT JOIN products p ON c.id = p.category_id AND p.is_active = 1
      LEFT JOIN product_variants pv ON p.id = pv.product_id
      WHERE c.is_active = 1
      GROUP BY c.id, c.name
      ORDER BY stock_value DESC
    `);

    // Format the data
    const formattedInventoryData = inventoryData.map(item => ({
      product: {
        id: item.product_id,
        name: item.product_name,
        sku: item.sku,
        purchasePrice: parseFloat(item.purchase_price),
        salePrice: parseFloat(item.sale_price),
        categoryName: item.category_name
      },
      variant: {
        id: item.variant_id,
        size: item.size,
        color: item.color,
        stock: item.stock,
        minStock: item.min_stock,
        stockValue: parseFloat(item.stock_value) || 0,
        stockStatus: item.stock_status
      }
    }));

    const summary = summaryStats[0];
    const formattedSummary = {
      totalProducts: summary.total_products,
      totalVariants: summary.total_variants,
      totalStockUnits: summary.total_stock_units || 0,
      totalStockValue: parseFloat(summary.total_stock_value) || 0,
      outOfStockCount: summary.out_of_stock_count,
      lowStockCount: summary.low_stock_count,
      inStockCount: summary.in_stock_count
    };

    const formattedCategoryBreakdown = categoryBreakdown.map(category => ({
      id: category.id,
      name: category.category_name,
      productCount: category.product_count || 0,
      variantCount: category.variant_count || 0,
      totalStock: category.total_stock || 0,
      stockValue: parseFloat(category.stock_value) || 0,
      outOfStock: category.out_of_stock,
      lowStock: category.low_stock
    }));

    res.json({
      success: true,
      data: {
        inventory: formattedInventoryData,
        summary: formattedSummary,
        categoryBreakdown: formattedCategoryBreakdown
      }
    });

  } catch (error) {
    console.error('Get inventory report error:', error);
    res.status(500).json({
      success: false,
      message: 'Failed to fetch inventory report'
    });
  }
});

// Get profit analysis report
router.get('/profit', authenticateToken, requireAdminOrManager, async (req, res) => {
  try {
    const {
      startDate = '',
      endDate = '',
      groupBy = 'month'
    } = req.query;

    // Build date conditions
    let dateConditions = [];
    let queryParams = [];

    if (startDate) {
      dateConditions.push('DATE(oi.created_at) >= ?');
      queryParams.push(startDate);
    }

    if (endDate) {
      dateConditions.push('DATE(oi.created_at) <= ?');
      queryParams.push(endDate);
    }

    const whereClause = dateConditions.length > 0 ? `WHERE ${dateConditions.join(' AND ')}` : '';

    // Determine date grouping
    let dateFormat;
    switch (groupBy) {
      case 'day':
        dateFormat = '%Y-%m-%d';
        break;
      case 'week':
        dateFormat = '%Y-%u';
        break;
      case 'year':
        dateFormat = '%Y';
        break;
      default:
        dateFormat = '%Y-%m';
    }

    // Get profit analysis
    const profitQuery = `
      SELECT 
        DATE_FORMAT(oi.created_at, '${dateFormat}') as period,
        SUM(oi.quantity) as units_sold,
        SUM(oi.price * oi.quantity) as total_revenue,
        SUM(p.purchase_price * oi.quantity) as total_cost,
        SUM((oi.price - p.purchase_price) * oi.quantity) as total_profit,
        AVG((oi.price - p.purchase_price) / oi.price * 100) as avg_margin_percentage
      FROM order_items oi
      JOIN product_variants pv ON oi.variant_id = pv.id
      JOIN products p ON pv.product_id = p.id
      ${whereClause}
      GROUP BY DATE_FORMAT(oi.created_at, '${dateFormat}')
      ORDER BY period DESC
      LIMIT 24
    `;

    const [profitData] = await promisePool.execute(profitQuery, queryParams);

    // Get product profitability
    const productProfitQuery = `
      SELECT 
        p.id, p.name, p.sku, p.purchase_price, p.sale_price,
        c.name as category_name,
        SUM(oi.quantity) as units_sold,
        SUM(oi.price * oi.quantity) as total_revenue,
        SUM(p.purchase_price * oi.quantity) as total_cost,
        SUM((oi.price - p.purchase_price) * oi.quantity) as total_profit,
        AVG((oi.price - p.purchase_price) / oi.price * 100) as margin_percentage
      FROM order_items oi
      JOIN product_variants pv ON oi.variant_id = pv.id
      JOIN products p ON pv.product_id = p.id
      JOIN categories c ON p.category_id = c.id
      ${whereClause}
      GROUP BY p.id, p.name, p.sku, p.purchase_price, p.sale_price, c.name
      ORDER BY total_profit DESC
      LIMIT 20
    `;

    const [productProfitData] = await promisePool.execute(productProfitQuery, queryParams);

    // Format the data
    const formattedProfitData = profitData.map(item => ({
      period: item.period,
      unitsSold: item.units_sold,
      totalRevenue: parseFloat(item.total_revenue) || 0,
      totalCost: parseFloat(item.total_cost) || 0,
      totalProfit: parseFloat(item.total_profit) || 0,
      avgMarginPercentage: parseFloat(item.avg_margin_percentage) || 0
    }));

    const formattedProductProfitData = productProfitData.map(product => ({
      id: product.id,
      name: product.name,
      sku: product.sku,
      purchasePrice: parseFloat(product.purchase_price),
      salePrice: parseFloat(product.sale_price),
      categoryName: product.category_name,
      unitsSold: product.units_sold,
      totalRevenue: parseFloat(product.total_revenue) || 0,
      totalCost: parseFloat(product.total_cost) || 0,
      totalProfit: parseFloat(product.total_profit) || 0,
      marginPercentage: parseFloat(product.margin_percentage) || 0
    }));

    // Calculate overall totals
    const overallTotals = formattedProfitData.reduce((acc, item) => ({
      totalRevenue: acc.totalRevenue + item.totalRevenue,
      totalCost: acc.totalCost + item.totalCost,
      totalProfit: acc.totalProfit + item.totalProfit,
      unitsSold: acc.unitsSold + item.unitsSold
    }), { totalRevenue: 0, totalCost: 0, totalProfit: 0, unitsSold: 0 });

    const overallMargin = overallTotals.totalRevenue > 0 
      ? (overallTotals.totalProfit / overallTotals.totalRevenue) * 100 
      : 0;

    res.json({
      success: true,
      data: {
        profitOverTime: formattedProfitData,
        productProfitability: formattedProductProfitData,
        summary: {
          ...overallTotals,
          overallMarginPercentage: overallMargin,
          averageProfit: formattedProfitData.length > 0 
            ? overallTotals.totalProfit / formattedProfitData.length 
            : 0
        }
      }
    });

  } catch (error) {
    console.error('Get profit report error:', error);
    res.status(500).json({
      success: false,
      message: 'Failed to fetch profit report'
    });
  }
});

// Get dashboard summary
router.get('/dashboard', authenticateToken, requireAdminOrManager, async (req, res) => {
  try {
    // Get today's stats
    const [todayStats] = await promisePool.execute(`
      SELECT 
        COUNT(DISTINCT o.id) as today_orders,
        SUM(oi.price * oi.quantity) as today_revenue,
        SUM(oi.quantity) as today_units_sold
      FROM orders o
      JOIN order_items oi ON o.id = oi.order_id
      WHERE DATE(o.created_at) = CURDATE()
    `);

    // Get this month's stats
    const [monthStats] = await promisePool.execute(`
      SELECT 
        COUNT(DISTINCT o.id) as month_orders,
        SUM(oi.price * oi.quantity) as month_revenue,
        SUM(oi.quantity) as month_units_sold
      FROM orders o
      JOIN order_items oi ON o.id = oi.order_id
      WHERE YEAR(o.created_at) = YEAR(CURDATE()) 
        AND MONTH(o.created_at) = MONTH(CURDATE())
    `);

    // Get inventory alerts
    const [inventoryAlerts] = await promisePool.execute(`
      SELECT 
        COUNT(CASE WHEN pv.stock = 0 THEN 1 END) as out_of_stock,
        COUNT(CASE WHEN pv.stock <= pv.min_stock AND pv.stock > 0 THEN 1 END) as low_stock,
        SUM(pv.stock * p.purchase_price) as total_inventory_value
      FROM product_variants pv
      JOIN products p ON pv.product_id = p.id
      WHERE p.is_active = 1
    `);

    // Get recent activity
    const [recentOrders] = await promisePool.execute(`
      SELECT o.id, o.total_amount, o.status, o.created_at
      FROM orders o
      ORDER BY o.created_at DESC
      LIMIT 5
    `);

    const [recentTransactions] = await promisePool.execute(`
      SELECT 
        it.id, it.type, it.quantity, it.created_at,
        p.name as product_name, pv.size, pv.color
      FROM inventory_transactions it
      JOIN product_variants pv ON it.variant_id = pv.id
      JOIN products p ON pv.product_id = p.id
      ORDER BY it.created_at DESC
      LIMIT 5
    `);

    const today = todayStats[0];
    const month = monthStats[0];
    const alerts = inventoryAlerts[0];

    res.json({
      success: true,
      data: {
        todayStats: {
          orders: today.today_orders || 0,
          revenue: parseFloat(today.today_revenue) || 0,
          unitsSold: today.today_units_sold || 0
        },
        monthStats: {
          orders: month.month_orders || 0,
          revenue: parseFloat(month.month_revenue) || 0,
          unitsSold: month.month_units_sold || 0
        },
        inventoryAlerts: {
          outOfStock: alerts.out_of_stock || 0,
          lowStock: alerts.low_stock || 0,
          totalInventoryValue: parseFloat(alerts.total_inventory_value) || 0
        },
        recentActivity: {
          orders: recentOrders.map(order => ({
            id: order.id,
            totalAmount: parseFloat(order.total_amount),
            status: order.status,
            createdAt: order.created_at
          })),
          transactions: recentTransactions.map(transaction => ({
            id: transaction.id,
            type: transaction.type,
            quantity: transaction.quantity,
            productName: transaction.product_name,
            variant: `${transaction.size}/${transaction.color}`,
            createdAt: transaction.created_at
          }))
        }
      }
    });

  } catch (error) {
    console.error('Get dashboard summary error:', error);
    res.status(500).json({
      success: false,
      message: 'Failed to fetch dashboard summary'
    });
  }
});

// Báo cáo tồn kho với xuất Excel
router.get('/inventory-export', authenticateToken, requireAdminOrManager, async (req, res) => {
  try {
    const { format = 'json', category = '', lowStock = false } = req.query;

    console.log('🔍 DEBUG - Inventory Export Request:', {
      query: req.query,
      format,
      category,
      lowStock
    });

    // Build WHERE clause
    let whereConditions = ['p.is_active = ?'];
    let queryParams = [1];

    if (category) {
      whereConditions.push('c.name = ?');
      queryParams.push(category);
      console.log('📁 Category filter applied:', category);
    }

    if (lowStock === 'true') {
      whereConditions.push('pv.stock <= pv.min_stock');
    }

    const query = `
      SELECT 
        p.name as product_name,
        p.sku,
        c.name as category_name,
        pv.size,
        pv.color,
        pv.stock,
        pv.min_stock,
        p.purchase_price,
        p.sale_price,
        (pv.stock * p.purchase_price) as stock_value,
        CASE 
          WHEN pv.stock = 0 THEN 'Hết hàng'
          WHEN pv.stock <= pv.min_stock THEN 'Sắp hết'
          ELSE 'Còn hàng'
        END as status
      FROM product_variants pv
      JOIN products p ON pv.product_id = p.id
      JOIN categories c ON p.category_id = c.id
      WHERE ${whereConditions.join(' AND ')}
      ORDER BY p.name, pv.size, pv.color
    `;

    console.log('🔍 SQL Query:', query);
    console.log('🔍 Query Params:', queryParams);

    const [data] = await promisePool.execute(query, queryParams);
    
    console.log('✅ Query Result Count:', data.length);

    if (format === 'excel') {
      // Tạo file Excel
      const workbook = new ExcelJS.Workbook();
      const worksheet = workbook.addWorksheet('Báo cáo tồn kho');

      // Thiết lập thông tin workbook
      workbook.creator = 'Clothing Store Management System';
      workbook.created = new Date();

      // Thiết lập tiêu đề
      worksheet.columns = [
        { header: 'Tên sản phẩm', key: 'product_name', width: 25 },
        { header: 'SKU', key: 'sku', width: 15 },
        { header: 'Danh mục', key: 'category_name', width: 15 },
        { header: 'Kích cỡ', key: 'size', width: 10 },
        { header: 'Màu sắc', key: 'color', width: 12 },
        { header: 'Tồn kho', key: 'stock', width: 10 },
        { header: 'Tồn kho tối thiểu', key: 'min_stock', width: 15 },
        { header: 'Giá nhập (VNĐ)', key: 'purchase_price', width: 15 },
        { header: 'Giá bán (VNĐ)', key: 'sale_price', width: 15 },
        { header: 'Giá trị tồn kho (VNĐ)', key: 'stock_value', width: 18 },
        { header: 'Trạng thái', key: 'status', width: 15 }
      ];

      // Thêm dữ liệu
      data.forEach(row => {
        worksheet.addRow(row);
      });

      // Định dạng header
      worksheet.getRow(1).eachCell((cell) => {
        cell.font = { bold: true, color: { argb: 'FFFFFF' } };
        cell.alignment = { horizontal: 'center', vertical: 'middle' };
        cell.fill = {
          type: 'pattern',
          pattern: 'solid',
          fgColor: { argb: 'FF366EF7' }
        };
        cell.border = {
          top: { style: 'thin' },
          left: { style: 'thin' },
          bottom: { style: 'thin' },
          right: { style: 'thin' }
        };
      });

      // Định dạng cột số
      ['stock', 'min_stock'].forEach(key => {
        const colIndex = worksheet.columns.findIndex(col => col.key === key) + 1;
        worksheet.getColumn(colIndex).numFmt = '#,##0';
      });

      // Định dạng cột tiền
      ['purchase_price', 'sale_price', 'stock_value'].forEach(key => {
        const colIndex = worksheet.columns.findIndex(col => col.key === key) + 1;
        worksheet.getColumn(colIndex).numFmt = '#,##0" ₫"';
      });

      // Thêm borders cho tất cả cells có dữ liệu
      worksheet.eachRow((row, rowNumber) => {
        if (rowNumber > 1) {
          row.eachCell((cell) => {
            cell.border = {
              top: { style: 'thin' },
              left: { style: 'thin' },
              bottom: { style: 'thin' },
              right: { style: 'thin' }
            };
          });
        }
      });

      // Thêm conditional formatting cho trạng thái
      const statusCol = worksheet.columns.findIndex(col => col.key === 'status') + 1;
      worksheet.addConditionalFormatting({
        ref: `${worksheet.getColumn(statusCol).letter}2:${worksheet.getColumn(statusCol).letter}${data.length + 1}`,
        rules: [
          {
            type: 'containsText',
            operator: 'containsText',
            text: 'Hết hàng',
            style: { fill: { type: 'pattern', pattern: 'solid', bgColor: { argb: 'FFFF0000' } } }
          },
          {
            type: 'containsText',
            operator: 'containsText',
            text: 'Sắp hết',
            style: { fill: { type: 'pattern', pattern: 'solid', bgColor: { argb: 'FFFFA500' } } }
          },
          {
            type: 'containsText',
            operator: 'containsText',
            text: 'Còn hàng',
            style: { fill: { type: 'pattern', pattern: 'solid', bgColor: { argb: 'FF90EE90' } } }
          }
        ]
      });

      // Tạo tên file với timestamp
      const timestamp = new Date().toISOString().slice(0, 19).replace(/:/g, '-');
      const filename = `Bao_cao_ton_kho_${timestamp}.xlsx`;

      // Thiết lập headers cho download
      res.setHeader('Content-Type', 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet');
      res.setHeader('Content-Disposition', `attachment; filename="${filename}"`);

      // Gửi file
      await workbook.xlsx.write(res);
      res.end();
    } else {
      // Trả về JSON
      res.json({
        success: true,
        data: data,
        summary: {
          total_items: data.length,
          total_stock_value: data.reduce((sum, item) => sum + (item.stock_value || 0), 0),
          low_stock_items: data.filter(item => item.stock <= item.min_stock).length,
          out_of_stock_items: data.filter(item => item.stock === 0).length
        }
      });
    }

  } catch (error) {
    console.error('Inventory report error:', error);
    res.status(500).json({
      success: false,
      message: 'Lỗi khi tạo báo cáo tồn kho'
    });
  }
});

// Báo cáo giao dịch kho với xuất Excel
router.get('/transactions-export', authenticateToken, requireAdminOrManager, async (req, res) => {
  try {
    const { 
      format = 'json', 
      startDate = '', 
      endDate = '', 
      type = '',
      category = ''
    } = req.query;

    console.log('🔍 DEBUG - Transactions Export Request:', {
      query: req.query,
      format,
      startDate,
      endDate,
      type,
      category
    });

    // Build WHERE clause
    let whereConditions = [];
    let queryParams = [];

    console.log('🔍 DEBUG - Building WHERE clause:', {
      startDate: startDate,
      endDate: endDate,
      startDateLength: startDate.length,
      endDateLength: endDate.length,
      type: type,
      category: category
    });

    if (startDate && startDate.length > 0) {
      whereConditions.push('DATE(it.created_at) >= ?');
      queryParams.push(startDate);
      console.log('📅 Added startDate condition:', startDate);
    }

    if (endDate && endDate.length > 0) {
      whereConditions.push('DATE(it.created_at) <= ?');
      queryParams.push(endDate);
      console.log('📅 Added endDate condition:', endDate);
    }

    if (type && ['in', 'out', 'adjustment'].includes(type)) {
      whereConditions.push('it.type = ?');
      queryParams.push(type);
    }

    if (category) {
      whereConditions.push('c.name = ?');
      queryParams.push(category);
    }

    const query = `
      SELECT 
        it.created_at,
        CASE 
          WHEN it.type = 'in' THEN 'Nhập kho'
          WHEN it.type = 'out' THEN 'Xuất kho'
          ELSE 'Điều chỉnh'
        END as transaction_type,
        p.name as product_name,
        p.sku,
        c.name as category_name,
        pv.size,
        pv.color,
        it.quantity,
        it.reason,
        u.name as user_name,
        CASE 
          WHEN it.order_id IS NOT NULL THEN CONCAT('Đơn hàng #', it.order_id)
          ELSE '-'
        END as order_info
      FROM inventory_transactions it
      JOIN product_variants pv ON it.variant_id = pv.id
      JOIN products p ON pv.product_id = p.id
      JOIN categories c ON p.category_id = c.id
      LEFT JOIN users u ON it.user_id = u.id
      ${whereConditions.length > 0 ? 'WHERE ' + whereConditions.join(' AND ') : ''}
      ORDER BY it.created_at DESC
    `;

    console.log('🔍 DEBUG - Final query:', query);
    console.log('🔍 DEBUG - Query params:', queryParams);
    console.log('🔍 DEBUG - WHERE conditions:', whereConditions);

    const [data] = await promisePool.execute(query, queryParams);
    
    console.log('🔍 DEBUG - Query result count:', data.length);
    if (data.length > 0) {
      console.log('🔍 DEBUG - First result date:', data[0].created_at);
      console.log('🔍 DEBUG - Last result date:', data[data.length - 1].created_at);
    }

    if (format === 'excel') {
      // Tạo file Excel
      const workbook = new ExcelJS.Workbook();
      const worksheet = workbook.addWorksheet('Báo cáo giao dịch kho');

      // Thiết lập thông tin workbook
      workbook.creator = 'Clothing Store Management System';
      workbook.created = new Date();

      // Thiết lập tiêu đề
      worksheet.columns = [
        { header: 'Ngày giờ', key: 'created_at', width: 20 },
        { header: 'Loại giao dịch', key: 'transaction_type', width: 15 },
        { header: 'Tên sản phẩm', key: 'product_name', width: 25 },
        { header: 'SKU', key: 'sku', width: 15 },
        { header: 'Danh mục', key: 'category_name', width: 15 },
        { header: 'Kích cỡ', key: 'size', width: 10 },
        { header: 'Màu sắc', key: 'color', width: 12 },
        { header: 'Số lượng', key: 'quantity', width: 12 },
        { header: 'Lý do', key: 'reason', width: 20 },
        { header: 'Người thực hiện', key: 'user_name', width: 18 },
        { header: 'Thông tin đơn hàng', key: 'order_info', width: 20 }
      ];

      // Thêm dữ liệu
      data.forEach(row => {
        const formattedRow = {
          ...row,
          created_at: new Date(row.created_at).toLocaleString('vi-VN')
        };
        worksheet.addRow(formattedRow);
      });

      // Định dạng header
      worksheet.getRow(1).eachCell((cell) => {
        cell.font = { bold: true, color: { argb: 'FFFFFF' } };
        cell.alignment = { horizontal: 'center', vertical: 'middle' };
        cell.fill = {
          type: 'pattern',
          pattern: 'solid',
          fgColor: { argb: 'FF366EF7' }
        };
        cell.border = {
          top: { style: 'thin' },
          left: { style: 'thin' },
          bottom: { style: 'thin' },
          right: { style: 'thin' }
        };
      });

      // Định dạng cột số
      const quantityColIndex = worksheet.columns.findIndex(col => col.key === 'quantity') + 1;
      worksheet.getColumn(quantityColIndex).numFmt = '#,##0';

      // Thêm borders cho tất cả cells có dữ liệu
      worksheet.eachRow((row, rowNumber) => {
        if (rowNumber > 1) {
          row.eachCell((cell) => {
            cell.border = {
              top: { style: 'thin' },
              left: { style: 'thin' },
              bottom: { style: 'thin' },
              right: { style: 'thin' }
            };
          });
        }
      });

      // Tạo tên file với timestamp
      const timestamp = new Date().toISOString().slice(0, 19).replace(/:/g, '-');
      const filename = `Bao_cao_giao_dich_kho_${timestamp}.xlsx`;

      // Thiết lập headers cho download
      res.setHeader('Content-Type', 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet');
      res.setHeader('Content-Disposition', `attachment; filename="${filename}"`);

      // Gửi file
      await workbook.xlsx.write(res);
      res.end();
    } else {
      // Trả về JSON với summary
      const summary = {
        total_transactions: data.length,
        total_in: data.filter(item => item.transaction_type === 'Nhập kho').reduce((sum, item) => sum + item.quantity, 0),
        total_out: data.filter(item => item.transaction_type === 'Xuất kho').reduce((sum, item) => sum + item.quantity, 0),
        total_adjustment: data.filter(item => item.transaction_type === 'Điều chỉnh').reduce((sum, item) => sum + item.quantity, 0)
      };

      res.json({
        success: true,
        data: data,
        summary: summary
      });
    }

  } catch (error) {
    console.error('Transactions report error:', error);
    res.status(500).json({
      success: false,
      message: 'Lỗi khi tạo báo cáo giao dịch kho'
    });
  }
});

// Báo cáo đơn hàng với xuất Excel
router.get('/orders-export', authenticateToken, requireAdminOrManager, async (req, res) => {
  try {
    const { 
      format = 'json', 
      startDate = '', 
      endDate = '', 
      status = ''
    } = req.query;

    console.log('🔍 DEBUG - Orders Export Request:', {
      query: req.query,
      format,
      startDate,
      endDate,
      status
    });

    // Build WHERE clause
    let whereConditions = [];
    let queryParams = [];

    console.log('🔍 DEBUG - Building WHERE clause (Orders):', {
      startDate: startDate,
      endDate: endDate,
      startDateLength: startDate.length,
      endDateLength: endDate.length,
      status: status
    });

    if (startDate && startDate.length > 0) {
      whereConditions.push('DATE(o.created_at) >= ?');
      queryParams.push(startDate);
      console.log('📅 Added startDate condition (Orders):', startDate);
    }

    if (endDate && endDate.length > 0) {
      whereConditions.push('DATE(o.created_at) <= ?');
      queryParams.push(endDate);
      console.log('📅 Added endDate condition (Orders):', endDate);
    }

    if (status && ['pending', 'processing', 'completed', 'cancelled'].includes(status)) {
      whereConditions.push('o.status = ?');
      queryParams.push(status);
    }

    const query = `
      SELECT 
        o.order_number,
        o.created_at,
        o.customer_name,
        o.customer_phone,
        o.customer_email,
        o.total_amount,
        CASE 
          WHEN o.status = 'pending' THEN 'Chờ xử lý'
          WHEN o.status = 'processing' THEN 'Đang xử lý'
          WHEN o.status = 'completed' THEN 'Hoàn thành'
          ELSE 'Đã hủy'
        END as order_status,
        CASE 
          WHEN o.payment_status = 'pending' THEN 'Chờ thanh toán'
          WHEN o.payment_status = 'paid' THEN 'Đã thanh toán'
          ELSE 'Đã hoàn tiền'
        END as payment_status,
        u.name as staff_name,
        GROUP_CONCAT(
          CONCAT(p.name, ' (', pv.size, '/', pv.color, ') x', oi.quantity)
          SEPARATOR '; '
        ) as items
      FROM orders o
      LEFT JOIN users u ON o.user_id = u.id
      LEFT JOIN order_items oi ON o.id = oi.order_id
      LEFT JOIN product_variants pv ON oi.variant_id = pv.id
      LEFT JOIN products p ON pv.product_id = p.id
      ${whereConditions.length > 0 ? 'WHERE ' + whereConditions.join(' AND ') : ''}
      GROUP BY o.id
      ORDER BY o.created_at DESC
    `;

    const [data] = await promisePool.execute(query, queryParams);

    if (format === 'excel') {
      // Tạo file Excel
      const workbook = new ExcelJS.Workbook();
      const worksheet = workbook.addWorksheet('Báo cáo đơn hàng');

      // Thiết lập thông tin workbook
      workbook.creator = 'Clothing Store Management System';
      workbook.created = new Date();

      // Thiết lập tiêu đề
      worksheet.columns = [
        { header: 'Số đơn hàng', key: 'order_number', width: 20 },
        { header: 'Ngày tạo', key: 'created_at', width: 20 },
        { header: 'Tên khách hàng', key: 'customer_name', width: 20 },
        { header: 'Số điện thoại', key: 'customer_phone', width: 15 },
        { header: 'Email', key: 'customer_email', width: 25 },
        { header: 'Tổng tiền (VNĐ)', key: 'total_amount', width: 15 },
        { header: 'Trạng thái đơn hàng', key: 'order_status', width: 18 },
        { header: 'Trạng thái thanh toán', key: 'payment_status', width: 20 },
        { header: 'Nhân viên xử lý', key: 'staff_name', width: 18 },
        { header: 'Chi tiết sản phẩm', key: 'items', width: 40 }
      ];

      // Thêm dữ liệu
      data.forEach(row => {
        const formattedRow = {
          ...row,
          created_at: new Date(row.created_at).toLocaleString('vi-VN'),
          total_amount: parseFloat(row.total_amount)
        };
        worksheet.addRow(formattedRow);
      });

      // Định dạng header
      worksheet.getRow(1).eachCell((cell) => {
        cell.font = { bold: true, color: { argb: 'FFFFFF' } };
        cell.alignment = { horizontal: 'center', vertical: 'middle' };
        cell.fill = {
          type: 'pattern',
          pattern: 'solid',
          fgColor: { argb: 'FF366EF7' }
        };
        cell.border = {
          top: { style: 'thin' },
          left: { style: 'thin' },
          bottom: { style: 'thin' },
          right: { style: 'thin' }
        };
      });

      // Định dạng cột tiền
      const totalAmountColIndex = worksheet.columns.findIndex(col => col.key === 'total_amount') + 1;
      worksheet.getColumn(totalAmountColIndex).numFmt = '#,##0" ₫"';

      // Thêm borders cho tất cả cells có dữ liệu
      worksheet.eachRow((row, rowNumber) => {
        if (rowNumber > 1) {
          row.eachCell((cell) => {
            cell.border = {
              top: { style: 'thin' },
              left: { style: 'thin' },
              bottom: { style: 'thin' },
              right: { style: 'thin' }
            };
          });
        }
      });

      // Tạo tên file với timestamp
      const timestamp = new Date().toISOString().slice(0, 19).replace(/:/g, '-');
      const filename = `Bao_cao_don_hang_${timestamp}.xlsx`;

      // Thiết lập headers cho download
      res.setHeader('Content-Type', 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet');
      res.setHeader('Content-Disposition', `attachment; filename="${filename}"`);

      // Gửi file
      await workbook.xlsx.write(res);
      res.end();
    } else {
      // Trả về JSON với summary
      const summary = {
        total_orders: data.length,
        total_revenue: data.reduce((sum, item) => sum + parseFloat(item.total_amount), 0),
        completed_orders: data.filter(item => item.order_status === 'Hoàn thành').length,
        pending_orders: data.filter(item => item.order_status === 'Chờ xử lý').length,
        cancelled_orders: data.filter(item => item.order_status === 'Đã hủy').length
      };

      res.json({
        success: true,
        data: data,
        summary: summary
      });
    }

  } catch (error) {
    console.error('Orders report error:', error);
    res.status(500).json({
      success: false,
      message: 'Lỗi khi tạo báo cáo đơn hàng'
    });
  }
});

module.exports = router;
