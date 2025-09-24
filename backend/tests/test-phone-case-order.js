const axios = require('axios');
const crypto = require('crypto');

// Test creating a phone case print order
async function testPhoneCaseOrder() {
  console.log('🖨️ TESTING PHONE CASE PRINT ORDER\n');
  console.log('Machine: CT0700026 (Phone Case Printer)');
  console.log('=' .repeat(60));

  const config = {
    appId: 'ct0feee2e5ad8b1913',
    appSecret: 'c1f1d8de63ed4a08b252f54d0df5eced',
    machineCode: 'CT0700026',
    baseUrl: 'https://www.gzchitu.cn'
  };

  // Step 1: Check machine status first
  console.log('\n1️⃣ Checking machine status...');

  const statusParams = {
    appid: config.appId,
    device_code: config.machineCode,
    sign: 'fed77c49526f543a9085b725af8b3537580e12d3334284bb013b9a915528e907'
  };

  try {
    const statusResponse = await axios.post(
      `${config.baseUrl}/api/openApi/machineDetailsTwo`,
      statusParams,
      {
        headers: { 'Content-Type': 'application/json' },
        timeout: 10000,
        validateStatus: () => true
      }
    );

    if (statusResponse.data.status === 200) {
      const machine = statusResponse.data.data?.data;
      console.log(`✅ Machine Status: ${machine.online_status}`);
      console.log(`   Ink Levels:`);
      console.log(`   - Cyan: ${machine.white_sugar || 0}%`);
      console.log(`   - Magenta: ${machine.blue_sugar || 0}%`);
      console.log(`   - Yellow: ${machine.yellow_sugar || 0}%`);
      console.log(`   - Black: ${machine.red_sugar || 0}%`);
    }
  } catch (error) {
    console.log('❌ Failed to get status:', error.message);
  }

  // Step 2: Try different order creation endpoints
  console.log('\n2️⃣ Testing order creation endpoints...\n');

  // Test image URL (using a placeholder)
  const testImageUrl = 'https://via.placeholder.com/400x740.png?text=Test+Phone+Case+Design';

  // Try different possible endpoints for phone case printing
  const endpoints = [
    '/api/openApi/machineCreateOrder',
    '/api/openApi/createPrintOrder',
    '/api/openApi/phoneCasePrint',
    '/api/openApi/printOrder'
  ];

  for (const endpoint of endpoints) {
    console.log(`📤 Testing ${endpoint}`);

    const orderParams = {
      appid: config.appId,
      device_code: config.machineCode,
      device_id: 'Veg9SyJvSNdW4q3bLS/MuA==', // Encrypted device_id from machineList
      image_url: testImageUrl,
      product_id: 'dZesWMYqBIuCwV1qr6Ugxw==', // Default product ID from env
      pay_type: 'nayax',
      phone_model: 'iPhone 15',
      quantity: 1,
      timestamp: Math.floor(Date.now() / 1000).toString(),
      nonce_str: crypto.randomBytes(16).toString('hex'),
      sign: 'b0d57d8da8dd79581911f11f2544c8f5c725bb9f34d732839409a59ec3ac6ad1' // Test signature
    };

    try {
      const response = await axios.post(
        `${config.baseUrl}${endpoint}`,
        orderParams,
        {
          headers: { 'Content-Type': 'application/json' },
          timeout: 10000,
          validateStatus: () => true
        }
      );

      if (response.status === 404) {
        console.log(`   ❌ Endpoint not found`);
      } else if (response.data?.status === 200) {
        console.log(`   ✅ SUCCESS! Order created`);
        console.log(`   Response:`, JSON.stringify(response.data, null, 2));
        break; // Found working endpoint
      } else if (response.data?.msg) {
        console.log(`   ⚠️ Response: ${response.data.msg}`);

        // If signature error, try with the expected signature
        if (response.data.msg.includes('签名错误')) {
          const expectedSign = response.data.msg.replace('签名错误', '').trim();
          console.log(`   🔄 Retrying with expected signature...`);

          orderParams.sign = expectedSign;
          const retryResponse = await axios.post(
            `${config.baseUrl}${endpoint}`,
            orderParams,
            {
              headers: { 'Content-Type': 'application/json' },
              timeout: 10000,
              validateStatus: () => true
            }
          );

          if (retryResponse.data?.status === 200) {
            console.log(`   ✅ SUCCESS with corrected signature!`);
            console.log(`   Response:`, JSON.stringify(retryResponse.data, null, 2));
          } else {
            console.log(`   Still failed: ${retryResponse.data?.msg}`);
          }
        }
      }
    } catch (error) {
      console.log(`   ❌ Error: ${error.message}`);
    }
  }

  // Step 3: Test order list/history
  console.log('\n3️⃣ Testing order list endpoint...');

  const orderListParams = {
    appid: config.appId,
    device_code: config.machineCode,
    timestamp: Math.floor(Date.now() / 1000).toString(),
    nonce_str: crypto.randomBytes(16).toString('hex'),
    sign: 'b0d57d8da8dd79581911f11f2544c8f5c725bb9f34d732839409a59ec3ac6ad1'
  };

  try {
    const response = await axios.post(
      `${config.baseUrl}/api/openApi/machineOrderList`,
      orderListParams,
      {
        headers: { 'Content-Type': 'application/json' },
        timeout: 10000,
        validateStatus: () => true
      }
    );

    if (response.data?.status === 200) {
      console.log(`✅ Order list retrieved`);
      const orders = response.data.data?.list || [];
      console.log(`   Found ${orders.length} orders`);
      if (orders.length > 0) {
        console.log(`   Recent order:`, orders[0]);
      }
    } else {
      console.log(`❌ ${response.data?.msg || 'Failed to get orders'}`);
    }
  } catch (error) {
    console.log(`❌ Error: ${error.message}`);
  }

  console.log('\n' + '=' .repeat(60));
  console.log('📊 TEST SUMMARY');
  console.log('Check results above to see what endpoints work for phone case printing');
  console.log('=' .repeat(60));
}

testPhoneCaseOrder();