const express = require('express');
const router = express.Router();
const { promisePool } = require('../config/database');

// Simple test route
router.get('/test', async (req, res) => {
  try {
    console.log('Testing simple query...');
    const [result] = await promisePool.execute('SELECT 1 as test');
    console.log('Simple query result:', result);
    res.json({ success: true, data: result });
  } catch (error) {
    console.error('Test query error:', error);
    res.status(500).json({ success: false, error: error.message });
  }
});

// Test products query
router.get('/test-products', async (req, res) => {
  try {
    console.log('Testing products query...');
    
    // Simple products query first
    const [products] = await promisePool.execute(`
      SELECT p.id, p.name, p.sku 
      FROM products p 
      WHERE p.is_active = ? 
      LIMIT 5
    `, [1]);
    
    console.log('Products found:', products.length);
    res.json({ success: true, data: products });
  } catch (error) {
    console.error('Test products error:', error);
    res.status(500).json({ success: false, error: error.message });
  }
});

module.exports = router;
