/**
 * Test product catalog API for CT0700046
 * This will show us what products are available on the machine
 */

require('dotenv').config();
const axios = require('axios');
const crypto = require('crypto');

const config = {
  baseUrl: 'https://www.gzchitu.cn',
  appId: process.env.CHITU_APP_ID,
  appSecret: process.env.CHITU_APP_SECRET,
  deviceCode: 'CT0700046',
};

console.log('🧪 Testing Product Catalog API for CT0700046');
console.log(`🔑 App ID: ${config.appId}`);
console.log('');

function generateSignature(params) {
  const { sign, ...paramsWithoutSign } = params;
  const sortedKeys = Object.keys(paramsWithoutSign).sort();
  const paramString = sortedKeys.map(key => `${key}=${paramsWithoutSign[key]}`).join('&');
  const signString = `${paramString}&access_token=${config.appSecret}`;
  return crypto.createHash('sha256').update(signString).digest('hex');
}

async function apiRequest(endpoint, params) {
  const requestParams = {
    appid: config.appId,
    ...params,
  };
  requestParams.sign = generateSignature(requestParams);

  console.log(`📤 Request to: ${endpoint}`);
  console.log(`📊 Params:`, JSON.stringify(requestParams, null, 2));

  const response = await axios.post(`${config.baseUrl}${endpoint}`, requestParams);
  return response.data;
}

async function testProductCatalog() {
  try {
    // Step 1: Get machine details to get device_id
    console.log('🔍 Step 1: Getting machine details...\n');
    const machineDetails = await apiRequest('/api/openApi/machineDetailsTwo', {
      device_code: config.deviceCode,
    });

    if (machineDetails.status !== 200) {
      throw new Error(`Failed to get machine details: ${machineDetails.msg}`);
    }

    const machine = machineDetails.data?.data || machineDetails.data;
    console.log(`✅ Machine found: ${machine.name}`);
    console.log(`   Device ID: ${machine.device_id}`);
    console.log(`   Status: ${machine.online_status}`);
    console.log('');

    // Step 2: Get product catalog with type='diy'
    console.log('📦 Step 2: Getting product catalog (type=diy)...\n');
    const catalogDiy = await apiRequest('/api/openApi/machineProductList', {
      device_id: machine.device_id,
      type: 'diy',
      status: 1,
      page: 1,
      limit: 100,
    });

    console.log('✅ Product Catalog Response (type=diy):');
    console.log(JSON.stringify(catalogDiy, null, 2));
    console.log('');

    if (catalogDiy.data?.list && catalogDiy.data.list.length > 0) {
      console.log(`✅ Found ${catalogDiy.data.count} products with type=diy`);
      catalogDiy.data.list.forEach(brand => {
        console.log(`\n📱 Brand: ${brand.name_en} (${brand.name_cn})`);
        brand.modelList.forEach(model => {
          console.log(`   - ${model.name_en}: Stock=${model.stock}, Price=${model.price}, ID=${model.product_id}`);
        });
      });
    } else {
      console.log('⚠️  No products found with type=diy');
    }

    // Step 3: Try with type='default' to see if products exist there
    console.log('\n📦 Step 3: Getting product catalog (type=default)...\n');
    const catalogDefault = await apiRequest('/api/openApi/machineProductList', {
      device_id: machine.device_id,
      type: 'default',
      status: 1,
      page: 1,
      limit: 100,
    });

    console.log('✅ Product Catalog Response (type=default):');
    console.log(JSON.stringify(catalogDefault, null, 2));
    console.log('');

    if (catalogDefault.data?.list && catalogDefault.data.list.length > 0) {
      console.log(`✅ Found ${catalogDefault.data.count} products with type=default`);
      catalogDefault.data.list.forEach(brand => {
        console.log(`\n📱 Brand: ${brand.name_en} (${brand.name_cn})`);
        brand.modelList.forEach(model => {
          console.log(`   - ${model.name_en}: Stock=${model.stock}, Price=${model.price}, ID=${model.product_id}`);
        });
      });
    } else {
      console.log('⚠️  No products found with type=default');
    }

  } catch (error) {
    console.error('\n❌ Test failed:', error.message);
    if (error.response) {
      console.error('Response:', JSON.stringify(error.response.data, null, 2));
    }
    process.exit(1);
  }
}

testProductCatalog();
