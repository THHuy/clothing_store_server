const express = require('express');
const { promisePool } = require('../config/database');
const { authenticateToken, requireAdminOrManager } = require('../middleware/auth');

const router = express.Router();

// Get all variants for a product
router.get('/product/:productId', async (req, res) => {
  try {
    const { productId } = req.params;

    const query = `
      SELECT 
        pv.id, pv.size, pv.color, pv.stock, pv.min_stock,
        pv.created_at, pv.updated_at,
        p.name as product_name, p.sku as product_sku
      FROM product_variants pv
      JOIN products p ON pv.product_id = p.id
      WHERE pv.product_id = ?
      ORDER BY pv.size, pv.color
    `;

    const [variants] = await promisePool.execute(query, [productId]);

    const formattedVariants = variants.map(variant => ({
      id: variant.id,
      size: variant.size,
      color: variant.color,
      stock: variant.stock,
      minStock: variant.min_stock,
      createdAt: variant.created_at,
      updatedAt: variant.updated_at,
      product: {
        name: variant.product_name,
        sku: variant.product_sku
      }
    }));

    res.json({
      success: true,
      data: formattedVariants
    });

  } catch (error) {
    console.error('Get product variants error:', error);
    res.status(500).json({
      success: false,
      message: 'Failed to fetch product variants'
    });
  }
});

// Get single variant by ID
router.get('/:id', async (req, res) => {
  try {
    const { id } = req.params;

    const query = `
      SELECT 
        pv.id, pv.product_id, pv.size, pv.color, pv.stock, pv.min_stock,
        pv.created_at, pv.updated_at,
        p.name as product_name, p.sku as product_sku
      FROM product_variants pv
      JOIN products p ON pv.product_id = p.id
      WHERE pv.id = ?
    `;

    const [rows] = await promisePool.execute(query, [id]);

    if (rows.length === 0) {
      return res.status(404).json({
        success: false,
        message: 'Product variant not found'
      });
    }

    const variant = rows[0];

    const formattedVariant = {
      id: variant.id,
      productId: variant.product_id,
      size: variant.size,
      color: variant.color,
      stock: variant.stock,
      minStock: variant.min_stock,
      createdAt: variant.created_at,
      updatedAt: variant.updated_at,
      product: {
        name: variant.product_name,
        sku: variant.product_sku
      }
    };

    res.json({
      success: true,
      data: formattedVariant
    });

  } catch (error) {
    console.error('Get variant error:', error);
    res.status(500).json({
      success: false,
      message: 'Failed to fetch variant'
    });
  }
});

// Create new variant (Admin/Manager only)
router.post('/', authenticateToken, requireAdminOrManager, async (req, res) => {
  try {
    const { productId, size, color, stock = 0, minStock = 0 } = req.body;

    // Validate required fields
    if (!productId || !size || !color) {
      return res.status(400).json({
        success: false,
        message: 'Product ID, size, and color are required'
      });
    }

    // Check if product exists
    const [productCheck] = await promisePool.execute(
      'SELECT id FROM products WHERE id = ? AND is_active = 1',
      [productId]
    );

    if (productCheck.length === 0) {
      return res.status(404).json({
        success: false,
        message: 'Product not found'
      });
    }

    // Check if variant already exists
    const [existingVariant] = await promisePool.execute(
      'SELECT id FROM product_variants WHERE product_id = ? AND size = ? AND color = ?',
      [productId, size, color]
    );

    if (existingVariant.length > 0) {
      return res.status(400).json({
        success: false,
        message: 'Variant with this size and color already exists'
      });
    }

    // Insert variant
    const [result] = await promisePool.execute(
      'INSERT INTO product_variants (product_id, size, color, stock, min_stock) VALUES (?, ?, ?, ?, ?)',
      [productId, size, color, stock, minStock]
    );

    res.status(201).json({
      success: true,
      message: 'Product variant created successfully',
      data: { id: result.insertId }
    });

  } catch (error) {
    console.error('Create variant error:', error);
    res.status(500).json({
      success: false,
      message: 'Failed to create variant'
    });
  }
});

// Update variant (Admin/Manager only)
router.put('/:id', authenticateToken, requireAdminOrManager, async (req, res) => {
  try {
    const { id } = req.params;
    const { size, color, stock, minStock } = req.body;

    // Check if variant exists
    const [existing] = await promisePool.execute(
      'SELECT product_id FROM product_variants WHERE id = ?',
      [id]
    );

    if (existing.length === 0) {
      return res.status(404).json({
        success: false,
        message: 'Product variant not found'
      });
    }

    const productId = existing[0].product_id;

    // Check if new size/color combination conflicts
    if (size && color) {
      const [conflictCheck] = await promisePool.execute(
        'SELECT id FROM product_variants WHERE product_id = ? AND size = ? AND color = ? AND id != ?',
        [productId, size, color, id]
      );

      if (conflictCheck.length > 0) {
        return res.status(400).json({
          success: false,
          message: 'Another variant with this size and color already exists'
        });
      }
    }

    // Build update query dynamically
    const updateFields = [];
    const updateValues = [];

    if (size !== undefined) { updateFields.push('size = ?'); updateValues.push(size); }
    if (color !== undefined) { updateFields.push('color = ?'); updateValues.push(color); }
    if (stock !== undefined) { updateFields.push('stock = ?'); updateValues.push(stock); }
    if (minStock !== undefined) { updateFields.push('min_stock = ?'); updateValues.push(minStock); }

    updateFields.push('updated_at = NOW()');
    updateValues.push(id);

    await promisePool.execute(
      `UPDATE product_variants SET ${updateFields.join(', ')} WHERE id = ?`,
      updateValues
    );

    res.json({
      success: true,
      message: 'Product variant updated successfully'
    });

  } catch (error) {
    console.error('Update variant error:', error);
    res.status(500).json({
      success: false,
      message: 'Failed to update variant'
    });
  }
});

// Update stock only (for inventory management)
router.patch('/:id/stock', authenticateToken, requireAdminOrManager, async (req, res) => {
  try {
    const { id } = req.params;
    const { stock, reason = 'Manual adjustment' } = req.body;

    if (stock === undefined || stock < 0) {
      return res.status(400).json({
        success: false,
        message: 'Valid stock quantity is required'
      });
    }

    // Check if variant exists
    const [existing] = await promisePool.execute(
      'SELECT stock FROM product_variants WHERE id = ?',
      [id]
    );

    if (existing.length === 0) {
      return res.status(404).json({
        success: false,
        message: 'Product variant not found'
      });
    }

    const currentStock = existing[0].stock;

    // Update stock
    await promisePool.execute(
      'UPDATE product_variants SET stock = ?, updated_at = NOW() WHERE id = ?',
      [stock, id]
    );

    // Log inventory transaction
    const transaction = await promisePool.getConnection();
    try {
      await transaction.beginTransaction();

      await transaction.execute(
        `INSERT INTO inventory_transactions 
         (variant_id, type, quantity, reason, user_id, created_at) 
         VALUES (?, ?, ?, ?, ?, NOW())`,
        [id, stock > currentStock ? 'in' : 'out', Math.abs(stock - currentStock), reason, req.user.id]
      );

      await transaction.commit();
    } catch (error) {
      await transaction.rollback();
      throw error;
    } finally {
      transaction.release();
    }

    res.json({
      success: true,
      message: 'Stock updated successfully',
      data: {
        previousStock: currentStock,
        newStock: stock,
        change: stock - currentStock
      }
    });

  } catch (error) {
    console.error('Update stock error:', error);
    res.status(500).json({
      success: false,
      message: 'Failed to update stock'
    });
  }
});

// Delete variant (Admin only)
router.delete('/:id', authenticateToken, requireAdminOrManager, async (req, res) => {
  try {
    const { id } = req.params;

    // Check if variant exists
    const [existing] = await promisePool.execute(
      'SELECT id FROM product_variants WHERE id = ?',
      [id]
    );

    if (existing.length === 0) {
      return res.status(404).json({
        success: false,
        message: 'Product variant not found'
      });
    }

    // Delete variant (hard delete since it's a variant)
    await promisePool.execute(
      'DELETE FROM product_variants WHERE id = ?',
      [id]
    );

    res.json({
      success: true,
      message: 'Product variant deleted successfully'
    });

  } catch (error) {
    console.error('Delete variant error:', error);
    res.status(500).json({
      success: false,
      message: 'Failed to delete variant'
    });
  }
});

// Get low stock variants (Admin/Manager only)
router.get('/alerts/low-stock', authenticateToken, requireAdminOrManager, async (req, res) => {
  try {
    const query = `
      SELECT 
        pv.id, pv.size, pv.color, pv.stock, pv.min_stock,
        p.id as product_id, p.name as product_name, p.sku as product_sku,
        c.name as category_name
      FROM product_variants pv
      JOIN products p ON pv.product_id = p.id
      JOIN categories c ON p.category_id = c.id
      WHERE pv.stock <= pv.min_stock 
        AND p.is_active = 1
      ORDER BY (pv.stock - pv.min_stock) ASC, p.name, pv.size, pv.color
    `;

    const [variants] = await promisePool.execute(query);

    const formattedVariants = variants.map(variant => ({
      id: variant.id,
      size: variant.size,
      color: variant.color,
      stock: variant.stock,
      minStock: variant.min_stock,
      deficit: variant.min_stock - variant.stock,
      product: {
        id: variant.product_id,
        name: variant.product_name,
        sku: variant.product_sku,
        category: variant.category_name
      }
    }));

    res.json({
      success: true,
      data: formattedVariants
    });

  } catch (error) {
    console.error('Get low stock alerts error:', error);
    res.status(500).json({
      success: false,
      message: 'Failed to fetch low stock alerts'
    });
  }
});

module.exports = router;
