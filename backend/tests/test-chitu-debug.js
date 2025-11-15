const axios = require('axios');
const crypto = require('crypto');

// Your production credentials
const config = {
  appId: 'ct0feee2e5ad8b1913',
  appSecret: 'c1f1d8de63ed4a08b252f54d0df5eced',
  baseUrl: 'https://www.gzchitu.cn',
  testMachineId: 'CT0700046'
};

// The signature the API is expecting
const EXPECTED_SIGNATURES = {
  machineList: 'b0d57d8da8dd79581911f11f2544c8f5c725bb9f34d732839409a59ec3ac6ad1',
  machineDetails: '9147ea6c915dd0515c43ba97189382b5b1a9f65fc1a402cce97767ae9da06676'
};

async function testWithExpectedSignature() {
  console.log('🔬 TESTING WITH EXPECTED SIGNATURE\n');
  console.log('The API consistently expects these signatures:');
  console.log(`  machineList: ${EXPECTED_SIGNATURES.machineList}`);
  console.log(`  machineDetails: ${EXPECTED_SIGNATURES.machineDetails}`);
  console.log('\nLet\'s try using them directly...\n');

  // Test 1: Use the expected signature for machineList
  const timestamp = Math.floor(Date.now() / 1000).toString();
  const nonce_str = crypto.randomBytes(16).toString('hex');

  const params1 = {
    appid: config.appId,
    timestamp: timestamp,
    nonce_str: nonce_str,
    sign: EXPECTED_SIGNATURES.machineList  // Use the expected signature
  };

  console.log('📤 Test 1: machineList with expected signature');
  console.log('Request:', JSON.stringify(params1, null, 2));

  try {
    const response = await axios.post(
      `${config.baseUrl}/api/openApi/machineList`,
      params1,
      {
        headers: { 'Content-Type': 'application/json' },
        timeout: 10000,
        validateStatus: () => true
      }
    );
    console.log('Response:', JSON.stringify(response.data, null, 2));
  } catch (error) {
    console.log('Error:', error.message);
  }

  // Test 2: Try without timestamp/nonce
  console.log('\n📤 Test 2: machineList without timestamp/nonce');
  const params2 = {
    appid: config.appId,
    sign: EXPECTED_SIGNATURES.machineList
  };

  try {
    const response = await axios.post(
      `${config.baseUrl}/api/openApi/machineList`,
      params2,
      {
        headers: { 'Content-Type': 'application/json' },
        timeout: 10000,
        validateStatus: () => true
      }
    );
    console.log('Response:', JSON.stringify(response.data, null, 2));
  } catch (error) {
    console.log('Error:', error.message);
  }

  // Test 3: Try to reverse engineer the expected signature
  console.log('\n🔍 REVERSE ENGINEERING THE SIGNATURE\n');

  // Try different combinations to see what produces the expected hash
  const testCombinations = [
    { desc: 'Just appid', str: `appid=${config.appId}&access_token=${config.appSecret}` },
    { desc: 'With static timestamp', str: `appid=${config.appId}&timestamp=1234567890&access_token=${config.appSecret}` },
    { desc: 'With test nonce', str: `appid=${config.appId}&nonce_str=test&timestamp=1234567890&access_token=${config.appSecret}` },
    { desc: 'Empty params', str: `access_token=${config.appSecret}` },
    { desc: 'Test mode flag', str: `appid=${config.appId}&test_mode=1&access_token=${config.appSecret}` }
  ];

  for (const combo of testCombinations) {
    const hash = crypto.createHash('sha256').update(combo.str).digest('hex');
    console.log(`${combo.desc}:`);
    console.log(`  String: ${combo.str}`);
    console.log(`  Hash: ${hash}`);
    if (hash === EXPECTED_SIGNATURES.machineList) {
      console.log('  ✅ MATCH FOUND!');
    }
    console.log('');
  }

  // Test 4: Try fixed parameters that might produce the expected signature
  console.log('📤 Test 3: Try with fixed test parameters');
  const fixedParams = {
    appid: config.appId,
    timestamp: '0',
    nonce_str: '0',
    sign: EXPECTED_SIGNATURES.machineList
  };

  try {
    const response = await axios.post(
      `${config.baseUrl}/api/openApi/machineList`,
      fixedParams,
      {
        headers: { 'Content-Type': 'application/json' },
        timeout: 10000,
        validateStatus: () => true
      }
    );
    console.log('Response:', JSON.stringify(response.data, null, 2));
  } catch (error) {
    console.log('Error:', error.message);
  }
}

testWithExpectedSignature();