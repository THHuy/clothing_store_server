const express = require('express');
const bcrypt = require('bcryptjs');
const { promisePool } = require('../config/database');
const { authenticateToken, requireAdmin } = require('../middleware/auth');

const router = express.Router();

// Get all users (Admin only)
router.get('/', authenticateToken, requireAdmin, async (req, res) => {
  try {
    const {
      page = 1,
      limit = 20,
      search = '',
      role = '',
      isActive = ''
    } = req.query;

    const offset = (parseInt(page) - 1) * parseInt(limit);

    // Build WHERE clause
    let whereConditions = [];
    let queryParams = [];

    if (search) {
      whereConditions.push('(u.username LIKE ? OR u.name LIKE ? OR u.email LIKE ? OR u.phone LIKE ?)');
      queryParams.push(`%${search}%`, `%${search}%`, `%${search}%`, `%${search}%`);
    }

    if (role && ['admin', 'manager', 'staff', 'ADMIN', 'MANAGER', 'STAFF'].includes(role)) {
      whereConditions.push('u.role = ?');
      queryParams.push(role.toLowerCase());
    }

    if (isActive !== '') {
      whereConditions.push('u.is_active = ?');
      queryParams.push(isActive === 'true' ? 1 : 0);
    }

    const whereClause = whereConditions.length > 0 ? `WHERE ${whereConditions.join(' AND ')}` : '';

    console.log('Debug - Query params:', queryParams);
    console.log('Debug - Limit:', limit, 'Offset:', offset);
    console.log('Debug - Where clause:', whereClause);

    // Get users with pagination
    const usersQuery = `
      SELECT 
        u.id, u.username, u.name, u.email, u.phone, u.role, u.is_active,
        u.last_login_at, u.created_at, u.updated_at
      FROM users u
      ${whereClause}
      ORDER BY u.created_at DESC
      LIMIT ? OFFSET ?
    `;

    // Prepare parameters for users query - ensure numbers are properly formatted for MySQL
    const limitParam = parseInt(limit, 10);
    const offsetParam = parseInt(offset, 10);
    
    // Validate numeric parameters
    if (isNaN(limitParam) || isNaN(offsetParam) || limitParam < 1 || offsetParam < 0) {
      return res.status(400).json({
        success: false,
        message: 'Invalid pagination parameters'
      });
    }
    
    const usersQueryParams = [...queryParams, limitParam, offsetParam];
    
    console.log('Debug - Query params array:', queryParams);
    console.log('Debug - Final query params:', usersQueryParams);
    console.log('Debug - SQL Query:', usersQuery.trim());
    
    // Try alternative approach - use direct query with proper parameter binding
    let users;
    try {
      const [usersResult] = await promisePool.execute(usersQuery.trim(), usersQueryParams);
      users = usersResult;
      console.log('✅ Query executed successfully, got', users.length, 'users');
    } catch (executeError) {
      console.error('❌ Execute error details:', executeError);
      console.error('❌ Query being executed:', usersQuery.trim());
      console.error('❌ Parameters being passed:', usersQueryParams);
      console.error('❌ Parameter types:', usersQueryParams.map(p => typeof p));
      
      // Fallback: try with manual query construction for debugging
      const manualQuery = `
        SELECT 
          u.id, u.username, u.name, u.email, u.phone, u.role, u.is_active,
          u.last_login_at, u.created_at, u.updated_at
        FROM users u
        ${whereClause}
        ORDER BY u.created_at DESC
        LIMIT ${limitParam} OFFSET ${offsetParam}
      `;
      
      console.log('🔄 Trying manual query construction:', manualQuery.trim());
      const [usersResult] = await promisePool.execute(manualQuery.trim(), queryParams);
      users = usersResult;
      console.log('✅ Manual query executed successfully, got', users.length, 'users');
    }

    // Get total count for pagination
    const countQuery = `
      SELECT COUNT(*) as total
      FROM users u
      ${whereClause}
    `;

    console.log('Debug - Count query:', countQuery);
    console.log('Debug - Count query params:', queryParams);
    console.log('Debug - Count query placeholders:', (countQuery.match(/\?/g) || []).length);

    const [countResult] = await promisePool.execute(countQuery, queryParams);
    const total = countResult[0].total;

    // Format users data (exclude password)
    const formattedUsers = users.map(user => ({
      id: user.id,
      username: user.username,
      name: user.name,
      email: user.email,
      phone: user.phone,
      role: user.role.toUpperCase(), // Convert to uppercase for frontend compatibility
      isActive: !!user.is_active,
      lastLogin: user.last_login_at,
      createdAt: user.created_at,
      updatedAt: user.updated_at
    }));

    res.json({
      success: true,
      data: formattedUsers,
      pagination: {
        page: parseInt(page),
        limit: parseInt(limit),
        total,
        totalPages: Math.ceil(total / parseInt(limit))
      }
    });

  } catch (error) {
    console.error('Get users error:', error);
    res.status(500).json({
      success: false,
      message: 'Failed to fetch users'
    });
  }
});

// Get single user by ID (Admin only)
router.get('/:id', authenticateToken, requireAdmin, async (req, res) => {
  try {
    const { id } = req.params;

    const query = `
      SELECT 
        u.id, u.name, u.email, u.phone, u.role, u.is_active,
        u.last_login_at, u.created_at, u.updated_at
      FROM users u
      WHERE u.id = ?
    `;

    const [rows] = await promisePool.execute(query, [id]);

    if (rows.length === 0) {
      return res.status(404).json({
        success: false,
        message: 'User not found'
      });
    }

    const user = rows[0];

    const formattedUser = {
      id: user.id,
      name: user.name,
      email: user.email,
      phone: user.phone,
      role: user.role,
      isActive: !!user.is_active,
      lastLoginAt: user.last_login_at,
      createdAt: user.created_at,
      updatedAt: user.updated_at
    };

    res.json({
      success: true,
      data: formattedUser
    });

  } catch (error) {
    console.error('Get user error:', error);
    res.status(500).json({
      success: false,
      message: 'Failed to fetch user'
    });
  }
});

// Create new user (Admin only)
router.post('/', authenticateToken, requireAdmin, async (req, res) => {
  try {
    const {
      username, name, email, phone, password, role = 'manager'
    } = req.body;

    // Validate required fields
    if (!username || !name || !email || !password) {
      return res.status(400).json({
        success: false,
        message: 'Username, name, email, and password are required'
      });
    }

    // Convert role to lowercase for database storage
    const dbRole = typeof role === 'string' ? role.toLowerCase() : 'manager';

    // Validate role
    if (!['admin', 'manager', 'staff'].includes(dbRole)) {
      return res.status(400).json({
        success: false,
        message: 'Invalid role. Must be admin, manager, or staff'
      });
    }

    // Validate email format
    const emailRegex = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;
    if (!emailRegex.test(email)) {
      return res.status(400).json({
        success: false,
        message: 'Invalid email format'
      });
    }

    // Validate username format
    const usernameRegex = /^[a-zA-Z0-9_]+$/;
    if (!usernameRegex.test(username)) {
      return res.status(400).json({
        success: false,
        message: 'Username can only contain letters, numbers, and underscores'
      });
    }

    // Check if username already exists
    const [existingUsername] = await promisePool.execute(
      'SELECT id FROM users WHERE username = ?',
      [username]
    );

    if (existingUsername.length > 0) {
      return res.status(400).json({
        success: false,
        message: 'Username already exists'
      });
    }

    // Check if email already exists
    const [existingEmail] = await promisePool.execute(
      'SELECT id FROM users WHERE email = ?',
      [email]
    );

    if (existingEmail.length > 0) {
      return res.status(400).json({
        success: false,
        message: 'Email already exists'
      });
    }

    // Hash password
    const hashedPassword = await bcrypt.hash(password, 10);

    // Insert user
    const [result] = await promisePool.execute(
      `INSERT INTO users (username, name, email, phone, password, role) 
       VALUES (?, ?, ?, ?, ?, ?)`,
      [username, name, email, phone || null, hashedPassword, dbRole]
    );

    res.status(201).json({
      success: true,
      message: 'User created successfully',
      data: { id: result.insertId }
    });

  } catch (error) {
    console.error('Create user error:', error);
    res.status(500).json({
      success: false,
      message: 'Failed to create user'
    });
  }
});

// Update user (Admin only)
router.put('/:id', authenticateToken, requireAdmin, async (req, res) => {
  try {
    const { id } = req.params;
    const {
      username, name, email, phone, role, isActive, password
    } = req.body;

    // Check if user exists
    const [existing] = await promisePool.execute(
      'SELECT id, username, email FROM users WHERE id = ?',
      [id]
    );

    if (existing.length === 0) {
      return res.status(404).json({
        success: false,
        message: 'User not found'
      });
    }

    // Prevent admin ID = 1 from having their role changed
    if (parseInt(id) === 1 && role !== undefined && role.toLowerCase() !== 'admin') {
      return res.status(400).json({
        success: false,
        message: 'Không thể thay đổi vai trò của admin chính'
      });
    }

    // Convert role to lowercase for database storage if provided
    const dbRole = role ? (typeof role === 'string' ? role.toLowerCase() : role) : undefined;

    // Validate role if provided
    if (dbRole && !['admin', 'manager', 'staff'].includes(dbRole)) {
      return res.status(400).json({
        success: false,
        message: 'Invalid role. Must be admin, manager, or staff'
      });
    }

    // Check if new username conflicts with other users
    if (username && username !== existing[0].username) {
      const usernameRegex = /^[a-zA-Z0-9_]+$/;
      if (!usernameRegex.test(username)) {
        return res.status(400).json({
          success: false,
          message: 'Username can only contain letters, numbers, and underscores'
        });
      }

      const [usernameCheck] = await promisePool.execute(
        'SELECT id FROM users WHERE username = ? AND id != ?',
        [username, id]
      );

      if (usernameCheck.length > 0) {
        return res.status(400).json({
          success: false,
          message: 'Username already exists'
        });
      }
    }

    // Check if new email conflicts with other users
    if (email && email !== existing[0].email) {
      const emailRegex = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;
      if (!emailRegex.test(email)) {
        return res.status(400).json({
          success: false,
          message: 'Invalid email format'
        });
      }

      const [emailCheck] = await promisePool.execute(
        'SELECT id FROM users WHERE email = ? AND id != ?',
        [email, id]
      );

      if (emailCheck.length > 0) {
        return res.status(400).json({
          success: false,
          message: 'Email already exists'
        });
      }
    }

    // Build update query dynamically
    const updateFields = [];
    const updateValues = [];

    if (username !== undefined) { updateFields.push('username = ?'); updateValues.push(username); }
    if (name !== undefined) { updateFields.push('name = ?'); updateValues.push(name); }
    if (email !== undefined) { updateFields.push('email = ?'); updateValues.push(email); }
    if (phone !== undefined) { updateFields.push('phone = ?'); updateValues.push(phone); }
    if (dbRole !== undefined) { updateFields.push('role = ?'); updateValues.push(dbRole); }
    if (isActive !== undefined) { updateFields.push('is_active = ?'); updateValues.push(isActive ? 1 : 0); }

    // Hash new password if provided
    if (password) {
      const hashedPassword = await bcrypt.hash(password, 10);
      updateFields.push('password = ?');
      updateValues.push(hashedPassword);
    }

    updateFields.push('updated_at = NOW()');
    updateValues.push(id);

    await promisePool.execute(
      `UPDATE users SET ${updateFields.join(', ')} WHERE id = ?`,
      updateValues
    );

    res.json({
      success: true,
      message: 'User updated successfully'
    });

  } catch (error) {
    console.error('Update user error:', error);
    res.status(500).json({
      success: false,
      message: 'Failed to update user'
    });
  }
});

// Change user password (Admin only)
router.patch('/:id/password', authenticateToken, requireAdmin, async (req, res) => {
  try {
    const { id } = req.params;
    const { newPassword } = req.body;

    if (!newPassword) {
      return res.status(400).json({
        success: false,
        message: 'New password is required'
      });
    }

    if (newPassword.length < 6) {
      return res.status(400).json({
        success: false,
        message: 'Password must be at least 6 characters long'
      });
    }

    // Check if user exists
    const [existing] = await promisePool.execute(
      'SELECT id FROM users WHERE id = ?',
      [id]
    );

    if (existing.length === 0) {
      return res.status(404).json({
        success: false,
        message: 'User not found'
      });
    }

    // Hash new password
    const hashedPassword = await bcrypt.hash(newPassword, 10);

    // Update password
    await promisePool.execute(
      'UPDATE users SET password = ?, updated_at = NOW() WHERE id = ?',
      [hashedPassword, id]
    );

    res.json({
      success: true,
      message: 'Password updated successfully'
    });

  } catch (error) {
    console.error('Update password error:', error);
    res.status(500).json({
      success: false,
      message: 'Failed to update password'
    });
  }
});

// Toggle user active status (Admin only)
router.patch('/:id/toggle-status', authenticateToken, requireAdmin, async (req, res) => {
  try {
    const { id } = req.params;

    // Prevent admin ID = 1 from changing their own status
    if (parseInt(id) === 1 && req.user.id === 1) {
      return res.status(400).json({
        success: false,
        message: 'Admin chính không thể thay đổi trạng thái của chính mình'
      });
    }

    // Check if user exists
    const [existing] = await promisePool.execute(
      'SELECT id, is_active FROM users WHERE id = ?',
      [id]
    );

    if (existing.length === 0) {
      return res.status(404).json({
        success: false,
        message: 'User not found'
      });
    }

    const currentStatus = existing[0].is_active;
    const newStatus = currentStatus ? 0 : 1;

    // Update status
    await promisePool.execute(
      'UPDATE users SET is_active = ?, updated_at = NOW() WHERE id = ?',
      [newStatus, id]
    );

    res.json({
      success: true,
      message: `User ${newStatus ? 'activated' : 'deactivated'} successfully`,
      data: {
        previousStatus: !!currentStatus,
        newStatus: !!newStatus
      }
    });

  } catch (error) {
    console.error('Toggle user status error:', error);
    res.status(500).json({
      success: false,
      message: 'Failed to toggle user status'
    });
  }
});

// Delete user (Admin only) - Soft delete
router.delete('/:id', authenticateToken, requireAdmin, async (req, res) => {
  try {
    const { id } = req.params;

    // Prevent admin from deleting themselves
    if (parseInt(id) === req.user.id) {
      return res.status(400).json({
        success: false,
        message: 'Cannot delete your own account'
      });
    }

    // Prevent admin ID = 1 from being deleted
    if (parseInt(id) === 1) {
      return res.status(400).json({
        success: false,
        message: 'Không thể xóa tài khoản admin chính'
      });
    }

    // Check if user exists
    const [existing] = await promisePool.execute(
      'SELECT id FROM users WHERE id = ?',
      [id]
    );

    if (existing.length === 0) {
      return res.status(404).json({
        success: false,
        message: 'User not found'
      });
    }

    // Soft delete (set is_active to 0)
    await promisePool.execute(
      'UPDATE users SET is_active = 0, updated_at = NOW() WHERE id = ?',
      [id]
    );

    res.json({
      success: true,
      message: 'User deleted successfully'
    });

  } catch (error) {
    console.error('Delete user error:', error);
    res.status(500).json({
      success: false,
      message: 'Failed to delete user'
    });
  }
});

// Get user statistics (Admin only)
router.get('/stats/overview', authenticateToken, requireAdmin, async (req, res) => {
  try {
    // Get user statistics
    const [userStats] = await promisePool.execute(`
      SELECT 
        COUNT(*) as total_users,
        COUNT(CASE WHEN is_active = 1 THEN 1 END) as active_users,
        COUNT(CASE WHEN is_active = 0 THEN 1 END) as inactive_users,
        COUNT(CASE WHEN role = 'admin' THEN 1 END) as admin_count,
        COUNT(CASE WHEN role = 'manager' THEN 1 END) as manager_count,
        COUNT(CASE WHEN role = 'staff' THEN 1 END) as staff_count,
        COUNT(CASE WHEN DATE(created_at) = CURDATE() THEN 1 END) as today_registrations,
        COUNT(CASE WHEN created_at >= DATE_SUB(NOW(), INTERVAL 7 DAY) THEN 1 END) as week_registrations,
        COUNT(CASE WHEN last_login_at >= DATE_SUB(NOW(), INTERVAL 24 HOUR) THEN 1 END) as daily_active_users
      FROM users
    `);

    // Get recent registrations
    const [recentUsers] = await promisePool.execute(`
      SELECT id, name, email, role, created_at
      FROM users
      ORDER BY created_at DESC
      LIMIT 5
    `);

    const stats = userStats[0];

    res.json({
      success: true,
      data: {
        overview: {
          totalUsers: stats.total_users,
          activeUsers: stats.active_users,
          inactiveUsers: stats.inactive_users,
          todayRegistrations: stats.today_registrations,
          weekRegistrations: stats.week_registrations,
          dailyActiveUsers: stats.daily_active_users
        },
        roleDistribution: {
          admin: stats.admin_count,
          manager: stats.manager_count,
          staff: stats.staff_count
        },
        recentRegistrations: recentUsers.map(user => ({
          id: user.id,
          name: user.name,
          email: user.email,
          role: user.role,
          createdAt: user.created_at
        }))
      }
    });

  } catch (error) {
    console.error('Get user statistics error:', error);
    res.status(500).json({
      success: false,
      message: 'Failed to fetch user statistics'
    });
  }
});

module.exports = router;
