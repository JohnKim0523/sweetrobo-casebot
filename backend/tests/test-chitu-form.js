const axios = require('axios');
const crypto = require('crypto');
const FormData = require('form-data');
const querystring = require('querystring');

// Configuration
const config = {
  appId: 'ct0feee2e5ad8b1913',
  appSecret: 'c1f1d8de63ed4a08b252f54d0df5eced',
  baseUrl: 'https://www.gzchitu.cn',
  testMachineId: 'CT0700046',
};

// Test with form data
async function testWithFormData() {
  console.log('🧪 Testing Chitu API with form-urlencoded\n');

  const timestamp = Math.floor(Date.now() / 1000).toString();
  const nonce_str = crypto.randomBytes(8).toString('hex');

  const params = {
    app_id: config.appId,
    timestamp: timestamp,
    nonce_str: nonce_str,
  };

  // Generate signature
  const sortedKeys = Object.keys(params).sort();
  const paramString = sortedKeys.map(key => `${key}=${params[key]}`).join('&');
  const signString = `${paramString}&app_secret=${config.appSecret}`;
  const sign = crypto.createHash('sha256').update(signString).digest('hex');

  params.sign = sign;

  console.log('Parameters:', params);
  console.log('Signature:', sign.substring(0, 20) + '...');

  try {
    // Try with application/x-www-form-urlencoded
    const response = await axios.post(
      `${config.baseUrl}/api/openApi/machineList`,
      querystring.stringify(params),
      {
        headers: {
          'Content-Type': 'application/x-www-form-urlencoded',
        },
        timeout: 10000,
      }
    );
    console.log('✅ Success:', response.data);
  } catch (error) {
    console.log('❌ Form-urlencoded failed:', error.response?.data || error.message);
  }

  // Also try GET request
  console.log('\nTrying GET request...');
  try {
    const response = await axios.get(
      `${config.baseUrl}/api/openApi/machineList`,
      {
        params: params,
        timeout: 10000,
      }
    );
    console.log('✅ GET Success:', response.data);
  } catch (error) {
    console.log('❌ GET failed:', error.response?.data || error.message);
  }
}

testWithFormData();