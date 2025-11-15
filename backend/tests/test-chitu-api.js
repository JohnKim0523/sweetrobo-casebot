const axios = require('axios');
const crypto = require('crypto');

// Configuration - using the correct credentials
const config = {
  appId: 'ct0feee2e5ad8b1913',
  appSecret: 'c1f1d8de63ed4a08b252f54d0df5eced',
  baseUrl: 'https://www.gzchitu.cn',
  testMachineId: 'CT0700046',
  testMachineModel: 'CT-sjk360'
};

// Generate signature for API requests
function generateSignature(params) {
  const cleanParams = { ...params };
  delete cleanParams.sign;

  // Sort parameters alphabetically by key
  const sortedKeys = Object.keys(cleanParams).sort();

  // Build query string: key1=value1&key2=value2...
  const paramString = sortedKeys
    .map(key => {
      const value = cleanParams[key];
      // Handle different value types
      if (typeof value === 'object') {
        return `${key}=${JSON.stringify(value)}`;
      }
      return `${key}=${value}`;
    })
    .join('&');

  // Append app_secret for Chitu API
  const signString = `${paramString}&app_secret=${config.appSecret}`;

  // Generate SHA256 signature
  const sign = crypto
    .createHash('sha256')
    .update(signString)
    .digest('hex');

  console.log(`🔐 Sign string: ${signString.substring(0, 50)}...`);
  console.log(`🔐 Generated signature: ${sign}`);

  return sign;
}

// Make authenticated API request
async function makeRequest(endpoint, params = {}, method = 'POST') {
  const requestParams = {
    ...params,
    app_id: config.appId,
    timestamp: Math.floor(Date.now() / 1000).toString(),
    nonce_str: crypto.randomBytes(16).toString('hex'),
  };

  requestParams.sign = generateSignature(requestParams);

  console.log(`\n📤 Request to: ${endpoint}`);
  console.log(`📊 Parameters:`, params);

  try {
    const response = await axios({
      method,
      url: `${config.baseUrl}${endpoint}`,
      [method === 'GET' ? 'params' : 'data']: requestParams,
      headers: {
        'Content-Type': 'application/json',
      },
      timeout: 30000,
    });

    console.log(`✅ Response received`);
    return response.data;
  } catch (error) {
    console.error(`❌ Error:`, error.response?.data || error.message);
    throw error;
  }
}

// Test workflow
async function testChituAPI() {
  console.log('🧪 Testing Chitu API with correct credentials and machine\n');
  console.log('📋 Configuration:');
  console.log(`   App ID: ${config.appId}`);
  console.log(`   App Secret: ${config.appSecret.substring(0, 8)}...`);
  console.log(`   Test Machine: ${config.testMachineId} (${config.testMachineModel})`);
  console.log('\n⚠️  Note: This is an exhibition hall machine - DO NOT modify prices/inventory!\n');

  try {
    // Test 1: Get machine list
    console.log('1️⃣ Test: Get machine list');
    const machineListResponse = await makeRequest('/api/openApi/machineList');
    console.log('Response:', JSON.stringify(machineListResponse, null, 2));

    // Test 2: Get specific machine details
    console.log('\n2️⃣ Test: Get details for test machine', config.testMachineId);
    const machineDetailsResponse = await makeRequest('/api/openApi/machineDetails', {
      device_id: config.testMachineId
    });
    console.log('Response:', JSON.stringify(machineDetailsResponse, null, 2));

    // Test 3: Get order list (read-only operation, safe for exhibition machine)
    console.log('\n3️⃣ Test: Get order list for machine');
    const orderListResponse = await makeRequest('/api/openApi/machineOrderList', {
      device_id: config.testMachineId
    });
    console.log('Response:', JSON.stringify(orderListResponse, null, 2));

    console.log('\n✅ All tests completed successfully!');
    console.log('🎉 API credentials and machine configuration are working correctly.');

  } catch (error) {
    console.error('\n❌ Test failed:', error.message);
    if (error.response?.data) {
      console.error('Error details:', error.response.data);
    }
  }
}

// Run the test
testChituAPI();