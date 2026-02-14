/**
 * Test different payment types to see which ones work
 * This will create TEST orders (you may want to cancel them)
 */

const crypto = require('crypto');
const https = require('https');
require('dotenv').config();

const config = {
  appId: process.env.CHITU_APP_ID,
  appSecret: process.env.CHITU_APP_SECRET,
};

console.log(`
${'='.repeat(70)}
PAYMENT TYPE TESTING
${'='.repeat(70)}
App ID: ${config.appId}

This script will test what happens when we send orders with different pay_types.
We'll use a test image URL and see what Chitu API responds.
${'='.repeat(70)}
`);

function generateSignature(params, appSecret) {
  const { sign, ...paramsWithoutSign } = params;
  const sortedKeys = Object.keys(paramsWithoutSign).sort();
  const paramString = sortedKeys.map((key) => `${key}=${paramsWithoutSign[key]}`).join('&');
  const signString = `${paramString}&access_token=${appSecret}`;
  return crypto.createHash('sha256').update(signString).digest('hex');
}

function apiRequest(endpoint, params) {
  return new Promise((resolve, reject) => {
    const fullParams = { appid: config.appId, ...params };
    fullParams.sign = generateSignature(fullParams, config.appSecret);

    const postData = JSON.stringify(fullParams);

    console.log(`\n📤 REQUEST: POST ${endpoint}`);
    console.log(`   Payload: ${JSON.stringify(fullParams, null, 2)}`);

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
          console.log(`\n📥 RESPONSE:`);
          console.log(`   ${JSON.stringify(parsed, null, 2)}`);
          resolve(parsed);
        } catch (e) {
          console.log(`   Raw: ${data}`);
          resolve({ raw: data });
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

async function getMachineDetails(deviceCode) {
  const result = await apiRequest('/api/openApi/machineDetailsTwo', {
    device_code: deviceCode,
  });
  return result;
}

async function getProducts(deviceId) {
  // Try to get product list
  const result = await apiRequest('/api/openApi/machineProductList', {
    device_id: deviceId,
    page: 1,
    limit: 10,
  });
  return result;
}

async function testCreateOrder(deviceId, productId, payType, imageUrl) {
  console.log(`\n${'='.repeat(50)}`);
  console.log(`TESTING pay_type: "${payType}"`);
  console.log('='.repeat(50));

  const result = await apiRequest('/api/openApi/machineCreateOrder', {
    device_id: deviceId,
    product_id: productId,
    pay_type: payType,
    image_url: imageUrl,
  });

  return {
    payType,
    success: result.status === 200,
    status: result.status,
    message: result.msg,
    data: result.data,
  };
}

async function main() {
  const MACHINE_CODE = 'CT0700046';

  // Step 1: Get machine details
  console.log('\n' + '='.repeat(70));
  console.log('STEP 1: Get Machine Details');
  console.log('='.repeat(70));

  const machineDetails = await getMachineDetails(MACHINE_CODE);

  if (machineDetails.status !== 200) {
    console.log('❌ Failed to get machine details. Is the machine online?');
    return;
  }

  const deviceId = machineDetails.data.data.device_id;
  const machineStatus = machineDetails.data.data.online_status;

  console.log(`\n✅ Machine: ${MACHINE_CODE}`);
  console.log(`   Device ID: ${deviceId}`);
  console.log(`   Status: ${machineStatus}`);

  if (machineStatus !== 'online') {
    console.log('\n⚠️  Machine is OFFLINE. Orders may fail.');
    console.log('   Continuing anyway to see API responses...\n');
  }

  // Step 2: Get a valid product ID
  console.log('\n' + '='.repeat(70));
  console.log('STEP 2: Get Products to find a valid product_id');
  console.log('='.repeat(70));

  const inventory = await apiRequest('/api/openApi/machineInventoryInfo', {
    device_id: deviceId,
  });

  let productId = 'dZesWMYqBIuCwV1qr6Ugxw=='; // Default from docs

  if (inventory.status === 200 && inventory.data?.proList) {
    const validProduct = inventory.data.proList.find(p => p.value > 0);
    if (validProduct) {
      // We need the encrypted product_id, not the numeric value
      // For now, use the default
      console.log(`\n📦 Available products: ${inventory.data.proList.filter(p => p.value > 0).map(p => p.text).join(', ')}`);
    }
  }

  console.log(`\n🔑 Using product_id: ${productId}`);

  // Step 3: Test image URL (using a known working test image)
  const testImageUrl = 'https://print-gz.oss-accelerate.aliyuncs.com/20250918005929722424.tif';
  console.log(`\n🖼️  Using test image: ${testImageUrl}`);

  // Step 4: Test different pay_types
  console.log('\n' + '='.repeat(70));
  console.log('STEP 3: Test Different Payment Types');
  console.log('='.repeat(70));

  const payTypesToTest = ['ict', 'nayax', 'vpos'];
  const results = [];

  for (const payType of payTypesToTest) {
    const result = await testCreateOrder(deviceId, productId, payType, testImageUrl);
    results.push(result);

    // Wait a bit between requests
    await new Promise(r => setTimeout(r, 1000));
  }

  // Summary
  console.log('\n' + '='.repeat(70));
  console.log('SUMMARY: PAYMENT TYPE TEST RESULTS');
  console.log('='.repeat(70));

  console.log('\n| pay_type | Status | Message |');
  console.log('|----------|--------|---------|');
  for (const r of results) {
    const statusIcon = r.success ? '✅' : '❌';
    console.log(`| ${r.payType.padEnd(8)} | ${statusIcon} ${String(r.status).padEnd(4)} | ${r.message || 'N/A'} |`);
  }

  console.log('\n' + '='.repeat(70));
  console.log('INTERPRETATION');
  console.log('='.repeat(70));

  const ictResult = results.find(r => r.payType === 'ict');
  const nayaxResult = results.find(r => r.payType === 'nayax');
  const vposResult = results.find(r => r.payType === 'vpos');

  console.log(`
ICT (Cash/Bill Acceptor):
  Status: ${ictResult?.status} - ${ictResult?.message}
  ${ictResult?.success ? '✅ Cash payments work' : '❌ Cash payments failed'}

NAYAX (Card Terminal - direct):
  Status: ${nayaxResult?.status} - ${nayaxResult?.message}
  ${nayaxResult?.success ? '✅ Nayax direct works' : '❌ Nayax direct failed'}

VPOS (Virtual POS - Nayax via VPos):
  Status: ${vposResult?.status} - ${vposResult?.message}
  ${vposResult?.success ? '✅ VPos works - USE THIS FOR CREDIT CARDS' : '❌ VPos failed'}

RECOMMENDATION:
`);

  if (vposResult?.success) {
    console.log('✅ Use pay_type: "vpos" for credit card payments');
    console.log('   Update your .env: CHITU_DEFAULT_PAY_TYPE=vpos');
  } else if (nayaxResult?.success) {
    console.log('✅ Use pay_type: "nayax" for credit card payments');
    console.log('   Update your .env: CHITU_DEFAULT_PAY_TYPE=nayax');
  } else {
    console.log('⚠️  Neither vpos nor nayax succeeded.');
    console.log('   Possible reasons:');
    console.log('   - Machine is offline');
    console.log('   - No Nayax hardware installed');
    console.log('   - Payment not configured in admin portal');
    console.log('   - Need to enable VPos in System Management → Shopping Settings');
  }

  console.log('\n' + '='.repeat(70));
  console.log('⚠️  NOTE: If orders were created, they may need to be cancelled!');
  console.log('='.repeat(70) + '\n');
}

main().catch(console.error);
