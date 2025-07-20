const axios = require('axios');

async function testStockOut() {
  try {
    // First, let's get a login token
    const loginResponse = await axios.post('http://localhost:3001/api/auth/login', {
      email: 'admin@clothing.com',
      password: 'admin123'
    });

    if (!loginResponse.data.success) {
      console.error('Login failed:', loginResponse.data);
      return;
    }

    const token = loginResponse.data.data.token;
    console.log('✅ Login successful');

    // Now test stock out with customer info
    const response = await axios.post('http://localhost:3001/api/inventory/stock-out', {
      variantId: 71,
      quantity: 1,
      reason: 'Bán hàng cho khách',
      customerName: 'Nguyễn Văn Test',
      customerPhone: '0987654321',
      customerEmail: 'test@example.com'
    }, {
      headers: {
        'Authorization': `Bearer ${token}`,
        'Content-Type': 'application/json'
      }
    });

    console.log('✅ Stock out response:', response.data);
  } catch (error) {
    console.error('❌ Error:', error.response?.data || error.message);
  }
}

testStockOut();
