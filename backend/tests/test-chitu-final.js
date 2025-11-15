const axios = require('axios');
const crypto = require('crypto');

// EXACT Configuration as provided - DO NOT CHANGE
const config = {
  appId: 'ct0feee2e5ad8b1913',  // From marshmallow parameters
  appSecret: 'c1f1d8de63ed4a08b252f54d0df5eced',  // From marshmallow parameters
  baseUrl: 'https://www.gzchitu.cn',
  testMachineId: 'CT0700046',  // Exhibition hall machine - READ ONLY
  testMachineModel: 'CT-sjk360'
};

console.log('='.repeat(70));
console.log('🍬 TESTING WITH MARSHMALLOW PARAMETERS (DO NOT MODIFY)');
console.log('='.repeat(70));
console.log('\nExact Configuration:');
console.log(`App ID: ${config.appId}`);
console.log(`App Secret: ${config.appSecret}`);
console.log(`Machine: ${config.testMachineId} (${config.testMachineModel})`);
console.log('\n⚠️  EXHIBITION HALL MACHINE - NO PRICE/INVENTORY MODIFICATIONS');
console.log('='.repeat(70));

// Test different signature methods to see which one works
async function testAllFormats() {
  const timestamp = Math.floor(Date.now() / 1000).toString();
  const nonce = crypto.randomBytes(16).toString('hex');

  // Test different parameter combinations
  const testCases = [
    {
      name: 'Format 1: app_id with SHA256 & app_secret',
      params: {
        app_id: config.appId,
        timestamp: timestamp,
        nonce_str: nonce
      },
      signMethod: 'sha256',
      signSuffix: 'app_secret'
    },
    {
      name: 'Format 2: appid with SHA256 & app_secret',
      params: {
        appid: config.appId,
        timestamp: timestamp,
        nonce_str: nonce
      },
      signMethod: 'sha256',
      signSuffix: 'app_secret'
    },
    {
      name: 'Format 3: app_id with MD5 & app_secret',
      params: {
        app_id: config.appId,
        timestamp: timestamp,
        nonce_str: nonce
      },
      signMethod: 'md5',
      signSuffix: 'app_secret'
    },
    {
      name: 'Format 4: app_id with SHA256 & access_token',
      params: {
        app_id: config.appId,
        timestamp: timestamp,
        nonce_str: nonce
      },
      signMethod: 'sha256',
      signSuffix: 'access_token'
    }
  ];

  for (const testCase of testCases) {
    console.log(`\n📝 Testing ${testCase.name}`);

    // Generate signature
    const sortedKeys = Object.keys(testCase.params).sort();
    const paramString = sortedKeys.map(key => `${key}=${testCase.params[key]}`).join('&');
    const signString = `${paramString}&${testCase.signSuffix}=${config.appSecret}`;
    const sign = crypto.createHash(testCase.signMethod).update(signString).digest('hex');

    const requestParams = { ...testCase.params, sign };

    console.log('  Parameters:', JSON.stringify(requestParams, null, 2));

    try {
      // Test with JSON
      const jsonResponse = await axios.post(
        `${config.baseUrl}/api/openApi/machineList`,
        requestParams,
        {
          headers: { 'Content-Type': 'application/json' },
          timeout: 5000,
          validateStatus: () => true // Accept any status
        }
      );

      console.log('  JSON Response:', JSON.stringify(jsonResponse.data, null, 2));

      // If we get a different error than "参数错误", it might be progress
      if (jsonResponse.data && jsonResponse.data.msg !== '参数错误') {
        console.log('  ⚠️  Different response received!');
      }

      // Also try form-urlencoded
      const querystring = require('querystring');
      const formResponse = await axios.post(
        `${config.baseUrl}/api/openApi/machineList`,
        querystring.stringify(requestParams),
        {
          headers: { 'Content-Type': 'application/x-www-form-urlencoded' },
          timeout: 5000,
          validateStatus: () => true
        }
      );

      if (JSON.stringify(formResponse.data) !== JSON.stringify(jsonResponse.data)) {
        console.log('  Form Response (different):', JSON.stringify(formResponse.data, null, 2));
      }

    } catch (error) {
      console.log('  Error:', error.message);
    }
  }
}

// Test specific machine operations
async function testMachineOperations() {
  console.log('\n' + '='.repeat(70));
  console.log('📱 TESTING MACHINE-SPECIFIC OPERATIONS');
  console.log('='.repeat(70));

  const timestamp = Math.floor(Date.now() / 1000).toString();
  const nonce = crypto.randomBytes(16).toString('hex');

  // Using the most likely format based on common API patterns
  const baseParams = {
    app_id: config.appId,
    timestamp: timestamp,
    nonce_str: nonce
  };

  // Generate signature
  const sortedKeys = Object.keys(baseParams).sort();
  const paramString = sortedKeys.map(key => `${key}=${baseParams[key]}`).join('&');
  const signString = `${paramString}&app_secret=${config.appSecret}`;
  const sign = crypto.createHash('sha256').update(signString).digest('hex');

  // Test different endpoints
  const endpoints = [
    { path: '/api/openApi/machineList', params: {} },
    { path: '/api/openApi/machineDetails', params: { device_id: config.testMachineId } },
    { path: '/api/openApi/machineStatus', params: { device_id: config.testMachineId } },
    { path: '/api/openApi/machineOrderList', params: { device_id: config.testMachineId } }
  ];

  for (const endpoint of endpoints) {
    const requestParams = { ...baseParams, ...endpoint.params, sign };

    console.log(`\n📍 ${endpoint.path}`);
    console.log('Request:', JSON.stringify(requestParams, null, 2));

    try {
      const response = await axios.post(
        `${config.baseUrl}${endpoint.path}`,
        requestParams,
        {
          headers: { 'Content-Type': 'application/json' },
          timeout: 5000,
          validateStatus: () => true
        }
      );

      console.log('Response Format:', {
        status: response.status,
        headers: response.headers['content-type'],
        data: response.data
      });

    } catch (error) {
      console.log('Error:', error.message);
    }
  }
}

// Run all tests
async function runAllTests() {
  await testAllFormats();
  await testMachineOperations();

  console.log('\n' + '='.repeat(70));
  console.log('📊 TEST COMPLETE - ALL RESPONSE FORMATS SHOWN ABOVE');
  console.log('='.repeat(70));
}

runAllTests();