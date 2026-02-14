/**
 * Final test: Payment types with correct product catalog parameters
 */

const crypto = require('crypto');
const https = require('https');
require('dotenv').config();

const config = {
  appId: process.env.CHITU_APP_ID,
  appSecret: process.env.CHITU_APP_SECRET,
};

function generateSignature(params, appSecret) {
  const { sign, ...paramsWithoutSign } = params;
  const sortedKeys = Object.keys(paramsWithoutSign).sort();
  const paramString = sortedKeys.map((key) => `${key}=${paramsWithoutSign[key]}`).join('&');
  const signString = `${paramString}&access_token=${appSecret}`;
  return crypto.createHash('sha256').update(signString).digest('hex');
}

function apiRequest(endpoint, params) {
  return new Promise((resolve) => {
    const fullParams = { appid: config.appId, ...params };
    fullParams.sign = generateSignature(fullParams, config.appSecret);
    const postData = JSON.stringify(fullParams);

    console.log(`📤 ${endpoint}`);

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
        try { resolve(JSON.parse(data)); }
        catch (e) { resolve({ raw: data }); }
      });
    });
    req.on('error', (e) => resolve({ error: e.message }));
    req.write(postData);
    req.end();
  });
}

async function main() {
  console.log('='.repeat(60));
  console.log('PAYMENT TYPE TEST - Finding product with stock');
  console.log('='.repeat(60) + '\n');

  // Get machine details
  const machine = await apiRequest('/api/openApi/machineDetailsTwo', {
    device_code: 'CT0700046',
  });
  const deviceId = machine.data.data.device_id;
  console.log(`✅ Machine: CT0700046 (${machine.data.data.online_status})\n`);

  // Get product list with correct parameters (type='diy' for phone case machines)
  console.log('Fetching product catalog (type=diy)...');
  const products = await apiRequest('/api/openApi/machineProductList', {
    device_id: deviceId,
    type: 'diy',
    status: 1,  // Active products
    page: 1,
    limit: 100,
  });

  if (products.status !== 200) {
    console.log('Product list failed:', products.msg);
    return;
  }

  // Find a product with stock
  let productWithStock = null;
  let productName = '';

  if (products.data?.list) {
    for (const brand of products.data.list) {
      for (const model of brand.modelList || []) {
        if (model.stock > 0) {
          productWithStock = model.product_id || model.id;
          productName = `${brand.name_en} ${model.name_en}`;
          console.log(`\n🎯 Found product with stock: ${productName}`);
          console.log(`   product_id: ${productWithStock}`);
          console.log(`   stock: ${model.stock}`);
          break;
        }
      }
      if (productWithStock) break;
    }
  }

  if (!productWithStock) {
    console.log('\n❌ No products with stock found!');
    console.log('Cannot test order creation without stock.');
    return;
  }

  // Test with this product
  const testImageUrl = 'https://print-gz.oss-accelerate.aliyuncs.com/20250918005929722424.tif';

  console.log('\n' + '='.repeat(60));
  console.log('TESTING PAYMENT TYPES');
  console.log('='.repeat(60));

  const results = [];

  for (const payType of ['ict', 'vpos', 'nayax']) {
    console.log(`\n--- Testing pay_type: "${payType}" ---`);

    const result = await apiRequest('/api/openApi/machineCreateOrder', {
      device_id: deviceId,
      product_id: productWithStock,
      pay_type: payType,
      image_url: testImageUrl,
    });

    console.log(`   Status: ${result.status}`);
    console.log(`   Message: ${result.msg}`);

    if (result.data) {
      console.log(`   Order ID: ${result.data.result?.orderId || 'N/A'}`);
    }

    results.push({
      payType,
      status: result.status,
      msg: result.msg,
      success: result.status === 200,
      orderId: result.data?.result?.orderId,
    });

    await new Promise(r => setTimeout(r, 1000));
  }

  // Summary
  console.log('\n' + '='.repeat(60));
  console.log('RESULTS SUMMARY');
  console.log('='.repeat(60));

  console.log('\n| Payment Type | Status | Result |');
  console.log('|--------------|--------|--------|');
  for (const r of results) {
    const icon = r.success ? '✅' : '❌';
    console.log(`| ${r.payType.padEnd(12)} | ${r.status}    | ${icon} ${r.msg} |`);
  }

  console.log('\n' + '='.repeat(60));
  console.log('WHAT THIS MEANS');
  console.log('='.repeat(60));

  const ict = results.find(r => r.payType === 'ict');
  const vpos = results.find(r => r.payType === 'vpos');
  const nayax = results.find(r => r.payType === 'nayax');

  if (ict?.success) {
    console.log('\n✅ ICT (Cash) works - orders can be created for cash payment');
  }
  if (vpos?.success) {
    console.log('\n✅ VPOS works - USE THIS FOR CREDIT CARDS');
    console.log('   → Set CHITU_DEFAULT_PAY_TYPE=vpos in .env');
  }
  if (nayax?.success) {
    console.log('\n✅ NAYAX works - this also supports credit cards');
    console.log('   → Set CHITU_DEFAULT_PAY_TYPE=nayax in .env');
  }

  if (!vpos?.success && !nayax?.success) {
    console.log('\n⚠️  Neither VPOS nor NAYAX succeeded.');
    console.log('   Check if:');
    console.log('   - Nayax hardware is installed on the machine');
    console.log('   - VPos is enabled in admin portal (System Management → Shopping Settings)');
  }

  console.log('\n⚠️  WARNING: Any successful orders were REAL orders!');
  console.log('   You may need to cancel them in the admin portal.');
  console.log('='.repeat(60) + '\n');
}

main().catch(console.error);
