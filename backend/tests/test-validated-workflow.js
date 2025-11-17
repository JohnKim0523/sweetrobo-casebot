/**
 * Test the validated Chitu workflow
 * Tests the complete process:
 * 1. Check machine status
 * 2. Get products
 * 3. Verify inventory
 * 4. Create order (with test image)
 */

require('dotenv').config();
const axios = require('axios');
const crypto = require('crypto');

// Configuration from .env
const config = {
  baseUrl: 'https://www.gzchitu.cn',
  appId: process.env.CHITU_APP_ID,
  appSecret: process.env.CHITU_APP_SECRET,
  deviceCode: 'CT0700046',
};

console.log('🧪 Testing Chitu API with validated workflow');
console.log(`📱 Machine: ${config.deviceCode}`);
console.log(`🔑 App ID: ${config.appId}`);
console.log('');

// Generate signature
function generateSignature(params) {
  const { sign, ...paramsWithoutSign } = params;
  const sortedKeys = Object.keys(paramsWithoutSign).sort();
  const paramString = sortedKeys.map(key => `${key}=${paramsWithoutSign[key]}`).join('&');
  const signString = `${paramString}&access_token=${config.appSecret}`;
  return crypto.createHash('sha256').update(signString).digest('hex');
}

// Make API request
async function apiRequest(endpoint, params) {
  const requestParams = {
    appid: config.appId,
    ...params,
  };
  requestParams.sign = generateSignature(requestParams);

  console.log(`📤 Request to: ${endpoint}`);
  console.log(`📊 Params:`, JSON.stringify(requestParams, null, 2));

  const response = await axios.post(`${config.baseUrl}${endpoint}`, requestParams);

  console.log(`✅ Response:`, JSON.stringify(response.data, null, 2));
  return response.data;
}

// Main test flow
async function testValidatedWorkflow() {
  try {
    // Step 1: Get machine details to verify it exists and get device_id
    console.log('\n🔍 Step 1: Checking machine status...\n');
    const machineDetails = await apiRequest('/api/openApi/machineDetailsTwo', {
      device_code: config.deviceCode,
    });

    if (machineDetails.status !== 200) {
      throw new Error(`Failed to get machine details: ${machineDetails.msg}`);
    }

    const machine = machineDetails.data?.data || machineDetails.data;
    console.log(`\n✅ Machine found: ${machine.name}`);
    console.log(`   Status: ${machine.online_status}`);
    console.log(`   Model: ${machine.machine_model}`);
    console.log(`   Device ID: ${machine.device_id}`);

    if (machine.online_status !== 'online') {
      console.log(`\n⚠️  WARNING: Machine is ${machine.online_status}`);
      console.log('   Cannot proceed with print order test');
      return;
    }

    // Step 2: Get product catalog
    console.log('\n📦 Step 2: Getting product catalog...\n');
    const catalog = await apiRequest('/api/openApi/machineProductList', {
      device_id: machine.device_id,
      type: 'diy',
      status: 1,
      page: 1,
      limit: 100,
    });

    if (catalog.status !== 200 || !catalog.data?.list) {
      throw new Error(`Failed to get product catalog: ${catalog.msg}`);
    }

    console.log(`\n✅ Found ${catalog.data.count} products`);

    // Find a product with stock
    let selectedProduct = null;
    for (const brand of catalog.data.list) {
      console.log(`\n   Brand: ${brand.name_en} (${brand.name_cn})`);
      for (const model of brand.modelList) {
        console.log(`      - ${model.name_en}: Stock=${model.stock}, Price=${model.price}, ID=${model.product_id}`);
        if (!selectedProduct && model.stock > 0) {
          selectedProduct = model;
        }
      }
    }

    if (!selectedProduct) {
      console.log('\n⚠️  WARNING: No products with stock available');
      console.log('   Cannot proceed with print order test');
      return;
    }

    console.log(`\n✅ Selected product: ${selectedProduct.name_en}`);
    console.log(`   Product ID: ${selectedProduct.product_id}`);
    console.log(`   Stock: ${selectedProduct.stock}`);

    // Step 3: Create order (with test image URL)
    console.log('\n📝 Step 3: Creating test order...\n');
    console.log('⚠️  Note: This will create a real order on the machine!');
    console.log('   Using test image URL - will fail if image is not valid TIF');

    // You can uncomment this to actually test order creation
    // WARNING: This will create a real order!
    /*
    const orderResult = await apiRequest('/api/openApi/machineCreateOrder', {
      device_id: machine.device_id,
      product_id: selectedProduct.product_id,
      image_url: 'https://example.com/test.tif',  // Replace with real TIF URL
      pay_type: 'unknown',
    });

    console.log(`\n✅ Order result:`, orderResult);
    */

    console.log('\n✅ Workflow validation complete!');
    console.log('\n📋 Summary:');
    console.log(`   ✅ Machine ${config.deviceCode} is online`);
    console.log(`   ✅ Found ${catalog.data.count} products in catalog`);
    console.log(`   ✅ Selected product: ${selectedProduct.name_en} (stock: ${selectedProduct.stock})`);
    console.log(`   ℹ️  Order creation skipped (uncomment to test)`);

  } catch (error) {
    console.error('\n❌ Test failed:', error.message);
    if (error.response) {
      console.error('Response:', error.response.data);
    }
    process.exit(1);
  }
}

// Run the test
testValidatedWorkflow();
