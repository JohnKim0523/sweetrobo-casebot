const axios = require('axios');
const crypto = require('crypto');

// Configuration
const config = {
  appId: 'ct0feee2e5ad8b1913',
  appSecret: 'c1f1d8de63ed4a08b252f54d0df5eced',
  baseUrl: 'https://www.gzchitu.cn',
  testMachineId: 'CT0700046',
};

// Simple test with minimal parameters
async function testSimpleRequest() {
  console.log('🧪 Testing Chitu API with minimal parameters\n');

  // Build parameters
  const timestamp = Math.floor(Date.now() / 1000).toString();
  const nonce_str = crypto.randomBytes(8).toString('hex');

  // Test different parameter combinations
  const paramSets = [
    {
      name: 'With app_id',
      params: {
        app_id: config.appId,
        timestamp: timestamp,
        nonce_str: nonce_str,
      }
    },
    {
      name: 'With appid',
      params: {
        appid: config.appId,
        timestamp: timestamp,
        nonce_str: nonce_str,
      }
    }
  ];

  for (const paramSet of paramSets) {
    console.log(`\nTesting ${paramSet.name}:`);
    console.log('Parameters:', paramSet.params);

    // Generate signature
    const sortedKeys = Object.keys(paramSet.params).sort();
    const paramString = sortedKeys.map(key => `${key}=${paramSet.params[key]}`).join('&');

    // Try both signature methods
    const signMethods = [
      { name: 'app_secret', str: `${paramString}&app_secret=${config.appSecret}` },
      { name: 'access_token', str: `${paramString}&access_token=${config.appSecret}` },
    ];

    for (const signMethod of signMethods) {
      const sign = crypto.createHash('sha256').update(signMethod.str).digest('hex');

      console.log(`  ${signMethod.name}: ${sign.substring(0, 20)}...`);

      const requestParams = { ...paramSet.params, sign };

      try {
        const response = await axios.post(
          `${config.baseUrl}/api/openApi/machineList`,
          requestParams,
          {
            headers: { 'Content-Type': 'application/json' },
            timeout: 10000,
          }
        );
        console.log(`  ✅ Success:`, response.data);
        return; // Exit on first success
      } catch (error) {
        console.log(`  ❌ Failed:`, error.response?.data || error.message);
      }
    }
  }
}

testSimpleRequest();