const express = require('express');
const { promisePool } = require('../config/database');
const { authenticateToken, requireAdminOrManager } = require('../middleware/auth');

const router = express.Router();

// Get all categories (public)
router.get('/', async (req, res) => {
  try {
    const query = `
      SELECT 
        c.id, c.name, c.slug, c.description, c.is_active,
        c.created_at, c.updated_at,
        COUNT(p.id) as product_count
      FROM categories c
      LEFT JOIN products p ON c.id = p.category_id AND p.is_active = 1
      WHERE c.is_active = 1
      GROUP BY c.id
      ORDER BY c.name
    `;

    const [categories] = await promisePool.execute(query);

    const formattedCategories = categories.map(category => ({
      id: category.id,
      name: category.name,
      slug: category.slug,
      description: category.description,
      isActive: !!category.is_active,
      productCount: category.product_count,
      createdAt: category.created_at,
      updatedAt: category.updated_at
    }));

    res.json({
      success: true,
      data: formattedCategories
    });

  } catch (error) {
    console.error('Get categories error:', error);
    res.status(500).json({
      success: false,
      message: 'Failed to fetch categories'
    });
  }
});

// Get single category by ID or slug
router.get('/:identifier', async (req, res) => {
  try {
    const { identifier } = req.params;
    
    // Check if identifier is numeric (ID) or string (slug)
    const isId = /^\d+$/.test(identifier);
    const whereClause = isId ? 'c.id = ?' : 'c.slug = ?';

    const query = `
      SELECT 
        c.id, c.name, c.slug, c.description, c.is_active,
        c.created_at, c.updated_at,
        COUNT(p.id) as product_count
      FROM categories c
      LEFT JOIN products p ON c.id = p.category_id AND p.is_active = 1
      WHERE ${whereClause} AND c.is_active = 1
      GROUP BY c.id
    `;

    const [rows] = await promisePool.execute(query, [identifier]);

    if (rows.length === 0) {
      return res.status(404).json({
        success: false,
        message: 'Category not found'
      });
    }

    const category = rows[0];

    const formattedCategory = {
      id: category.id,
      name: category.name,
      slug: category.slug,
      description: category.description,
      isActive: !!category.is_active,
      productCount: category.product_count,
      createdAt: category.created_at,
      updatedAt: category.updated_at
    };

    res.json({
      success: true,
      data: formattedCategory
    });

  } catch (error) {
    console.error('Get category error:', error);
    res.status(500).json({
      success: false,
      message: 'Failed to fetch category'
    });
  }
});

// Create new category (Admin/Manager only)
router.post('/', authenticateToken, requireAdminOrManager, async (req, res) => {
  try {
    const { name, slug, description } = req.body;

    // Validate required fields
    if (!name || !slug) {
      return res.status(400).json({
        success: false,
        message: 'Name and slug are required'
      });
    }

    // Check if slug already exists
    const [existingSlug] = await promisePool.execute(
      'SELECT id FROM categories WHERE slug = ?',
      [slug]
    );

    if (existingSlug.length > 0) {
      return res.status(400).json({
        success: false,
        message: 'Slug already exists'
      });
    }

    // Insert category
    const [result] = await promisePool.execute(
      'INSERT INTO categories (name, slug, description) VALUES (?, ?, ?)',
      [name, slug, description || '']
    );

    res.status(201).json({
      success: true,
      message: 'Category created successfully',
      data: { id: result.insertId }
    });

  } catch (error) {
    console.error('Create category error:', error);
    res.status(500).json({
      success: false,
      message: 'Failed to create category'
    });
  }
});

// Update category (Admin/Manager only)
router.put('/:id', authenticateToken, requireAdminOrManager, async (req, res) => {
  try {
    const { id } = req.params;
    const { name, slug, description, isActive } = req.body;

    // Check if category exists
    const [existing] = await promisePool.execute(
      'SELECT id FROM categories WHERE id = ?',
      [id]
    );

    if (existing.length === 0) {
      return res.status(404).json({
        success: false,
        message: 'Category not found'
      });
    }

    // Check if new slug conflicts with other categories
    if (slug) {
      const [slugCheck] = await promisePool.execute(
        'SELECT id FROM categories WHERE slug = ? AND id != ?',
        [slug, id]
      );

      if (slugCheck.length > 0) {
        return res.status(400).json({
          success: false,
          message: 'Slug already exists'
        });
      }
    }

    // Build update query dynamically
    const updateFields = [];
    const updateValues = [];

    if (name !== undefined) { updateFields.push('name = ?'); updateValues.push(name); }
    if (slug !== undefined) { updateFields.push('slug = ?'); updateValues.push(slug); }
    if (description !== undefined) { updateFields.push('description = ?'); updateValues.push(description); }
    if (isActive !== undefined) { updateFields.push('is_active = ?'); updateValues.push(isActive ? 1 : 0); }

    updateFields.push('updated_at = NOW()');
    updateValues.push(id);

    await promisePool.execute(
      `UPDATE categories SET ${updateFields.join(', ')} WHERE id = ?`,
      updateValues
    );

    res.json({
      success: true,
      message: 'Category updated successfully'
    });

  } catch (error) {
    console.error('Update category error:', error);
    res.status(500).json({
      success: false,
      message: 'Failed to update category'
    });
  }
});

// Delete category (Admin only)
router.delete('/:id', authenticateToken, requireAdminOrManager, async (req, res) => {
  try {
    const { id } = req.params;

    // Check if category exists
    const [existing] = await promisePool.execute(
      'SELECT id FROM categories WHERE id = ?',
      [id]
    );

    if (existing.length === 0) {
      return res.status(404).json({
        success: false,
        message: 'Category not found'
      });
    }

    // Check if category has products
    const [productCheck] = await promisePool.execute(
      'SELECT COUNT(*) as count FROM products WHERE category_id = ? AND is_active = 1',
      [id]
    );

    if (productCheck[0].count > 0) {
      return res.status(400).json({
        success: false,
        message: 'Cannot delete category with active products'
      });
    }

    // Soft delete (set is_active to 0)
    await promisePool.execute(
      'UPDATE categories SET is_active = 0, updated_at = NOW() WHERE id = ?',
      [id]
    );

    res.json({
      success: true,
      message: 'Category deleted successfully'
    });

  } catch (error) {
    console.error('Delete category error:', error);
    res.status(500).json({
      success: false,
      message: 'Failed to delete category'
    });
  }
});

module.exports = router;
