const jwt = require('jsonwebtoken');
const { promisePool } = require('../config/database');

// Authentication middleware
const authenticateToken = async (req, res, next) => {
  try {
    const authHeader = req.headers['authorization'];
    const token = authHeader && authHeader.split(' ')[1]; // Bearer TOKEN

    if (!token) {
      return res.status(401).json({
        success: false,
        message: 'Access token required'
      });
    }

    const decoded = jwt.verify(token, process.env.JWT_SECRET);
    
    // Get user from database
    const [rows] = await promisePool.execute(
      'SELECT id, username, email, role, is_active FROM users WHERE id = ?',
      [decoded.userId]
    );

    if (rows.length === 0) {
      return res.status(401).json({
        success: false,
        message: 'User not found'
      });
    }

    const user = rows[0];

    if (!user.is_active) {
      return res.status(401).json({
        success: false,
        message: 'User account is inactive'
      });
    }

    req.user = {
      id: user.id,
      username: user.username,
      email: user.email,
      role: user.role
    };

    next();
  } catch (error) {
    console.error('Auth middleware error:', error);
    
    if (error.name === 'JsonWebTokenError') {
      return res.status(401).json({
        success: false,
        message: 'Invalid token'
      });
    }
    
    if (error.name === 'TokenExpiredError') {
      return res.status(401).json({
        success: false,
        message: 'Token expired'
      });
    }

    return res.status(500).json({
      success: false,
      message: 'Authentication error'
    });
  }
};

// Authorization middleware for admin only
const requireAdmin = (req, res, next) => {
  if (req.user.role.toLowerCase() !== 'admin') {
    return res.status(403).json({
      success: false,
      message: 'Admin access required'
    });
  }
  next();
};

// Authorization middleware for admin or manager
const requireAdminOrManager = (req, res, next) => {
  const role = req.user.role.toLowerCase();
  if (!['admin', 'manager'].includes(role)) {
    return res.status(403).json({
      success: false,
      message: 'Admin or Manager access required'
    });
  }
  next();
};

module.exports = {
  authenticateToken,
  requireAdmin,
  requireAdminOrManager
};
