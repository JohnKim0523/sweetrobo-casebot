const axios = require('axios');
const crypto = require('crypto');

// Configuration with marshmallow parameters
const config = {
  appId: 'ct0feee2e5ad8b1913',
  appSecret: 'c1f1d8de63ed4a08b252f54d0df5eced',
  baseUrl: 'https://www.gzchitu.cn',
  testMachineId: 'CT0700026',
  testMachineModel: 'CT-sjk360'
};

/**
 * Generate signature according to Chitu documentation:
 * 1. Sort all parameters (except sign) alphabetically
 * 2. Concatenate as key1=value1&key2=value2...&access_token=appSecret
 * 3. Sign with SHA256
 */
function generateSignature(params, appSecret) {
  // Remove sign field if present
  const cleanParams = { ...params };
  delete cleanParams.sign;

  // Sort parameters alphabetically
  const sortedKeys = Object.keys(cleanParams).sort();

  // Build string: key1=value1&key2=value2...
  const paramString = sortedKeys
    .map(key => `${key}=${cleanParams[key]}`)
    .join('&');

  // Append access_token=appSecret (as per documentation)
  const signString = `${paramString}&access_token=${appSecret}`;

  // Generate SHA256 signature
  const sign = crypto
    .createHash('sha256')
    .update(signString)
    .digest('hex');

  console.log(`🔐 Sign string: ${signString.substring(0, 60)}...`);
  console.log(`🔐 Generated signature: ${sign}`);

  return sign;
}

// Make API request with correct format
async function makeRequest(endpoint, params = {}) {
  const timestamp = Math.floor(Date.now() / 1000).toString();
  const nonce = crypto.randomBytes(16).toString('hex');

  // Build request parameters with 'appid' (not 'app_id')
  const requestParams = {
    appid: config.appId,
    timestamp: timestamp,
    nonce_str: nonce,
    ...params
  };

  // Generate signature
  requestParams.sign = generateSignature(requestParams, config.appSecret);

  console.log(`\n📤 Calling ${endpoint}`);
  console.log('Parameters:', JSON.stringify(requestParams, null, 2));

  try {
    const response = await axios.post(
      `${config.baseUrl}${endpoint}`,
      requestParams,
      {
        headers: {
          'Content-Type': 'application/json',
          'Accept': 'application/json'
        },
        timeout: 10000,
        validateStatus: () => true // Accept any status
      }
    );

    console.log('✅ Response:', JSON.stringify(response.data, null, 2));
    return response.data;
  } catch (error) {
    console.log('❌ Error:', error.message);
    throw error;
  }
}

// Test device_key encryption (for future use)
function encryptDeviceKey(data, appSecret) {
  // As per docs: key is first 16 bits of appSecret, iv is last 16 bits
  const key = appSecret.substring(0, 16);
  const iv = appSecret.substring(16, 32);

  const cipher = crypto.createCipheriv('aes-128-cbc', key, iv);
  let encrypted = cipher.update(data, 'utf8', 'base64');
  encrypted += cipher.final('base64');

  return encrypted;
}

// Main test function
async function testChituAPI() {
  console.log('='.repeat(70));
  console.log('🍬 CHITU API TEST - CORRECTED SIGNATURE FORMAT');
  console.log('='.repeat(70));
  console.log('\n📋 Configuration:');
  console.log(`   App ID: ${config.appId}`);
  console.log(`   App Secret: ${config.appSecret.substring(0, 16)}...`);
  console.log(`   Test Machine: ${config.testMachineId} (${config.testMachineModel})`);
  console.log('\n📝 Using correct format from documentation:');
  console.log('   - Parameter name: appid (not app_id)');
  console.log('   - Signature: SHA256 with access_token=appSecret');
  console.log('='.repeat(70));

  try {
    // Test 1: Get machine list
    console.log('\n1️⃣ TEST: Machine List');
    const machineList = await makeRequest('/api/openApi/machineList');

    // Test 2: Get specific machine details
    console.log('\n2️⃣ TEST: Machine Details');
    const machineDetails = await makeRequest('/api/openApi/machineDetails', {
      device_id: config.testMachineId
    });

    // Test 3: Get order list
    console.log('\n3️⃣ TEST: Machine Order List');
    const orderList = await makeRequest('/api/openApi/machineOrderList', {
      device_id: config.testMachineId
    });

    console.log('\n' + '='.repeat(70));
    console.log('📊 TEST RESULTS SUMMARY');
    console.log('='.repeat(70));

    // Check if we got successful responses
    if (machineList && machineList.status !== 400) {
      console.log('✅ Machine List API: Working');
    } else {
      console.log('❌ Machine List API: ' + (machineList?.msg || 'Failed'));
    }

    if (machineDetails && machineDetails.status !== 400) {
      console.log('✅ Machine Details API: Working');
    } else {
      console.log('❌ Machine Details API: ' + (machineDetails?.msg || 'Failed'));
    }

    if (orderList && orderList.status !== 400) {
      console.log('✅ Order List API: Working');
    } else {
      console.log('❌ Order List API: ' + (orderList?.msg || 'Failed'));
    }

  } catch (error) {
    console.log('\n❌ Test failed:', error.message);
  }

  console.log('='.repeat(70));
}

// Run the test
testChituAPI();