const axios = require('axios');
const crypto = require('crypto');

// Configuration with correct credentials
const config = {
  appId: 'ct0feee2e5ad8b1913',
  appSecret: 'c1f1d8de63ed4a08b252f54d0df5eced',
  baseUrl: 'https://www.gzchitu.cn',
  testMachineId: 'CT0700046',
  testMachineModel: 'CT-sjk360'
};

// Generate signature using SHA256
function generateSignature(params, secret) {
  // Remove sign field if present
  const cleanParams = { ...params };
  delete cleanParams.sign;

  // Sort parameters alphabetically
  const sortedKeys = Object.keys(cleanParams).sort();

  // Build query string
  const paramString = sortedKeys
    .map(key => `${key}=${cleanParams[key]}`)
    .join('&');

  // Add secret
  const signString = `${paramString}&app_secret=${secret}`;

  // Generate SHA256 hash
  return crypto.createHash('sha256').update(signString).digest('hex');
}

// Make API request
async function makeRequest(endpoint, params = {}) {
  const timestamp = Math.floor(Date.now() / 1000).toString();
  const nonce = crypto.randomBytes(16).toString('hex');

  // Build request parameters
  const requestParams = {
    app_id: config.appId,
    timestamp: timestamp,
    nonce_str: nonce,
    ...params
  };

  // Generate signature
  requestParams.sign = generateSignature(requestParams, config.appSecret);

  console.log(`\n📤 Calling ${endpoint}`);
  console.log('Parameters:', Object.keys(requestParams).join(', '));

  try {
    const response = await axios.post(
      `${config.baseUrl}${endpoint}`,
      requestParams,
      {
        headers: {
          'Content-Type': 'application/json',
          'Accept': 'application/json'
        },
        timeout: 10000
      }
    );

    console.log('✅ Response:', JSON.stringify(response.data, null, 2));
    return response.data;
  } catch (error) {
    if (error.response) {
      console.log('❌ Error Response:', error.response.data);
    } else {
      console.log('❌ Error:', error.message);
    }
    throw error;
  }
}

// Main test function
async function testChituAPI() {
  console.log('='.repeat(60));
  console.log('🧪 CHITU API TEST - USING PROVIDED CREDENTIALS');
  console.log('='.repeat(60));
  console.log('\n📋 Configuration:');
  console.log(`   App ID: ${config.appId}`);
  console.log(`   App Secret: ${config.appSecret.substring(0, 16)}...`);
  console.log(`   Test Machine: ${config.testMachineId} (${config.testMachineModel})`);
  console.log('\n⚠️  This is an exhibition hall machine - READ ONLY operations!');
  console.log('='.repeat(60));

  try {
    // Test 1: Get machine list
    console.log('\n1️⃣ TEST: Machine List');
    await makeRequest('/api/openApi/machineList');

    // Test 2: Get specific machine
    console.log('\n2️⃣ TEST: Machine Details');
    await makeRequest('/api/openApi/machineDetails', {
      device_id: config.testMachineId
    });

    // Test 3: Get machine status
    console.log('\n3️⃣ TEST: Machine Status');
    await makeRequest('/api/openApi/machineStatus', {
      device_id: config.testMachineId
    });

    console.log('\n' + '='.repeat(60));
    console.log('✅ ALL TESTS COMPLETED');
    console.log('='.repeat(60));

  } catch (error) {
    console.log('\n' + '='.repeat(60));
    console.log('❌ TEST FAILED');
    console.log('='.repeat(60));
    console.log('\n📝 Troubleshooting:');
    console.log('1. Verify the APP_ID and APP_SECRET are correct');
    console.log('2. Check if the machine ID CT0700046 is valid');
    console.log('3. Ensure the API endpoints are correct');
    console.log('4. Contact Chitu support if credentials are valid but still failing');
  }
}

// Run the test
testChituAPI();