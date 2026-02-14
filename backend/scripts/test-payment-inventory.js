/**
 * Test payment using inventory product IDs directly
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
  console.log('='.repeat(60));
  console.log('PAYMENT TYPE TEST - Using Inventory Products');
  console.log('='.repeat(60) + '\n');

  // Get machine details
  const machine = await apiRequest('/api/openApi/machineDetailsTwo', {
    device_code: 'CT0700046',
  });
  const deviceId = machine.data.data.device_id;
  console.log(`Machine: CT0700046 (${machine.data.data.online_status})`);
  console.log(`Device ID: ${deviceId}\n`);

  // Get inventory to find products with stock
  const inventory = await apiRequest('/api/openApi/machineInventoryInfo', {
    device_id: deviceId,
  });

  if (inventory.status !== 200) {
    console.log('Failed to get inventory');
    return;
  }

  // Find products with stock from inventory grid
  const productsWithStock = [];
  for (const row of inventory.data.data.stock) {
    for (const col of row.column) {
      if (col.product_id > 0 && col.stock > 0) {
        productsWithStock.push({
          numericId: col.product_id,
          stock: col.stock,
          position: `Row ${row.index}, Col ${col.index}`,
        });
      }
    }
  }

  // Get product names from proList
  const proList = inventory.data.proList || [];
  for (const p of productsWithStock) {
    const product = proList.find(pr => pr.value === p.numericId);
    p.name = product ? product.text : `Unknown (${p.numericId})`;
  }

  console.log('Products with stock (from inventory):');
  for (const p of productsWithStock) {
    console.log(`  - ${p.name}: ${p.stock} units at ${p.position} (ID: ${p.numericId})`);
  }

  if (productsWithStock.length === 0) {
    console.log('\n❌ No products with stock in inventory!');
    return;
  }

  // Get the encrypted product_id from product catalog
  console.log('\nFetching product catalog to get encrypted IDs...');
  const products = await apiRequest('/api/openApi/machineProductList', {
    device_id: deviceId,
    type: 'diy',
    status: 1,
    page: 1,
    limit: 100,
  });

  // Try to find encrypted product_id that matches our numeric ID
  let encryptedProductId = null;
  let productName = productsWithStock[0].name;

  if (products.status === 200 && products.data?.list) {
    for (const brand of products.data.list) {
      for (const model of brand.modelList || []) {
        // Check if this model's name matches any of our products with stock
        for (const p of productsWithStock) {
          if (model.name_en === p.name || model.name_cn === p.name) {
            encryptedProductId = model.product_id || model.id;
            productName = p.name;
            console.log(`Found match: ${productName} -> ${encryptedProductId}`);
            break;
          }
        }
        if (encryptedProductId) break;
      }
      if (encryptedProductId) break;
    }
  }

  // If we couldn't find encrypted ID, try using numeric ID directly
  // (The API might accept both formats)
  const productIdToUse = encryptedProductId || String(productsWithStock[0].numericId);
  console.log(`\nUsing product: ${productName}`);
  console.log(`Product ID: ${productIdToUse}`);

  // Test payment types
  const testImageUrl = 'https://print-gz.oss-accelerate.aliyuncs.com/20250918005929722424.tif';

  console.log('\n' + '='.repeat(60));
  console.log('TESTING PAYMENT TYPES');
  console.log('='.repeat(60));

  const results = [];

  for (const payType of ['ict', 'vpos', 'nayax']) {
    console.log(`\n--- pay_type: "${payType}" ---`);

    const result = await apiRequest('/api/openApi/machineCreateOrder', {
      device_id: deviceId,
      product_id: productIdToUse,
      pay_type: payType,
      image_url: testImageUrl,
    });

    console.log(`Status: ${result.status} - ${result.msg}`);
    if (result.data?.result?.orderId) {
      console.log(`Order ID: ${result.data.result.orderId}`);
    }

    results.push({
      payType,
      status: result.status,
      msg: result.msg,
      success: result.status === 200,
    });

    await new Promise(r => setTimeout(r, 1000));
  }

  // Summary
  console.log('\n' + '='.repeat(60));
  console.log('RESULTS');
  console.log('='.repeat(60));

  for (const r of results) {
    const icon = r.success ? '✅' : '❌';
    console.log(`${icon} ${r.payType}: ${r.status} - ${r.msg}`);
  }

  const working = results.filter(r => r.success).map(r => r.payType);
  const notWorking = results.filter(r => !r.success).map(r => r.payType);

  console.log(`\nWorking payment types: ${working.length > 0 ? working.join(', ') : 'NONE'}`);
  console.log(`Not working: ${notWorking.length > 0 ? notWorking.join(', ') : 'NONE'}`);

  if (working.includes('vpos')) {
    console.log('\n✅ VPOS works! Set CHITU_DEFAULT_PAY_TYPE=vpos for credit cards');
  } else if (working.includes('nayax')) {
    console.log('\n✅ NAYAX works! Set CHITU_DEFAULT_PAY_TYPE=nayax for credit cards');
  }
}

main().catch(console.error);
