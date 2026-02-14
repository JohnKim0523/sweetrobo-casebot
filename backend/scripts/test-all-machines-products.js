/**
 * Check products on multiple machines
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

async function checkMachine(code) {
  console.log(`\n${'='.repeat(50)}`);
  console.log(`MACHINE: ${code}`);
  console.log('='.repeat(50));

  const machine = await apiRequest('/api/openApi/machineDetailsTwo', {
    device_code: code,
  });

  if (machine.status !== 200) {
    console.log(`❌ Failed to get machine: ${machine.msg}`);
    return;
  }

  const deviceId = machine.data.data.device_id;
  const status = machine.data.data.online_status;
  console.log(`Status: ${status}`);

  // Get product catalog
  const products = await apiRequest('/api/openApi/machineProductList', {
    device_id: deviceId,
    type: 'diy',
    status: 1,
    page: 1,
    limit: 100,
  });

  console.log(`\nProduct Catalog: ${products.data?.count || 0} products`);

  if (products.data?.list?.length > 0) {
    for (const brand of products.data.list) {
      console.log(`  Brand: ${brand.name_en}`);
      for (const model of (brand.modelList || []).slice(0, 3)) {
        const pid = model.product_id || model.id;
        console.log(`    - ${model.name_en}: ${pid} (stock: ${model.stock})`);
      }
    }

    // If we found products with encrypted IDs, test payment
    const firstModel = products.data.list[0]?.modelList?.[0];
    if (firstModel) {
      const productId = firstModel.product_id || firstModel.id;
      console.log(`\nTesting payment with: ${firstModel.name_en} (${productId})`);

      for (const payType of ['ict', 'vpos']) {
        const result = await apiRequest('/api/openApi/machineCreateOrder', {
          device_id: deviceId,
          product_id: productId,
          pay_type: payType,
          image_url: 'https://print-gz.oss-accelerate.aliyuncs.com/20250918005929722424.tif',
        });
        const icon = result.status === 200 ? '✅' : '❌';
        console.log(`  ${icon} ${payType}: ${result.status} - ${result.msg}`);

        if (result.data?.result?.orderId) {
          console.log(`     Order created: ${result.data.result.orderId}`);
        }
        await new Promise(r => setTimeout(r, 500));
      }
    }
  } else {
    console.log('  (empty catalog)');
  }
}

async function main() {
  const machines = ['CT0700046', 'CT0700055', 'CT0700053'];

  for (const code of machines) {
    await checkMachine(code);
  }

  console.log('\n' + '='.repeat(50));
  console.log('DONE');
  console.log('='.repeat(50));
}

main().catch(console.error);
