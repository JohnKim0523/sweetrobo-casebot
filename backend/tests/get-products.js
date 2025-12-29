const crypto = require('crypto');
const axios = require('axios');
require('dotenv').config();

const config = {
  baseUrl: process.env.CHITU_API_URL || 'https://www.gzchitu.cn',
  appId: process.env.CHITU_APP_ID,
  appSecret: process.env.CHITU_APP_SECRET,
};

function generateSignature(params) {
  const { sign, ...paramsWithoutSign } = params;
  const sortedKeys = Object.keys(paramsWithoutSign).sort();
  const paramString = sortedKeys.map(key => key + '=' + paramsWithoutSign[key]).join('&');
  const signString = paramString + '&access_token=' + config.appSecret;
  return crypto.createHash('sha256').update(signString).digest('hex');
}

async function getMachineList() {
  const params = { appid: config.appId, page: 1, limit: 100 };
  params.sign = generateSignature(params);
  const response = await axios.post(
    config.baseUrl + '/api/openApi/machineList',
    params,
    { headers: { 'Content-Type': 'application/json' } }
  );
  return response.data;
}

async function getProducts(deviceId, type) {
  const params = {
    appid: config.appId,
    device_id: deviceId,
    type: type,
    status: 1,
    page: 1,
    limit: 100,
  };
  params.sign = generateSignature(params);
  const response = await axios.post(
    config.baseUrl + '/api/openApi/machineProductList',
    params,
    { headers: { 'Content-Type': 'application/json' } }
  );
  return response.data;
}

async function main() {
  const deviceCode = process.argv[2];

  if (!deviceCode) {
    console.log('Usage: node get-products.js <device_code>');
    console.log('Example: node get-products.js CT0700059');
    process.exit(1);
  }

  console.log('Fetching machine list...');
  const machineList = await getMachineList();
  const machines = machineList.data?.list || [];
  const machine = machines.find(m => m.device_code === deviceCode);

  if (!machine) {
    console.log(`❌ Machine ${deviceCode} not found`);
    process.exit(1);
  }

  console.log(`\nMachine: ${deviceCode}`);
  console.log(`Device ID: ${machine.device_id}`);
  console.log(`Status: ${machine.online_status}`);

  // Get default products
  console.log('\n=== DEFAULT PRODUCTS ===');
  try {
    const defaultProducts = await getProducts(machine.device_id, 'default');
    if (defaultProducts.data && defaultProducts.data.list) {
      defaultProducts.data.list.forEach(brand => {
        const brandName = brand.name_en || brand.name_cn || brand.name || 'Unknown Brand';
        console.log(`\nBrand: ${brandName}`);
        console.log('-'.repeat(60));
        brand.modelList.forEach(model => {
          const name = model.name_en || model.name_cn || model.name || 'Unknown';
          const stock = model.stock !== undefined ? model.stock : 'N/A';
          const price = model.price || 'N/A';
          const id = model.product_id || model.id || 'N/A';
          console.log(`  ${name.padEnd(30)} | Stock: ${String(stock).padEnd(5)} | Price: ${price} | ID: ${id}`);
        });
      });
    } else {
      console.log('No default products found');
    }
  } catch (e) {
    console.log('Error:', e.response?.data?.msg || e.message);
  }

  // Get DIY products
  console.log('\n=== DIY PRODUCTS ===');
  try {
    const diyProducts = await getProducts(machine.device_id, 'diy');
    if (diyProducts.data && diyProducts.data.list) {
      diyProducts.data.list.forEach(brand => {
        const brandName = brand.name_en || brand.name_cn || brand.name || 'Unknown Brand';
        console.log(`\nBrand: ${brandName}`);
        console.log('-'.repeat(60));
        brand.modelList.forEach(model => {
          const name = model.name_en || model.name_cn || model.name || 'Unknown';
          const stock = model.stock !== undefined ? model.stock : 'N/A';
          const price = model.price || 'N/A';
          const id = model.product_id || model.id || 'N/A';
          console.log(`  ${name.padEnd(30)} | Stock: ${String(stock).padEnd(5)} | Price: ${price} | ID: ${id}`);
        });
      });
    } else {
      console.log('No DIY products found');
    }
  } catch (e) {
    console.log('Error:', e.response?.data?.msg || e.message);
  }
}

main().catch(e => console.error('Error:', e.message));
