/**
 * Debug: Show full product catalog structure
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
  console.log('Getting product catalog to see full structure...\n');

  // Get machine details
  const machine = await apiRequest('/api/openApi/machineDetailsTwo', {
    device_code: 'CT0700046',
  });
  const deviceId = machine.data.data.device_id;
  console.log(`Device ID: ${deviceId}\n`);

  // Get product catalog
  const products = await apiRequest('/api/openApi/machineProductList', {
    device_id: deviceId,
    type: 'diy',
    status: 1,
    page: 1,
    limit: 100,
  });

  console.log('Full Product Catalog Response:');
  console.log(JSON.stringify(products, null, 2));

  // Show specific product structure
  if (products.status === 200 && products.data?.list?.length > 0) {
    const firstBrand = products.data.list[0];
    console.log('\n\nFirst Brand structure:');
    console.log(JSON.stringify(firstBrand, null, 2));

    if (firstBrand.modelList?.length > 0) {
      console.log('\n\nFirst Model structure:');
      console.log(JSON.stringify(firstBrand.modelList[0], null, 2));
    }
  }
}

main().catch(console.error);
