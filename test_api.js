const axios = require('axios');

const API_BASE_URL = 'http://localhost:3001/api';

async function testInventoryAPI() {
  try {
    console.log('🔍 Testing Inventory API...');

    // 1. Login để lấy token
    console.log('1. Đăng nhập...');
    const loginResponse = await axios.post(`${API_BASE_URL}/auth/login`, {
      username: 'admin@clothingstore.com',
      password: 'admin123'
    });

    if (!loginResponse.data.success) {
      console.error('❌ Login failed:', loginResponse.data.message);
      return;
    }

    const token = loginResponse.data.data.token;
    console.log('✅ Login thành công!');

    // 2. Test inventory summary
    console.log('\n2. Test inventory summary...');
    const summaryResponse = await axios.get(`${API_BASE_URL}/inventory/summary`, {
      headers: { Authorization: `Bearer ${token}` }
    });

    console.log('Summary response:', JSON.stringify(summaryResponse.data, null, 2));

    // 3. Test inventory variants
    console.log('\n3. Test inventory variants...');
    const variantsResponse = await axios.get(`${API_BASE_URL}/inventory/variants`, {
      headers: { Authorization: `Bearer ${token}` }
    });

    console.log('Variants response:', JSON.stringify(variantsResponse.data, null, 2));

    // 4. Test inventory transactions
    console.log('\n4. Test inventory transactions...');
    const transactionsResponse = await axios.get(`${API_BASE_URL}/inventory/transactions`, {
      headers: { Authorization: `Bearer ${token}` }
    });

    console.log('Transactions response:', JSON.stringify(transactionsResponse.data, null, 2));

    console.log('\n🎉 Tất cả API đều hoạt động!');

  } catch (error) {
    console.error('❌ API Test failed:', error.response?.data || error.message);
  }
}

testInventoryAPI();
