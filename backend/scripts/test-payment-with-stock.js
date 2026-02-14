/**
 * Test payment types with a product that has stock
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
  console.log('Testing payment types with products that have stock...\n');

  // Get machine details
  const machine = await apiRequest('/api/openApi/machineDetailsTwo', {
    device_code: 'CT0700046',
  });
  const deviceId = machine.data.data.device_id;
  console.log(`Machine: CT0700046 (${machine.data.data.online_status})`);
  console.log(`Device ID: ${deviceId}\n`);

  // Get product list with encrypted IDs
  console.log('Fetching products with encrypted IDs...');
  const products = await apiRequest('/api/openApi/machineProductList', {
    device_id: deviceId,
    page: 1,
    page_size: 50,
  });

  console.log('Product List Response:', JSON.stringify(products, null, 2));

  if (products.status === 200 && products.data?.list) {
    console.log('\n✅ Products with encrypted IDs:');
    for (const p of products.data.list.slice(0, 5)) {
      console.log(`  - ${p.name}: ${p.product_id} (stock: ${p.stock || 'unknown'})`);
    }

    // Find a product with stock
    const productWithStock = products.data.list.find(p => p.stock > 0);
    if (productWithStock) {
      console.log(`\n🎯 Testing with: ${productWithStock.name} (${productWithStock.product_id})`);

      // Test with this product
      const testImageUrl = 'https://print-gz.oss-accelerate.aliyuncs.com/20250918005929722424.tif';

      for (const payType of ['ict', 'vpos', 'nayax']) {
        console.log(`\n--- Testing pay_type: ${payType} ---`);
        const result = await apiRequest('/api/openApi/machineCreateOrder', {
          device_id: deviceId,
          product_id: productWithStock.product_id,
          pay_type: payType,
          image_url: testImageUrl,
        });
        console.log(`Result: ${result.status} - ${result.msg}`);
        if (result.data) {
          console.log(`Data: ${JSON.stringify(result.data)}`);
        }
        await new Promise(r => setTimeout(r, 500));
      }
    } else {
      console.log('\n⚠️ No products with stock found in the product list');
    }
  } else {
    console.log('\n❌ Failed to get product list or different format');
    console.log('Trying alternative: get individual product details...');

    // Try to get product details for a known product ID from inventory
    // From inventory we saw product_id 20003585 has stock 4
    // We need to find the encrypted version

    // Let's check if there's another endpoint
    const productDetail = await apiRequest('/api/openApi/productDetails', {
      device_id: deviceId,
      product_id: '20003585', // numeric ID
    });
    console.log('Product Detail Response:', JSON.stringify(productDetail, null, 2));
  }
}

main().catch(console.error);
