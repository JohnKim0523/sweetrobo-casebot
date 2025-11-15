const axios = require('axios');
const crypto = require('crypto');

// Use EXACT credentials from Chitu worker
const config = {
  appId: 'ct0feee2e5ad8b1913',
  appSecret: 'c1f1d8de63ed4a08b252f54d0df5eced',
  baseUrl: 'https://www.gzchitu.cn',
  testMachineId: 'CT0700046',
  testMachineModel: 'CT-sjk360'
};

// Also test with documentation example
const testConfig = {
  appId: 'ct2c8dced2bb630888',
  appSecret: '7482691bad5ff0581f05158e3ad75f88'
};

/**
 * Generate signature EXACTLY as per documentation:
 * 1. Sort all fields (except sign) lexicographically
 * 2. Concatenate as key1=value1&key2=value2...&access_token=appSecret
 * 3. Sign with SHA256
 */
function generateSignature(params, appSecret) {
  // Create a copy and remove sign field
  const cleanParams = { ...params };
  delete cleanParams.sign;

  // Sort keys lexicographically (alphabetically)
  const sortedKeys = Object.keys(cleanParams).sort();

  // Build concatenation string: key1=value1&key2=value2...
  const paramString = sortedKeys
    .map(key => `${key}=${cleanParams[key]}`)
    .join('&');

  // Append &access_token=appSecret (EXACTLY as documentation says)
  const signString = `${paramString}&access_token=${appSecret}`;

  // Generate SHA256 signature
  const sign = crypto
    .createHash('sha256')
    .update(signString)
    .digest('hex');

  return { sign, signString };
}

// Test device_key encryption as per docs
function encryptDeviceKey(data, appSecret) {
  // Key: first 16 bytes of appSecret
  // IV: last 16 bytes of appSecret
  const key = appSecret.substring(0, 16);
  const iv = appSecret.substring(16, 32);

  console.log(`  Encryption key (first 16): ${key}`);
  console.log(`  Encryption IV (last 16): ${iv}`);

  const cipher = crypto.createCipheriv('aes-128-cbc', key, iv);
  let encrypted = cipher.update(data, 'utf8', 'base64');
  encrypted += cipher.final('base64');

  return encrypted;
}

async function testAPI(useTestCreds = false) {
  const currentConfig = useTestCreds ? testConfig : config;
  const configName = useTestCreds ? 'TEST CREDENTIALS' : 'PRODUCTION CREDENTIALS';

  console.log(`\n${'='.repeat(70)}`);
  console.log(`🧪 TESTING WITH ${configName}`);
  console.log(`   AppID: ${currentConfig.appId}`);
  console.log(`   AppSecret: ${currentConfig.appSecret}`);
  console.log('='.repeat(70));

  // Build request parameters
  const timestamp = Math.floor(Date.now() / 1000).toString();
  const nonce_str = crypto.randomBytes(16).toString('hex');

  // Test basic request first
  const params = {
    appid: currentConfig.appId,
    timestamp: timestamp,
    nonce_str: nonce_str
  };

  const { sign, signString } = generateSignature(params, currentConfig.appSecret);
  params.sign = sign;

  console.log('\n📝 Request Details:');
  console.log('   Parameters (sorted):', Object.keys(params).filter(k => k !== 'sign').sort().join(', '));
  console.log('   Timestamp:', timestamp);
  console.log('   Nonce:', nonce_str);
  console.log('\n🔐 Signature Calculation:');
  console.log(`   String to sign: ${signString}`);
  console.log(`   SHA256 Result: ${sign}`);

  // Make request
  console.log('\n📤 Sending Request to /api/openApi/machineList');
  try {
    const response = await axios.post(
      `${config.baseUrl}/api/openApi/machineList`,
      params,
      {
        headers: {
          'Content-Type': 'application/json',
          'Accept': 'application/json'
        },
        timeout: 10000,
        validateStatus: () => true
      }
    );

    console.log('📥 Response:', JSON.stringify(response.data, null, 2));

    // If signature error, show what API expects
    if (response.data && response.data.msg && response.data.msg.includes('签名错误')) {
      const expectedSign = response.data.msg.replace('签名错误', '').trim();
      console.log('\n⚠️  Signature Mismatch:');
      console.log(`   Our signature:      ${sign}`);
      console.log(`   Expected signature: ${expectedSign}`);
    }

  } catch (error) {
    console.log('❌ Request failed:', error.message);
  }

  // Test with device_id
  console.log('\n📤 Testing with device_id parameter');
  const paramsWithDevice = {
    appid: currentConfig.appId,
    device_id: config.testMachineId,
    timestamp: Math.floor(Date.now() / 1000).toString(),
    nonce_str: crypto.randomBytes(16).toString('hex')
  };

  const deviceResult = generateSignature(paramsWithDevice, currentConfig.appSecret);
  paramsWithDevice.sign = deviceResult.sign;

  try {
    const response = await axios.post(
      `${config.baseUrl}/api/openApi/machineDetails`,
      paramsWithDevice,
      {
        headers: { 'Content-Type': 'application/json' },
        timeout: 10000,
        validateStatus: () => true
      }
    );

    console.log('📥 Response:', JSON.stringify(response.data, null, 2));
  } catch (error) {
    console.log('❌ Request failed:', error.message);
  }

  // Test device_key encryption
  if (!useTestCreds) {
    console.log('\n🔐 Testing Device Key Encryption:');
    const testData = 'test_device_key_123';
    const encrypted = encryptDeviceKey(testData, currentConfig.appSecret);
    console.log(`   Original: ${testData}`);
    console.log(`   Encrypted: ${encrypted}`);
  }
}

async function runTests() {
  console.log('🍬 CHITU API SIGNATURE TEST - EXACT DOCUMENTATION IMPLEMENTATION');
  console.log('=' .repeat(70));
  console.log('Testing signature algorithm as per documentation:');
  console.log('1. Sort fields lexicographically (except sign)');
  console.log('2. Concatenate: key1=value1&key2=value2...&access_token=appSecret');
  console.log('3. Sign with SHA256');

  // Test with production credentials
  await testAPI(false);

  // Also test with documentation test credentials
  console.log('\n\n🧪 COMPARING WITH DOCUMENTATION TEST CREDENTIALS');
  await testAPI(true);

  console.log('\n' + '='.repeat(70));
  console.log('📊 TEST COMPLETE');
  console.log('If both credentials return the same error format,');
  console.log('the implementation is correct but the account needs activation.');
  console.log('=' .repeat(70));
}

runTests();