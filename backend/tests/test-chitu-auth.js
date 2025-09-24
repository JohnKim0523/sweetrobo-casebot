const axios = require('axios');
const crypto = require('crypto');

// Test authentication endpoint
async function testAuth() {
  const config = {
    appId: 'ct0feee2e5ad8b1913',
    appSecret: 'c1f1d8de63ed4a08b252f54d0df5eced',
    baseUrl: 'https://www.gzchitu.cn',
  };

  console.log('🧪 Testing Chitu Authentication\n');
  console.log('App ID:', config.appId);
  console.log('App Secret:', config.appSecret.substring(0, 10) + '...\n');

  // Try different API paths
  const endpoints = [
    '/api/openApi/auth',
    '/api/openApi/token',
    '/api/openApi/login',
    '/api/auth/token',
    '/openApi/auth',
  ];

  for (const endpoint of endpoints) {
    console.log(`Testing ${endpoint}...`);

    const params = {
      app_id: config.appId,
      app_secret: config.appSecret,
      timestamp: Math.floor(Date.now() / 1000).toString(),
    };

    try {
      const response = await axios.post(
        `${config.baseUrl}${endpoint}`,
        params,
        {
          headers: { 'Content-Type': 'application/json' },
          timeout: 5000,
        }
      );
      console.log('✅ Success:', response.data);
      return;
    } catch (error) {
      if (error.response) {
        console.log(`  Status: ${error.response.status}, Message:`, error.response.data);
      } else {
        console.log(`  Error:`, error.message);
      }
    }
  }

  // Try with minimal params
  console.log('\n📝 Testing with minimal params to /api/openApi/machineList...');
  const minimalParams = {
    app_id: config.appId,
    app_secret: config.appSecret,
  };

  try {
    const response = await axios.post(
      `${config.baseUrl}/api/openApi/machineList`,
      minimalParams,
      {
        headers: { 'Content-Type': 'application/json' },
        timeout: 5000,
      }
    );
    console.log('✅ Success:', response.data);
  } catch (error) {
    console.log('❌ Failed:', error.response?.data || error.message);
  }
}

testAuth();