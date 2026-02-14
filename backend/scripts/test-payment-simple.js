/**
 * Simple test script to query payment capabilities
 * Uses the same signature algorithm as the ChituService
 */

const crypto = require('crypto');
const https = require('https');

require('dotenv').config();

const config = {
  appId: process.env.CHITU_APP_ID,
  appSecret: process.env.CHITU_APP_SECRET,
  apiUrl: 'https://www.gzchitu.cn',
};

console.log('='.repeat(60));
console.log('PAYMENT CAPABILITIES TEST (JSON API)');
console.log('='.repeat(60));
console.log(`App ID: ${config.appId}`);

function generateSignature(params, appSecret) {
  const { sign, ...paramsWithoutSign } = params;
  const sortedKeys = Object.keys(paramsWithoutSign).sort();
  const paramString = sortedKeys.map((key) => `${key}=${paramsWithoutSign[key]}`).join('&');
  const signString = `${paramString}&access_token=${appSecret}`;
  return crypto.createHash('sha256').update(signString).digest('hex');
}

function apiRequest(endpoint, params) {
  return new Promise((resolve, reject) => {
    const fullParams = {
      appid: config.appId,
      ...params,
    };
    fullParams.sign = generateSignature(fullParams, config.appSecret);

    const postData = JSON.stringify(fullParams);

    console.log(`\n📤 Request to ${endpoint}`);
    console.log(`   Params: ${JSON.stringify(fullParams, null, 2)}`);

    const options = {
      hostname: 'www.gzchitu.cn',
      port: 443,
      path: endpoint,
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        'Accept': 'application/json',
        'Content-Length': Buffer.byteLength(postData),
      },
    };

    const req = https.request(options, (res) => {
      let data = '';
      res.on('data', (chunk) => data += chunk);
      res.on('end', () => {
        try {
          const parsed = JSON.parse(data);
          console.log(`   Response: ${JSON.stringify(parsed, null, 2)}`);
          resolve(parsed);
        } catch (e) {
          console.log(`   Raw response: ${data}`);
          resolve({ error: 'parse_error', raw: data });
        }
      });
    });

    req.on('error', (e) => {
      console.log(`   Error: ${e.message}`);
      resolve({ error: e.message });
    });

    req.write(postData);
    req.end();
  });
}

async function main() {
  // Step 1: Get machine details to get device_id
  console.log('\n' + '='.repeat(60));
  console.log('STEP 1: Get Machine Details');
  console.log('='.repeat(60));

  const machineDetails = await apiRequest('/api/openApi/machineDetailsTwo', {
    device_code: 'CT0700046',
  });

  if (machineDetails.status !== 200) {
    console.log('Failed to get machine details');
    return;
  }

  const deviceId = machineDetails.data.data.device_id;
  const machineId = machineDetails.data.data.machineId;
  console.log(`\ndevice_id: ${deviceId}`);
  console.log(`machineId: ${machineId}`);

  // Step 2: Query payment config
  console.log('\n' + '='.repeat(60));
  console.log('STEP 2: Query Payment Configuration');
  console.log('='.repeat(60));

  const paymentConfig = await apiRequest('/api/openApi/machineQueryPaymentConfig', {
    device_id: deviceId,
  });

  // Step 3: Get machine list to see all machines
  console.log('\n' + '='.repeat(60));
  console.log('STEP 3: Get Machine List');
  console.log('='.repeat(60));

  const machineList = await apiRequest('/api/openApi/machineList', {});

  // Step 4: Try to get product list (might show payment info)
  console.log('\n' + '='.repeat(60));
  console.log('STEP 4: Get Product List');
  console.log('='.repeat(60));

  const productList = await apiRequest('/api/openApi/machineProductList', {
    device_id: deviceId,
  });

  // Step 5: Try machine inventory to see full details
  console.log('\n' + '='.repeat(60));
  console.log('STEP 5: Get Machine Inventory Info');
  console.log('='.repeat(60));

  const inventory = await apiRequest('/api/openApi/machineInventoryInfo', {
    device_id: deviceId,
  });

  // Summary
  console.log('\n' + '='.repeat(60));
  console.log('SUMMARY');
  console.log('='.repeat(60));

  console.log('\nMachine: CT0700046');
  console.log(`Model: ${machineDetails.data.data.machine_model}`);
  console.log(`Status: ${machineDetails.data.data.online_status}`);
  console.log(`Shopping Mode: ${machineDetails.data.data.shopping_mode}`);

  if (paymentConfig.status === 200 && paymentConfig.data) {
    console.log(`\nPayment Config: ${JSON.stringify(paymentConfig.data)}`);
  } else {
    console.log(`\nPayment Config: ${paymentConfig.msg || 'Not configured'}`);
  }

  console.log('\n' + '='.repeat(60));
  console.log('ANALYSIS');
  console.log('='.repeat(60));

  console.log(`
Based on the API responses:

1. Machine Details Retrieved: ✅
   - Model: ${machineDetails.data.data.machine_model}
   - Online: ${machineDetails.data.data.online_status}

2. Payment Configuration: ${paymentConfig.msg === '未设置' ? '❌ NOT CONFIGURED' : '✅ Configured'}
   - The response "未设置" means "Not Set"
   - This machine does NOT have payment configured via the Chitu API

3. What this means:
   - The machine MAY have a physical payment terminal (Nayax, ICT, etc.)
   - But it's NOT configured through the Chitu payment API
   - Payment configuration needs to be set up via:
     a) The Chitu admin portal
     b) The /api/openApi/machinePaymentConfig API endpoint

4. To enable credit card payments, you need:
   - A Nayax terminal installed on the machine
   - Nayax merchant credentials (merchant_no, terminal_id, token)
   - Configuration via machinePaymentConfig API or Chitu portal
`);
}

main().catch(console.error);
